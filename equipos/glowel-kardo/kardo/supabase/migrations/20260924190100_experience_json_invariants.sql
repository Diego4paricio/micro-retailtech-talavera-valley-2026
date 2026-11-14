-- ALTO (audit): draft_content/content aceptaban cualquier JSON escalar, no
-- solo objetos. Las dos migraciones de 2026-09-24 ya repararon el contenido
-- legado que habia quedado doblemente codificado como string; ahora se
-- valida el invariante con NOT VALID + VALIDATE para no bloquear el deploy
-- si alguna fila historica todavia no calza (se veria en el error).
do $$ begin
  alter table kardo_core.experiences
    add constraint experiences_draft_content_is_object
    check (jsonb_typeof(draft_content) = 'object') not valid;
exception when duplicate_object then null;
end $$;
alter table kardo_core.experiences validate constraint experiences_draft_content_is_object;

do $$ begin
  alter table kardo_core.experience_versions
    add constraint experience_versions_content_is_object
    check (jsonb_typeof(content) = 'object') not valid;
exception when duplicate_object then null;
end $$;
alter table kardo_core.experience_versions validate constraint experience_versions_content_is_object;

-- ALTO (audit): kardo_core.assets.media_type solo tenia un limite de
-- longitud (char_length <= 128), no una lista de valores permitidos, a
-- pesar de que expected_media_type ya restringia a image/png|application/pdf
-- desde 20260915070000. El Customer API ya solo escribe esos dos valores.
do $$ begin
  alter table kardo_core.assets
    add constraint assets_media_type_allowed
    check (media_type in ('image/png', 'application/pdf')) not valid;
exception when duplicate_object then null;
end $$;
alter table kardo_core.assets validate constraint assets_media_type_allowed;
