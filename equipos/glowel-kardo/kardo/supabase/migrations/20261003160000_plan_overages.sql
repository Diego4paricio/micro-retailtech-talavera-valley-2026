-- Bajada de plan, opción B (ADR 023 §3, decidida por el dueño el 2026-10-03).
--
-- Si al bajar de plan la organización tiene más Touchpoints o Links que los
-- que incluye el plan nuevo, tiene 14 días para elegir cuáles siguen activos.
-- Si no elige, la tarea horaria deja activos los más visitados en 30 días
-- (los calcula el API con Analytics Engine y los pasa aquí). Los demás
-- quedan «fuera del plan»: muestran la página neutral del Resolver (la misma
-- pausa por Touchpoint del cobro), no cuentan para el límite y nada se borra.
-- Volver a un plan que los incluya, o liberar espacio, los reactiva.

-- ---------------------------------------------------------------------------
-- 1. Touchpoints fuera del plan
-- ---------------------------------------------------------------------------

alter table kardo_core.touchpoints
  add column if not exists plan_excluded_at timestamptz;
create index if not exists touchpoints_plan_excluded_idx
  on kardo_core.touchpoints (workspace_id) where plan_excluded_at is not null;
-- La tarea horaria, al reanudar páginas pausadas por cobro, deja en pausa
-- lo que está fuera del plan.
grant select (plan_excluded_at) on kardo_core.touchpoints to kardo_billing_sync;

-- ---------------------------------------------------------------------------
-- 2. El plazo para elegir
-- ---------------------------------------------------------------------------

create table if not exists kardo_billing.plan_overages (
  workspace_id uuid primary key references kardo_core.workspaces(id) on delete cascade,
  plan_code text not null check (char_length(plan_code) between 1 and 64),
  touchpoints_limit integer check (touchpoints_limit is null or touchpoints_limit >= 0),
  links_limit integer check (links_limit is null or links_limit >= 0),
  -- Cuántos quedaban fuera al detectarlo, para el aviso y Operations.
  touchpoints_over integer not null default 0 check (touchpoints_over >= 0),
  links_over integer not null default 0 check (links_over >= 0),
  detected_at timestamptz not null default now(),
  choose_by timestamptz not null,
  chosen_at timestamptz,
  applied_at timestamptz,
  reminded_at timestamptz,
  resolved_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists plan_overages_open_idx
  on kardo_billing.plan_overages (choose_by) where resolved_at is null;

alter table kardo_billing.plan_overages enable row level security;
revoke all on kardo_billing.plan_overages from public, anon, authenticated;
grant select on kardo_billing.plan_overages to kardo_customer_api, kardo_staff_api;
grant select, insert, update on kardo_billing.plan_overages to kardo_billing_sync;

drop policy if exists "customer api plan overages" on kardo_billing.plan_overages;
create policy "customer api plan overages" on kardo_billing.plan_overages
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));
drop policy if exists "staff api billing read" on kardo_billing.plan_overages;
create policy "staff api billing read" on kardo_billing.plan_overages
  for select to kardo_staff_api
  using (kardo_private.staff_has_permission('billing.read'));
drop policy if exists "billing sync plan overages" on kardo_billing.plan_overages;
create policy "billing sync plan overages" on kardo_billing.plan_overages
  for all to kardo_billing_sync using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3. Lo que el Resolver debe saber (pausa por Touchpoint)
-- ---------------------------------------------------------------------------

-- Cola del estado deseado: el API la vacía después de cada cambio y la
-- tarea horaria reintenta lo que falló. Una fila por Touchpoint.
create table if not exists kardo_billing.touchpoint_pause_sync (
  touchpoint_id uuid primary key references kardo_core.touchpoints(id) on delete cascade,
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  public_id text not null check (public_id ~ '^[A-Za-z0-9_-]{16,32}$'),
  paused boolean not null,
  requested_at timestamptz not null default now(),
  synced_at timestamptz,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 500)
);
create index if not exists touchpoint_pause_sync_pending_idx
  on kardo_billing.touchpoint_pause_sync (requested_at) where synced_at is null;

alter table kardo_billing.touchpoint_pause_sync enable row level security;
revoke all on kardo_billing.touchpoint_pause_sync from public, anon, authenticated;
grant select, update on kardo_billing.touchpoint_pause_sync to kardo_customer_api;
grant select, insert, update on kardo_billing.touchpoint_pause_sync to kardo_billing_sync;

