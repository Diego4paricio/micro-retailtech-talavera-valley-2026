-- ALTO (audit): todas las politicas de kardo_customer_api eran
-- `using (true)` -- RLS puramente decorativo para el rol de servicio. La
-- autorizacion primaria sigue viviendo en el Customer API (assertMembership/
-- assertWritableMembership); esto anade una segunda capa real, basada en la
-- identidad del cliente final, no en el rol de Postgres.
--
-- El Customer API, justo despues de `set local role kardo_customer_api`,
-- debe fijar dos GUCs de sesion con la identidad del sujeto autenticado:
--   select set_config('kardo.subject', $1, true), set_config('kardo.email', $2, true);
-- Mientras ese cambio no este desplegado, `kardo.subject`/`kardo.email`
-- quedan vacios y las funciones de abajo devuelven NULL/false: las politicas
-- fallan cerradas (deniegan) en vez de fallar abiertas.
--
-- No se tocan las politicas de kardo_publisher, kardo_analytics ni
-- kardo_staff_api: siguen tal cual estaban.

-- ---------------------------------------------------------------------------
-- 1. Esquema y funciones de apoyo
-- ---------------------------------------------------------------------------
-- Se usa un esquema nuevo (`kardo_private`) en vez de reutilizar `private`
-- (creado en 20260914171353) porque `private.is_workspace_member(uuid)` ya
-- existe con una firma identica pero semantica distinta: compara contra
-- auth.uid() para las politicas "defensa en profundidad" de `authenticated`
-- (pensadas para un futuro acceso PostgREST directo). Duplicar el nombre en
-- el mismo esquema no es posible (mismo tipo de argumento) y mezclar ambas
-- semanticas en una funcion seria confuso. kardo_private es exclusivamente
-- para el modelo de sesion del Customer API (GUCs kardo.subject/kardo.email).
create schema if not exists kardo_private;
revoke all on schema kardo_private from public;
revoke all on schema kardo_private from anon, authenticated;
grant usage on schema kardo_private to kardo_customer_api;

create or replace function kardo_private.current_customer_subject()
returns uuid
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('kardo.subject', true), '')::uuid;
$$;
revoke all on function kardo_private.current_customer_subject() from public;
grant execute on function kardo_private.current_customer_subject() to kardo_customer_api;

create or replace function kardo_private.current_customer_email()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(current_setting('kardo.email', true), '');
$$;
revoke all on function kardo_private.current_customer_email() from public;
grant execute on function kardo_private.current_customer_email() to kardo_customer_api;

-- SECURITY DEFINER + search_path vacio: al ejecutarse con los privilegios del
-- propietario (superusuario de la migracion), la consulta interna a
-- workspace_memberships omite RLS por completo. Esto es lo que evita la
-- recursion cuando esta misma funcion se usa dentro de la politica RLS de
-- workspace_memberships.
create or replace function kardo_private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from kardo_core.workspace_memberships membership
    where membership.workspace_id = target_workspace_id
      and membership.profile_id = kardo_private.current_customer_subject()
  );
$$;
revoke all on function kardo_private.is_workspace_member(uuid) from public;
grant execute on function kardo_private.is_workspace_member(uuid) to kardo_customer_api;

create or replace function kardo_private.workspace_role(target_workspace_id uuid)
returns kardo_core.membership_role
language sql
stable
security definer
set search_path = ''
as $$
  select membership.role
  from kardo_core.workspace_memberships membership
  where membership.workspace_id = target_workspace_id
    and membership.profile_id = kardo_private.current_customer_subject();
$$;
revoke all on function kardo_private.workspace_role(uuid) from public;
grant execute on function kardo_private.workspace_role(uuid) to kardo_customer_api;

-- Helper adicional (no pedido explicitamente, pero necesario) para la regla
-- "profiles: select propio o de co-miembros" sin reabrir `using (true)`.
create or replace function kardo_private.shares_workspace_with(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from kardo_core.workspace_memberships mine
    join kardo_core.workspace_memberships theirs
      on theirs.workspace_id = mine.workspace_id
    where mine.profile_id = kardo_private.current_customer_subject()
      and theirs.profile_id = target_profile_id
  );
