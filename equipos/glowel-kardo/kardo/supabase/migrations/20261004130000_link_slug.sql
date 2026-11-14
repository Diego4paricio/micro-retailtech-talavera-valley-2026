-- Dirección de cada Link (rediseño de Links, decisiones del dueño del
-- 2026-10-04): kardo.com.mx/<negocio>/<link>, y kardo.com.mx/<negocio> para
-- el link principal.
--   * La parte del link es única dentro de su negocio: dos negocios pueden
--     tener /menu. «menu-del-dia» y «menudeldia» cuentan como la misma.
--   * Se elige al crear el Link, con la disponibilidad revisada antes.
--   * Se cambia una vez cada 7 días (la primera vez no cuenta); la anterior
--     queda apartada para ese Link y el Resolver la redirige a la nueva.
--   * Retirar el Link libera su dirección (su /t/ responde «retirado»).
--   * El primer Link con dirección es el principal; se puede cambiar.

-- 1. La dirección del Link.
alter table kardo_core.touchpoints add column if not exists slug text;
alter table kardo_core.touchpoints add column if not exists slug_changed_at timestamptz;
alter table kardo_core.touchpoints
  add column if not exists slug_key text generated always as (replace(slug, '-', '')) stored;

do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_slug_format
    check (
      slug is null
      or (kind = 'link'
        and slug ~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'
        and slug !~ '--')
    );
exception when duplicate_object then null;
end $$;

create unique index if not exists touchpoints_link_slug_unique
  on kardo_core.touchpoints (workspace_id, slug_key) where slug_key is not null;

-- 2. Direcciones anteriores de cada Link, apartadas dentro de su negocio.
create table if not exists kardo_core.touchpoint_slug_history (
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  slug_key text not null,
  slug text not null,
  touchpoint_id uuid not null references kardo_core.touchpoints(id) on delete cascade,
  retired_at timestamptz not null default now(),
  primary key (workspace_id, slug_key)
);
create index if not exists touchpoint_slug_history_touchpoint_idx
  on kardo_core.touchpoint_slug_history (touchpoint_id);
alter table kardo_core.touchpoint_slug_history enable row level security;
revoke all on kardo_core.touchpoint_slug_history from public;

-- 3. El link principal del negocio (kardo.com.mx/<negocio>).
alter table kardo_core.workspaces
  add column if not exists main_link_id uuid references kardo_core.touchpoints(id) on delete set null;

