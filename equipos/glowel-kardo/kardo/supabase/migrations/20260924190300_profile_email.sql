-- Los perfiles necesitan un email propio y en minusculas para que el
-- Customer API pueda listar miembros de workspace y resolver invitaciones
-- sin volver a consultar auth.users en cada request. auth.users sigue siendo
-- la fuente de verdad; esta columna es una copia sincronizada.
alter table kardo_core.profiles add column if not exists email text;

do $$ begin
  alter table kardo_core.profiles
    add constraint profiles_email_format
    check (email is null or (email = lower(email) and char_length(email) between 3 and 320))
    not valid;
exception when duplicate_object then null;
end $$;
alter table kardo_core.profiles validate constraint profiles_email_format;

-- Backfill: solo toca filas que aun no coinciden con auth.users, asi es
-- seguro re-ejecutar esta migracion.
update kardo_core.profiles as profile
set email = lower(auth_user.email)
from auth.users as auth_user
where auth_user.id = profile.id
  and auth_user.email is not null
  and profile.email is distinct from lower(auth_user.email);

-- Actualizamos el trigger de bootstrap (20260914215610) para que un alta
-- nueva ya nazca con el email en minusculas, en la misma transaccion que
-- crea el perfil y el workspace personal.
create or replace function private.bootstrap_customer_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_name text;
  workspace_id uuid := gen_random_uuid();
begin
  workspace_name := left(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Kardo'
    ),
    108
  ) || ' · Personal';

  insert into kardo_core.profiles (id, display_name, email)
  values (new.id, left(workspace_name, 120), nullif(lower(new.email), ''));

  insert into kardo_core.workspaces (id, public_id, kind, name)
  values (workspace_id, replace(gen_random_uuid()::text, '-', ''), 'personal', workspace_name);

  insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
  values (workspace_id, new.id, 'owner');

  return new;
end;
$$;

revoke all on function private.bootstrap_customer_workspace() from public;

-- Ademas, un trigger dedicado en auth.users mantiene el email sincronizado
-- si el usuario lo cambia despues del alta (auth.users es la unica fuente de
-- verdad para el email; este trigger es la unica escritura permitida sobre
-- kardo_core.profiles.email fuera de la app). Es un upsert defensivo: si por
-- algun motivo se dispara antes que el bootstrap (o el perfil aun no
-- existiera), igual deja la fila correcta.
create or replace function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email is null then
    return new;
  end if;

  insert into kardo_core.profiles (id, email)
  values (new.id, lower(new.email))
  on conflict (id) do update
    set email = excluded.email,
        updated_at = now()
    where profiles.email is distinct from excluded.email;

  return new;
end;
$$;

revoke all on function private.sync_profile_email() from public, anon, authenticated;

drop trigger if exists on_auth_user_email_sync on auth.users;
-- Only UPDATE: the insert path is owned by on_auth_user_created, so this
-- trigger never races the bootstrap regardless of trigger name ordering.
create trigger on_auth_user_email_sync
  after update of email on auth.users
  for each row execute function private.sync_profile_email();
