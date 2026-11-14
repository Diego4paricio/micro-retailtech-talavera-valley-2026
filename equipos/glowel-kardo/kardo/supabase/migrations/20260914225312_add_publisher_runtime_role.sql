-- Publisher has its own least-privilege role. It never runs with either BFF role.
do $$ begin
  create role kardo_publisher nologin noinherit nobypassrls;
exception when duplicate_object then null;
end $$;

grant usage on schema kardo_core, kardo_audit to kardo_publisher;
grant select on kardo_core.touchpoints, kardo_core.experiences, kardo_core.experience_versions, kardo_core.publications, kardo_core.publication_jobs to kardo_publisher;
grant update on kardo_core.publications, kardo_core.publication_jobs to kardo_publisher;
grant insert on kardo_audit.events to kardo_publisher;

create policy "publisher publications read" on kardo_core.publications for select to kardo_publisher using (true);
create policy "publisher publications update" on kardo_core.publications for update to kardo_publisher using (true) with check (true);
create policy "publisher jobs read" on kardo_core.publication_jobs for select to kardo_publisher using (true);
create policy "publisher jobs update" on kardo_core.publication_jobs for update to kardo_publisher using (true) with check (true);
create policy "publisher touchpoints read" on kardo_core.touchpoints for select to kardo_publisher using (true);
create policy "publisher experiences read" on kardo_core.experiences for select to kardo_publisher using (true);
create policy "publisher versions read" on kardo_core.experience_versions for select to kardo_publisher using (true);
create policy "publisher audit append" on kardo_audit.events for insert to kardo_publisher with check (true);
