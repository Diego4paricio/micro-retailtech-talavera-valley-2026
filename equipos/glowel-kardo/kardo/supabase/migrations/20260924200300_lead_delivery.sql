-- Reenvio opcional de leads: Kardo siempre guarda el lead en kardo_core.leads;
-- esto es un canal ADICIONAL (email y/o webhook) que cada workspace puede
-- activar. El Analytics Worker es quien efectivamente envia.
--
-- Sobre el secreto del webhook: el Worker necesita el secreto EN CLARO para
-- firmar el payload saliente (HMAC), no solo compararlo -- a diferencia de
-- workspace_invitations.token_hash (donde alcanza un hash de un solo sentido
-- porque solo hace falta verificar). Por eso se guarda cifrado
-- (`webhook_secret_ciphertext`, AES-GCM aplicado en la aplicacion: el
-- Customer API cifra al guardar, el Analytics Worker descifra para firmar)
-- con una clave que vive solo en el entorno de cada servicio y que Postgres
-- nunca ve. Deliberadamente NO se agrega ademas un `webhook_secret_hash`:
-- ningun flujo necesita comparar el secreto sin descifrarlo primero, asi que
-- un segundo campo solo anadiria superficie de ataque (y otra copia que
-- mantener sincronizada) sin ningun beneficio real.
create table if not exists kardo_core.lead_delivery_settings (
  workspace_id uuid primary key references kardo_core.workspaces(id) on delete cascade,
  notify_email boolean not null default false,
  notify_recipients text[] not null default '{}' check (cardinality(notify_recipients) <= 5),
  webhook_url text check (webhook_url is null or (webhook_url ~ '^https://' and char_length(webhook_url) <= 2048)),
  webhook_secret_ciphertext text,
  updated_by uuid references kardo_core.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists kardo_core.lead_deliveries (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references kardo_core.leads(id) on delete cascade,
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  channel text not null check (channel in ('email', 'webhook')),
  status text not null check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (char_length(last_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lead_deliveries_lead_id_idx on kardo_core.lead_deliveries (lead_id);
create index if not exists lead_deliveries_workspace_id_idx on kardo_core.lead_deliveries (workspace_id);
create index if not exists lead_deliveries_pending_idx on kardo_core.lead_deliveries (status) where status = 'pending';

-- Campos de lead configurables a futuro (formularios custom por workspace),
-- acotados en tamano para que no se convierta en un blob sin control.
alter table kardo_core.leads add column if not exists fields jsonb not null default '{}'::jsonb;

do $$ begin
  alter table kardo_core.leads
    add constraint leads_fields_is_bounded_object
    check (jsonb_typeof(fields) = 'object' and pg_column_size(fields) <= 4096)
    not valid;
exception when duplicate_object then null;
end $$;
alter table kardo_core.leads validate constraint leads_fields_is_bounded_object;

alter table kardo_core.lead_delivery_settings enable row level security;
alter table kardo_core.lead_deliveries enable row level security;

-- lead_delivery_settings guarda el secreto cifrado del webhook: solo
-- owner/admin puede leerlo o cambiarlo (ni siquiera editor).
create policy "customer api lead delivery settings select" on kardo_core.lead_delivery_settings
  for select to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));
create policy "customer api lead delivery settings insert" on kardo_core.lead_delivery_settings
  for insert to kardo_customer_api
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));
create policy "customer api lead delivery settings update" on kardo_core.lead_delivery_settings
  for update to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'))
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));

grant select, insert, update on kardo_core.lead_delivery_settings to kardo_customer_api;

-- lead_deliveries: solo lectura (el estado de los intentos de reenvio), para
-- cualquier miembro con acceso al workspace, igual que kardo_core.leads.
create policy "customer api lead deliveries select" on kardo_core.lead_deliveries
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));

grant select on kardo_core.lead_deliveries to kardo_customer_api;

-- kardo_analytics (el Worker): lee la configuracion activa para decidir si
-- reenviar y escribe el resultado de cada intento. Nunca ve la clave de
-- cifrado ni el secreto en claro por si solo -- descifra webhook_secret_ciphertext
-- en su propio proceso con una clave que solo el Worker conoce.
grant select on kardo_core.lead_delivery_settings to kardo_analytics;
grant insert, update on kardo_core.lead_deliveries to kardo_analytics;

create policy "analytics lead delivery settings read" on kardo_core.lead_delivery_settings
  for select to kardo_analytics
  using (true);
create policy "analytics lead deliveries append" on kardo_core.lead_deliveries
  for insert to kardo_analytics
  with check (true);
create policy "analytics lead deliveries update" on kardo_core.lead_deliveries
  for update to kardo_analytics
  using (true)
  with check (true);