$$;
revoke all on function kardo_private.shares_workspace_with(uuid) from public;
grant execute on function kardo_private.shares_workspace_with(uuid) to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- 2. Proteccion "ultimo owner": ningun UPDATE/DELETE puede dejar un
--    workspace sin ningun miembro con role = 'owner'.
-- ---------------------------------------------------------------------------
create or replace function kardo_core.enforce_workspace_last_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  remaining_owners integer;
begin
  if old.role <> 'owner' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;

  -- Cascading deletes (the workspace itself or the member's profile/account is
  -- being removed) must not be blocked: there is no workspace left to orphan,
  -- and account deletion must always be possible.
  if tg_op = 'DELETE' and (
    not exists (select 1 from kardo_core.workspaces workspace where workspace.id = old.workspace_id)
    or not exists (select 1 from kardo_core.profiles profile where profile.id = old.profile_id)
  ) then
    return old;
  end if;

  -- Sigue siendo owner del mismo workspace: no hay riesgo.
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
$$;
revoke all on function kardo_core.enforce_workspace_last_owner() from public;

drop trigger if exists workspace_memberships_last_owner_guard on kardo_core.workspace_memberships;
create trigger workspace_memberships_last_owner_guard
  before update or delete on kardo_core.workspace_memberships
  for each row execute function kardo_core.enforce_workspace_last_owner();

-- ---------------------------------------------------------------------------
-- 3. Operaciones que no pueden pasar por RLS por diseno: funciones
--    SECURITY DEFINER, ejecutables solo por kardo_customer_api, que validan
--    todo internamente.
-- ---------------------------------------------------------------------------
create or replace function kardo_core.create_organization_workspace(
  p_subject uuid,
  p_name text,
  p_public_id text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
begin
  if p_subject is null or p_subject is distinct from kardo_private.current_customer_subject() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  insert into kardo_core.workspaces (id, public_id, kind, name)
  values (gen_random_uuid(), p_public_id, 'organization', p_name)
  returning id into v_workspace_id;

  insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
  values (v_workspace_id, p_subject, 'owner');

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result
  ) values (
    v_workspace_id, p_subject, 'customer', 'workspace.created', 'workspace', v_workspace_id, 'succeeded'
  );

  return v_workspace_id;
end;
$$;
revoke all on function kardo_core.create_organization_workspace(uuid, text, text) from public;
grant execute on function kardo_core.create_organization_workspace(uuid, text, text) to kardo_customer_api;

-- Un unico error generico (SQLSTATE 'P0001', mensaje 'INVITATION_INVALID')
-- para cualquier fallo -- token invalido, expirado, revocado, ya aceptado o
-- email que no coincide -- para no revelar por que fallo un intento.
create or replace function kardo_core.accept_workspace_invitation(p_token_hash text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_email text := kardo_private.current_customer_email();
  v_invitation kardo_core.workspace_invitations%rowtype;
begin
  if v_subject is null or v_email is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = 'P0001', message = 'INVITATION_INVALID';
  end if;

  select * into v_invitation
  from kardo_core.workspace_invitations
  where token_hash = p_token_hash
  for update;

  if not found
    or v_invitation.status <> 'pending'
    or v_invitation.expires_at <= now()
    or v_invitation.email <> lower(v_email)
  then
    raise exception using errcode = 'P0001', message = 'INVITATION_INVALID';
  end if;

  perform 1
  from kardo_core.workspace_memberships
  where workspace_id = v_invitation.workspace_id
    and profile_id = v_subject
  for update;

  -- Si ya es miembro, aceptar la invitacion nunca degrada su rol actual.
  if not found then
    insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
    values (v_invitation.workspace_id, v_subject, v_invitation.role);
  end if;

  update kardo_core.workspace_invitations
  set status = 'accepted', accepted_at = now(), accepted_by = v_subject, updated_at = now()
  where id = v_invitation.id;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result
  ) values (
    v_invitation.workspace_id, v_subject, 'customer', 'invitation.accepted',
    'workspace_invitation', v_invitation.id, 'succeeded'
  );

  return v_invitation.workspace_id;
