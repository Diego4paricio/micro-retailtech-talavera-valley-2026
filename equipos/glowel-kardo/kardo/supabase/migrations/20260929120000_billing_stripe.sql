-- Suscripciones con Stripe y limites por plan (ADR 019).
--
-- Stripe es la fuente de verdad del cobro; esta base guarda un espejo minimo
-- (Customers, precios, suscripciones, facturas, reembolsos, eventos) que solo
-- escribe el webhook con su propio rol, `kardo_billing_sync`. Kardo es la
-- fuente de verdad de los limites: `plan_entitlements` del plan efectivo.
--
-- Plan efectivo de un workspace (kardo_billing.effective_plan):
--   1. suscripcion viva (trialing, active, past_due);
--   2. asignacion manual de Operations en workspace_plans (vigente);
--   3. el plan marcado is_default;
--   4. ninguno: sin limites (igual que hoy con `beta`).
-- Nunca se borra ni se apaga nada al bajar de plan: los limites solo impiden
-- crear por encima del tope.

create schema if not exists kardo_billing;
revoke all on schema kardo_billing from public;
revoke all on schema kardo_billing from anon, authenticated;

do $$ begin
  create role kardo_billing_sync nologin noinherit nobypassrls;
exception when duplicate_object then null;
end $$;

-- El login del Customer API cambia a este rol solo dentro de la transaccion
-- del webhook, despues de verificar la firma de Stripe.
grant kardo_billing_sync to kardo_customer_api_runtime;
-- El Staff API tambien: despues de cancelar, reanudar, extender una prueba o
-- reembolsar en Stripe, refleja el resultado en el espejo sin esperar al
-- webhook (el webhook llega despues y no cambia nada).
grant kardo_billing_sync to kardo_staff_api_runtime;
-- Igual que kardo_customer_api: permite pruebas y verificacion con el login
-- de migraciones.
grant kardo_billing_sync to postgres;

grant usage on schema kardo_billing to kardo_customer_api, kardo_staff_api, kardo_billing_sync;
grant usage on schema kardo_core, kardo_audit, kardo_private to kardo_billing_sync;

-- ---------------------------------------------------------------------------
-- 1. Catalogo: columnas nuevas en planes y asignaciones
-- ---------------------------------------------------------------------------

alter table kardo_core.plans
  add column if not exists description text,
  add column if not exists is_public boolean not null default false,
  add column if not exists is_default boolean not null default false,
  add column if not exists sort_order integer not null default 0,
  add column if not exists trial_days integer;

do $$ begin
  alter table kardo_core.plans
    add constraint plans_description_length check (description is null or char_length(description) <= 500);
exception when duplicate_object then null;
end $$;
do $$ begin
  alter table kardo_core.plans
    add constraint plans_trial_days_range check (trial_days is null or trial_days between 1 and 90);
exception when duplicate_object then null;
end $$;
-- A lo sumo un plan por defecto (el de caida al terminar una suscripcion).
create unique index if not exists plans_single_default
  on kardo_core.plans ((true)) where is_default;

-- Asignacion manual con vencimiento opcional (cortesias, acuerdos).
alter table kardo_core.workspace_plans
  add column if not exists override_until timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Espejo de Stripe
-- ---------------------------------------------------------------------------

