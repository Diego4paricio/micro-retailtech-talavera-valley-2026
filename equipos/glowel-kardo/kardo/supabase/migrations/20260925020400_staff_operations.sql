-- Kardo Operations (panel interno): permisos nuevos, contexto de staff por
-- transaccion y RLS real para kardo_staff_api.
--
-- La Staff API fija `kardo.staff_subject` (set_config local) en cada
-- transaccion despues de verificar el JWT AAL2. Las politicas ya no son
-- `using (true)`: exigen un perfil de staff activo y, para escribir, el
-- permiso concreto. La API sigue comprobando permisos en codigo: RLS es la
-- segunda barrera. Staff nunca lee datos personales de leads (solo conteos).

insert into kardo_staff.permissions (role_id, permission)
select role.id, catalog.permission
from kardo_staff.roles role
join (
  values
    ('platform-admin', 'operations.metrics.read'),
    ('platform-admin', 'customers.read'),
    ('platform-admin', 'publications.retry'),
    ('platform-admin', 'audit.read'),
    ('platform-admin', 'commercial.catalog.read'),
    ('platform-admin', 'commercial.catalog.write'),
    ('platform-admin', 'touchpoints.suspend.write'),
    ('operations', 'operations.metrics.read'),
    ('operations', 'customers.read'),
    ('operations', 'publications.retry'),
    ('operations', 'audit.read'),
    ('support', 'customers.read'),
    ('support', 'touchpoints.operations.read'),
    ('commercial', 'operations.metrics.read'),
    ('commercial', 'customers.read'),
    ('trust-safety', 'customers.read'),
    ('trust-safety', 'touchpoints.operations.read'),
    ('trust-safety', 'audit.read')
) as catalog(role_code, permission) on catalog.role_code = role.code
on conflict (role_id, permission) do nothing;

-- ---------------------------------------------------------------------------
-- Contexto de staff
-- ---------------------------------------------------------------------------

create or replace function kardo_private.current_staff_subject()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('kardo.staff_subject', true), '')::uuid;
$$;

create or replace function kardo_private.is_active_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from kardo_staff.staff_profiles staff
    where staff.id = kardo_private.current_staff_subject()
      and staff.status = 'active'
      and staff.revoked_at is null
  );
$$;

create or replace function kardo_private.staff_has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from kardo_staff.staff_profiles staff
    join kardo_staff.role_assignments assignment on assignment.staff_id = staff.id
    join kardo_staff.permissions granted on granted.role_id = assignment.role_id
    where staff.id = kardo_private.current_staff_subject()
      and staff.status = 'active'
      and staff.revoked_at is null
      and granted.permission = p_permission
  );
$$;

revoke all on function kardo_private.current_staff_subject() from public;
revoke all on function kardo_private.is_active_staff() from public;
revoke all on function kardo_private.staff_has_permission(text) from public;
grant usage on schema kardo_private to kardo_staff_api;
grant execute on function kardo_private.current_staff_subject() to kardo_staff_api;
grant execute on function kardo_private.is_active_staff() to kardo_staff_api;
grant execute on function kardo_private.staff_has_permission(text) to kardo_staff_api;

-- ---------------------------------------------------------------------------
-- Privilegios
-- ---------------------------------------------------------------------------

grant select on
  kardo_core.workspaces, kardo_core.profiles, kardo_core.workspace_memberships,
  kardo_core.touchpoints, kardo_core.touchpoint_groups, kardo_core.experiences,
  kardo_core.experience_versions, kardo_core.experience_targets,
  kardo_core.publications, kardo_core.publication_jobs,
  kardo_core.plans, kardo_core.plan_entitlements, kardo_core.workspace_plans
to kardo_staff_api;
-- Leads: solo columnas para conteos; nunca email, nombre, telefono ni mensaje.
grant select (id, workspace_id, touchpoint_id, created_at) on kardo_core.leads to kardo_staff_api;
grant select on kardo_audit.events to kardo_staff_api;

grant update (suspended_at, suspension_reason, suspended_by, updated_at)
  on kardo_core.touchpoints to kardo_staff_api;
