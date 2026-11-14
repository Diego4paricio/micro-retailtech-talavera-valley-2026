-- The analytics Worker now (a) accepts a lead only when the Touchpoint's
-- active publication is a `form` Experience and (b) delivers optional copies
-- (webhook/email) that include the workspace and Touchpoint names. It needs
-- read access to those rows, and SELECT on lead_deliveries because an UPDATE
-- whose WHERE clause references columns requires the SELECT privilege.
-- Access stays read-only and server-side, like its existing analytics grants.

grant select (id, workspace_id, type) on kardo_core.experiences to kardo_analytics;
grant select (id, experience_id) on kardo_core.experience_versions to kardo_analytics;
grant select (id, name) on kardo_core.workspaces to kardo_analytics;
grant select on kardo_core.lead_deliveries to kardo_analytics;

drop policy if exists "analytics experiences read" on kardo_core.experiences;
create policy "analytics experiences read" on kardo_core.experiences
  for select to kardo_analytics using (true);

drop policy if exists "analytics experience versions read" on kardo_core.experience_versions;
create policy "analytics experience versions read" on kardo_core.experience_versions
  for select to kardo_analytics using (true);

drop policy if exists "analytics workspaces read" on kardo_core.workspaces;
create policy "analytics workspaces read" on kardo_core.workspaces
  for select to kardo_analytics using (true);

drop policy if exists "analytics lead deliveries read" on kardo_core.lead_deliveries;
create policy "analytics lead deliveries read" on kardo_core.lead_deliveries
  for select to kardo_analytics using (true);

-- `insert into kardo_core.leads ... returning created_at` needs SELECT on the
-- returned column and a SELECT policy the new row satisfies (RLS applies
-- RETURNING through SELECT policies). Limit it to the two columns involved.
grant select (id, created_at) on kardo_core.leads to kardo_analytics;

drop policy if exists "analytics leads read" on kardo_core.leads;
create policy "analytics leads read" on kardo_core.leads
  for select to kardo_analytics using (true);
