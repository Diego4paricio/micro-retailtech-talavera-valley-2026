-- Estado físico del objeto de cada Touchpoint (relevo 36, aprobado por el
-- dueño el 2026-10-07). Va aparte del estado de la página (status): un
-- touchpoint puede estar «Activo» y su objeto todavía «Sin grabar».
--
-- Cada paso de «Conecta el objeto» guarda la hora en que se hizo, así una
-- recarga o salir a media configuración regresa al mismo paso:
--   object_prepared_at  NFC grabado / QR impreso / Otro: dirección puesta
--   object_tested_at    funcionó con un celular (a mano o por la primera visita)
--   object_backup_at    NFC: QR de respaldo impreso
--   object_placed_at    colocado en su lugar
-- Reemplazar el chip de un NFC (perdido o dañado) es un flujo aparte que no
-- borra lo anterior mientras dura; al colocar la tarjeta nueva, el API pasa
-- sus horas a las columnas de arriba y limpia las de reemplazo:
--   object_replacing_at          reemplazo en curso desde
--   object_replace_ready_at      tarjeta nueva borrada o formateada
--   object_replace_prepared_at   tarjeta nueva grabada
--   object_replace_tested_at     tarjeta nueva probada
-- La descarga del QR ya vive en qr_last_export_at.

alter table kardo_core.touchpoints
  add column object_prepared_at timestamptz,
  add column object_tested_at timestamptz,
  add column object_backup_at timestamptz,
  add column object_placed_at timestamptz,
  add column object_replacing_at timestamptz,
  add column object_replace_ready_at timestamptz,
  add column object_replace_prepared_at timestamptz,
  add column object_replace_tested_at timestamptz;

alter table kardo_core.touchpoints
  -- Los pasos de reemplazo solo existen mientras hay un reemplazo en curso.
  add constraint touchpoints_object_replace_steps check (
    object_replacing_at is not null
    or (
      object_replace_ready_at is null
      and object_replace_prepared_at is null
      and object_replace_tested_at is null
    )
  ),
  -- Un Link no es un objeto físico.
  add constraint touchpoints_object_not_links check (
    kind <> 'link'
    or (
      object_prepared_at is null and object_tested_at is null
      and object_backup_at is null and object_placed_at is null
      and object_replacing_at is null
    )
  );

comment on column kardo_core.touchpoints.object_prepared_at is
  'Relevo 36: NFC grabado, QR impreso u Otro con su dirección puesta.';
comment on column kardo_core.touchpoints.object_tested_at is
  'Relevo 36: probado con un celular (a mano o por la primera visita del canal).';
comment on column kardo_core.touchpoints.object_backup_at is
  'Relevo 36: NFC con su QR de respaldo impreso.';
comment on column kardo_core.touchpoints.object_placed_at is
  'Relevo 36: objeto colocado en su lugar.';
comment on column kardo_core.touchpoints.object_replacing_at is
  'Relevo 36: reemplazo del chip NFC en curso desde esta hora.';

grant update (
  object_prepared_at, object_tested_at, object_backup_at, object_placed_at,
  object_replacing_at, object_replace_ready_at, object_replace_prepared_at,
  object_replace_tested_at
) on kardo_core.touchpoints to kardo_customer_api;
