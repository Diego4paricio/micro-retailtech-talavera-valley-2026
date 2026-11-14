-- Estado de acceso por organizacion (ADR 020 §4 y §8, relevo 18 §4.1 y §4.2).
--
-- Una organizacion esta, en este orden:
--   1. `internal`: cuenta interna o demo de Kardo (marca de staff); nunca se
--      limita, pausa ni borra.
--   2. `active`: suscripcion viva (trialing, active, past_due: la deuda
--      sigue activa durante los reintentos de Stripe) o cortesia de staff
--      vigente (plan manual sin vencer).
--   3. `trial`: prueba de Kardo sin convertir y sin terminar.
--   4. `limited` o `paused`: termino la prueba, la suscripcion o la cortesia.
--      `lapsed_at` es el fin mas reciente; hasta `lapsed_at + 7 dias` las
--      paginas publicas siguen abiertas (`limited`), despues muestran la
--      pagina de estado (`paused`). Se borra a los 90 dias (`delete_at`).
--   5. `legacy`: creada antes de `access_policy.legacy_before` sin prueba ni
--      plan (anterior al ADR 020): sin limites hasta que staff decida.
--   6. `limited` con fuente `none`: creada despues sin prueba ni plan (la
--      segunda organizacion de quien ya uso su prueba): debe contratar para
--      empezar. Sin paginas que pausar ni calendario de borrado.
--
-- El Customer API aplica `limited`/`paused` en su punto unico de permisos
-- (403 PLAN_REQUIRED en escrituras). La tarea horaria pausa y reanuda las
-- paginas en el Resolver (bandera propia, distinta de la suspension de
-- staff) y encola los avisos. El borrado real no existe todavia: la tarea
-- solo lista "Por borrar" en Operations.

-- ---------------------------------------------------------------------------
-- 1. Politica de acceso
-- ---------------------------------------------------------------------------

create table if not exists kardo_billing.access_policy (
  singleton boolean primary key default true check (singleton),
  -- Organizaciones creadas antes, sin prueba ni plan: `legacy`.
  legacy_before timestamptz not null,
  updated_at timestamptz not null default now()
);
insert into kardo_billing.access_policy (singleton, legacy_before)
values (true, now())
on conflict (singleton) do nothing;

alter table kardo_billing.access_policy enable row level security;

-- ---------------------------------------------------------------------------
-- 2. Cuentas internas o demo (ADR 020 §8)
-- ---------------------------------------------------------------------------

create table if not exists kardo_billing.internal_workspaces (
  workspace_id uuid primary key references kardo_core.workspaces(id) on delete cascade,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  set_by uuid references kardo_staff.staff_profiles(id) on delete set null,
  set_at timestamptz not null default now()
);
create index if not exists billing_internal_workspaces_set_by_idx
  on kardo_billing.internal_workspaces (set_by);

alter table kardo_billing.internal_workspaces enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Paginas publicas pausadas por cobro (idempotencia de la tarea horaria)
-- ---------------------------------------------------------------------------

