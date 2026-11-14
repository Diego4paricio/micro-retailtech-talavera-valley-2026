-- Auditoría de dominios (2026-10-13), A9-4: destinos «fantasma».
--
-- Cuando un QR, una etiqueta o un link pasa a mostrar otra página, la página
-- que lo pierde se quedaba con él en sus destinos (`experience_targets`): su
-- «Dónde se ve» lo seguía listando y, al volver a publicarla (cambiar un
-- precio, regresar a una versión), se lo quitaba otra vez a la página nueva
-- sin pedir confirmación. Desde hoy el Customer API, en la misma
-- transacción que publica, quita ese destino directo de la página que lo
-- pierde. Esta migración limpia los que ya existían.
--
-- Un destino directo de la página X en el touchpoint T es fantasma cuando:
--   * otra página (Y) está en vivo hoy en T;
--   * X estuvo publicada en T alguna vez (la reemplazaron, no es un plan);
--   * X no está en vivo ni publicándose en T.
-- Los destinos de una página que nunca se publicó en T se conservan: son lo
-- que el dueño eligió y se aplica cuando la publique. Los destinos por grupo
-- no se tocan: ahí decide la regla «gana lo más cercano» (ADR 021).

delete from kardo_core.experience_targets et
where et.touchpoint_id is not null
  and exists (
    select 1
    from kardo_core.publications live
    join kardo_core.experience_versions live_version on live_version.id = live.experience_version_id
    where live.touchpoint_id = et.touchpoint_id
      and live.status = 'published' and live.superseded_at is null
      and live_version.experience_id <> et.experience_id
  )
  and exists (
    select 1
    from kardo_core.publications past
    join kardo_core.experience_versions past_version on past_version.id = past.experience_version_id
    where past.touchpoint_id = et.touchpoint_id
      and past_version.experience_id = et.experience_id
      and past.status in ('published', 'superseded')
  )
  and not exists (
    select 1
    from kardo_core.publications own
    join kardo_core.experience_versions own_version on own_version.id = own.experience_version_id
    where own.touchpoint_id = et.touchpoint_id
      and own_version.experience_id = et.experience_id
      and (
        (own.status = 'published' and own.superseded_at is null)
        or own.status in ('pending', 'processing')
      )
  );

-- The legacy single-target column follows the first remaining direct target
-- (`writeExperienceTargets` keeps it that way).
update kardo_core.experiences e
set touchpoint_id = (
  select et.touchpoint_id from kardo_core.experience_targets et
  where et.experience_id = e.id and et.touchpoint_id is not null
  order by et.touchpoint_id
  limit 1
)
where e.touchpoint_id is not null
  and not exists (
    select 1 from kardo_core.experience_targets et
    where et.experience_id = e.id and et.touchpoint_id = e.touchpoint_id
  );
