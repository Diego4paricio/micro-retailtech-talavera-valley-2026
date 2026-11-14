-- El derivado publico de un archivo se nombra por su contenido
-- (`assets/<sha256>`, ver services/assets-worker): dos archivos con los mismos
-- bytes, en la misma organizacion o en otra, comparten el mismo derivado.
-- La columna derivative_key era UNIQUE, asi que el segundo archivo fallaba al
-- validarse (500, "assets_derivative_key_key") y se quedaba en revision.
--
-- 1. Se quita la unicidad (queda un indice normal para buscar por derivado).
-- 2. Borrar un archivo solo borra el derivado si ningun otro archivo vivo lo
--    comparte, de CUALQUIER organizacion. El API corre bajo el RLS del
--    cliente y no ve las demas organizaciones: esta funcion SECURITY DEFINER
--    responde solo si/no, y solo sobre un archivo de una organizacion de la
--    que quien llama es miembro.

alter table kardo_core.assets drop constraint if exists assets_derivative_key_key;

create index if not exists assets_derivative_key_idx
  on kardo_core.assets (derivative_key) where derivative_key is not null;

create index if not exists assets_sha256_live_idx
  on kardo_core.assets (sha256) where status in ('validated', 'published');

create or replace function kardo_private.asset_derivative_shared(target_asset_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from kardo_core.assets target
    join kardo_core.assets other
      on other.sha256 = target.sha256
     and other.id <> target.id
     and other.status in ('validated', 'published')
    where target.id = target_asset_id
      and target.derivative_key is not null
      and kardo_private.is_workspace_member(target.workspace_id)
  );
$$;
revoke all on function kardo_private.asset_derivative_shared(uuid) from public;
grant execute on function kardo_private.asset_derivative_shared(uuid) to kardo_customer_api;