-- 4. ¿Está libre dentro del negocio?
create or replace function kardo_core.link_slug_available(
  p_workspace_id uuid,
  p_slug text,
  p_touchpoint_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select kardo_private.is_workspace_member(p_workspace_id)
    and not exists (
      select 1 from kardo_core.touchpoints t
      where t.workspace_id = p_workspace_id
        and t.slug_key = replace(p_slug, '-', '')
        and t.id is distinct from p_touchpoint_id
    )
    and not exists (
      select 1 from kardo_core.touchpoint_slug_history h
      where h.workspace_id = p_workspace_id
        and h.slug_key = replace(p_slug, '-', '')
        and h.touchpoint_id is distinct from p_touchpoint_id
    );
$$;
revoke all on function kardo_core.link_slug_available(uuid, text, uuid) from public;
grant execute on function kardo_core.link_slug_available(uuid, text, uuid) to kardo_customer_api;

-- 5. Elegir o cambiar la dirección de un Link: quien administra touchpoints
--    (Owner, Admin o Editor).
create or replace function kardo_core.set_link_slug(
  p_touchpoint_id uuid,
  p_slug text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
  v_kind text;
  v_status text;
  v_current text;
  v_changed timestamptz;
begin
  select workspace_id, kind, status::text, slug, slug_changed_at
  into v_workspace, v_kind, v_status, v_current, v_changed
  from kardo_core.touchpoints
  where id = p_touchpoint_id
  for update;
  if not found then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  if coalesce(kardo_private.workspace_role(v_workspace)::text, '') not in ('owner', 'admin', 'editor') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if v_kind <> 'link' or v_status = 'retired' then
    raise exception 'NOT_A_LINK' using errcode = 'P0001';
  end if;
  if p_slug is null
     or p_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,28}[a-z0-9])$'
     or p_slug ~ '--' then
    raise exception 'SLUG_INVALID' using errcode = 'P0001';
  end if;
  if v_current = p_slug then
    return p_slug;
  end if;
  if v_current is not null and v_changed is not null
     and v_changed > now() - interval '7 days' then
    raise exception 'SLUG_CHANGE_TOO_SOON' using errcode = 'P0001';
  end if;
  if not kardo_core.link_slug_available(v_workspace, p_slug, p_touchpoint_id) then
    raise exception 'SLUG_TAKEN' using errcode = 'P0001';
  end if;

  if v_current is not null then
    insert into kardo_core.touchpoint_slug_history (workspace_id, slug_key, slug, touchpoint_id)
    values (v_workspace, replace(v_current, '-', ''), v_current, p_touchpoint_id)
    on conflict (workspace_id, slug_key) do update
      set slug = excluded.slug, retired_at = now()
      where kardo_core.touchpoint_slug_history.touchpoint_id = p_touchpoint_id;
  end if;
  delete from kardo_core.touchpoint_slug_history
  where workspace_id = v_workspace
    and slug_key = replace(p_slug, '-', '')
    and touchpoint_id = p_touchpoint_id;

  update kardo_core.touchpoints
  set slug = p_slug,
      slug_changed_at = case when v_current is null then slug_changed_at else now() end,
      updated_at = now()
  where id = p_touchpoint_id;

  -- The first Link with an address becomes the business's main one.
  update kardo_core.workspaces
  set main_link_id = p_touchpoint_id
  where id = v_workspace and main_link_id is null;
  return p_slug;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN' using errcode = 'P0001';
end;
$$;
revoke all on function kardo_core.set_link_slug(uuid, text) from public;
grant execute on function kardo_core.set_link_slug(uuid, text) to kardo_customer_api;

-- 6. Cambiar el link principal.
create or replace function kardo_core.set_main_link(
  p_workspace_id uuid,
  p_touchpoint_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(kardo_private.workspace_role(p_workspace_id)::text, '') not in ('owner', 'admin', 'editor') then
    raise exception 'FORBIDDEN' using errcode = 'P0001';
  end if;
  if not exists (
    select 1 from kardo_core.touchpoints
    where id = p_touchpoint_id and workspace_id = p_workspace_id
      and kind = 'link' and status <> 'retired' and slug is not null
  ) then
    raise exception 'NOT_A_LINK' using errcode = 'P0001';
  end if;
  update kardo_core.workspaces set main_link_id = p_touchpoint_id
  where id = p_workspace_id;
end;
$$;
revoke all on function kardo_core.set_main_link(uuid, uuid) from public;
grant execute on function kardo_core.set_main_link(uuid, uuid) to kardo_customer_api;

-- 7. Retirar un Link libera su dirección y deja de ser el principal.
create or replace function kardo_core.release_link_slug()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'retired' and old.status is distinct from 'retired' then
    new.slug := null;
    new.slug_changed_at := null;
    delete from kardo_core.touchpoint_slug_history where touchpoint_id = new.id;
    update kardo_core.workspaces set main_link_id = null
    where id = new.workspace_id and main_link_id = new.id;
  end if;
  return new;
end;
$$;
revoke all on function kardo_core.release_link_slug() from public;

drop trigger if exists touchpoints_release_link_slug on kardo_core.touchpoints;
create trigger touchpoints_release_link_slug
  before update of status on kardo_core.touchpoints
  for each row execute function kardo_core.release_link_slug();

-- 8. El API cambia estas columnas solo con las funciones de arriba.
revoke update (slug, slug_changed_at) on kardo_core.touchpoints from kardo_customer_api;
revoke update (main_link_id) on kardo_core.workspaces from kardo_customer_api;