exception
  when others then
    raise warning 'kardo_core.accept_workspace_invitation failed: %', sqlerrm;
    raise exception using errcode = 'P0001', message = 'INVITATION_INVALID';
end;
$$;
revoke all on function kardo_core.accept_workspace_invitation(text) from public;
grant execute on function kardo_core.accept_workspace_invitation(text) to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- 4. Politicas RLS reales para kardo_customer_api
-- ---------------------------------------------------------------------------

-- profiles: cada quien ve su propio perfil y el de sus co-miembros; solo
-- puede editar el propio. No hay politica de insert/delete: la creacion pasa
-- por el trigger de bootstrap (security definer) y no hay flujo de borrado.
drop policy if exists "customer api profiles" on kardo_core.profiles;
create policy "customer api profiles select" on kardo_core.profiles
  for select to kardo_customer_api
  using (
    id = kardo_private.current_customer_subject()
    or kardo_private.shares_workspace_with(id)
  );
create policy "customer api profiles update" on kardo_core.profiles
  for update to kardo_customer_api
  using (id = kardo_private.current_customer_subject())
  with check (id = kardo_private.current_customer_subject());

-- workspaces: select para cualquier miembro; update (p.ej. renombrar) solo
-- para owner/admin. El insert de organizaciones pasa exclusivamente por
-- kardo_core.create_organization_workspace; el de workspaces personales, por
-- el trigger de bootstrap. Ninguno de los dos necesita una politica INSERT
-- para kardo_customer_api.
drop policy if exists "customer api workspaces" on kardo_core.workspaces;
create policy "customer api workspaces select" on kardo_core.workspaces
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(id));
create policy "customer api workspaces update" on kardo_core.workspaces
  for update to kardo_customer_api
  using (kardo_private.workspace_role(id) in ('owner', 'admin'))
  with check (kardo_private.workspace_role(id) in ('owner', 'admin'));

-- workspace_memberships: el listado de "mis workspaces" sigue funcionando
-- (profile_id propio, sin necesitar ya ser miembro confirmado por la misma
-- politica) o cualquier fila de un workspace del que ya soy miembro.
-- Mutaciones (agregar, cambiar rol, quitar) requieren owner/admin; el
-- trigger de "ultimo owner" protege contra dejar el workspace huerfano.
drop policy if exists "customer api memberships" on kardo_core.workspace_memberships;
create policy "customer api memberships select" on kardo_core.workspace_memberships
  for select to kardo_customer_api
  using (
    profile_id = kardo_private.current_customer_subject()
    or kardo_private.is_workspace_member(workspace_id)
  );
create policy "customer api memberships insert" on kardo_core.workspace_memberships
  for insert to kardo_customer_api
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));
create policy "customer api memberships update" on kardo_core.workspace_memberships
  for update to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'))
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));
-- Any member may remove themselves (leave); owners/admins may remove others.
create policy "customer api memberships delete" on kardo_core.workspace_memberships
  for delete to kardo_customer_api
  using (
    profile_id = kardo_private.current_customer_subject()
    or kardo_private.workspace_role(workspace_id) in ('owner', 'admin')
  );

-- touchpoints, experiences, assets: workspace_id es columna directa.
drop policy if exists "customer api touchpoints" on kardo_core.touchpoints;
create policy "customer api touchpoints" on kardo_core.touchpoints
  for all to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id))
  with check (kardo_private.is_workspace_member(workspace_id));

drop policy if exists "customer api experiences" on kardo_core.experiences;
create policy "customer api experiences" on kardo_core.experiences
  for all to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id))
  with check (kardo_private.is_workspace_member(workspace_id));

drop policy if exists "customer api assets" on kardo_core.assets;
create policy "customer api assets" on kardo_core.assets
  for all to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id))
  with check (kardo_private.is_workspace_member(workspace_id));

-- experience_assets: sin workspace_id propio, se valida via join a experiences.
drop policy if exists "customer api experience assets" on kardo_core.experience_assets;
create policy "customer api experience assets" on kardo_core.experience_assets
  for all to kardo_customer_api
  using (exists (
    select 1 from kardo_core.experiences experience
    where experience.id = experience_assets.experience_id
      and kardo_private.is_workspace_member(experience.workspace_id)
  ))
  with check (exists (
    select 1 from kardo_core.experiences experience
    where experience.id = experience_assets.experience_id
      and kardo_private.is_workspace_member(experience.workspace_id)
  ));