create table if not exists kardo_billing.customers (
  workspace_id uuid primary key references kardo_core.workspaces(id) on delete restrict,
  stripe_customer_id text not null unique check (stripe_customer_id ~ '^cus_[A-Za-z0-9]{6,64}$'),
  livemode boolean not null,
  email text check (email is null or char_length(email) <= 320),
  -- Una sola prueba gratuita por workspace y por persona que la inicia.
  trial_consumed_at timestamptz,
  trial_consumed_by uuid references kardo_core.profiles(id) on delete set null,
  created_by uuid references kardo_core.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists billing_customers_trial_consumed_by_idx on kardo_billing.customers (trial_consumed_by);
create index if not exists billing_customers_created_by_idx on kardo_billing.customers (created_by);

create table if not exists kardo_billing.prices (
  stripe_price_id text primary key check (stripe_price_id ~ '^price_[A-Za-z0-9]{6,64}$'),
  stripe_product_id text not null check (stripe_product_id ~ '^prod_[A-Za-z0-9]{6,64}$'),
  -- De `metadata.kardo_plan_code` del Price (o, si falta, del Product). Asi
  -- sirve un Product por plan o un solo Product con varios Prices (el Portal
  -- solo programa bajadas al final del periodo entre Prices del mismo
  -- Product). Null cuando el precio no corresponde a ningun plan de Kardo.
  plan_id uuid references kardo_core.plans(id) on delete restrict,
  lookup_key text check (lookup_key is null or char_length(lookup_key) <= 200),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  -- Centavos. Con tax_behavior inclusive el monto ya trae IVA.
  unit_amount bigint check (unit_amount is null or unit_amount >= 0),
  billing_interval text check (billing_interval is null or billing_interval in ('day', 'week', 'month', 'year')),
  interval_count integer check (interval_count is null or interval_count between 1 and 365),
  tax_behavior text check (tax_behavior is null or tax_behavior in ('inclusive', 'exclusive', 'unspecified')),
  active boolean not null,
  livemode boolean not null,
  synced_at timestamptz not null default now()
);
create unique index if not exists billing_prices_lookup_key_unique
  on kardo_billing.prices (lookup_key) where lookup_key is not null;
create index if not exists billing_prices_plan_id_idx on kardo_billing.prices (plan_id);

do $$ begin
  create type kardo_billing.subscription_status as enum (
    'incomplete', 'incomplete_expired', 'trialing', 'active',
    'past_due', 'canceled', 'unpaid', 'paused'
  );
exception when duplicate_object then null;
end $$;

create table if not exists kardo_billing.subscriptions (
  stripe_subscription_id text primary key check (stripe_subscription_id ~ '^sub_[A-Za-z0-9]{6,64}$'),
  workspace_id uuid not null references kardo_core.workspaces(id) on delete restrict,
  stripe_customer_id text not null references kardo_billing.customers(stripe_customer_id) on delete restrict,
  status kardo_billing.subscription_status not null,
  plan_id uuid references kardo_core.plans(id) on delete restrict,
  stripe_price_id text check (stripe_price_id is null or stripe_price_id ~ '^price_[A-Za-z0-9]{6,64}$'),
  billing_interval text check (billing_interval is null or billing_interval in ('day', 'week', 'month', 'year')),
  interval_count integer check (interval_count is null or interval_count between 1 and 365),
  unit_amount bigint check (unit_amount is null or unit_amount >= 0),
  currency text check (currency is null or currency ~ '^[a-z]{3}$'),
  current_period_start timestamptz,
  current_period_end timestamptz,
  trial_start timestamptz,
  trial_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_at timestamptz,
  canceled_at timestamptz,
  ended_at timestamptz,
  cancellation_reason text check (cancellation_reason is null or char_length(cancellation_reason) <= 64),
  cancellation_feedback text check (cancellation_feedback is null or char_length(cancellation_feedback) <= 64),
  -- Solo lo necesario para mostrar; nunca el numero de tarjeta.
  payment_method_type text check (payment_method_type is null or char_length(payment_method_type) <= 32),
  payment_method_brand text check (payment_method_brand is null or char_length(payment_method_brand) <= 32),
  payment_method_last4 text check (payment_method_last4 is null or payment_method_last4 ~ '^[0-9]{4}$'),
  payment_method_exp_month integer check (payment_method_exp_month is null or payment_method_exp_month between 1 and 12),
  payment_method_exp_year integer check (payment_method_exp_year is null or payment_method_exp_year between 2000 and 2200),
  latest_invoice_id text check (latest_invoice_id is null or latest_invoice_id ~ '^in_[A-Za-z0-9]{6,64}$'),
  livemode boolean not null,
  stripe_created_at timestamptz not null,
  synced_at timestamptz not null default now()
);
-- Sin indice unico por workspace a proposito: si Stripe llegara a tener dos
-- suscripciones vivas (dos pestanas en Checkout), el espejo debe reflejarlo
-- para que Operations lo vea, no fallar y reintentar para siempre.
create index if not exists billing_subscriptions_workspace_idx on kardo_billing.subscriptions (workspace_id, status);
create index if not exists billing_subscriptions_customer_idx on kardo_billing.subscriptions (stripe_customer_id);
create index if not exists billing_subscriptions_plan_idx on kardo_billing.subscriptions (plan_id);

create table if not exists kardo_billing.invoices (
  stripe_invoice_id text primary key check (stripe_invoice_id ~ '^in_[A-Za-z0-9]{6,64}$'),
  workspace_id uuid not null references kardo_core.workspaces(id) on delete restrict,
  stripe_customer_id text not null check (stripe_customer_id ~ '^cus_[A-Za-z0-9]{6,64}$'),
  stripe_subscription_id text check (stripe_subscription_id is null or stripe_subscription_id ~ '^sub_[A-Za-z0-9]{6,64}$'),
  number text check (number is null or char_length(number) <= 64),
  status text check (status is null or status in ('draft', 'open', 'paid', 'uncollectible', 'void')),
  billing_reason text check (billing_reason is null or char_length(billing_reason) <= 64),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  subtotal bigint,
  tax bigint,
  total bigint not null,
  amount_due bigint not null,
  amount_paid bigint not null,
  amount_remaining bigint,
  amount_refunded bigint not null default 0 check (amount_refunded >= 0),
  hosted_invoice_url text check (hosted_invoice_url is null or hosted_invoice_url ~ '^https://'),
  invoice_pdf text check (invoice_pdf is null or invoice_pdf ~ '^https://'),
  period_start timestamptz,
  period_end timestamptz,
  paid_at timestamptz,
  attempt_count integer check (attempt_count is null or attempt_count >= 0),
  next_payment_attempt timestamptz,
  livemode boolean not null,
  stripe_created_at timestamptz not null,
  synced_at timestamptz not null default now()
);
create index if not exists billing_invoices_workspace_idx on kardo_billing.invoices (workspace_id, stripe_created_at desc);
create index if not exists billing_invoices_subscription_idx on kardo_billing.invoices (stripe_subscription_id);

create table if not exists kardo_billing.refunds (
  stripe_refund_id text primary key check (stripe_refund_id ~ '^re_[A-Za-z0-9]{6,64}$'),
  workspace_id uuid not null references kardo_core.workspaces(id) on delete restrict,
  stripe_invoice_id text references kardo_billing.invoices(stripe_invoice_id) on delete restrict,
  amount bigint not null check (amount > 0),
  currency text not null check (currency ~ '^[a-z]{3}$'),
  status text not null check (status in ('pending', 'requires_action', 'succeeded', 'failed', 'canceled')),
  reason text check (reason is null or char_length(reason) <= 500),
  -- Staff que lo pidio (null si llego desde el dashboard de Stripe).
  requested_by uuid references kardo_staff.staff_profiles(id) on delete set null,
  livemode boolean not null,
  created_at timestamptz not null default now(),
  synced_at timestamptz not null default now()
);
create index if not exists billing_refunds_workspace_idx on kardo_billing.refunds (workspace_id);
create index if not exists billing_refunds_invoice_idx on kardo_billing.refunds (stripe_invoice_id);
create index if not exists billing_refunds_requested_by_idx on kardo_billing.refunds (requested_by);

-- Idempotencia del webhook. No se guarda el cuerpo del evento (trae correos
-- y direcciones): solo lo necesario para diagnosticar y reintentar.
create table if not exists kardo_billing.webhook_events (
  stripe_event_id text primary key check (stripe_event_id ~ '^evt_[A-Za-z0-9]{6,64}$'),
  event_type text not null check (char_length(event_type) <= 100),
  object_id text check (object_id is null or char_length(object_id) <= 100),
  workspace_id uuid references kardo_core.workspaces(id) on delete set null,
  livemode boolean not null,
  api_version text check (api_version is null or char_length(api_version) <= 64),
  stripe_created_at timestamptz not null,
  status text not null default 'received' check (status in ('received', 'processed', 'ignored', 'failed')),
  attempts integer not null default 1 check (attempts >= 1),
  last_error text check (last_error is null or char_length(last_error) <= 500),
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists billing_webhook_events_status_idx on kardo_billing.webhook_events (status, received_at desc);
create index if not exists billing_webhook_events_workspace_idx on kardo_billing.webhook_events (workspace_id);

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

alter table kardo_billing.customers enable row level security;
alter table kardo_billing.prices enable row level security;
alter table kardo_billing.subscriptions enable row level security;
alter table kardo_billing.invoices enable row level security;
alter table kardo_billing.refunds enable row level security;
alter table kardo_billing.webhook_events enable row level security;

-- Cliente: Owner y Admin leen la facturacion de su workspace (billing.read);
-- solo el Owner crea el Customer (billing.manage).
drop policy if exists "customer api billing customers read" on kardo_billing.customers;
create policy "customer api billing customers read" on kardo_billing.customers
  for select to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));
