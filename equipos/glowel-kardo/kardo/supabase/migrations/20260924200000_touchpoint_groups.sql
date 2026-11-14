-- Grupos de touchpoints dentro de un workspace (ej. "Local Centro", "Mesas
-- terraza"), para organizarlos y, mas adelante, poder targetear una
-- Experience a un grupo entero (ver 20260924200100_experience_targets.sql).
create table if not exists kardo_core.touchpoint_groups (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  description text check (char_length(description) <= 300),
  created_by uuid references kardo_core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, workspace_id)
);

create unique index if not exists touchpoint_groups_workspace_name_unique
  on kardo_core.touchpoint_groups (workspace_id, lower(name));

alter table kardo_core.touchpoints add column if not exists group_id uuid;

-- Columna explicita en ON DELETE SET NULL (Postgres 15+): al borrar un grupo
-- solo se limpia group_id, nunca workspace_id (que no forma parte del grupo
-- borrado). El match simple de la FK compuesta hace que, mientras group_id
-- sea null, la fila no dependa de ningun grupo; cuando no es null, exige que
-- (group_id, workspace_id) exista en touchpoint_groups, es decir, que el
-- grupo pertenezca al mismo workspace que el touchpoint.
do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_group_same_workspace
    foreign key (group_id, workspace_id)
    references kardo_core.touchpoint_groups (id, workspace_id)
    on delete set null (group_id);
exception when duplicate_object then null;
end $$;

create index if not exists touchpoints_group_id_idx on kardo_core.touchpoints (group_id);

alter table kardo_core.touchpoint_groups enable row level security;

-- Publisher y Analytics no necesitan acceso: no publican ni agregan por grupo.
create policy "customer api touchpoint groups select" on kardo_core.touchpoint_groups
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));
create policy "customer api touchpoint groups insert" on kardo_core.touchpoint_groups
  for insert to kardo_customer_api
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
create policy "customer api touchpoint groups update" on kardo_core.touchpoint_groups
  for update to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
create policy "customer api touchpoint groups delete" on kardo_core.touchpoint_groups
  for delete to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

grant select, insert, update, delete on kardo_core.touchpoint_groups to kardo_customer_api;
