-- Links, fase 3b (relevo 34): lo que el Resolver necesita para servir
-- kardo.com.mx/<negocio> y kardo.com.mx/<negocio>/<link>.
--
-- Las tablas de historial tienen RLS y el API no las lee directo. Esta
-- función arma, para un negocio, el estado completo que el API le manda al
-- Resolver (POST /internal/business) después de cada cambio:
--   slug           la dirección actual del negocio;
--   previousSlugs  las anteriores, que redirigen a la actual;
--   mainPublicId   el link que abre la dirección sola;
--   links          cada link vivo con su dirección y su código público;
--   linkRedirects  las direcciones anteriores de cada link vivo.
-- Devuelve null si el negocio no tiene dirección (o ya no existe).
--
-- Solo devuelve datos públicos (las direcciones y el código que ya va en los
-- QR), así que no revisa membresía; únicamente el API puede llamarla.

create or replace function kardo_core.business_link_routes(p_workspace_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'slug', w.slug,
    'previousSlugs', coalesce((
      select jsonb_agg(h.slug order by h.retired_at, h.slug)
      from kardo_core.workspace_slug_history h
      where h.workspace_id = w.id
    ), '[]'::jsonb),
    'mainPublicId', (
      select t.public_id from kardo_core.touchpoints t
      where t.id = w.main_link_id and t.workspace_id = w.id
        and t.kind = 'link' and t.status <> 'retired' and t.slug is not null
    ),
    'links', coalesce((
      select jsonb_agg(
        jsonb_build_object('slug', t.slug, 'publicId', t.public_id)
        order by t.slug
      )
      from kardo_core.touchpoints t
      where t.workspace_id = w.id and t.kind = 'link'
        and t.status <> 'retired' and t.slug is not null
    ), '[]'::jsonb),
    'linkRedirects', coalesce((
      select jsonb_agg(
        jsonb_build_object('from', h.slug, 'to', t.slug)
        order by h.slug
      )
      from kardo_core.touchpoint_slug_history h
      join kardo_core.touchpoints t on t.id = h.touchpoint_id
      where h.workspace_id = w.id and t.kind = 'link'
        and t.status <> 'retired' and t.slug is not null
    ), '[]'::jsonb)
  )
  from kardo_core.workspaces w
  where w.id = p_workspace_id and w.slug is not null and w.deleted_at is null;
$$;

revoke all on function kardo_core.business_link_routes(uuid) from public;
grant execute on function kardo_core.business_link_routes(uuid) to kardo_customer_api;