drop policy if exists "customer api billing customers create" on kardo_billing.customers;
create policy "customer api billing customers create" on kardo_billing.customers
  for insert to kardo_customer_api
  with check (
    kardo_private.workspace_role(workspace_id) = 'owner'
    and created_by = kardo_private.current_customer_subject()
    and trial_consumed_at is null
    and trial_consumed_by is null
  );

drop policy if exists "customer api billing subscriptions read" on kardo_billing.subscriptions;
create policy "customer api billing subscriptions read" on kardo_billing.subscriptions
  for select to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));

drop policy if exists "customer api billing invoices read" on kardo_billing.invoices;
create policy "customer api billing invoices read" on kardo_billing.invoices
  for select to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));

-- El catalogo de precios es publico dentro del panel.
drop policy if exists "customer api billing prices read" on kardo_billing.prices;
create policy "customer api billing prices read" on kardo_billing.prices
  for select to kardo_customer_api
  using (active);

-- Staff: lectura con billing.read; solo registra reembolsos que pidio.
do $$
declare
  target text;
begin
  foreach target in array array['customers', 'prices', 'subscriptions', 'invoices', 'refunds', 'webhook_events'] loop
    execute format('drop policy if exists %I on kardo_billing.%I', 'staff api billing read', target);
    execute format(
      'create policy %I on kardo_billing.%I for select to kardo_staff_api using (kardo_private.staff_has_permission(''billing.read''))',
      'staff api billing read', target
    );
    execute format('drop policy if exists %I on kardo_billing.%I', 'billing sync all', target);
    execute format(
      'create policy %I on kardo_billing.%I for all to kardo_billing_sync using (true) with check (true)',
      'billing sync all', target
    );
  end loop;
