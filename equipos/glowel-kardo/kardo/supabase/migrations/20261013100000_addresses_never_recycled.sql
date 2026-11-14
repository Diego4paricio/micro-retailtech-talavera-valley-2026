-- Auditoría de dominios (2026-10-13), decisiones del dueño:
--
-- 1. La dirección de un negocio nunca pasa a otro negocio (A9-1). Ya estaba
--    impresa o compartida en mensajes, bios y volantes: si otro negocio la
--    tomara después de borrar la organización, esos enlaces abrirían el
--    negocio de otra persona. El PRD lo pide para toda dirección física: «la
--    URL física es una promesa de continuidad; nunca se recicla para un
--    cliente distinto». Al borrar la organización, su dirección y las
--    anteriores se quedan apartadas para siempre (la organización borrada
--    conserva `slug` y su historial; `workspace_slug_available` ya cuenta
--    las de cualquier organización, borrada o no). La dirección de un link
--    retirado sigue libre solo dentro de su mismo negocio: es única por
--    negocio, así que nadie más puede tomarla.
--
-- 2. Cambiar la dirección de un link ya no lo vuelve principal (A9-17).
--    Solo el primer link que recibe dirección queda como principal, como
--    antes; si después se retira el principal, el negocio elige otro con
--    «Hacer principal», y renombrar otro link no lo decide por él.

-- 1. Ya no se liberan las direcciones al borrar la organización.
drop trigger if exists workspaces_release_slug on kardo_core.workspaces;
drop function if exists kardo_core.release_workspace_slug();

-- 2. set_link_slug: solo la primera dirección promueve a principal.
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

  -- Only a link's first address can make it the business's main link: a
  -- rename never takes over an empty main slot the owner left on purpose.
  if v_current is null then
    update kardo_core.workspaces
    set main_link_id = p_touchpoint_id
    where id = v_workspace and main_link_id is null;
  end if;
  return p_slug;
exception
  when unique_violation then
    raise exception 'SLUG_TAKEN' using errcode = 'P0001';
end;
$$;
revoke all on function kardo_core.set_link_slug(uuid, text) from public;
grant execute on function kardo_core.set_link_slug(uuid, text) to kardo_customer_api;
