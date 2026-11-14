-- Borrado real a los 90 dias (ADR 020, adenda del 2026-10-01; relevo 20, T2).
--
-- Anonimizar, no borrar a ciegas. Se borra el contenido de la organizacion
-- (Experiences, archivos, leads, grupos, analitica, invitaciones y
-- membresias); los Touchpoints quedan como lapida `retired` para que su
-- identificador publico nunca se reasigne; se conserva lo que la ley pide
-- (cobro, avisos, CFDI, prueba y auditoria, 5 anos, CFF art. 30). La matriz
-- completa esta en la adenda, marcada "revision del abogado".
--
-- Solo la tarea horaria la llama (rol kardo_billing_sync) y solo con
-- BILLING_DELETE_ENABLED=true. La limpieza fuera de la base (R2 y Resolver)
-- queda en `deletion_cleanup` y la tarea la reintenta cada hora.

-- ---------------------------------------------------------------------------
-- 1. Marca de borrado en la organizacion
-- ---------------------------------------------------------------------------

alter table kardo_core.workspaces add column if not exists deleted_at timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Registro del borrado y limpieza pendiente
-- ---------------------------------------------------------------------------

create table if not exists kardo_billing.workspace_deletions (
  workspace_id uuid primary key references kardo_core.workspaces(id) on delete restrict,
  reason text not null check (char_length(btrim(reason)) between 3 and 200),
  deleted_at timestamptz not null default now(),
  -- Cuanto se borro, para Operations y la auditoria.
  counts jsonb not null default '{}'::jsonb check (jsonb_typeof(counts) = 'object'),
  -- Cuando la tarea termino de limpiar R2 y el Resolver.
  cleanup_completed_at timestamptz
);

