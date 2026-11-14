-- Avisos de cobro al cliente (ADR 019, LFPC art. 76 Bis fr. VIII y IX).
--
-- Bandeja de salida: el aviso se registra en la MISMA transaccion que el
-- cambio que lo causa (una suscripcion nueva, una cancelacion, un cobro
-- proximo), con una llave de deduplicacion, y el Customer API lo envia
-- despues por correo. Asi un aviso nunca se pierde ni se manda dos veces, y
-- queda constancia de a quien y cuando se envio (evidencia ante PROFECO).

create table if not exists kardo_billing.notices (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references kardo_core.workspaces(id) on delete restrict,
  kind text not null check (kind in (
    'subscription_started', 'renewal_upcoming', 'trial_ending', 'cancellation_confirmed'
  )),
  -- p. ej. renewal_upcoming:sub_123:2026-10-29. Un aviso por hecho.
  dedupe_key text not null unique check (char_length(dedupe_key) <= 200),
  stripe_subscription_id text check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]{6,64}$'),
  -- Datos del aviso (plan, monto, fechas, folio); nunca datos de tarjeta.
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and pg_column_size(payload) <= 4096),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts integer not null default 0 check (attempts >= 0),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  sent_to text check (sent_to is null or char_length(sent_to) <= 320),
  provider_message_id text check (provider_message_id is null or char_length(provider_message_id) <= 200),
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create index if not exists billing_notices_pending_idx
  on kardo_billing.notices (created_at) where status in ('pending', 'failed');
create index if not exists billing_notices_workspace_idx
  on kardo_billing.notices (workspace_id, created_at desc);

alter table kardo_billing.notices enable row level security;

drop policy if exists "billing sync all" on kardo_billing.notices;
create policy "billing sync all" on kardo_billing.notices
  for all to kardo_billing_sync using (true) with check (true);

drop policy if exists "staff api billing read" on kardo_billing.notices;
create policy "staff api billing read" on kardo_billing.notices
  for select to kardo_staff_api using (kardo_private.staff_has_permission('billing.read'));

-- Owner y Admin ven los avisos de su organizacion (historial en el panel).
drop policy if exists "customer api billing notices read" on kardo_billing.notices;
create policy "customer api billing notices read" on kardo_billing.notices
  for select to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));

grant select, insert, update on kardo_billing.notices to kardo_billing_sync;
grant select on kardo_billing.notices to kardo_staff_api, kardo_customer_api;