-- experience_versions: sin workspace_id propio, se valida via join a experiences.
drop policy if exists "customer api versions" on kardo_core.experience_versions;
create policy "customer api versions" on kardo_core.experience_versions
  for all to kardo_customer_api
  using (exists (
    select 1 from kardo_core.experiences experience
    where experience.id = experience_versions.experience_id
      and kardo_private.is_workspace_member(experience.workspace_id)
  ))
  with check (exists (
    select 1 from kardo_core.experiences experience
    where experience.id = experience_versions.experience_id
      and kardo_private.is_workspace_member(experience.workspace_id)
  ));

-- publications: sin workspace_id propio, se valida via join a touchpoints.
drop policy if exists "customer api publications" on kardo_core.publications;
create policy "customer api publications" on kardo_core.publications
  for all to kardo_customer_api
  using (exists (
    select 1 from kardo_core.touchpoints touchpoint
    where touchpoint.id = publications.touchpoint_id
      and kardo_private.is_workspace_member(touchpoint.workspace_id)
  ))
  with check (exists (
    select 1 from kardo_core.touchpoints touchpoint
    where touchpoint.id = publications.touchpoint_id
      and kardo_private.is_workspace_member(touchpoint.workspace_id)
  ));

-- publication_jobs: sin workspace_id propio, se valida via join a
-- publications -> touchpoints.
drop policy if exists "customer api publication jobs" on kardo_core.publication_jobs;
create policy "customer api publication jobs" on kardo_core.publication_jobs
  for all to kardo_customer_api
  using (exists (
    select 1
    from kardo_core.publications publication
    join kardo_core.touchpoints touchpoint on touchpoint.id = publication.touchpoint_id
    where publication.id = publication_jobs.publication_id
      and kardo_private.is_workspace_member(touchpoint.workspace_id)
  ))
  with check (exists (
    select 1
    from kardo_core.publications publication
    join kardo_core.touchpoints touchpoint on touchpoint.id = publication.touchpoint_id
    where publication.id = publication_jobs.publication_id
      and kardo_private.is_workspace_member(touchpoint.workspace_id)
  ));

-- leads, analytics_hourly, analytics_daily: solo lectura, workspace_id directo.
drop policy if exists "customer api leads read" on kardo_core.leads;
create policy "customer api leads read" on kardo_core.leads
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));

drop policy if exists "customer api hourly read" on kardo_core.analytics_hourly;
create policy "customer api hourly read" on kardo_core.analytics_hourly
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));

drop policy if exists "customer api daily read" on kardo_core.analytics_daily;
create policy "customer api daily read" on kardo_core.analytics_daily
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));

-- kardo_audit.events: solo se toca la politica de insert de
-- kardo_customer_api (las de kardo_staff_api/kardo_publisher/kardo_analytics
-- quedan intactas). workspace_id null se permite para eventos que no son de
-- un workspace especifico.
drop policy if exists "customer api audit append" on kardo_audit.events;
create policy "customer api audit append" on kardo_audit.events
  for insert to kardo_customer_api
  with check (workspace_id is null or kardo_private.is_workspace_member(workspace_id));

-- workspace_invitations: select/insert/update para miembros con
-- owner/admin; ver tambien kardo_core.accept_workspace_invitation (que
-- corre como SECURITY DEFINER y no depende de estas politicas).
drop policy if exists "customer api invitations select" on kardo_core.workspace_invitations;
create policy "customer api invitations select" on kardo_core.workspace_invitations
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));
drop policy if exists "customer api invitations insert" on kardo_core.workspace_invitations;
create policy "customer api invitations insert" on kardo_core.workspace_invitations
  for insert to kardo_customer_api
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));
drop policy if exists "customer api invitations update" on kardo_core.workspace_invitations;
create policy "customer api invitations update" on kardo_core.workspace_invitations
  for update to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'))
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));
