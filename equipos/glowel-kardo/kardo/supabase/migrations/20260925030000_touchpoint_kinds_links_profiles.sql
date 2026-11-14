-- Rediseño 2026-09-25 (decisiones del dueño):
--   * Un Touchpoint es UN formato físico: NFC, QR u otro. Dos formatos en una
--     tarjeta son dos Touchpoints.
--   * Los enlaces directos para compartir (tipo Linktree) son otro producto:
--     Touchpoints de tipo 'link', con handle opcional y nunca en grupos.
--   * Experience 'linkpage' (página de enlaces con redes), solo para Links.
--   * Perfil de organización y marca.

-- 1. Tipo de Touchpoint (antes solo physical_type tarjeta/etiqueta/otro).
alter table kardo_core.touchpoints add column if not exists kind text;
update kardo_core.touchpoints
set kind = case physical_type when 'card' then 'nfc' when 'label' then 'qr' else 'other' end
where kind is null;
alter table kardo_core.touchpoints alter column kind set default 'qr';
alter table kardo_core.touchpoints alter column kind set not null;

do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_kind_allowed check (kind in ('nfc', 'qr', 'other', 'link'));
exception when duplicate_object then null;
end $$;

-- 2. Handle público de los Links (kardo…/@handle).
alter table kardo_core.touchpoints add column if not exists handle text;

do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_handle_format
    check (handle is null or handle ~ '^[a-z0-9](?:[a-z0-9._-]{1,28}[a-z0-9])$');
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_handle_only_links check (handle is null or kind = 'link');
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_links_ungrouped check (kind <> 'link' or group_id is null);
exception when duplicate_object then null;
end $$;

create unique index if not exists touchpoints_handle_unique
  on kardo_core.touchpoints (handle) where handle is not null;
create index if not exists touchpoints_workspace_kind_idx
  on kardo_core.touchpoints (workspace_id, kind);

-- Retirar un Link libera su handle (el public ID sigue respondiendo 410).
create or replace function kardo_core.enforce_touchpoint_retirement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'retired' and new.status is distinct from 'retired' then
    raise exception 'TOUCHPOINT_RETIRED' using errcode = 'check_violation';
  end if;
  if new.status = 'retired' and old.status is distinct from 'retired' then
    new.retired_at := now();
    new.group_id := null;
    new.handle := null;
  end if;
  return new;
end;
$$;

grant update (kind, handle) on kardo_core.touchpoints to kardo_customer_api;

-- 3. Página de enlaces (link-in-bio).
alter type kardo_core.experience_type add value if not exists 'linkpage';

-- 4. Perfil y marca de la organización (validado por la Customer API).
alter table kardo_core.workspaces add column if not exists profile jsonb not null default '{}'::jsonb;

do $$ begin
  alter table kardo_core.workspaces
    add constraint workspaces_profile_bounded_object
    check (jsonb_typeof(profile) = 'object' and pg_column_size(profile) <= 16384);
exception when duplicate_object then null;
end $$;