end $$;

drop policy if exists "staff api billing refunds create" on kardo_billing.refunds;
create policy "staff api billing refunds create" on kardo_billing.refunds
  for insert to kardo_staff_api
  with check (
    kardo_private.staff_has_permission('billing.refund')
    and requested_by = kardo_private.current_staff_subject()
  );

-- El webhook lee workspaces y planes para mapear productos y validar IDs, y
-- audita como servicio.
drop policy if exists "billing sync workspaces read" on kardo_core.workspaces;
create policy "billing sync workspaces read" on kardo_core.workspaces
  for select to kardo_billing_sync using (true);
drop policy if exists "billing sync plans read" on kardo_core.plans;
create policy "billing sync plans read" on kardo_core.plans
  for select to kardo_billing_sync using (true);
-- Solo el id: para registrar quien inicio la prueba sin violar la FK si su
-- cuenta ya no existe.
drop policy if exists "billing sync profiles read" on kardo_core.profiles;
create policy "billing sync profiles read" on kardo_core.profiles
  for select to kardo_billing_sync using (true);
drop policy if exists "billing sync audit append" on kardo_audit.events;
create policy "billing sync audit append" on kardo_audit.events
  for insert to kardo_billing_sync with check (actor_type = 'service');

-- ---------------------------------------------------------------------------
-- 4. Privilegios
-- ---------------------------------------------------------------------------

grant select on kardo_billing.customers, kardo_billing.subscriptions,
  kardo_billing.invoices, kardo_billing.prices to kardo_customer_api;
grant insert (workspace_id, stripe_customer_id, livemode, email, created_by)
  on kardo_billing.customers to kardo_customer_api;

grant select on all tables in schema kardo_billing to kardo_staff_api;
grant insert (stripe_refund_id, workspace_id, stripe_invoice_id, amount, currency, status, reason, requested_by, livemode)
  on kardo_billing.refunds to kardo_staff_api;

grant select, insert, update on kardo_billing.customers, kardo_billing.prices,
  kardo_billing.subscriptions, kardo_billing.invoices, kardo_billing.refunds,
  kardo_billing.webhook_events to kardo_billing_sync;
grant select on kardo_core.workspaces, kardo_core.plans to kardo_billing_sync;
grant select (id) on kardo_core.profiles to kardo_billing_sync;
grant insert on kardo_audit.events to kardo_billing_sync;

-- ---------------------------------------------------------------------------
-- 5. Plan efectivo, limites y consumo
-- ---------------------------------------------------------------------------

-- Interna: sin control de acceso, no se otorga a ningun rol de API.
create or replace function kardo_billing.resolve_effective_plan(p_workspace_id uuid)
returns table (plan_id uuid, source text, stripe_subscription_id text)
language sql
stable
security definer
set search_path = ''
as $$
  with live_subscription as (
    select s.plan_id, s.stripe_subscription_id
    from kardo_billing.subscriptions s
    join kardo_core.plans p on p.id = s.plan_id
    where s.workspace_id = p_workspace_id
      and s.status in ('trialing', 'active', 'past_due')
    order by
      case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
      s.current_period_end desc nulls last
    limit 1
  ),
  manual as (
    select wp.plan_id
    from kardo_core.workspace_plans wp
    where wp.workspace_id = p_workspace_id
      and (wp.override_until is null or wp.override_until > now())
  ),
  fallback as (
    select p.id as plan_id
    from kardo_core.plans p
    where p.is_default and p.is_active
    limit 1
  )
  select plan_id, 'subscription'::text, stripe_subscription_id from live_subscription
  union all
  select plan_id, 'manual'::text, null::text from manual
    where not exists (select 1 from live_subscription)
  union all
  select plan_id, 'default'::text, null::text from fallback
    where not exists (select 1 from live_subscription)
      and not exists (select 1 from manual)
  limit 1;
