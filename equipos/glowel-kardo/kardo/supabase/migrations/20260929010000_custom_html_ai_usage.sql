-- Estudio de Experiences, modo HTML (ADR 018, adenda 2026-09-29): cupo diario
-- de "Pídele a la IA de Kardo" por organización. Cada generación cuesta, así
-- que el límite vive en la base (vale para todas las instancias del API y
-- sobrevive reinicios). Un día es un día UTC.

create table if not exists kardo_core.custom_html_ai_usage (
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  usage_day date not null,
  generations integer not null default 0 check (generations >= 0),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, usage_day)
);

alter table kardo_core.custom_html_ai_usage enable row level security;

drop policy if exists "customer api custom html ai usage" on kardo_core.custom_html_ai_usage;
create policy "customer api custom html ai usage" on kardo_core.custom_html_ai_usage
  for all to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id))
  with check (kardo_private.is_workspace_member(workspace_id));

grant select, insert on kardo_core.custom_html_ai_usage to kardo_customer_api;
grant update (generations, updated_at) on kardo_core.custom_html_ai_usage to kardo_customer_api;