drop policy if exists "customer api pause sync" on kardo_billing.touchpoint_pause_sync;
create policy "customer api pause sync" on kardo_billing.touchpoint_pause_sync
  for all to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id))
  with check (kardo_private.is_workspace_member(workspace_id));
drop policy if exists "billing sync pause sync" on kardo_billing.touchpoint_pause_sync;
create policy "billing sync pause sync" on kardo_billing.touchpoint_pause_sync
  for all to kardo_billing_sync using (true) with check (true);

-- Interna: pide el estado que corresponde a un Touchpoint (fuera del plan, o
-- toda la organización en pausa por cobro).
create or replace function kardo_billing.request_touchpoint_pause(p_touchpoint_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into kardo_billing.touchpoint_pause_sync (touchpoint_id, workspace_id, public_id, paused)
  select t.id, t.workspace_id, t.public_id,
    t.plan_excluded_at is not null or exists (
      select 1 from kardo_billing.access_states a
      where a.workspace_id = t.workspace_id and a.pages_paused_at is not null
    )
  from kardo_core.touchpoints t
  where t.id = p_touchpoint_id and t.status <> 'retired'
  on conflict (touchpoint_id) do update set
    paused = excluded.paused,
    requested_at = now(),
    synced_at = null,
    attempts = 0,
    last_error = null;
$$;
revoke all on function kardo_billing.request_touchpoint_pause(uuid) from public;

-- ---------------------------------------------------------------------------
-- 4. Límites y uso
-- ---------------------------------------------------------------------------

-- Lo que fuera del plan no cuenta: así cabe lo que sí sigue activo.
create or replace function kardo_billing.workspace_usage(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usage jsonb;
begin
  if not (kardo_private.is_workspace_member(p_workspace_id) or kardo_private.is_active_staff()) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'touchpoints.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = p_workspace_id and t.kind <> 'link'
        and t.status in ('assigned', 'active', 'paused')
        and t.plan_excluded_at is null
    ),
    'links.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = p_workspace_id and t.kind = 'link'
        and t.status in ('assigned', 'active', 'paused')
        and t.plan_excluded_at is null
    ),
    'members.max', (
      (select count(*) from kardo_core.workspace_memberships m where m.workspace_id = p_workspace_id)
      + (select count(*) from kardo_core.workspace_invitations i
         where i.workspace_id = p_workspace_id and i.status = 'pending' and i.expires_at > now())
    ),
    'qr_designs.max', (
      select count(*) from kardo_core.qr_design_templates q where q.workspace_id = p_workspace_id
    ),
    'assets.storage_mb', (
      select coalesce(ceil(sum(a.byte_size) / 1048576.0), 0)::bigint
      from kardo_core.assets a
      where a.workspace_id = p_workspace_id and a.deleted_at is null
        and a.status not in ('rejected', 'deleted')
    ),
    'ai.generations_month', (
      select coalesce(sum(u.generations), 0)
      from kardo_core.custom_html_ai_usage u
      where u.workspace_id = p_workspace_id
        and u.usage_day >= date_trunc('month', (now() at time zone 'utc'))::date
    ),
    'ai.spend_cents_month', (
      select coalesce(ceil(sum(
        case
          when e.metadata ->> 'costMicroUsd' ~ '^[0-9]{1,15}$'
            then (e.metadata ->> 'costMicroUsd')::bigint
          else 0
        end
      ) / 10000.0), 0)::bigint
      from kardo_audit.events e
      where e.workspace_id = p_workspace_id
        and e.action in ('experience.custom_html_generated', 'experience.design_generated')
        and e.occurred_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    )
  ) into v_usage;

  return v_usage;
end;
$$;

