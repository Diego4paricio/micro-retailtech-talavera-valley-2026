-- Dirección pública del negocio (rediseño de Links, decisiones del dueño del
-- 2026-10-04): kardo.com.mx/<negocio> y kardo.com.mx/<negocio>/<link>.
--   * Es distinta del nombre: dos organizaciones pueden llamarse igual, pero
--     solo una tiene cada dirección.
--   * Única en todo Kardo, y «cafe-nube» y «cafenube» cuentan como la misma
--     (la llave es la dirección sin guiones), para evitar imitadores.
--   * Nunca se desempata con números: la elige el dueño (Primeros pasos,
--     paso 1, o su primer Link) a partir de una recomendación libre.
--   * Se cambia una vez cada 7 días; la primera vez no cuenta.
--   * Una dirección anterior queda apartada para esa organización (el
--     Resolver la redirige a la nueva); nadie más puede tomarla.
--   * Al borrar la organización, sus direcciones quedan libres.
-- La lista de direcciones reservadas (rutas del sitio y del producto) vive
-- en @kardo/contracts (business-slug.ts) y la comparten el API y el Resolver.

-- 1. La dirección, su llave y cuándo cambió.
alter table kardo_core.workspaces add column if not exists slug text;
alter table kardo_core.workspaces add column if not exists slug_changed_at timestamptz;
alter table kardo_core.workspaces
  add column if not exists slug_key text generated always as (replace(slug, '-', '')) stored;

do $$ begin
  alter table kardo_core.workspaces
    add constraint workspaces_slug_format
    check (slug is null or (slug ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$' and slug !~ '--'));
exception when duplicate_object then null;
end $$;

create unique index if not exists workspaces_slug_key_unique
  on kardo_core.workspaces (slug_key) where slug_key is not null;

-- 2. Direcciones anteriores, apartadas para su organización.
create table if not exists kardo_core.workspace_slug_history (
  slug_key text primary key,
  slug text not null,
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  retired_at timestamptz not null default now()
);
create index if not exists workspace_slug_history_workspace_idx
  on kardo_core.workspace_slug_history (workspace_id);
-- Sin políticas para los roles del API: solo se toca desde las funciones
-- SECURITY DEFINER de abajo.
alter table kardo_core.workspace_slug_history enable row level security;
revoke all on kardo_core.workspace_slug_history from public;

-- 3. ¿Está libre? Mira todas las organizaciones (por eso SECURITY DEFINER),
--    pero solo responde sí o no.
create or replace function kardo_core.workspace_slug_available(
  p_slug text,
  p_workspace_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
      select 1 from kardo_core.workspaces w
      where w.slug_key = replace(p_slug, '-', '') and w.id <> p_workspace_id
    )
    and not exists (
      select 1 from kardo_core.workspace_slug_history h
      where h.slug_key = replace(p_slug, '-', '') and h.workspace_id <> p_workspace_id
    );
$$;
revoke all on function kardo_core.workspace_slug_available(text, uuid) from public;
grant execute on function kardo_core.workspace_slug_available(text, uuid) to kardo_customer_api;

-- 4. Elegir o cambiar la dirección: solo Owner o Admin de la organización.
create or replace function kardo_core.set_workspace_slug(
  p_workspace_id uuid,
  p_slug text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_current text;
  v_changed timestamptz;
begin
  if coalesce(kardo_private.workspace_role(p_workspace_id)::text, '') not in ('owner', 'admin') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if p_slug is null
     or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'
     or p_slug ~ '--' then
    raise exception 'SLUG_INVALID' using errcode = 'P0001';
  end if;

  select slug, slug_changed_at into v_current, v_changed
  from kardo_core.workspaces
  where id = p_workspace_id and deleted_at is null
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if v_current = p_slug then
    return p_slug;
  end if;
  if v_current is not null and v_changed is not null
     and v_changed > now() - interval '7 days' then
    raise exception 'SLUG_CHANGE_TOO_SOON' using errcode = 'P0001';
  end if;
  if not kardo_core.workspace_slug_available(p_slug, p_workspace_id) then
    raise exception 'SLUG_TAKEN' using errcode = 'P0001';
  end if;

  if v_current is not null then
    insert into kardo_core.workspace_slug_history (slug_key, slug, workspace_id)
    values (replace(v_current, '-', ''), v_current, p_workspace_id)
    on conflict (slug_key) do update
      set slug = excluded.slug, retired_at = now()
      where kardo_core.workspace_slug_history.workspace_id = p_workspace_id;
  end if;
  -- Volver a una dirección propia anterior la saca del historial.
  delete from kardo_core.workspace_slug_history
  where slug_key = replace(p_slug, '-', '') and workspace_id = p_workspace_id;

  update kardo_core.workspaces
  set slug = p_slug,
      slug_changed_at = case when v_current is null then slug_changed_at else now() end,
      updated_at = now()
  where id = p_workspace_id;
  return p_slug;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN' using errcode = 'P0001';
end;
$$;
revoke all on function kardo_core.set_workspace_slug(uuid, text) from public;
grant execute on function kardo_core.set_workspace_slug(uuid, text) to kardo_customer_api;

-- 5. Al borrar la organización, sus direcciones quedan libres.
create or replace function kardo_core.release_workspace_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.deleted_at is not null and old.deleted_at is null then
    new.slug := null;
    new.slug_changed_at := null;
    delete from kardo_core.workspace_slug_history where workspace_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function kardo_core.release_workspace_slug() from public;

drop trigger if exists workspaces_release_slug on kardo_core.workspaces;
create trigger workspaces_release_slug
  before update of deleted_at on kardo_core.workspaces
  for each row execute function kardo_core.release_workspace_slug();
