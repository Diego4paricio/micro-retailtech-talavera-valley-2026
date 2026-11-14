create index analytics_raw_events_workspace_id_idx
  on kardo_core.analytics_raw_events (workspace_id);
create index analytics_raw_events_touchpoint_id_idx
  on kardo_core.analytics_raw_events (touchpoint_id);
create index leads_touchpoint_id_idx
  on kardo_core.leads (touchpoint_id);
