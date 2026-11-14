-- Defensa en profundidad del Customer API (revisión de seguridad del
-- 2026-10, informe Docs/engineering/security/2026-10-revision-prelanzamiento.md).
--
-- Ninguna ruta del API permite hoy nada de esto; la base lo impide por su
-- cuenta para que un error futuro o una inyección SQL no lo abra:
--   1. permisos por columna: el API solo actualiza estas columnas de
--      `workspaces` (nunca `public_id`, `deleted_at` ni `created_at`) y solo
--      `role` de una membresía;
--   2. solo un Owner crea o quita a un Owner cuando actúa el rol del API
--      (las funciones SECURITY DEFINER, el staff y la tarea de cobro corren
--      con otros roles y no pasan por esta regla);
--   3. la guarda del último Owner bloquea las filas de Owners antes de
--      contarlas: dos Owners que se degradan a la vez ya no dejan la
--      organización sin Owner.

-- 1. Permisos por columna.
revoke update on kardo_core.workspaces from kardo_customer_api;
grant update (name, kind, account_type, profile, lead_retention_days, updated_at)
  on kardo_core.workspaces to kardo_customer_api;

revoke update on kardo_core.workspace_memberships from kardo_customer_api;
grant update (role) on kardo_core.workspace_memberships to kardo_customer_api;

-- 2. Solo un Owner crea o quita a un Owner (rol del API).
create or replace function kardo_core.enforce_membership_owner_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'kardo_customer_api' then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.role = 'owner')
    or (tg_op = 'UPDATE' and (new.role = 'owner') is distinct from (old.role = 'owner'))
  then
    if kardo_private.workspace_role(new.workspace_id) is distinct from 'owner' then
      raise exception using errcode = 'P0001', message = 'OWNER_REQUIRED';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function kardo_core.enforce_membership_owner_change() from public;

drop trigger if exists workspace_memberships_owner_change on kardo_core.workspace_memberships;
create trigger workspace_memberships_owner_change
  before insert or update of role on kardo_core.workspace_memberships
  for each row execute function kardo_core.enforce_membership_owner_change();

-- 3. La guarda del último Owner bloquea las filas de Owners antes de contar.
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
  -- Lock every Owner row of the organization first (same order for every
  -- transaction), so a concurrent demotion waits and then counts what the
  -- other one committed.
  perform 1
  from kardo_core.workspace_memberships membership
  where membership.workspace_id = old.workspace_id
    and membership.role = 'owner'
  order by membership.profile_id
  for update;
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
