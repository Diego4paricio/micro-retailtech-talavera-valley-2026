-- Resumen (2026-09-27): cada miembro arma su propio tablero por organización
-- (widgets, posición, tamaño y opciones). Es una preferencia personal: solo
-- su dueño la lee o la cambia, y solo mientras siga siendo miembro.

create table if not exists kardo_core.dashboard_layouts (
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  profile_id uuid not null references kardo_core.profiles(id) on delete cascade,
  layout jsonb not null check (
    jsonb_typeof(layout) = 'object'
    and jsonb_typeof(layout->'widgets') = 'array'
    and pg_column_size(layout) <= 32768
  ),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, profile_id)
);

create index if not exists dashboard_layouts_profile_idx
  on kardo_core.dashboard_layouts (profile_id);

alter table kardo_core.dashboard_layouts enable row level security;

drop policy if exists "customer api dashboard select" on kardo_core.dashboard_layouts;
create policy "customer api dashboard select" on kardo_core.dashboard_layouts
  for select to kardo_customer_api
  using (
    profile_id = kardo_private.current_customer_subject()
    and kardo_private.is_workspace_member(workspace_id)
  );
drop policy if exists "customer api dashboard insert" on kardo_core.dashboard_layouts;
create policy "customer api dashboard insert" on kardo_core.dashboard_layouts
  for insert to kardo_customer_api
  with check (
    profile_id = kardo_private.current_customer_subject()
    and kardo_private.is_workspace_member(workspace_id)
  );
drop policy if exists "customer api dashboard update" on kardo_core.dashboard_layouts;
create policy "customer api dashboard update" on kardo_core.dashboard_layouts
  for update to kardo_customer_api
  using (
    profile_id = kardo_private.current_customer_subject()
    and kardo_private.is_workspace_member(workspace_id)
  )
  with check (
    profile_id = kardo_private.current_customer_subject()
    and kardo_private.is_workspace_member(workspace_id)
  );
drop policy if exists "customer api dashboard delete" on kardo_core.dashboard_layouts;
create policy "customer api dashboard delete" on kardo_core.dashboard_layouts
  for delete to kardo_customer_api
  using (
    profile_id = kardo_private.current_customer_subject()
    and kardo_private.is_workspace_member(workspace_id)
  );

grant select, insert, delete on kardo_core.dashboard_layouts to kardo_customer_api;
grant update (layout, updated_at) on kardo_core.dashboard_layouts to kardo_customer_api;
