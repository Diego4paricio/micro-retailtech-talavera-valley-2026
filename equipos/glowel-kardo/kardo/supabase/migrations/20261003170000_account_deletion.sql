-- Tus datos (ADR 023): exportar mis datos y borrar mi cuenta (derechos ARCO,
-- LFPDPPP), decidido por el dueño el 2026-10-03.
--
-- Borrar la cuenta borra también las organizaciones donde la persona es la
-- única integrante, con el mismo borrado del cobro (ADR 020: lápidas de
-- Touchpoints, contenido fuera, lo legal se conserva). Antes hay que
-- transferir las organizaciones con más personas y cancelar suscripciones
-- abiertas. Pide una autenticación de hace 10 minutos o menos.

-- ---------------------------------------------------------------------------
-- 1. El borrado de una organización, reutilizable
-- ---------------------------------------------------------------------------

-- Interna: borra el contenido de una organización ya bloqueada (lo que antes
-- hacía delete_workspace_data después de sus comprobaciones, sin cambios).
create or replace function kardo_private.erase_workspace_data(
  p_workspace_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
  v_cleanup integer;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 200 then
    raise exception using errcode = 'P0001', message = 'INVALID_REASON';
  end if;
  v_counts := kardo_private.workspace_deletion_counts(p_workspace_id);

  -- El registro va primero: autoriza la marca y quitar al ultimo Owner.
  insert into kardo_billing.workspace_deletions (workspace_id, reason, counts)
  values (p_workspace_id, btrim(p_reason), v_counts);

  -- Limpieza fuera de la base, despues del commit.
  insert into kardo_billing.deletion_cleanup (workspace_id, kind, target)
  select p_workspace_id, 'resolver', jsonb_build_object('publicId', t.public_id)
  from kardo_core.touchpoints t
  where t.workspace_id = p_workspace_id;
  insert into kardo_billing.deletion_cleanup (workspace_id, kind, target)
  select p_workspace_id, 'asset', jsonb_build_object(
    'assetId', a.id,
    'storageKey', a.storage_key,
    'sha256', case when a.derivative_key is not null then a.sha256 end,
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
  update kardo_billing.notices
  set status = 'skipped', last_error = 'workspace deleted'
  where workspace_id = p_workspace_id and status in ('pending', 'failed');
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
revoke all on function kardo_private.erase_workspace_data(uuid, text) from public;

-- La tarea horaria sigue igual: sus comprobaciones y luego el borrado.
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

  if p_dry_run then
    return jsonb_build_object(
      'status', 'dry_run',
      'counts', kardo_private.workspace_deletion_counts(p_workspace_id),
      'deleteAt', v_delete_at
    );
  end if;
  return kardo_private.erase_workspace_data(p_workspace_id, p_reason);
end;
$$;
revoke all on function kardo_private.delete_workspace_data(uuid, text, boolean) from public;
grant execute on function kardo_private.delete_workspace_data(uuid, text, boolean) to kardo_billing_sync;

-- ---------------------------------------------------------------------------
-- 2. Lo que una persona hizo se conserva sin ella
-- ---------------------------------------------------------------------------

-- Al borrar una cuenta, lo que creó en organizaciones que siguen (una
-- Experience, una publicación, un archivo) queda sin autor en lugar de
-- impedir el borrado.
alter table kardo_core.experiences alter column created_by drop not null;
alter table kardo_core.experience_versions alter column created_by drop not null;
alter table kardo_core.publications alter column created_by drop not null;
alter table kardo_core.assets alter column created_by drop not null;
alter table kardo_core.publication_requests alter column created_by drop not null;

do $$
declare
  fk record;
begin
  for fk in
    select * from (values
      ('kardo_core.workspace_plans', 'workspace_plans_assigned_by_fkey', 'assigned_by'),
      ('kardo_core.touchpoint_activations', 'touchpoint_activations_claimed_by_fkey', 'claimed_by'),
      ('kardo_core.experiences', 'experiences_created_by_fkey', 'created_by'),
      ('kardo_core.experience_versions', 'experience_versions_created_by_fkey', 'created_by'),
      ('kardo_core.publications', 'publications_created_by_fkey', 'created_by'),
      ('kardo_core.assets', 'assets_created_by_fkey', 'created_by'),
      ('kardo_core.publication_requests', 'publication_requests_created_by_fkey', 'created_by')
    ) as t(tbl, name, col)
  loop
    execute format('alter table %s drop constraint if exists %I', fk.tbl, fk.name);
    execute format(
      'alter table %s add constraint %I foreign key (%I) references kardo_core.profiles(id) on delete set null',
      fk.tbl, fk.name, fk.col
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3. Revisar, borrar y exportar (siempre la persona del contexto del API)
-- ---------------------------------------------------------------------------

-- Qué pasaría al borrar la cuenta: lo que lo impide y lo que se borra con ella.
create or replace function kardo_private.customer_account_deletion_check(p_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_recent boolean;
  v_blockers jsonb;
  v_erase jsonb;
begin
  if v_subject is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  -- Autenticación reciente: contraseña, código por correo o de la app en
  -- esta misma sesión, hace 10 minutos o menos.
  select exists (
    select 1
    from auth.sessions s
    join auth.mfa_amr_claims c on c.session_id = s.id
    where s.id = p_session and s.user_id = v_subject
      and greatest(c.created_at, c.updated_at) > now() - interval '10 minutes'
  ) into v_recent;

  select coalesce(jsonb_agg(b order by b ->> 'kind', b ->> 'name'), '[]'::jsonb)
  into v_blockers
  from (
    -- Owner único de una organización con más personas: transferir antes.
    select jsonb_build_object('kind', 'owner_with_team', 'workspaceId', w.id, 'name', w.name) as b
    from kardo_core.workspace_memberships m
    join kardo_core.workspaces w on w.id = m.workspace_id and w.deleted_at is null
    where m.profile_id = v_subject and m.role = 'owner'
      and exists (
        select 1 from kardo_core.workspace_memberships other
        where other.workspace_id = w.id and other.profile_id <> v_subject
      )
      and not exists (
        select 1 from kardo_core.workspace_memberships other
        where other.workspace_id = w.id and other.profile_id <> v_subject and other.role = 'owner'
      )
    union all
    -- Organizaciones que se borrarían con una suscripción abierta: cancelar antes.
    select jsonb_build_object('kind', 'open_subscription', 'workspaceId', w.id, 'name', w.name)
    from kardo_core.workspace_memberships m
    join kardo_core.workspaces w on w.id = m.workspace_id and w.deleted_at is null
    where m.profile_id = v_subject
      and not exists (
        select 1 from kardo_core.workspace_memberships other
        where other.workspace_id = w.id and other.profile_id <> v_subject
      )
      and exists (
        select 1 from kardo_billing.subscriptions s
        where s.workspace_id = w.id and s.status not in ('canceled', 'incomplete_expired')
      )
    union all
    select jsonb_build_object('kind', 'internal', 'workspaceId', w.id, 'name', w.name)
    from kardo_core.workspace_memberships m
    join kardo_core.workspaces w on w.id = m.workspace_id and w.deleted_at is null
    join kardo_billing.internal_workspaces i on i.workspace_id = w.id
    where m.profile_id = v_subject
    union all
    select jsonb_build_object('kind', 'staff', 'workspaceId', null, 'name', null)
    from kardo_staff.staff_profiles st where st.id = v_subject
  ) blockers;

  select coalesce(jsonb_agg(jsonb_build_object(
    'workspaceId', w.id, 'name', w.name, 'kind', w.kind::text
  ) order by w.kind, w.name), '[]'::jsonb)
  into v_erase
  from kardo_core.workspace_memberships m
  join kardo_core.workspaces w on w.id = m.workspace_id and w.deleted_at is null
  where m.profile_id = v_subject
    and not exists (
      select 1 from kardo_core.workspace_memberships other
      where other.workspace_id = w.id and other.profile_id <> v_subject
    );

  return jsonb_build_object(
    'recentSignIn', v_recent,
    'blockers', v_blockers,
    'erase', v_erase
  );
end;
$$;
revoke all on function kardo_private.customer_account_deletion_check(uuid) from public;
grant execute on function kardo_private.customer_account_deletion_check(uuid) to kardo_customer_api;

create or replace function kardo_private.delete_customer_account(p_session uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_check jsonb;
  v_workspace record;
  v_erased uuid[] := '{}';
begin
  if v_subject is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  -- Bloquea las organizaciones de la persona en el mismo orden siempre.
  perform 1 from kardo_core.workspaces w
  join kardo_core.workspace_memberships m on m.workspace_id = w.id
  where m.profile_id = v_subject
  order by w.id
  for update of w;

  v_check := kardo_private.customer_account_deletion_check(p_session);
  if not (v_check ->> 'recentSignIn')::boolean then
    return jsonb_build_object('status', 'reauthenticate');
  end if;
  if jsonb_array_length(v_check -> 'blockers') > 0 then
    return jsonb_build_object('status', 'blocked', 'blockers', v_check -> 'blockers');
  end if;

  for v_workspace in
    select (e ->> 'workspaceId')::uuid as id from jsonb_array_elements(v_check -> 'erase') e
  loop
    perform kardo_private.erase_workspace_data(v_workspace.id, 'customer.account_deleted');
    v_erased := v_erased || v_workspace.id;
  end loop;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    null, null, 'customer', 'account.deleted', 'profile', v_subject, 'succeeded',
    jsonb_build_object('erasedWorkspaces', coalesce(array_length(v_erased, 1), 0))
  );

  -- La cuenta de Auth y, en cascada, el perfil, sus membresías, sesiones,
  -- factores, preferencias e historial.
  delete from auth.users where id = v_subject;

  return jsonb_build_object('status', 'deleted', 'erased', to_jsonb(v_erased));
end;
$$;
revoke all on function kardo_private.delete_customer_account(uuid) from public;
grant execute on function kardo_private.delete_customer_account(uuid) to kardo_customer_api;

-- Métodos de verificación de la persona, sin secretos, para «Exportar mis datos».
create or replace function kardo_private.customer_factors()
returns table (friendly_name text, factor_type text, status text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select f.friendly_name, f.factor_type::text, f.status::text, f.created_at
  from auth.mfa_factors f
  where f.user_id = kardo_private.current_customer_subject()
  order by f.created_at;
$$;
revoke all on function kardo_private.customer_factors() from public;
grant execute on function kardo_private.customer_factors() to kardo_customer_api;