create table if not exists kardo_billing.access_states (
  workspace_id uuid primary key references kardo_core.workspaces(id) on delete cascade,
  -- Cuando el Resolver confirmo la pausa; null: las paginas sirven normal.
  pages_paused_at timestamptz,
  pages_paused_count integer not null default 0 check (pages_paused_count >= 0),
  last_resumed_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists billing_access_states_paused_idx
  on kardo_billing.access_states (pages_paused_at) where pages_paused_at is not null;

alter table kardo_billing.access_states enable row level security;

-- ---------------------------------------------------------------------------
-- 4. RLS y privilegios
-- ---------------------------------------------------------------------------

do $$
declare
  target text;
begin
  foreach target in array array['access_policy', 'internal_workspaces', 'access_states'] loop
    execute format('drop policy if exists %I on kardo_billing.%I', 'staff api billing read', target);
    execute format(
      'create policy %I on kardo_billing.%I for select to kardo_staff_api using (kardo_private.staff_has_permission(''billing.read''))',
      'staff api billing read', target
    );
    execute format('drop policy if exists %I on kardo_billing.%I', 'billing sync all', target);
    execute format(
      'create policy %I on kardo_billing.%I for all to kardo_billing_sync using (true) with check (true)',
      'billing sync all', target
    );
  end loop;
end $$;

grant select on kardo_billing.access_policy, kardo_billing.internal_workspaces,
  kardo_billing.access_states to kardo_staff_api;
grant select on kardo_billing.access_policy, kardo_billing.internal_workspaces
  to kardo_billing_sync;
grant select, insert, update on kardo_billing.access_states to kardo_billing_sync;

-- La tarea horaria pausa las paginas de cada Touchpoint de la organizacion y
-- avisa al Owner cuando no hay Customer de Stripe ni prueba (cortesias).
drop policy if exists "billing sync touchpoints read" on kardo_core.touchpoints;
create policy "billing sync touchpoints read" on kardo_core.touchpoints
  for select to kardo_billing_sync using (true);
grant select (id, workspace_id, public_id, status) on kardo_core.touchpoints to kardo_billing_sync;

drop policy if exists "billing sync memberships read" on kardo_core.workspace_memberships;
create policy "billing sync memberships read" on kardo_core.workspace_memberships
  for select to kardo_billing_sync using (true);
grant select (workspace_id, profile_id, role, created_at)
  on kardo_core.workspace_memberships to kardo_billing_sync;

-- ---------------------------------------------------------------------------
-- 5. Avisos nuevos
-- ---------------------------------------------------------------------------

alter table kardo_billing.notices drop constraint if exists notices_kind_check;
alter table kardo_billing.notices add constraint notices_kind_check check (kind in (
  'subscription_started', 'renewal_upcoming', 'trial_ending', 'cancellation_confirmed',
  'trial_started', 'trial_reminder', 'trial_ended',
  'plan_ended', 'pause_upcoming', 'pages_paused', 'deletion_upcoming', 'courtesy_ending'
));

-- ---------------------------------------------------------------------------
-- 6. Estado de acceso
-- ---------------------------------------------------------------------------

-- Interna: sin control de acceso. La usan `workspace_access` y la tarea
-- horaria (kardo_billing_sync); no se otorga a los roles de los APIs.
create or replace function kardo_billing.resolve_workspace_access(p_workspace_id uuid)
returns table (
  state text,
  source text,
  plan_code text,
  plan_name text,
  ends_at timestamptz,
  lapsed_at timestamptz,
  grace_ends_at timestamptz,
  delete_at timestamptz,
  offer_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_created timestamptz;
  v_code text;
  v_name text;
  v_ends timestamptz;
  v_trial_end timestamptz;
  v_trial_plan uuid;
  v_sub_end timestamptz;
  v_sub_plan uuid;
  v_manual_end timestamptz;
  v_manual_plan uuid;
  v_lapsed timestamptz;
  v_source text;
  v_plan uuid;
  v_offer timestamptz;
begin
  select w.created_at into v_created
  from kardo_core.workspaces w where w.id = p_workspace_id;
  if not found then
    return;
  end if;

  -- 1. Cuenta interna.
  if exists (
    select 1 from kardo_billing.internal_workspaces i where i.workspace_id = p_workspace_id
  ) then
    return query select 'internal'::text, 'internal'::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- 2. Suscripcion viva (aunque su precio no corresponda a un plan).
  select p.code, p.name into v_code, v_name
  from kardo_billing.subscriptions s
  left join kardo_core.plans p on p.id = s.plan_id
  where s.workspace_id = p_workspace_id
    and s.status in ('trialing', 'active', 'past_due')
  order by
    case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
    s.current_period_end desc nulls last
  limit 1;
  if found then
    return query select 'active'::text, 'subscription'::text, v_code, v_name,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- 3. Cortesia de staff vigente.
  select p.code, p.name, wp.override_until into v_code, v_name, v_ends
  from kardo_core.workspace_plans wp
  join kardo_core.plans p on p.id = wp.plan_id
  where wp.workspace_id = p_workspace_id
    and (wp.override_until is null or wp.override_until > now());
  if found then
    return query select 'active'::text, 'manual'::text, v_code, v_name,
      v_ends, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- 4. Prueba de Kardo vigente.
  select p.code, p.name, t.ends_at into v_code, v_name, v_ends
  from kardo_billing.trials t
  join kardo_core.plans p on p.id = t.plan_id
  where t.workspace_id = p_workspace_id
    and t.converted_at is null
    and t.ends_at > now();
  if found then
    return query select 'trial'::text, 'trial'::text, v_code, v_name,
      v_ends, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- 5. Termino algo: el fin mas reciente manda.
  select t.ends_at, t.plan_id into v_trial_end, v_trial_plan
  from kardo_billing.trials t
  where t.workspace_id = p_workspace_id and t.converted_at is null;

  select coalesce(s.ended_at, s.canceled_at, s.current_period_end, s.stripe_created_at), s.plan_id
    into v_sub_end, v_sub_plan
  from kardo_billing.subscriptions s
  where s.workspace_id = p_workspace_id
    and s.status in ('canceled', 'unpaid', 'paused')
  order by coalesce(s.ended_at, s.canceled_at, s.current_period_end, s.stripe_created_at) desc
  limit 1;

  select wp.override_until, wp.plan_id into v_manual_end, v_manual_plan
  from kardo_core.workspace_plans wp
  where wp.workspace_id = p_workspace_id and wp.override_until <= now();

  v_lapsed := greatest(v_trial_end, v_sub_end, v_manual_end);
  if v_lapsed is not null then
    if v_lapsed = v_sub_end then
      v_source := 'subscription';
      v_plan := v_sub_plan;
    elsif v_lapsed = v_manual_end then
      v_source := 'manual';
      v_plan := v_manual_plan;
    else
      v_source := 'trial';
      v_plan := v_trial_plan;
    end if;
    select p.code, p.name into v_code, v_name from kardo_core.plans p where p.id = v_plan;

    -- Cupon de conversion (ADR 020 §1): 7 dias despues del fin de la
    -- prueba, solo si la organizacion nunca tuvo una suscripcion.
    if v_trial_end is not null
      and v_trial_end > now() - interval '7 days'
      and not exists (
        select 1 from kardo_billing.subscriptions s
        where s.workspace_id = p_workspace_id
          and s.status not in ('incomplete', 'incomplete_expired')
      ) then
      v_offer := v_trial_end + interval '7 days';
    end if;

    return query select
      case when now() < v_lapsed + interval '7 days' then 'limited' else 'paused' end,
      v_source, v_code, v_name, null::timestamptz,
      v_lapsed, v_lapsed + interval '7 days', v_lapsed + interval '90 days', v_offer;
    return;
  end if;

  -- 6. Nunca tuvo prueba ni plan.
  if v_created < coalesce(
    (select ap.legacy_before from kardo_billing.access_policy ap where ap.singleton),
    'infinity'::timestamptz
  ) then
    return query select 'legacy'::text, 'legacy'::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
  else
    return query select 'limited'::text, 'none'::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
  end if;
end;
$$;
revoke all on function kardo_billing.resolve_workspace_access(uuid) from public;
grant execute on function kardo_billing.resolve_workspace_access(uuid) to kardo_billing_sync;

-- Estado de acceso de una organizacion: miembros o staff activo.
create or replace function kardo_billing.workspace_access(p_workspace_id uuid)
returns table (
  state text,
  source text,
  plan_code text,
  plan_name text,
  ends_at timestamptz,
  lapsed_at timestamptz,
  grace_ends_at timestamptz,
  delete_at timestamptz,
  offer_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (kardo_private.is_workspace_member(p_workspace_id) or kardo_private.is_active_staff()) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  return query select * from kardo_billing.resolve_workspace_access(p_workspace_id);
end;
$$;
revoke all on function kardo_billing.workspace_access(uuid) from public;
grant execute on function kardo_billing.workspace_access(uuid) to kardo_customer_api, kardo_staff_api;

-- ---------------------------------------------------------------------------
-- 7. Acciones de staff (auditadas)
-- ---------------------------------------------------------------------------

-- Marca o quita la cuenta interna. Devuelve si cambio algo.
create or replace function kardo_private.set_workspace_internal(
  p_workspace_id uuid,
  p_internal boolean,
  p_reason text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := kardo_private.current_staff_subject();
  v_count integer;
begin
  if v_staff is null or not kardo_private.staff_has_permission('billing.write') then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_REASON';
  end if;
  if not exists (select 1 from kardo_core.workspaces w where w.id = p_workspace_id) then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  if p_internal then
    insert into kardo_billing.internal_workspaces (workspace_id, reason, set_by)
    values (p_workspace_id, btrim(p_reason), v_staff)
    on conflict (workspace_id) do nothing;
  else
    delete from kardo_billing.internal_workspaces where workspace_id = p_workspace_id;
  end if;
  get diagnostics v_count = row_count;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, reason, metadata
  ) values (
    p_workspace_id, v_staff, 'staff',
    case when p_internal then 'billing.internal_marked' else 'billing.internal_cleared' end,
    'workspace', p_workspace_id, 'succeeded', btrim(p_reason),
    jsonb_build_object('changed', v_count > 0)
  );
  return v_count > 0;
end;
$$;
revoke all on function kardo_private.set_workspace_internal(uuid, boolean, text) from public;
grant execute on function kardo_private.set_workspace_internal(uuid, boolean, text) to kardo_staff_api;

-- Extiende (o reabre) la prueba de Kardo: `days` dias desde hoy o desde su
-- fin, lo que sea mas tarde. Devuelve el nuevo fin.
create or replace function kardo_private.extend_workspace_trial(
  p_workspace_id uuid,
  p_days integer,
  p_reason text
) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := kardo_private.current_staff_subject();
  v_before timestamptz;
  v_after timestamptz;
begin
  if v_staff is null or not kardo_private.staff_has_permission('billing.write') then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception using errcode = 'P0001', message = 'INVALID_TRIAL_DAYS';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(p_reason) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_REASON';
  end if;

  select t.ends_at into v_before
  from kardo_billing.trials t
  where t.workspace_id = p_workspace_id and t.converted_at is null
  for update;
  if v_before is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;

  update kardo_billing.trials
  set ends_at = greatest(ends_at, now()) + make_interval(days => p_days)
  where workspace_id = p_workspace_id and converted_at is null
  returning ends_at into v_after;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, reason, metadata
  ) values (
    p_workspace_id, v_staff, 'staff', 'billing.kardo_trial_extended', 'workspace', p_workspace_id,
    'succeeded', btrim(p_reason),
    jsonb_build_object('days', p_days, 'from', v_before, 'to', v_after)
  );
  return v_after;
end;
$$;
revoke all on function kardo_private.extend_workspace_trial(uuid, integer, text) from public;
grant execute on function kardo_private.extend_workspace_trial(uuid, integer, text) to kardo_staff_api;
