-- Domain audit 2026-10-13, A2-22: four screens write an Experience's draft
-- (the page editor, the Estudio, «Editar productos» and Disponibilidad) and
-- the last one to save won, design included. `draft_revision` goes up by
-- one on every saved change of the draft's name or content; a screen sends
-- back the one it loaded and the API answers 409 EXPERIENCE_CHANGED when
-- someone saved in between, instead of overwriting.
alter table kardo_core.experiences
  add column if not exists draft_revision integer not null default 1;

alter table kardo_core.experiences
  drop constraint if exists experiences_draft_revision_positive;
alter table kardo_core.experiences
  add constraint experiences_draft_revision_positive check (draft_revision >= 1);

comment on column kardo_core.experiences.draft_revision is
  'Goes up by one on every saved change of the draft name or content (optimistic concurrency for the panel, domain audit A2-22).';