grant update (status, attempts, last_error, updated_at) on kardo_core.publication_jobs to kardo_staff_api;
grant update (status) on kardo_core.publications to kardo_staff_api;
grant insert, update on kardo_core.plans to kardo_staff_api;
grant insert, update, delete on kardo_core.plan_entitlements to kardo_staff_api;
grant insert, update on kardo_core.workspace_plans to kardo_staff_api;

-- ---------------------------------------------------------------------------
-- Politicas de lectura: staff activo
-- ---------------------------------------------------------------------------

drop policy if exists "staff api workspaces" on kardo_core.workspaces;
drop policy if exists "staff api touchpoints" on kardo_core.touchpoints;
drop policy if exists "staff api experiences" on kardo_core.experiences;
drop policy if exists "staff api publications" on kardo_core.publications;

do $$
declare
  target text;
begin
  foreach target in array array[
    'workspaces', 'profiles', 'workspace_memberships', 'touchpoints',
    'touchpoint_groups', 'experiences', 'experience_versions',
    'experience_targets', 'publications', 'publication_jobs', 'plans',
    'plan_entitlements', 'workspace_plans', 'leads'
  ] loop
    execute format('drop policy if exists %I on kardo_core.%I', 'staff api read', target);
    execute format(
      'create policy %I on kardo_core.%I for select to kardo_staff_api using (kardo_private.is_active_staff())',
      'staff api read', target
    );
  end loop;
end $$;

drop policy if exists "staff api audit read" on kardo_audit.events;
create policy "staff api audit read" on kardo_audit.events
  for select to kardo_staff_api using (kardo_private.is_active_staff());

-- El staff solo audita en su propio nombre.
drop policy if exists "staff api audit append" on kardo_audit.events;
create policy "staff api audit append" on kardo_audit.events
  for insert to kardo_staff_api
  with check (actor_type = 'staff' and actor_subject = kardo_private.current_staff_subject());

-- ---------------------------------------------------------------------------
-- Politicas de escritura: permiso concreto
-- ---------------------------------------------------------------------------

drop policy if exists "staff api touchpoints suspend" on kardo_core.touchpoints;
create policy "staff api touchpoints suspend" on kardo_core.touchpoints
  for update to kardo_staff_api
  using (kardo_private.staff_has_permission('touchpoints.suspend.write'))
  with check (kardo_private.staff_has_permission('touchpoints.suspend.write'));

drop policy if exists "staff api jobs retry" on kardo_core.publication_jobs;
create policy "staff api jobs retry" on kardo_core.publication_jobs
  for update to kardo_staff_api
  using (status = 'failed' and kardo_private.staff_has_permission('publications.retry'))
  with check (status = 'pending' and kardo_private.staff_has_permission('publications.retry'));

drop policy if exists "staff api publications retry" on kardo_core.publications;
create policy "staff api publications retry" on kardo_core.publications
  for update to kardo_staff_api
  using (status = 'failed' and kardo_private.staff_has_permission('publications.retry'))
  with check (status = 'pending' and kardo_private.staff_has_permission('publications.retry'));

do $$
declare
  target text;
begin
  foreach target in array array['plans', 'plan_entitlements', 'workspace_plans'] loop
    execute format('drop policy if exists %I on kardo_core.%I', 'staff api catalog insert', target);
    execute format(
      'create policy %I on kardo_core.%I for insert to kardo_staff_api with check (kardo_private.staff_has_permission(''commercial.catalog.write''))',
      'staff api catalog insert', target
    );
    execute format('drop policy if exists %I on kardo_core.%I', 'staff api catalog update', target);
    execute format(
      'create policy %I on kardo_core.%I for update to kardo_staff_api using (kardo_private.staff_has_permission(''commercial.catalog.write'')) with check (kardo_private.staff_has_permission(''commercial.catalog.write''))',
      'staff api catalog update', target
    );
  end loop;
end $$;

drop policy if exists "staff api entitlements delete" on kardo_core.plan_entitlements;
create policy "staff api entitlements delete" on kardo_core.plan_entitlements
  for delete to kardo_staff_api
  using (kardo_private.staff_has_permission('commercial.catalog.write'));

-- Plan por defecto para que Operations pueda mostrar y asignar planes antes
-- de Stripe. Sin limites aplicados todavia (se aplicaran con la facturacion).
insert into kardo_core.plans (code, name, is_active)
values ('beta', 'Beta', true)
on conflict (code) do nothing;