create table if not exists kardo_billing.deletion_cleanup (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references kardo_billing.workspace_deletions(workspace_id) on delete restrict,
  -- `resolver`: retirar el Touchpoint y borrar sus snapshots publicados.
  -- `asset`: borrar el archivo original (y su derivado si nadie mas lo usa).
  kind text not null check (kind in ('resolver', 'asset')),
  target jsonb not null check (jsonb_typeof(target) = 'object' and pg_column_size(target) <= 2048),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  done_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists billing_deletion_cleanup_pending_idx
  on kardo_billing.deletion_cleanup (workspace_id, created_at) where done_at is null;

alter table kardo_billing.workspace_deletions enable row level security;
alter table kardo_billing.deletion_cleanup enable row level security;

do $$
declare
  target text;
begin
  foreach target in array array['workspace_deletions', 'deletion_cleanup'] loop
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

grant select on kardo_billing.workspace_deletions, kardo_billing.deletion_cleanup to kardo_staff_api;
-- La tarea solo marca lo limpiado; las filas las crea la funcion de borrado.
grant select, update (cleanup_completed_at) on kardo_billing.workspace_deletions to kardo_billing_sync;
grant select, update (attempts, last_error, done_at) on kardo_billing.deletion_cleanup to kardo_billing_sync;

-- ---------------------------------------------------------------------------
-- 3. Guardas
-- ---------------------------------------------------------------------------

-- `deleted_at` solo se pone con un registro de borrado (que solo escribe la
-- funcion SECURITY DEFINER) y nunca se quita: el Customer API tiene UPDATE
-- sobre la tabla, pero no puede borrar ni "desborrar" una organizacion.
create or replace function kardo_core.enforce_workspace_deletion_mark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.deleted_at is not null and new.deleted_at is distinct from old.deleted_at then
    raise exception using errcode = 'P0001', message = 'WORKSPACE_DELETED';
  end if;
  if old.deleted_at is null and new.deleted_at is not null and not exists (
    select 1 from kardo_billing.workspace_deletions d where d.workspace_id = old.id
  ) then
    raise exception using errcode = 'P0001', message = 'WORKSPACE_DELETION_REQUIRED';
  end if;
  return new;
end;
$$;
revoke all on function kardo_core.enforce_workspace_deletion_mark() from public;

drop trigger if exists workspaces_deletion_mark on kardo_core.workspaces;
create trigger workspaces_deletion_mark
  before update of deleted_at on kardo_core.workspaces
  for each row execute function kardo_core.enforce_workspace_deletion_mark();

-- El borrado quita todas las membresias, la del ultimo Owner incluida: la
-- guarda lo permite solo si la organizacion tiene registro de borrado.
create or replace function kardo_core.enforce_workspace_last_owner()
 returns trigger
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  remaining_owners integer;
begin
  if old.role <> 'owner' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  -- Cascading deletes (workspace or member account removed) are never blocked.
  if tg_op = 'DELETE' and (
    not exists (select 1 from kardo_core.workspaces workspace where workspace.id = old.workspace_id)
    or not exists (select 1 from kardo_core.profiles profile where profile.id = old.profile_id)
    or exists (
      select 1 from kardo_billing.workspace_deletions deletion
      where deletion.workspace_id = old.workspace_id
    )
  ) then
    return old;
  end if;
  if tg_op = 'UPDATE' and new.role = 'owner' and new.workspace_id = old.workspace_id then
    return new;
  end if;
  select count(*) into remaining_owners
  from kardo_core.workspace_memberships membership
  where membership.workspace_id = old.workspace_id
    and membership.role = 'owner'
    and membership.profile_id <> old.profile_id;
  if remaining_owners = 0 then
    raise exception using errcode = 'P0001', message = 'LAST_OWNER';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Estado de acceso: `deleted`
-- ---------------------------------------------------------------------------

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
  v_deleted timestamptz;
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
  select w.created_at, w.deleted_at into v_created, v_deleted
  from kardo_core.workspaces w where w.id = p_workspace_id;
  if not found then
    return;
  end if;

  -- 0. Borrada (adenda del 2026-10-01): solo queda lo que la ley conserva.
  --    `delete_at` es cuando se borro.
  if v_deleted is not null then
    return query select 'deleted'::text, 'none'::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, v_deleted, null::timestamptz;
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

-- ---------------------------------------------------------------------------
-- 5. Borrado
-- ---------------------------------------------------------------------------

-- Cuenta lo que el borrado quitaria (modo de ensayo y registro).
create or replace function kardo_private.workspace_deletion_counts(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'touchpoints', (select count(*) from kardo_core.touchpoints t where t.workspace_id = p_workspace_id),
    'experiences', (select count(*) from kardo_core.experiences e where e.workspace_id = p_workspace_id),
    'experienceVersions', (
      select count(*) from kardo_core.experience_versions v
      join kardo_core.experiences e on e.id = v.experience_id
      where e.workspace_id = p_workspace_id
    ),
    'assets', (select count(*) from kardo_core.assets a where a.workspace_id = p_workspace_id and a.status <> 'deleted'),
    'leads', (select count(*) from kardo_core.leads l where l.workspace_id = p_workspace_id),
    'members', (select count(*) from kardo_core.workspace_memberships m where m.workspace_id = p_workspace_id),
    'invitations', (select count(*) from kardo_core.workspace_invitations i where i.workspace_id = p_workspace_id),
    'groups', (select count(*) from kardo_core.touchpoint_groups g where g.workspace_id = p_workspace_id),
    'qrTemplates', (select count(*) from kardo_core.qr_design_templates q where q.workspace_id = p_workspace_id),
    'analyticsRows', (
      (select count(*) from kardo_core.analytics_raw_events r where r.workspace_id = p_workspace_id)
      + (select count(*) from kardo_core.analytics_hourly h where h.workspace_id = p_workspace_id)
      + (select count(*) from kardo_core.analytics_daily d where d.workspace_id = p_workspace_id)
    ),
    'invoicesKept', (select count(*) from kardo_billing.invoices i where i.workspace_id = p_workspace_id),
    'cfdiKept', (select count(*) from kardo_billing.cfdi_requests c where c.workspace_id = p_workspace_id)
  );
$$;
revoke all on function kardo_private.workspace_deletion_counts(uuid) from public;

-- Borra (anonimiza) una organizacion que cumplio sus 90 dias sin contratar.
-- Idempotente; vuelve a revisar todo en esta transaccion. Devuelve:
--   {status: 'deleted' | 'dry_run' | 'already_deleted' | 'not_due' | 'not_found', ...}
create or replace function kardo_private.delete_workspace_data(
  p_workspace_id uuid,
  p_reason text,
  p_dry_run boolean default false
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted timestamptz;
  v_state text;
  v_delete_at timestamptz;
  v_counts jsonb;
  v_cleanup integer;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 200 then
    raise exception using errcode = 'P0001', message = 'INVALID_REASON';
  end if;

  select w.deleted_at into v_deleted
  from kardo_core.workspaces w where w.id = p_workspace_id
  for update;
  if not found then
    return jsonb_build_object('status', 'not_found');
  end if;
  if v_deleted is not null then
    return jsonb_build_object('status', 'already_deleted', 'deletedAt', v_deleted);
  end if;

  -- Revisa de nuevo, con la organizacion bloqueada: en pausa (no interna, no
  -- legacy, no en prueba ni con plan), sin suscripcion abierta en Stripe y
  -- con su fecha de borrado cumplida.
  select a.state, a.delete_at into v_state, v_delete_at
  from kardo_billing.resolve_workspace_access(p_workspace_id) a;
  if v_state is distinct from 'paused' then
    return jsonb_build_object('status', 'not_due', 'why', 'state', 'state', v_state);
  end if;
  if exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = p_workspace_id) then
    return jsonb_build_object('status', 'not_due', 'why', 'internal');
  end if;
  if exists (
    select 1 from kardo_billing.subscriptions s
    where s.workspace_id = p_workspace_id
      and s.status not in ('canceled', 'incomplete_expired')
  ) then
    return jsonb_build_object('status', 'not_due', 'why', 'open_subscription');
  end if;
  if v_delete_at is null or v_delete_at > now() then
    return jsonb_build_object('status', 'not_due', 'why', 'delete_at', 'deleteAt', v_delete_at);
  end if;

  v_counts := kardo_private.workspace_deletion_counts(p_workspace_id);
  if p_dry_run then
    return jsonb_build_object('status', 'dry_run', 'counts', v_counts, 'deleteAt', v_delete_at);
  end if;

  -- El registro va primero: autoriza la marca y quitar al ultimo Owner.
  insert into kardo_billing.workspace_deletions (workspace_id, reason, counts)
  values (p_workspace_id, btrim(p_reason), v_counts);

  -- Limpieza fuera de la base, despues del commit (la hace la tarea).
  insert into kardo_billing.deletion_cleanup (workspace_id, kind, target)
  select p_workspace_id, 'resolver', jsonb_build_object('publicId', t.public_id)
  from kardo_core.touchpoints t
  where t.workspace_id = p_workspace_id;
  insert into kardo_billing.deletion_cleanup (workspace_id, kind, target)
  select p_workspace_id, 'asset', jsonb_build_object(
    'assetId', a.id,
    'storageKey', a.storage_key,
    'sha256', case when a.derivative_key is not null then a.sha256 end,
    -- El derivado publico se nombra por su hash: solo se borra si ningun
    -- archivo vivo de otra organizacion lo comparte.
    'deleteDerivative', a.derivative_key is not null and not exists (
      select 1 from kardo_core.assets other
      where other.sha256 = a.sha256
        and other.workspace_id <> p_workspace_id
        and other.status in ('validated', 'published')
    )
  )
  from kardo_core.assets a
  where a.workspace_id = p_workspace_id and a.status <> 'deleted';
  select count(*) into v_cleanup
  from kardo_billing.deletion_cleanup c where c.workspace_id = p_workspace_id;

  -- Touchpoints: lapida. El trigger fija `retired_at` y quita grupo y handle.
  update kardo_core.touchpoints set
    status = 'retired',
    operational_name = null,
    qr_design = null,
    qr_design_updated_at = null,
    qr_template_id = null,
    qr_last_export_at = null,
    qr_last_export_fingerprint = null,
    qr_last_export_format = null,
    updated_at = now()
  where workspace_id = p_workspace_id;
  delete from kardo_core.touchpoint_activations
  where touchpoint_id in (
    select t.id from kardo_core.touchpoints t where t.workspace_id = p_workspace_id
  );

  -- Contenido.
  delete from kardo_core.experience_targets where workspace_id = p_workspace_id;
  delete from kardo_core.publication_requests where workspace_id = p_workspace_id;
  delete from kardo_core.item_availability where workspace_id = p_workspace_id;
  delete from kardo_core.publications
  where touchpoint_id in (
    select t.id from kardo_core.touchpoints t where t.workspace_id = p_workspace_id
  );
  delete from kardo_core.experience_assets
  where experience_id in (
    select e.id from kardo_core.experiences e where e.workspace_id = p_workspace_id
  );
  delete from kardo_core.experience_versions
  where experience_id in (
    select e.id from kardo_core.experiences e where e.workspace_id = p_workspace_id
  );
  delete from kardo_core.experiences where workspace_id = p_workspace_id;
  delete from kardo_core.assets where workspace_id = p_workspace_id;

  -- Datos de terceros y de operacion.
  delete from kardo_core.leads where workspace_id = p_workspace_id;
  delete from kardo_core.lead_deliveries where workspace_id = p_workspace_id;
  delete from kardo_core.lead_delivery_settings where workspace_id = p_workspace_id;
  delete from kardo_core.analytics_raw_events where workspace_id = p_workspace_id;
  delete from kardo_core.analytics_hourly where workspace_id = p_workspace_id;
  delete from kardo_core.analytics_daily where workspace_id = p_workspace_id;
  delete from kardo_core.qr_design_templates where workspace_id = p_workspace_id;
  delete from kardo_core.touchpoint_groups where workspace_id = p_workspace_id;
  delete from kardo_core.dashboard_layouts where workspace_id = p_workspace_id;
  delete from kardo_core.custom_html_ai_usage where workspace_id = p_workspace_id;
  delete from kardo_core.workspace_invitations where workspace_id = p_workspace_id;
  delete from kardo_core.workspace_memberships where workspace_id = p_workspace_id;

  -- El perfil fiscal se conserva solo si sustenta un CFDI emitido.
  delete from kardo_billing.fiscal_profiles f
  where f.workspace_id = p_workspace_id
    and not exists (
      select 1 from kardo_billing.cfdi_requests c
      where c.workspace_id = p_workspace_id and c.status in ('issued', 'canceled')
    );
  -- Nadie queda a quien avisar; los enviados se conservan como constancia.
  update kardo_billing.notices
  set status = 'skipped', last_error = 'workspace deleted'
  where workspace_id = p_workspace_id and status in ('pending', 'failed');
  -- Las paginas ya no estan en pausa por cobro: estan retiradas.
  update kardo_billing.access_states
  set pages_paused_at = null, updated_at = now()
  where workspace_id = p_workspace_id;

  update kardo_core.workspaces set
    name = 'Organización eliminada',
    profile = '{}'::jsonb,
    lead_retention_days = null,
    deleted_at = now(),
    updated_at = now()
  where id = p_workspace_id;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, reason, metadata
  ) values (
    p_workspace_id, null, 'service', 'workspace.deleted', 'workspace', p_workspace_id,
    'succeeded', btrim(p_reason), v_counts || jsonb_build_object('cleanupItems', v_cleanup)
  );

  return jsonb_build_object('status', 'deleted', 'counts', v_counts, 'cleanupItems', v_cleanup);
end;
$$;
revoke all on function kardo_private.delete_workspace_data(uuid, text, boolean) from public;
grant execute on function kardo_private.delete_workspace_data(uuid, text, boolean) to kardo_billing_sync;
