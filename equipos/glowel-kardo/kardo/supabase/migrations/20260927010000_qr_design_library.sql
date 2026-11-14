-- Estudio QR (2026-09-27): biblioteca de diseños aplicados por referencia.
-- Un QR codifica la dirección permanente de su Touchpoint, así que cambiar el
-- diseño nunca invalida lo ya impreso. Por eso el diseño se asigna:
--   1. propio del Touchpoint (touchpoints.qr_design),
--   2. o un diseño de la biblioteca (touchpoints.qr_template_id),
--   3. o el diseño por defecto de su grupo (touchpoint_groups.qr_template_id),
--      que también reciben los Touchpoints que se agreguen después,
--   4. o el diseño Kardo por defecto.
-- Además se registra con qué diseño se exportó cada QR (control de impresión).

-- 1. La biblioteca se edita (y su edición alcanza a todos sus usos).
alter table kardo_core.qr_design_templates
  add column if not exists updated_at timestamptz not null default now();
alter table kardo_core.qr_design_templates
  add column if not exists updated_by uuid references kardo_core.profiles(id) on delete set null;
create index if not exists qr_design_templates_updated_by_idx
  on kardo_core.qr_design_templates (updated_by);

-- Clave compuesta para que los usos queden atados al mismo workspace.
do $$ begin
  alter table kardo_core.qr_design_templates
    add constraint qr_design_templates_id_workspace_unique unique (id, workspace_id);
exception when duplicate_object then null;
end $$;

grant update (name, design, updated_at, updated_by)
  on kardo_core.qr_design_templates to kardo_customer_api;

-- Límite de la biblioteca: 50 diseños por organización.
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
  ) >= 50 then
    raise exception 'QR_TEMPLATE_LIMIT' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- 2. Diseño de la biblioteca aplicado a un Touchpoint.
alter table kardo_core.touchpoints add column if not exists qr_template_id uuid;
do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_qr_template_same_workspace
    foreign key (qr_template_id, workspace_id)
    references kardo_core.qr_design_templates (id, workspace_id)
    on delete restrict;
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_qr_design_single_source
    check (qr_design is null or qr_template_id is null);
exception when duplicate_object then null;
end $$;
create index if not exists touchpoints_qr_template_idx
  on kardo_core.touchpoints (qr_template_id) where qr_template_id is not null;

-- 3. Diseño por defecto del grupo.
alter table kardo_core.touchpoint_groups add column if not exists qr_template_id uuid;
do $$ begin
  alter table kardo_core.touchpoint_groups
    add constraint touchpoint_groups_qr_template_same_workspace
    foreign key (qr_template_id, workspace_id)
    references kardo_core.qr_design_templates (id, workspace_id)
    on delete restrict;
exception when duplicate_object then null;
end $$;
create index if not exists touchpoint_groups_qr_template_idx
  on kardo_core.touchpoint_groups (qr_template_id) where qr_template_id is not null;

-- 4. Control de impresión: última exportación de cada QR.
alter table kardo_core.touchpoints add column if not exists qr_last_export_at timestamptz;
alter table kardo_core.touchpoints add column if not exists qr_last_export_fingerprint text;
alter table kardo_core.touchpoints add column if not exists qr_last_export_format text;
do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_qr_last_export_valid
    check (
      (qr_last_export_at is null and qr_last_export_fingerprint is null and qr_last_export_format is null)
      or (
        qr_last_export_at is not null
        and qr_last_export_fingerprint ~ '^[a-f0-9]{64}$'
        and qr_last_export_format in ('png', 'svg', 'pdf', 'sheet')
      )
    );
exception when duplicate_object then null;
end $$;

grant update (qr_template_id, qr_last_export_at, qr_last_export_fingerprint, qr_last_export_format)
  on kardo_core.touchpoints to kardo_customer_api;