$$;
revoke all on function kardo_billing.resolve_effective_plan(uuid) from public;

-- Plan efectivo con sus limites. Miembros del workspace o staff activo.
-- `entitlements` vacio = sin limites.
create or replace function kardo_billing.effective_plan(p_workspace_id uuid)
returns table (
  plan_id uuid,
  plan_code text,
  plan_name text,
  source text,
  stripe_subscription_id text,
  entitlements jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not (kardo_private.is_workspace_member(p_workspace_id) or kardo_private.is_active_staff()) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  return query
  select
    resolved.plan_id,
    plan.code,
    plan.name,
    resolved.source,
    resolved.stripe_subscription_id,
    coalesce(
      (select jsonb_object_agg(entitlement.key, entitlement.value)
       from kardo_core.plan_entitlements entitlement
       where entitlement.plan_id = resolved.plan_id),
      '{}'::jsonb
    )
  from kardo_billing.resolve_effective_plan(p_workspace_id) resolved
  join kardo_core.plans plan on plan.id = resolved.plan_id;
end;
$$;
revoke all on function kardo_billing.effective_plan(uuid) from public;
grant execute on function kardo_billing.effective_plan(uuid) to kardo_customer_api, kardo_staff_api;

-- Consumo actual contra cada limite. Las claves coinciden con las de
-- plan_entitlements (`<recurso>.max`, `assets.storage_mb`, `ai.generations_month`).
create or replace function kardo_billing.workspace_usage(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usage jsonb;
begin
  if not (kardo_private.is_workspace_member(p_workspace_id) or kardo_private.is_active_staff()) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'touchpoints.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = p_workspace_id and t.kind <> 'link'
        and t.status in ('assigned', 'active', 'paused')
    ),
    'links.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = p_workspace_id and t.kind = 'link'
        and t.status in ('assigned', 'active', 'paused')
    ),
    'members.max', (
      (select count(*) from kardo_core.workspace_memberships m where m.workspace_id = p_workspace_id)
      + (select count(*) from kardo_core.workspace_invitations i
         where i.workspace_id = p_workspace_id and i.status = 'pending' and i.expires_at > now())
    ),
    'qr_designs.max', (
      select count(*) from kardo_core.qr_design_templates q where q.workspace_id = p_workspace_id
    ),
    'assets.storage_mb', (
      select coalesce(ceil(sum(a.byte_size) / 1048576.0), 0)::bigint
      from kardo_core.assets a
      where a.workspace_id = p_workspace_id and a.deleted_at is null
        and a.status not in ('rejected', 'deleted')
    ),
    'ai.generations_month', (
      select coalesce(sum(u.generations), 0)
      from kardo_core.custom_html_ai_usage u
      where u.workspace_id = p_workspace_id
        and u.usage_day >= date_trunc('month', (now() at time zone 'utc'))::date
    )
  ) into v_usage;

  return v_usage;
end;
$$;
revoke all on function kardo_billing.workspace_usage(uuid) from public;
grant execute on function kardo_billing.workspace_usage(uuid) to kardo_customer_api, kardo_staff_api;

-- Prueba gratuita disponible: el workspace nunca la uso y quien la pide
-- tampoco la uso en otro workspace.
create or replace function kardo_billing.trial_available(p_workspace_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
begin
  if v_subject is null or not kardo_private.is_workspace_member(p_workspace_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  return not exists (
    select 1 from kardo_billing.customers c
    where (c.workspace_id = p_workspace_id and c.trial_consumed_at is not null)
       or c.trial_consumed_by = v_subject
  ) and not exists (
    select 1 from kardo_billing.subscriptions s
    where s.workspace_id = p_workspace_id and s.trial_start is not null
  );
end;
$$;
revoke all on function kardo_billing.trial_available(uuid) from public;
grant execute on function kardo_billing.trial_available(uuid) to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- 6. Permisos de staff
-- ---------------------------------------------------------------------------

insert into kardo_staff.permissions (role_id, permission)
select role.id, catalog.permission
from kardo_staff.roles role
join (
  values
    ('platform-admin', 'billing.read'),
    ('platform-admin', 'billing.write'),
    ('platform-admin', 'billing.refund'),
    ('commercial', 'billing.read'),
    ('commercial', 'billing.write'),
    ('operations', 'billing.read'),
    ('support', 'billing.read')
) as catalog(role_code, permission) on catalog.role_code = role.code
on conflict do nothing;