-- Interna: los dos límites que esta regla cuida, del plan vigente (como
-- effective_plan, sin su control de acceso: la usan funciones internas).
create or replace function kardo_billing.plan_overage_limits(p_workspace_id uuid)
returns table (plan_code text, touchpoints_limit integer, links_limit integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    plan.code,
    (select (entitlement.value #>> '{}')::integer
     from kardo_core.plan_entitlements entitlement
     where entitlement.plan_id = resolved.plan_id and entitlement.key = 'touchpoints.max'
       and jsonb_typeof(entitlement.value) = 'number'),
    (select (entitlement.value #>> '{}')::integer
     from kardo_core.plan_entitlements entitlement
     where entitlement.plan_id = resolved.plan_id and entitlement.key = 'links.max'
       and jsonb_typeof(entitlement.value) = 'number')
  from kardo_billing.resolve_effective_plan(p_workspace_id) resolved
  join kardo_core.plans plan on plan.id = resolved.plan_id;
$$;
revoke all on function kardo_billing.plan_overage_limits(uuid) from public;

-- ---------------------------------------------------------------------------
-- 5. Detectar, reactivar y cerrar el plazo
-- ---------------------------------------------------------------------------

-- La llaman el webhook de Stripe al cambiar el plan y la tarea horaria.
-- Devuelve qué pasó para el aviso: opened, updated, resolved o none.
create or replace function kardo_billing.refresh_plan_overage(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan text;
  v_tp_limit integer;
  v_ln_limit integer;
  v_kind text;
  v_limit integer;
  v_active integer;
  v_free integer;
  v_tp_over integer := 0;
  v_ln_over integer := 0;
  v_row kardo_billing.plan_overages%rowtype;
  v_reactivated integer := 0;
  v_moved integer;
  v_target record;
begin
  if exists (
    select 1 from kardo_core.workspaces w
    where w.id = p_workspace_id and w.deleted_at is not null
  ) then
    return jsonb_build_object('status', 'none');
  end if;
  select l.plan_code, l.touchpoints_limit, l.links_limit
  into v_plan, v_tp_limit, v_ln_limit
  from kardo_billing.plan_overage_limits(p_workspace_id) l;

  -- Espacio libre (subió de plan o retiró algo): vuelven primero los que
  -- salieron antes.
  foreach v_kind in array array['touchpoint', 'link'] loop
    v_limit := case v_kind when 'touchpoint' then v_tp_limit else v_ln_limit end;
    select count(*) into v_active from kardo_core.touchpoints t
    where t.workspace_id = p_workspace_id
      and (t.kind = 'link') = (v_kind = 'link')
      and t.status in ('assigned', 'active', 'paused')
      and t.plan_excluded_at is null;
    v_free := case when v_limit is null then 2147483647 else greatest(v_limit - v_active, 0) end;
    if v_free > 0 then
      for v_target in
        select t.id from kardo_core.touchpoints t
        where t.workspace_id = p_workspace_id
          and (t.kind = 'link') = (v_kind = 'link')
          and t.status <> 'retired'
          and t.plan_excluded_at is not null
        order by t.plan_excluded_at, t.created_at
        limit least(v_free, 100000)
      loop
        update kardo_core.touchpoints set plan_excluded_at = null, updated_at = now()
        where id = v_target.id;
        perform kardo_billing.request_touchpoint_pause(v_target.id);
        v_reactivated := v_reactivated + 1;
      end loop;
    end if;
    -- Lo que sigue de más después de reactivar.
    select count(*) into v_active from kardo_core.touchpoints t
    where t.workspace_id = p_workspace_id
      and (t.kind = 'link') = (v_kind = 'link')
      and t.status in ('assigned', 'active', 'paused')
      and t.plan_excluded_at is null;
    if v_limit is not null and v_active > v_limit then
      if v_kind = 'touchpoint' then v_tp_over := v_active - v_limit;
      else v_ln_over := v_active - v_limit;
      end if;
    end if;
  end loop;

  select * into v_row from kardo_billing.plan_overages o
  where o.workspace_id = p_workspace_id
  for update;

  if v_tp_over > 0 or v_ln_over > 0 then
    if not found or v_row.resolved_at is not null then
      insert into kardo_billing.plan_overages (
        workspace_id, plan_code, touchpoints_limit, links_limit,
        touchpoints_over, links_over, detected_at, choose_by,
        chosen_at, applied_at, reminded_at, resolved_at, updated_at
      ) values (
        p_workspace_id, v_plan, v_tp_limit, v_ln_limit,
        v_tp_over, v_ln_over, now(), now() + interval '14 days',
        null, null, null, null, now()
      )
      on conflict (workspace_id) do update set
        plan_code = excluded.plan_code,
        touchpoints_limit = excluded.touchpoints_limit,
        links_limit = excluded.links_limit,
        touchpoints_over = excluded.touchpoints_over,
        links_over = excluded.links_over,
        detected_at = now(),
        choose_by = now() + interval '14 days',
        chosen_at = null, applied_at = null, reminded_at = null, resolved_at = null,
        updated_at = now();
      return jsonb_build_object('status', 'opened', 'reactivated', v_reactivated,
        'touchpointsOver', v_tp_over, 'linksOver', v_ln_over);
    end if;
    -- Ya estaba abierto: si eligió y ahora vuelve a sobrar (bajó otra vez),
    -- el plazo se reinicia; si no, solo se actualizan los números.
    update kardo_billing.plan_overages set
      plan_code = v_plan,
      touchpoints_limit = v_tp_limit,
      links_limit = v_ln_limit,
      touchpoints_over = v_tp_over,
      links_over = v_ln_over,
      choose_by = case when v_row.applied_at is not null then now() + interval '14 days' else v_row.choose_by end,
      chosen_at = case when v_row.applied_at is not null then null else v_row.chosen_at end,
      applied_at = null,
      updated_at = now()
    where workspace_id = p_workspace_id;
    return jsonb_build_object('status', 'updated', 'reactivated', v_reactivated,
      'touchpointsOver', v_tp_over, 'linksOver', v_ln_over);
  end if;

  -- Ya cabe todo lo activo. El plazo se cierra cuando no queda nada fuera.
  select count(*) into v_moved from kardo_core.touchpoints t
  where t.workspace_id = p_workspace_id and t.status <> 'retired' and t.plan_excluded_at is not null;
  if v_row.workspace_id is not null and v_row.resolved_at is null and v_moved = 0 then
    update kardo_billing.plan_overages set
      touchpoints_over = 0, links_over = 0, resolved_at = now(), updated_at = now()
    where workspace_id = p_workspace_id;
    return jsonb_build_object('status', 'resolved', 'reactivated', v_reactivated);
  end if;
  return jsonb_build_object('status', 'none', 'reactivated', v_reactivated);
end;
$$;
revoke all on function kardo_billing.refresh_plan_overage(uuid) from public;
grant execute on function kardo_billing.refresh_plan_overage(uuid) to kardo_billing_sync;

-- ---------------------------------------------------------------------------
-- 6. Aplicar una elección (del cliente o la regla por defecto)
-- ---------------------------------------------------------------------------

-- Interna: deja activos `p_keep` (dentro del límite de cada tipo) y saca del
-- plan a los demás de los tipos que exceden. `p_by_customer` distingue la
-- elección del cliente de la regla por defecto en el registro y la auditoría.
create or replace function kardo_billing.apply_plan_selection_internal(
  p_workspace_id uuid,
  p_keep uuid[],
  p_by_customer boolean,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tp_limit integer;
  v_ln_limit integer;
  v_kind text;
  v_limit integer;
  v_total integer;
  v_kept integer;
  v_excluded integer := 0;
  v_included integer := 0;
  v_target record;
begin
  perform 1 from kardo_core.workspaces w where w.id = p_workspace_id for update;
  select l.touchpoints_limit, l.links_limit into v_tp_limit, v_ln_limit
  from kardo_billing.plan_overage_limits(p_workspace_id) l;

  foreach v_kind in array array['touchpoint', 'link'] loop
    v_limit := case v_kind when 'touchpoint' then v_tp_limit else v_ln_limit end;
    select count(*) into v_total from kardo_core.touchpoints t
    where t.workspace_id = p_workspace_id
      and (t.kind = 'link') = (v_kind = 'link')
      and t.status in ('assigned', 'active', 'paused');
    -- Ese tipo cabe completo: nada queda fuera.
    if v_limit is null or v_total <= v_limit then
      for v_target in
        select t.id from kardo_core.touchpoints t
        where t.workspace_id = p_workspace_id
          and (t.kind = 'link') = (v_kind = 'link')
          and t.plan_excluded_at is not null and t.status <> 'retired'
      loop
        update kardo_core.touchpoints set plan_excluded_at = null, updated_at = now()
        where id = v_target.id;
        perform kardo_billing.request_touchpoint_pause(v_target.id);
        v_included := v_included + 1;
      end loop;
      continue;
    end if;
    select count(*) into v_kept from kardo_core.touchpoints t
    where t.workspace_id = p_workspace_id
      and (t.kind = 'link') = (v_kind = 'link')
      and t.status in ('assigned', 'active', 'paused')
      and t.id = any(coalesce(p_keep, '{}'));
    if v_kept > v_limit then
      raise exception using errcode = 'P0001', message = 'PLAN_SELECTION_OVER_LIMIT',
        detail = v_kind;
    end if;
    for v_target in
      select t.id, t.plan_excluded_at is not null as was_excluded,
        t.id = any(coalesce(p_keep, '{}')) as keep
      from kardo_core.touchpoints t
      where t.workspace_id = p_workspace_id
        and (t.kind = 'link') = (v_kind = 'link')
        and t.status in ('assigned', 'active', 'paused')
    loop
      if v_target.keep and v_target.was_excluded then
        update kardo_core.touchpoints set plan_excluded_at = null, updated_at = now()
        where id = v_target.id;
        perform kardo_billing.request_touchpoint_pause(v_target.id);
        v_included := v_included + 1;
      elsif not v_target.keep and not v_target.was_excluded then
        update kardo_core.touchpoints set plan_excluded_at = now(), updated_at = now()
        where id = v_target.id;
        perform kardo_billing.request_touchpoint_pause(v_target.id);
        v_excluded := v_excluded + 1;
      end if;
    end loop;
  end loop;

  update kardo_billing.plan_overages set
    chosen_at = case when p_by_customer then now() else chosen_at end,
    applied_at = now(),
    touchpoints_over = 0,
    links_over = 0,
    updated_at = now()
  where workspace_id = p_workspace_id;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    p_workspace_id, p_actor, case when p_by_customer then 'customer' else 'service' end,
    case when p_by_customer then 'billing.plan_selection_saved' else 'billing.plan_selection_default' end,
    'workspace', p_workspace_id, 'succeeded',
    jsonb_build_object('excluded', v_excluded, 'included', v_included)
  );
  return jsonb_build_object('excluded', v_excluded, 'included', v_included);
end;
$$;
revoke all on function kardo_billing.apply_plan_selection_internal(uuid, uuid[], boolean, uuid) from public;

-- El cliente elige (Owner o Admin; el API también lo comprueba).
create or replace function kardo_billing.save_plan_selection(p_workspace_id uuid, p_keep uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
begin
  if v_subject is null or not exists (
    select 1 from kardo_core.workspace_memberships m
    where m.workspace_id = p_workspace_id and m.profile_id = v_subject
      and m.role in ('owner', 'admin')
  ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  return kardo_billing.apply_plan_selection_internal(p_workspace_id, p_keep, true, v_subject);
end;
$$;
revoke all on function kardo_billing.save_plan_selection(uuid, uuid[]) from public;
grant execute on function kardo_billing.save_plan_selection(uuid, uuid[]) to kardo_customer_api;

-- La tarea horaria, al vencer el plazo sin elección.
create or replace function kardo_billing.apply_default_plan_selection(p_workspace_id uuid, p_keep uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from kardo_billing.plan_overages o
    where o.workspace_id = p_workspace_id and o.resolved_at is null
      and o.applied_at is null and o.choose_by <= now()
  ) then
    return jsonb_build_object('status', 'not_due');
  end if;
  return kardo_billing.apply_plan_selection_internal(p_workspace_id, p_keep, false, null)
    || jsonb_build_object('status', 'applied');
end;
$$;
revoke all on function kardo_billing.apply_default_plan_selection(uuid, uuid[]) from public;
grant execute on function kardo_billing.apply_default_plan_selection(uuid, uuid[]) to kardo_billing_sync;

-- Lo que se puede elegir: Touchpoints y Links vivos de la organización. La
-- tarea horaria la usa para la regla por defecto (no lee kardo_core); el
-- API, con la persona en el contexto, solo para su organización.
create or replace function kardo_billing.plan_selection_candidates(p_workspace_id uuid)
returns table (
  id uuid,
  public_id text,
  kind text,
  name text,
  status text,
  excluded boolean,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if kardo_private.current_customer_subject() is not null
     and not kardo_private.is_workspace_member(p_workspace_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  return query
  select t.id, t.public_id, t.kind, t.operational_name, t.status::text,
    t.plan_excluded_at is not null, t.updated_at
  from kardo_core.touchpoints t
  where t.workspace_id = p_workspace_id
    and t.status in ('assigned', 'active', 'paused')
  order by t.kind, t.created_at;
end;
$$;
revoke all on function kardo_billing.plan_selection_candidates(uuid) from public;
grant execute on function kardo_billing.plan_selection_candidates(uuid) to kardo_customer_api, kardo_billing_sync;

-- ---------------------------------------------------------------------------
-- 7. Avisos por correo
-- ---------------------------------------------------------------------------

alter table kardo_billing.notices drop constraint if exists notices_kind_check;
alter table kardo_billing.notices add constraint notices_kind_check check (kind in (
  'subscription_started', 'renewal_upcoming', 'trial_ending', 'cancellation_confirmed',
  'trial_started', 'trial_reminder', 'trial_ended',
  'plan_ended', 'pause_upcoming', 'pages_paused', 'deletion_upcoming', 'courtesy_ending',
  'cfdi_issued',
  'plan_overage_opened', 'plan_overage_reminder', 'plan_overage_applied'
));
