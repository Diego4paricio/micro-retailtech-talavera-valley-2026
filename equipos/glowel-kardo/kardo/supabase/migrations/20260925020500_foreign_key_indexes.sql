-- Indices para las claves foraneas que el linter de Supabase marco sin
-- cobertura. Varios los usan las consultas de propagacion por grupo y de
-- precedencia (touchpoints por grupo, destinos por experience).
create index if not exists experience_targets_experience_workspace_idx
  on kardo_core.experience_targets (experience_id, workspace_id);
create index if not exists experience_targets_group_workspace_idx
  on kardo_core.experience_targets (group_id, workspace_id) where group_id is not null;
create index if not exists experience_targets_touchpoint_workspace_idx
  on kardo_core.experience_targets (touchpoint_id, workspace_id) where touchpoint_id is not null;
create index if not exists touchpoints_group_workspace_idx
  on kardo_core.touchpoints (group_id, workspace_id) where group_id is not null;
create index if not exists touchpoints_suspended_by_idx
  on kardo_core.touchpoints (suspended_by) where suspended_by is not null;
create index if not exists lead_delivery_settings_updated_by_idx
  on kardo_core.lead_delivery_settings (updated_by);
create index if not exists publication_requests_created_by_idx
  on kardo_core.publication_requests (created_by);
create index if not exists publication_requests_experience_version_id_idx
  on kardo_core.publication_requests (experience_version_id);
create index if not exists touchpoint_groups_created_by_idx
  on kardo_core.touchpoint_groups (created_by);
