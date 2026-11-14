-- Estudio QR (2026-09-25): el diseño deja de vivir solo en el navegador.
--   * Cada Touchpoint guarda su diseño QR (schema 2, validado estrictamente por
--     la Customer API contra @kardo/contracts QrDesignSchema).
--   * Cada organización guarda hasta 24 diseños con nombre ("Mis diseños").
-- Los diseños nunca contienen imágenes: el logo es una referencia a un asset
-- validado de la biblioteca o al logo de la marca.

-- 1. Diseño por Touchpoint.
alter table kardo_core.touchpoints add column if not exists qr_design jsonb;
alter table kardo_core.touchpoints add column if not exists qr_design_updated_at timestamptz;

do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_qr_design_bounded
    check (
      qr_design is null
      or (
        jsonb_typeof(qr_design) = 'object'
        and qr_design->>'schema' = '2'
        and pg_column_size(qr_design) <= 8192
      )
    );
exception when duplicate_object then null;
end $$;

grant update (qr_design, qr_design_updated_at) on kardo_core.touchpoints to kardo_customer_api;

-- 2. Diseños guardados de la organización.
create table if not exists kardo_core.qr_design_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  design jsonb not null check (
    jsonb_typeof(design) = 'object'
    and design->>'schema' = '2'
    and pg_column_size(design) <= 8192
  ),
  created_by uuid references kardo_core.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists qr_design_templates_workspace_created_idx
  on kardo_core.qr_design_templates (workspace_id, created_at desc);
create index if not exists qr_design_templates_created_by_idx
  on kardo_core.qr_design_templates (created_by);

-- Límite por organización, a prueba de inserciones concurrentes.
create or replace function kardo_core.enforce_qr_template_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform pg_advisory_xact_lock(hashtextextended('kardo.qr_templates:' || new.workspace_id::text, 0));
  if (
    select count(t.id) from kardo_core.qr_design_templates t
    where t.workspace_id = new.workspace_id
  ) >= 24 then
    raise exception 'QR_TEMPLATE_LIMIT' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists qr_design_templates_limit on kardo_core.qr_design_templates;
create trigger qr_design_templates_limit
  before insert on kardo_core.qr_design_templates
  for each row execute function kardo_core.enforce_qr_template_limit();

alter table kardo_core.qr_design_templates enable row level security;

-- Todos los miembros ven los diseños; crean, borran y limpian referencias a
-- logos borrados quienes gestionan Touchpoints o la biblioteca.
drop policy if exists "customer api qr templates select" on kardo_core.qr_design_templates;
create policy "customer api qr templates select" on kardo_core.qr_design_templates
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));
drop policy if exists "customer api qr templates insert" on kardo_core.qr_design_templates;
create policy "customer api qr templates insert" on kardo_core.qr_design_templates
  for insert to kardo_customer_api
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
drop policy if exists "customer api qr templates update" on kardo_core.qr_design_templates;
create policy "customer api qr templates update" on kardo_core.qr_design_templates
  for update to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
drop policy if exists "customer api qr templates delete" on kardo_core.qr_design_templates;
create policy "customer api qr templates delete" on kardo_core.qr_design_templates
  for delete to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

grant select, insert, delete on kardo_core.qr_design_templates to kardo_customer_api;
-- Solo para quitar el logo de un diseño cuando se borra su asset.
grant update (design) on kardo_core.qr_design_templates to kardo_customer_api;
