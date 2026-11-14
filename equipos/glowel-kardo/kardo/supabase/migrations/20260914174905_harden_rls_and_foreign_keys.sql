-- Runtime roles are used only by the two trusted BFFs. They do not inherit
-- browser privileges and remain constrained to their dedicated schemas.
create policy "customer api profiles" on kardo_core.profiles for all to kardo_customer_api using (true) with check (true);
create policy "customer api workspaces" on kardo_core.workspaces for all to kardo_customer_api using (true) with check (true);
create policy "customer api memberships" on kardo_core.workspace_memberships for all to kardo_customer_api using (true) with check (true);
create policy "customer api plans" on kardo_core.plans for all to kardo_customer_api using (true) with check (true);
create policy "customer api entitlements" on kardo_core.plan_entitlements for all to kardo_customer_api using (true) with check (true);
create policy "customer api workspace plans" on kardo_core.workspace_plans for all to kardo_customer_api using (true) with check (true);
create policy "customer api touchpoints" on kardo_core.touchpoints for all to kardo_customer_api using (true) with check (true);
create policy "customer api activations" on kardo_core.touchpoint_activations for all to kardo_customer_api using (true) with check (true);
create policy "customer api experiences" on kardo_core.experiences for all to kardo_customer_api using (true) with check (true);
create policy "customer api versions" on kardo_core.experience_versions for all to kardo_customer_api using (true) with check (true);
create policy "customer api publications" on kardo_core.publications for all to kardo_customer_api using (true) with check (true);
create policy "customer api publication jobs" on kardo_core.publication_jobs for all to kardo_customer_api using (true) with check (true);
create policy "customer api assets" on kardo_core.assets for all to kardo_customer_api using (true) with check (true);
create policy "customer api audit append" on kardo_audit.events for insert to kardo_customer_api with check (true);

create policy "staff api profiles" on kardo_staff.staff_profiles for select to kardo_staff_api using (true);
create policy "staff api roles" on kardo_staff.roles for select to kardo_staff_api using (true);
create policy "staff api permissions" on kardo_staff.permissions for select to kardo_staff_api using (true);
create policy "staff api assignments" on kardo_staff.role_assignments for select to kardo_staff_api using (true);
create policy "staff api workspaces" on kardo_core.workspaces for select to kardo_staff_api using (true);
create policy "staff api touchpoints" on kardo_core.touchpoints for select to kardo_staff_api using (true);
create policy "staff api experiences" on kardo_core.experiences for select to kardo_staff_api using (true);
create policy "staff api publications" on kardo_core.publications for select to kardo_staff_api using (true);
create policy "staff api audit append" on kardo_audit.events for insert to kardo_staff_api with check (true);

create index audit_events_actor_subject_idx on kardo_audit.events (actor_subject);
create index assets_created_by_idx on kardo_core.assets (created_by);
create index experience_versions_created_by_idx on kardo_core.experience_versions (created_by);
create index experiences_created_by_idx on kardo_core.experiences (created_by);
create index publication_jobs_publication_id_idx on kardo_core.publication_jobs (publication_id);
create index publications_created_by_idx on kardo_core.publications (created_by);
create index publications_experience_version_id_idx on kardo_core.publications (experience_version_id);
create index touchpoint_activations_claimed_by_idx on kardo_core.touchpoint_activations (claimed_by);
create index workspace_memberships_profile_id_idx on kardo_core.workspace_memberships (profile_id);
create index workspace_plans_assigned_by_idx on kardo_core.workspace_plans (assigned_by);
create index workspace_plans_plan_id_idx on kardo_core.workspace_plans (plan_id);
create index staff_role_assignments_assigned_by_idx on kardo_staff.role_assignments (assigned_by);
create index staff_role_assignments_role_id_idx on kardo_staff.role_assignments (role_id);
