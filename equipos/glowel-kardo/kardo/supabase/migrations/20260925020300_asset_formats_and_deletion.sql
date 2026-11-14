-- Assets: JPEG y WebP (sanitizados por el Assets Worker, sin EXIF/GPS) y
-- borrado logico. Un asset eliminado deja de poder usarse en borradores o
-- publicaciones; el original y, si nadie mas lo comparte, el derivado publico
-- se eliminan de R2.

alter table kardo_core.assets drop constraint if exists assets_media_type_allowed;
alter table kardo_core.assets add constraint assets_media_type_allowed
  check (media_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf'));

alter table kardo_core.assets drop constraint if exists assets_expected_media_type_matches;
alter table kardo_core.assets add constraint assets_expected_media_type_matches
  check (expected_media_type is null
    or expected_media_type in ('image/png', 'image/jpeg', 'image/webp', 'application/pdf'));

alter table kardo_core.assets add column if not exists deleted_at timestamptz;

alter table kardo_core.assets drop constraint if exists assets_status_check;
alter table kardo_core.assets add constraint assets_status_check
  check (status in ('quarantined', 'validated', 'rejected', 'published', 'deleted'));

do $$ begin
  alter table kardo_core.assets
    add constraint assets_deleted_consistent
    check ((status = 'deleted') = (deleted_at is not null));
exception when duplicate_object then null;
end $$;
