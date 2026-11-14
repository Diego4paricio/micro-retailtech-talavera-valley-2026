-- A draft must retain its intended physical object before a publication exists.
-- The API additionally verifies that both records belong to the same workspace.
alter table kardo_core.experiences
  add column touchpoint_id uuid references kardo_core.touchpoints(id) on delete restrict;

create index experiences_touchpoint_id_idx
  on kardo_core.experiences (touchpoint_id);
