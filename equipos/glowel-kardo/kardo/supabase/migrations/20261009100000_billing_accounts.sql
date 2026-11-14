-- Cobro por persona (ADR 024; relevo 38; el dueño aprobó el prototipo el
-- 2026-10-08). El plan es de la persona Owner y cubre sus organizaciones:
-- Esencial 1, Profesional 3, Negocio 5, Corporativo a la medida. Los
-- límites son una sola bolsa para todas ellas, con extras (organización,
-- 10 QR y etiquetas, 5 links) como renglones de la misma suscripción. La
-- bajada B (ADR 023) ahora también elige qué organizaciones siguen, y
-- transferir una organización la mueve al plan de quien la recibe.
--
-- Las funciones que usan el API, la tarea horaria y Operations conservan su
-- firma (resolve_effective_plan, effective_plan, workspace_usage,
-- resolve_workspace_access, refresh_plan_overage…): ahora miran la cuenta de
-- la organización.

-- ---------------------------------------------------------------------------
-- 1. La cuenta de cobro: una por persona
-- ---------------------------------------------------------------------------

create table if not exists kardo_billing.accounts (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references kardo_core.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table kardo_billing.accounts enable row level security;
revoke all on kardo_billing.accounts from public, anon, authenticated;
grant select on kardo_billing.accounts to kardo_customer_api, kardo_staff_api;
grant select, insert on kardo_billing.accounts to kardo_billing_sync;

drop policy if exists "customer api own account" on kardo_billing.accounts;
create policy "customer api own account" on kardo_billing.accounts
  for select to kardo_customer_api
  using (profile_id = kardo_private.current_customer_subject());
drop policy if exists "staff api billing read" on kardo_billing.accounts;
create policy "staff api billing read" on kardo_billing.accounts
  for select to kardo_staff_api
  using (kardo_private.staff_has_permission('billing.read'));
drop policy if exists "billing sync accounts" on kardo_billing.accounts;
create policy "billing sync accounts" on kardo_billing.accounts
  for all to kardo_billing_sync using (true) with check (true);

-- Interna: la cuenta de una persona (la crea la primera vez).
create or replace function kardo_billing.ensure_account(p_profile uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  if p_profile is null then
    return null;
  end if;
  select a.id into v_account from kardo_billing.accounts a where a.profile_id = p_profile;
  if found then
    return v_account;
  end if;
  insert into kardo_billing.accounts (profile_id) values (p_profile)
  on conflict (profile_id) do nothing
  returning id into v_account;
  if v_account is null then
    select a.id into v_account from kardo_billing.accounts a where a.profile_id = p_profile;
  end if;
  return v_account;
end;
$$;
revoke all on function kardo_billing.ensure_account(uuid) from public;

-- La persona que llama es la dueña de esa cuenta (políticas y API).
create or replace function kardo_billing.is_account_holder(p_account uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_account is not null and exists (
    select 1 from kardo_billing.accounts a
    where a.id = p_account
      and a.profile_id = kardo_private.current_customer_subject()
  );
$$;
revoke all on function kardo_billing.is_account_holder(uuid) from public;
grant execute on function kardo_billing.is_account_holder(uuid) to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- 2. Cada organización está en la cuenta de su Owner
-- ---------------------------------------------------------------------------

alter table kardo_core.workspaces
  add column if not exists billing_account_id uuid
    references kardo_billing.accounts(id) on delete set null;
-- Fuera del plan después de una bajada (sus páginas en pausa, el panel en
-- solo lectura; nada se borra).
alter table kardo_core.workspaces
  add column if not exists plan_excluded_at timestamptz;
create index if not exists workspaces_billing_account_idx
  on kardo_core.workspaces (billing_account_id) where billing_account_id is not null;
grant select (billing_account_id, plan_excluded_at)
  on kardo_core.workspaces to kardo_customer_api, kardo_billing_sync, kardo_staff_api;

-- Interna: la cuenta que cubre una organización.
create or replace function kardo_billing.account_of(p_workspace_id uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.billing_account_id from kardo_core.workspaces w where w.id = p_workspace_id;
$$;
revoke all on function kardo_billing.account_of(uuid) from public;

-- Al nacer (alta, «Crear organización») la organización entra a la cuenta
-- de su primer Owner. Transferirla la mueve con move_workspace_to_owner.
create or replace function kardo_billing.assign_workspace_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role = 'owner' then
    update kardo_core.workspaces
    set billing_account_id = kardo_billing.ensure_account(new.profile_id)
    where id = new.workspace_id and billing_account_id is null;
  end if;
  return new;
end;
$$;
revoke all on function kardo_billing.assign_workspace_account() from public;
drop trigger if exists workspace_memberships_assign_account on kardo_core.workspace_memberships;
create trigger workspace_memberships_assign_account
  after insert or update of role on kardo_core.workspace_memberships
  for each row execute function kardo_billing.assign_workspace_account();

-- Las organizaciones que ya existen: la cuenta de su Owner más antiguo.
update kardo_core.workspaces w
set billing_account_id = kardo_billing.ensure_account(owner.profile_id)
from (
  select distinct on (m.workspace_id) m.workspace_id, m.profile_id
  from kardo_core.workspace_memberships m
  where m.role = 'owner'
  order by m.workspace_id, m.created_at
) owner
where owner.workspace_id = w.id and w.billing_account_id is null;

-- La organización de referencia de una cuenta (avisos y auditoría): la
-- más antigua que sigue viva.
create or replace function kardo_billing.account_home(p_account uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id from kardo_core.workspaces w
  where w.billing_account_id = p_account
  order by (w.deleted_at is null) desc, (w.kind = 'organization') desc, w.created_at
  limit 1;
$$;
revoke all on function kardo_billing.account_home(uuid) from public;

-- ---------------------------------------------------------------------------
-- 3. Extras: renglones de la suscripción con cantidad
-- ---------------------------------------------------------------------------

create table if not exists kardo_billing.extras (
  code text primary key check (code ~ '^[a-z_]{2,32}$'),
  name text not null check (char_length(name) between 1 and 80),
  entitlement_key text not null check (char_length(entitlement_key) between 1 and 64),
  units_per_quantity integer not null check (units_per_quantity > 0),
  sort_order integer not null default 0
);
alter table kardo_billing.extras enable row level security;
revoke all on kardo_billing.extras from public, anon, authenticated;
grant select on kardo_billing.extras to kardo_customer_api, kardo_staff_api, kardo_billing_sync;
drop policy if exists "everyone reads extras" on kardo_billing.extras;
create policy "everyone reads extras" on kardo_billing.extras
  for select to kardo_customer_api, kardo_staff_api, kardo_billing_sync using (true);

insert into kardo_billing.extras (code, name, entitlement_key, units_per_quantity, sort_order) values
  ('organization', 'Organización extra', 'organizations.max', 1, 1),
  ('touchpoints', '10 QR y etiquetas más', 'touchpoints.max', 10, 2),
  ('links', '5 links más', 'links.max', 5, 3)
on conflict (code) do update set
  name = excluded.name,
  entitlement_key = excluded.entitlement_key,
  units_per_quantity = excluded.units_per_quantity,
  sort_order = excluded.sort_order;

alter table kardo_billing.prices
  add column if not exists extra_code text references kardo_billing.extras(code);
do $$ begin
  alter table kardo_billing.prices
    add constraint prices_plan_or_extra check (plan_id is null or extra_code is null);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Stripe por cuenta: Customer, suscripción, renglones y facturas
-- ---------------------------------------------------------------------------

-- `workspace_id` queda como la organización desde la que pagó (avisos y
-- auditoría). La llave pasa al Customer de Stripe: una organización puede
-- haber tenido el Customer de otra cuenta antes de transferirse.
alter table kardo_billing.customers drop constraint if exists customers_pkey;
do $$ begin
  alter table kardo_billing.customers add constraint customers_pkey primary key (stripe_customer_id);
exception when invalid_table_definition or duplicate_object then null;
end $$;
alter table kardo_billing.customers
  add column if not exists account_id uuid references kardo_billing.accounts(id) on delete restrict;

-- Una cuenta, un Customer por modo. Si una persona pagaba varias
-- organizaciones (solo datos de prueba), se queda el Customer con la
-- suscripción viva más reciente; los demás quedan como historia.
with ranked as (
  select c.stripe_customer_id, w.billing_account_id as account_id,
    row_number() over (
      partition by w.billing_account_id, c.livemode
      order by
        exists (
          select 1 from kardo_billing.subscriptions s
          where s.stripe_customer_id = c.stripe_customer_id
            and s.status in ('trialing', 'active', 'past_due')
        ) desc,
        (select max(s.current_period_end) from kardo_billing.subscriptions s
         where s.stripe_customer_id = c.stripe_customer_id) desc nulls last,
        c.created_at desc
    ) as position
  from kardo_billing.customers c
  join kardo_core.workspaces w on w.id = c.workspace_id
  where w.billing_account_id is not null and c.account_id is null
)
update kardo_billing.customers c
set account_id = ranked.account_id
from ranked
where ranked.stripe_customer_id = c.stripe_customer_id and ranked.position = 1;
create unique index if not exists customers_account_mode_unique
  on kardo_billing.customers (account_id, livemode) where account_id is not null;

alter table kardo_billing.subscriptions
  add column if not exists account_id uuid references kardo_billing.accounts(id) on delete restrict;
update kardo_billing.subscriptions s
set account_id = c.account_id
from kardo_billing.customers c
where c.stripe_customer_id = s.stripe_customer_id and s.account_id is null and c.account_id is not null;
create index if not exists subscriptions_account_status_idx
  on kardo_billing.subscriptions (account_id, status) where account_id is not null;

alter table kardo_billing.invoices
  add column if not exists account_id uuid references kardo_billing.accounts(id) on delete restrict;
update kardo_billing.invoices i
set account_id = c.account_id
from kardo_billing.customers c
where c.stripe_customer_id = i.stripe_customer_id and i.account_id is null and c.account_id is not null;
create index if not exists invoices_account_idx
  on kardo_billing.invoices (account_id, stripe_created_at desc) where account_id is not null;

-- Lo que llegue sin cuenta (el código anterior a esta ronda) la toma de su
-- organización o de su Customer, para que nada quede fuera del plan.
create or replace function kardo_billing.fill_billing_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_id is null then
    if tg_table_name = 'customers' then
      new.account_id := kardo_billing.account_of(new.workspace_id);
      if new.account_id is not null and exists (
        select 1 from kardo_billing.customers c
        where c.account_id = new.account_id and c.livemode = new.livemode
          and c.stripe_customer_id <> new.stripe_customer_id
      ) then
        new.account_id := null;
      end if;
    else
      select c.account_id into new.account_id
      from kardo_billing.customers c where c.stripe_customer_id = new.stripe_customer_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function kardo_billing.fill_billing_account() from public;
drop trigger if exists customers_fill_account on kardo_billing.customers;
create trigger customers_fill_account before insert on kardo_billing.customers
  for each row execute function kardo_billing.fill_billing_account();
drop trigger if exists subscriptions_fill_account on kardo_billing.subscriptions;
create trigger subscriptions_fill_account before insert or update on kardo_billing.subscriptions
  for each row execute function kardo_billing.fill_billing_account();
drop trigger if exists invoices_fill_account on kardo_billing.invoices;
create trigger invoices_fill_account before insert or update on kardo_billing.invoices
  for each row execute function kardo_billing.fill_billing_account();

-- Cada renglón de la suscripción: el del plan y uno por extra, con su
-- cantidad. Lo escribe el webhook.
create table if not exists kardo_billing.subscription_items (
  stripe_subscription_item_id text primary key
    check (stripe_subscription_item_id ~ '^si_[A-Za-z0-9]{6,64}$'),
  stripe_subscription_id text not null
    references kardo_billing.subscriptions(stripe_subscription_id) on delete cascade,
  stripe_price_id text not null check (char_length(stripe_price_id) between 3 and 255),
  plan_id uuid references kardo_core.plans(id) on delete restrict,
  extra_code text references kardo_billing.extras(code),
  quantity integer not null check (quantity >= 0),
  unit_amount bigint check (unit_amount is null or unit_amount >= 0),
  synced_at timestamptz not null default now(),
  check (plan_id is null or extra_code is null)
);
create index if not exists subscription_items_subscription_idx
  on kardo_billing.subscription_items (stripe_subscription_id);
alter table kardo_billing.subscription_items enable row level security;
revoke all on kardo_billing.subscription_items from public, anon, authenticated;
grant select on kardo_billing.subscription_items to kardo_customer_api, kardo_staff_api;
grant select, insert, update, delete on kardo_billing.subscription_items to kardo_billing_sync;
drop policy if exists "customer api own items" on kardo_billing.subscription_items;
create policy "customer api own items" on kardo_billing.subscription_items
  for select to kardo_customer_api
  using (exists (
    select 1 from kardo_billing.subscriptions s
    where s.stripe_subscription_id = subscription_items.stripe_subscription_id
      and kardo_billing.is_account_holder(s.account_id)
  ));
drop policy if exists "staff api billing read" on kardo_billing.subscription_items;
create policy "staff api billing read" on kardo_billing.subscription_items
  for select to kardo_staff_api
  using (kardo_private.staff_has_permission('billing.read'));
drop policy if exists "billing sync items" on kardo_billing.subscription_items;
create policy "billing sync items" on kardo_billing.subscription_items
  for all to kardo_billing_sync using (true) with check (true);

-- Lo de cobro de una cuenta lo ve su dueña. Lo anterior a la cuenta (sin
-- `account_id`) sigue con la regla de antes: Owner y Admin de esa
-- organización.
drop policy if exists "customer api billing customers read" on kardo_billing.customers;
create policy "customer api billing customers read" on kardo_billing.customers
  for select to kardo_customer_api
  using (
    case when account_id is not null
      then kardo_billing.is_account_holder(account_id)
      else kardo_private.workspace_role(workspace_id) in ('owner', 'admin')
    end
  );
drop policy if exists "customer api billing customers create" on kardo_billing.customers;
create policy "customer api billing customers create" on kardo_billing.customers
  for insert to kardo_customer_api
  with check (
    kardo_billing.is_account_holder(account_id)
    and kardo_private.is_workspace_member(workspace_id)
  );
grant insert (account_id) on kardo_billing.customers to kardo_customer_api;
drop policy if exists "customer api billing subscriptions read" on kardo_billing.subscriptions;
create policy "customer api billing subscriptions read" on kardo_billing.subscriptions
  for select to kardo_customer_api
  using (
    case when account_id is not null
      then kardo_billing.is_account_holder(account_id)
      else kardo_private.workspace_role(workspace_id) in ('owner', 'admin')
    end
  );
drop policy if exists "customer api billing invoices read" on kardo_billing.invoices;
create policy "customer api billing invoices read" on kardo_billing.invoices
  for select to kardo_customer_api
  using (
    case when account_id is not null
      then kardo_billing.is_account_holder(account_id)
      else kardo_private.workspace_role(workspace_id) in ('owner', 'admin')
    end
  );

-- ---------------------------------------------------------------------------
-- 5. Plan manual de staff (Corporativo, cortesías), ahora por cuenta
-- ---------------------------------------------------------------------------

create table if not exists kardo_billing.account_plans (
  account_id uuid primary key references kardo_billing.accounts(id) on delete cascade,
  plan_id uuid not null references kardo_core.plans(id) on delete restrict,
  -- Corporativo «a la medida»: cuántas organizaciones (null = las del plan).
  organizations_max integer check (organizations_max is null or organizations_max between 0 and 1000),
  override_until timestamptz,
  assigned_by uuid references kardo_core.profiles(id) on delete set null,
  assigned_at timestamptz not null default now()
);
alter table kardo_billing.account_plans enable row level security;
revoke all on kardo_billing.account_plans from public, anon, authenticated;
grant select on kardo_billing.account_plans to kardo_customer_api, kardo_billing_sync;
grant select, insert, update, delete on kardo_billing.account_plans to kardo_staff_api;
drop policy if exists "customer api own account plan" on kardo_billing.account_plans;
create policy "customer api own account plan" on kardo_billing.account_plans
  for select to kardo_customer_api
  using (kardo_billing.is_account_holder(account_id));
drop policy if exists "staff api account plans" on kardo_billing.account_plans;
create policy "staff api account plans" on kardo_billing.account_plans
  for all to kardo_staff_api
  using (kardo_private.staff_has_permission('billing.read'))
  with check (kardo_private.staff_has_permission('commercial.catalog.write')
    or kardo_private.staff_has_permission('billing.write'));
drop policy if exists "billing sync account plans" on kardo_billing.account_plans;
create policy "billing sync account plans" on kardo_billing.account_plans
  for select to kardo_billing_sync using (true);

-- Las cortesías de antes pasan a la cuenta del Owner (la vigente, o la
-- más reciente). `workspace_plans` queda solo para organizaciones internas.
insert into kardo_billing.account_plans (account_id, plan_id, override_until, assigned_by, assigned_at)
select distinct on (w.billing_account_id)
  w.billing_account_id, wp.plan_id, wp.override_until, wp.assigned_by, wp.assigned_at
from kardo_core.workspace_plans wp
join kardo_core.workspaces w on w.id = wp.workspace_id
where w.billing_account_id is not null
  and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)
order by w.billing_account_id,
  (wp.override_until is null or wp.override_until > now()) desc,
  wp.assigned_at desc
on conflict (account_id) do nothing;

-- ---------------------------------------------------------------------------
-- 6. Organizaciones por plan
-- ---------------------------------------------------------------------------

insert into kardo_core.plan_entitlements (plan_id, key, value)
select p.id, 'organizations.max', to_jsonb(v.amount)
from kardo_core.plans p
join (values ('esencial', 1), ('profesional', 3), ('negocio', 5), ('corporativo', 10))
  as v(code, amount) on v.code = p.code
on conflict (plan_id, key) do update set value = excluded.value;

-- ---------------------------------------------------------------------------
-- 7. Plan efectivo, límites y uso de la cuenta
-- ---------------------------------------------------------------------------

create or replace function kardo_billing.is_internal_workspace(p_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from kardo_billing.internal_workspaces i where i.workspace_id = p_workspace_id
  );
$$;
revoke all on function kardo_billing.is_internal_workspace(uuid) from public;

-- El plan de una cuenta: suscripción viva > plan manual > prueba de la
-- persona > plan por defecto (el orden del ADR 019 §8).
create or replace function kardo_billing.resolve_account_plan(p_account uuid)
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
    where p_account is not null and s.account_id = p_account
      and s.status in ('trialing', 'active', 'past_due')
    order by
      case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
      s.current_period_end desc nulls last
    limit 1
  ),
  manual as (
    select ap.plan_id
    from kardo_billing.account_plans ap
    where p_account is not null and ap.account_id = p_account
      and (ap.override_until is null or ap.override_until > now())
  ),
  trial as (
    select t.plan_id
    from kardo_billing.trials t
    join kardo_billing.accounts a on a.profile_id = t.profile_id
    where p_account is not null and a.id = p_account
      and t.converted_at is null
      and t.ends_at > now()
    order by t.ends_at desc
    limit 1
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
  select plan_id, 'trial'::text, null::text from trial
    where not exists (select 1 from live_subscription)
      and not exists (select 1 from manual)
  union all
  select plan_id, 'default'::text, null::text from fallback
    where not exists (select 1 from live_subscription)
      and not exists (select 1 from manual)
      and not exists (select 1 from trial)
  limit 1;
$$;
revoke all on function kardo_billing.resolve_account_plan(uuid) from public;

-- El plan de una organización es el de su cuenta. Una organización interna
-- (demo del equipo) va aparte: su plan manual propio o el de por defecto.
create or replace function kardo_billing.resolve_effective_plan(p_workspace_id uuid)
returns table (plan_id uuid, source text, stripe_subscription_id text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if kardo_billing.is_internal_workspace(p_workspace_id) then
    return query
    select wp.plan_id, 'manual'::text, null::text
    from kardo_core.workspace_plans wp
    where wp.workspace_id = p_workspace_id
      and (wp.override_until is null or wp.override_until > now())
    union all
    select p.id, 'default'::text, null::text
    from kardo_core.plans p
    where p.is_default and p.is_active
      and not exists (
        select 1 from kardo_core.workspace_plans wp
        where wp.workspace_id = p_workspace_id
          and (wp.override_until is null or wp.override_until > now())
      )
    limit 1;
    return;
  end if;
  return query
  select * from kardo_billing.resolve_account_plan(kardo_billing.account_of(p_workspace_id));
end;
$$;
revoke all on function kardo_billing.resolve_effective_plan(uuid) from public;

-- Los extras vivos de una cuenta, por código: {"organization": 1, …}.
create or replace function kardo_billing.account_extras(p_account uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(x.extra_code, x.quantity), '{}'::jsonb)
  from (
    select i.extra_code, sum(i.quantity)::integer as quantity
    from kardo_billing.subscription_items i
    join kardo_billing.subscriptions s on s.stripe_subscription_id = i.stripe_subscription_id
    where p_account is not null and s.account_id = p_account
      and s.status in ('trialing', 'active', 'past_due')
      and i.extra_code is not null and i.quantity > 0
    group by i.extra_code
  ) x;
$$;
revoke all on function kardo_billing.account_extras(uuid) from public;

-- Lo que incluye el plan de una organización, con los extras de su cuenta
-- sumados (un límite sin tope sigue sin tope) y, en un plan manual, las
-- organizaciones a la medida.
create or replace function kardo_billing.workspace_entitlements(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
  v_source text;
  v_account uuid;
  v_result jsonb;
  v_extra record;
  v_orgs integer;
begin
  select r.plan_id, r.source into v_plan, v_source
  from kardo_billing.resolve_effective_plan(p_workspace_id) r;
  if v_plan is null then
    return '{}'::jsonb;
  end if;
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_result
  from kardo_core.plan_entitlements e where e.plan_id = v_plan;

  if kardo_billing.is_internal_workspace(p_workspace_id) then
    return v_result;
  end if;
  v_account := kardo_billing.account_of(p_workspace_id);
  if v_account is null then
    return v_result;
  end if;

  if v_source = 'manual' then
    select ap.organizations_max into v_orgs
    from kardo_billing.account_plans ap where ap.account_id = v_account;
    if v_orgs is not null then
      v_result := v_result || jsonb_build_object('organizations.max', v_orgs);
    end if;
  end if;

  for v_extra in
    select x.entitlement_key, x.units_per_quantity, (q.value)::integer as quantity
    from jsonb_each_text(kardo_billing.account_extras(v_account)) q
    join kardo_billing.extras x on x.code = q.key
  loop
    if jsonb_typeof(v_result -> v_extra.entitlement_key) = 'number' then
      v_result := jsonb_set(
        v_result,
        array[v_extra.entitlement_key],
        to_jsonb((v_result ->> v_extra.entitlement_key)::bigint
          + v_extra.units_per_quantity::bigint * v_extra.quantity)
      );
    end if;
  end loop;
  return v_result;
end;
$$;
revoke all on function kardo_billing.workspace_entitlements(uuid) from public;

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
    kardo_billing.workspace_entitlements(p_workspace_id)
  from kardo_billing.resolve_effective_plan(p_workspace_id) resolved
  join kardo_core.plans plan on plan.id = resolved.plan_id;
end;
$$;

-- Las organizaciones cuyo uso suma en la bolsa de una cuenta: vivas, no
-- internas y dentro del plan.
create or replace function kardo_billing.account_workspaces(p_account uuid)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select w.id from kardo_core.workspaces w
  where p_account is not null and w.billing_account_id = p_account
    and w.deleted_at is null
    and w.plan_excluded_at is null
    and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id);
$$;
revoke all on function kardo_billing.account_workspaces(uuid) from public;

-- Interna: el uso de un conjunto de organizaciones (lo que antes contaba
-- workspace_usage para una sola).
create or replace function kardo_billing.usage_of(p_workspace_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organizations.max', (
      select count(*) from kardo_core.workspaces w
      where w.id = any(p_workspace_ids) and w.kind = 'organization'
    ),
    'touchpoints.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = any(p_workspace_ids) and t.kind <> 'link'
        and t.status in ('assigned', 'active', 'paused')
        and t.plan_excluded_at is null
    ),
    'links.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = any(p_workspace_ids) and t.kind = 'link'
        and t.status in ('assigned', 'active', 'paused')
        and t.plan_excluded_at is null
    ),
    'members.max', (
      (select count(*) from kardo_core.workspace_memberships m where m.workspace_id = any(p_workspace_ids))
      + (select count(*) from kardo_core.workspace_invitations i
         where i.workspace_id = any(p_workspace_ids) and i.status = 'pending' and i.expires_at > now())
    ),
    'qr_designs.max', (
      select count(*) from kardo_core.qr_design_templates q where q.workspace_id = any(p_workspace_ids)
    ),
    'assets.storage_mb', (
      select coalesce(ceil(sum(a.byte_size) / 1048576.0), 0)::bigint
      from kardo_core.assets a
      where a.workspace_id = any(p_workspace_ids) and a.deleted_at is null
        and a.status not in ('rejected', 'deleted')
    ),
    'ai.generations_month', (
      select coalesce(sum(u.generations), 0)
      from kardo_core.custom_html_ai_usage u
      where u.workspace_id = any(p_workspace_ids)
        and u.usage_day >= date_trunc('month', (now() at time zone 'utc'))::date
    ),
    'ai.spend_cents_month', (
      select coalesce(ceil(sum(
        case
          when e.metadata ->> 'costMicroUsd' ~ '^[0-9]{1,15}$'
            then (e.metadata ->> 'costMicroUsd')::bigint
          else 0
        end
      ) / 10000.0), 0)::bigint
      from kardo_audit.events e
      where e.workspace_id = any(p_workspace_ids)
        and e.action in ('experience.custom_html_generated', 'experience.design_generated')
        and e.occurred_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    )
  );
$$;
revoke all on function kardo_billing.usage_of(uuid[]) from public;

-- El uso que cuenta para los límites de una organización: el de toda su
-- cuenta (una sola bolsa). Una organización interna, o fuera del plan,
-- cuenta sola.
create or replace function kardo_billing.workspace_usage(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account uuid;
begin
  if not (kardo_private.is_workspace_member(p_workspace_id) or kardo_private.is_active_staff()) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_account := kardo_billing.account_of(p_workspace_id);
  if v_account is null
    or kardo_billing.is_internal_workspace(p_workspace_id)
    or not exists (select 1 from kardo_billing.account_workspaces(v_account) x where x = p_workspace_id) then
    return kardo_billing.usage_of(array[p_workspace_id]);
  end if;
  return kardo_billing.usage_of(array(select kardo_billing.account_workspaces(v_account)));
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Acceso: el de la cuenta, más el de la organización fuera del plan
-- ---------------------------------------------------------------------------

create or replace function kardo_billing.resolve_workspace_access(p_workspace_id uuid)
returns table (
  state text,
  source text,
  plan_code text,
  plan_name text,
  ends_at timestamptz,
  lapsed_at timestamptz,
  grace_ends_at timestamptz,
  delete_at timestamptz,
  offer_until timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_created timestamptz;
  v_deleted timestamptz;
  v_excluded timestamptz;
  v_account uuid;
  v_profile uuid;
  v_code text;
  v_name text;
  v_ends timestamptz;
  v_trial_end timestamptz;
  v_trial_plan uuid;
  v_sub_end timestamptz;
  v_sub_plan uuid;
  v_manual_end timestamptz;
  v_manual_plan uuid;
  v_lapsed timestamptz;
  v_source text;
  v_plan uuid;
  v_offer timestamptz;
begin
  select w.created_at, w.deleted_at, w.plan_excluded_at, w.billing_account_id
    into v_created, v_deleted, v_excluded, v_account
  from kardo_core.workspaces w where w.id = p_workspace_id;
  if not found then
    return;
  end if;

  -- 0. Borrada: solo queda lo que la ley conserva.
  if v_deleted is not null then
    return query select 'deleted'::text, 'none'::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, v_deleted, null::timestamptz;
    return;
  end if;

  -- 1. Cuenta interna (demo del equipo): nunca se limita.
  if kardo_billing.is_internal_workspace(p_workspace_id) then
    return query select 'internal'::text, 'internal'::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  select a.profile_id into v_profile from kardo_billing.accounts a where a.id = v_account;

  -- 2. Suscripción viva de la cuenta.
  select p.code, p.name into v_code, v_name
  from kardo_billing.subscriptions s
  left join kardo_core.plans p on p.id = s.plan_id
  where v_account is not null and s.account_id = v_account
    and s.status in ('trialing', 'active', 'past_due')
  order by
    case s.status when 'active' then 0 when 'trialing' then 1 else 2 end,
    s.current_period_end desc nulls last
  limit 1;
  if found then
    v_source := 'subscription';
  end if;

  -- 3. Plan manual de staff vigente.
  if v_source is null then
    select p.code, p.name, ap.override_until into v_code, v_name, v_ends
    from kardo_billing.account_plans ap
    join kardo_core.plans p on p.id = ap.plan_id
    where v_account is not null and ap.account_id = v_account
      and (ap.override_until is null or ap.override_until > now());
    if found then
      v_source := 'manual';
    end if;
  end if;

  -- 4. Prueba de la persona vigente.
  if v_source is null then
    select p.code, p.name, t.ends_at into v_code, v_name, v_ends
    from kardo_billing.trials t
    join kardo_core.plans p on p.id = t.plan_id
    where v_profile is not null and t.profile_id = v_profile
      and t.converted_at is null
      and t.ends_at > now()
    order by t.ends_at desc
    limit 1;
    if found then
      v_source := 'trial';
    end if;
  end if;

  if v_source is not null then
    -- La cuenta está al corriente, pero esta organización quedó fuera del
    -- plan en una bajada: sus páginas en pausa, nada se borra.
    if v_excluded is not null then
      return query select 'paused'::text, 'excluded'::text, v_code, v_name,
        null::timestamptz, v_excluded, null::timestamptz, null::timestamptz, null::timestamptz;
      return;
    end if;
    return query select
      case when v_source = 'trial' then 'trial' else 'active' end,
      v_source, v_code, v_name,
      case when v_source = 'subscription' then null::timestamptz else v_ends end,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
    return;
  end if;

  -- 5. Terminó algo de la cuenta: el fin más reciente manda.
  select t.ends_at, t.plan_id into v_trial_end, v_trial_plan
  from kardo_billing.trials t
  where v_profile is not null and t.profile_id = v_profile and t.converted_at is null
  order by t.ends_at desc
  limit 1;

  select coalesce(s.ended_at, s.canceled_at, s.current_period_end, s.stripe_created_at), s.plan_id
    into v_sub_end, v_sub_plan
  from kardo_billing.subscriptions s
  where v_account is not null and s.account_id = v_account
    and s.status in ('canceled', 'unpaid', 'paused')
  order by coalesce(s.ended_at, s.canceled_at, s.current_period_end, s.stripe_created_at) desc
  limit 1;

  select ap.override_until, ap.plan_id into v_manual_end, v_manual_plan
  from kardo_billing.account_plans ap
  where v_account is not null and ap.account_id = v_account and ap.override_until <= now();

  v_lapsed := greatest(v_trial_end, v_sub_end, v_manual_end);
  if v_lapsed is not null then
    if v_lapsed = v_sub_end then
      v_source := 'subscription';
      v_plan := v_sub_plan;
    elsif v_lapsed = v_manual_end then
      v_source := 'manual';
      v_plan := v_manual_plan;
    else
      v_source := 'trial';
      v_plan := v_trial_plan;
    end if;
    select p.code, p.name into v_code, v_name from kardo_core.plans p where p.id = v_plan;

    -- Cupón de conversión (ADR 020 §1): 7 días después del fin de la
    -- prueba, solo si la cuenta nunca tuvo una suscripción.
    if v_trial_end is not null
      and v_trial_end > now() - interval '7 days'
      and not exists (
        select 1 from kardo_billing.subscriptions s
        where s.account_id = v_account
          and s.status not in ('incomplete', 'incomplete_expired')
      ) then
      v_offer := v_trial_end + interval '7 days';
    end if;

    return query select
      case when now() < v_lapsed + interval '7 days' then 'limited' else 'paused' end,
      v_source, v_code, v_name, null::timestamptz,
      v_lapsed, v_lapsed + interval '7 days', v_lapsed + interval '90 days', v_offer;
    return;
  end if;

  -- 6. Nunca tuvo prueba ni plan.
  if v_created < coalesce(
    (select ap.legacy_before from kardo_billing.access_policy ap where ap.singleton),
    'infinity'::timestamptz
  ) then
    return query select 'legacy'::text, 'legacy'::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
  else
    return query select 'limited'::text, 'none'::text, null::text, null::text,
      null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz, null::timestamptz;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 9. La prueba de la persona cubre su cuenta
-- ---------------------------------------------------------------------------

create or replace function kardo_billing.trial_available(p_workspace_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_account uuid;
begin
  if v_subject is null or not kardo_private.is_workspace_member(p_workspace_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_account := kardo_billing.account_of(p_workspace_id);

  return not exists (
    select 1 from kardo_billing.customers c
    where (v_account is not null and c.account_id = v_account and c.trial_consumed_at is not null)
       or (c.workspace_id = p_workspace_id and c.trial_consumed_at is not null)
       or c.trial_consumed_by = v_subject
  ) and not exists (
    select 1 from kardo_billing.subscriptions s
    where ((v_account is not null and s.account_id = v_account) or s.workspace_id = p_workspace_id)
      and s.trial_start is not null
  );
end;
$$;

create or replace function kardo_private.start_workspace_trial(
  p_workspace_id uuid,
  p_plan_code text,
  p_default_plan_code text,
  p_interval text,
  p_days integer
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_interval text := case when p_interval = 'year' then 'year' else 'month' end;
  v_account uuid;
  v_email text;
  v_hash text;
  v_plan uuid;
  v_plan_name text;
  v_amount bigint;
  v_currency text;
  v_ends timestamptz;
  v_trial uuid;
  v_workspace_name text;
begin
  if v_subject is null
    or kardo_private.workspace_role(p_workspace_id) is distinct from 'owner' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_days is null or p_days < 1 or p_days > 60 then
    raise exception using errcode = 'P0001', message = 'INVALID_TRIAL_DAYS';
  end if;
  v_account := kardo_billing.account_of(p_workspace_id);

  -- La cuenta ya tiene plan (suscripción o manual): no hace falta prueba.
  if exists (select 1 from kardo_billing.trials t where t.workspace_id = p_workspace_id)
    or exists (
      select 1 from kardo_billing.subscriptions s
      where s.workspace_id = p_workspace_id or (v_account is not null and s.account_id = v_account)
    )
    or exists (select 1 from kardo_core.workspace_plans wp where wp.workspace_id = p_workspace_id)
    or exists (select 1 from kardo_billing.account_plans ap where ap.account_id = v_account) then
    return null;
  end if;

  select lower(u.email) into v_email from auth.users u where u.id = v_subject;
  if v_email is null then
    return null;
  end if;
  v_hash := encode(extensions.digest(v_email, 'sha256'), 'hex');
  if exists (
    select 1 from kardo_billing.trials t
    where t.profile_id = v_subject or t.email_sha256 = v_hash
  ) then
    return null;
  end if;

  select p.id, p.name into v_plan, v_plan_name
  from kardo_core.plans p
  where p.code = p_plan_code and p.is_active and p.is_public
    and exists (select 1 from kardo_billing.prices pr where pr.plan_id = p.id and pr.active);
  if v_plan is null then
    select p.id, p.name into v_plan, v_plan_name
    from kardo_core.plans p
    where p.code = p_default_plan_code and p.is_active;
  end if;
  if v_plan is null then
    return null;
  end if;

  select pr.unit_amount, pr.currency into v_amount, v_currency
  from kardo_billing.prices pr
  where pr.plan_id = v_plan and pr.active and pr.billing_interval = v_interval
  order by pr.livemode desc, pr.unit_amount
  limit 1;

  v_ends := now() + make_interval(days => p_days);
  insert into kardo_billing.trials (
    workspace_id, profile_id, email_sha256, plan_id, billing_interval, ends_at
  ) values (
    p_workspace_id, v_subject, v_hash, v_plan, v_interval, v_ends
  )
  on conflict do nothing
  returning id into v_trial;
  if v_trial is null then
    return null;
  end if;

  select w.name into v_workspace_name from kardo_core.workspaces w where w.id = p_workspace_id;
  insert into kardo_billing.notices (workspace_id, kind, dedupe_key, payload)
  values (
    p_workspace_id, 'trial_started', 'trial_started:' || v_trial::text,
    jsonb_build_object(
      'workspaceName', coalesce(v_workspace_name, 'Tu organización'),
      'planName', v_plan_name,
      'amount', v_amount,
      'currency', coalesce(v_currency, 'mxn'),
      'interval', v_interval,
      'trialEnd', v_ends
    )
  )
  on conflict (dedupe_key) do nothing;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    p_workspace_id, v_subject, 'customer', 'billing.trial_started', 'workspace', p_workspace_id,
    'succeeded', jsonb_build_object('planId', v_plan, 'interval', v_interval, 'days', p_days, 'endsAt', v_ends)
  );
  return v_trial;
end;
$$;

-- Pagar convierte la prueba de la persona (la de su cuenta).
create or replace function kardo_billing.mark_trial_converted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('trialing', 'active', 'past_due') then
    update kardo_billing.trials t
    set converted_at = now()
    where t.converted_at is null
      and (
        t.workspace_id = new.workspace_id
        or t.profile_id = (select a.profile_id from kardo_billing.accounts a where a.id = new.account_id)
      );
  end if;
  return new;
end;
$$;

-- La prueba que cubre una organización (la de la persona de su cuenta),
-- para la franja del panel: cualquier integrante la puede ver.
create or replace function kardo_billing.workspace_trial(p_workspace_id uuid)
returns table (
  id uuid,
  plan_code text,
  plan_name text,
  billing_interval text,
  started_at timestamptz,
  ends_at timestamptz,
  converted_at timestamptz
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
  select t.id, p.code, p.name, t.billing_interval, t.started_at, t.ends_at, t.converted_at
  from kardo_billing.trials t
  join kardo_core.plans p on p.id = t.plan_id
  where t.workspace_id = p_workspace_id
     or t.profile_id = (
       select a.profile_id from kardo_billing.accounts a
       where a.id = kardo_billing.account_of(p_workspace_id)
     )
  order by (t.workspace_id = p_workspace_id) desc, t.ends_at desc
  limit 1;
end;
$$;
revoke all on function kardo_billing.workspace_trial(uuid) from public;
grant execute on function kardo_billing.workspace_trial(uuid) to kardo_customer_api, kardo_staff_api;

-- ---------------------------------------------------------------------------
-- 10. Crear organización: el tope sale del plan de la cuenta
-- ---------------------------------------------------------------------------

-- Cuántas organizaciones admite una cuenta: las del plan más los extras.
-- Null = sin tope. Sin plan, una.
create or replace function kardo_billing.account_organization_limit(p_account uuid)
returns integer
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_plan uuid;
  v_source text;
  v_value jsonb;
  v_manual integer;
  v_extra integer;
begin
  select r.plan_id, r.source into v_plan, v_source
  from kardo_billing.resolve_account_plan(p_account) r;
  if v_plan is null then
    return 1;
  end if;
  select e.value into v_value
  from kardo_core.plan_entitlements e
  where e.plan_id = v_plan and e.key = 'organizations.max';
  if v_source = 'manual' then
    select ap.organizations_max into v_manual
    from kardo_billing.account_plans ap where ap.account_id = p_account;
    if v_manual is not null then
      v_value := to_jsonb(v_manual);
    end if;
  end if;
  if v_value is null or jsonb_typeof(v_value) <> 'number' then
    return null;
  end if;
  v_extra := coalesce((kardo_billing.account_extras(p_account) ->> 'organization')::integer, 0);
  return (v_value #>> '{}')::integer + v_extra;
end;
$$;
revoke all on function kardo_billing.account_organization_limit(uuid) from public;

-- Las organizaciones de una cuenta que ocupan lugar en su plan.
create or replace function kardo_billing.account_organization_count(p_account uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer from kardo_core.workspaces w
  where w.billing_account_id = p_account and w.kind = 'organization'
    and w.deleted_at is null and w.plan_excluded_at is null
    and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id);
$$;
revoke all on function kardo_billing.account_organization_count(uuid) from public;

create or replace function kardo_core.create_organization_workspace(
  p_subject uuid,
  p_name text,
  p_public_id text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_account uuid;
  v_limit integer;
  v_workspace_id uuid;
begin
  if p_subject is null or p_subject is distinct from kardo_private.current_customer_subject() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception using errcode = 'P0001', message = 'INVALID_NAME';
  end if;

  if p_public_id is null or p_public_id !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_PUBLIC_ID';
  end if;

  -- Serializa por persona: dos solicitudes a la vez no pueden pasar las dos
  -- con el mismo conteo.
  perform pg_advisory_xact_lock(hashtextextended(p_subject::text, 0));

  v_account := kardo_billing.ensure_account(p_subject);
  v_limit := kardo_billing.account_organization_limit(v_account);
  if v_limit is not null
    and kardo_billing.account_organization_count(v_account) >= v_limit then
    raise exception using errcode = 'P0001', message = 'ORGANIZATION_LIMIT';
  end if;

  insert into kardo_core.workspaces (id, public_id, kind, name, billing_account_id)
  values (gen_random_uuid(), p_public_id, 'organization', v_name, v_account)
  returning id into v_workspace_id;

  insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
  values (v_workspace_id, p_subject, 'owner');

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result
  ) values (
    v_workspace_id, p_subject, 'customer', 'workspace.created', 'workspace', v_workspace_id, 'succeeded'
  );

  return v_workspace_id;
end;
$$;

-- Lo que el panel muestra de la cuenta que cubre una organización: de
-- quién es, cuántas organizaciones ocupa y admite, sus extras y si quien
-- mira es la dueña.
create or replace function kardo_billing.workspace_account(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_profile uuid;
  v_holder text;
begin
  if not (kardo_private.is_workspace_member(p_workspace_id) or kardo_private.is_active_staff()) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_account := kardo_billing.account_of(p_workspace_id);
  if v_account is null then
    return null;
  end if;
  select a.profile_id into v_profile from kardo_billing.accounts a where a.id = v_account;
  select coalesce(nullif(btrim(p.preferred_name), ''), nullif(btrim(p.display_name), ''), p.email)
    into v_holder
  from kardo_core.profiles p where p.id = v_profile;
  return jsonb_build_object(
    'accountId', v_account,
    'holderName', v_holder,
    'isHolder', v_profile is not null and v_profile = kardo_private.current_customer_subject(),
    'internal', kardo_billing.is_internal_workspace(p_workspace_id),
    'excludedAt', (select w.plan_excluded_at from kardo_core.workspaces w where w.id = p_workspace_id),
    'organizationsUsed', kardo_billing.account_organization_count(v_account),
    'organizationsLimit', kardo_billing.account_organization_limit(v_account),
    'extras', kardo_billing.account_extras(v_account),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'excluded', w.plan_excluded_at is not null,
        'internal', exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)
      ) order by w.created_at)
      from kardo_core.workspaces w
      where w.billing_account_id = v_account and w.kind = 'organization' and w.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function kardo_billing.workspace_account(uuid) from public;
grant execute on function kardo_billing.workspace_account(uuid) to kardo_customer_api, kardo_staff_api;

-- ---------------------------------------------------------------------------
-- 11. Bajada B por cuenta, también para organizaciones
-- ---------------------------------------------------------------------------

-- El plazo pasa a la cuenta. `workspace_id` queda como la organización de
-- referencia de los avisos.
alter table kardo_billing.plan_overages
  add column if not exists account_id uuid references kardo_billing.accounts(id) on delete cascade;
alter table kardo_billing.plan_overages
  add column if not exists organizations_limit integer
    check (organizations_limit is null or organizations_limit >= 0);
alter table kardo_billing.plan_overages
  add column if not exists organizations_over integer not null default 0
    check (organizations_over >= 0);
update kardo_billing.plan_overages o
set account_id = w.billing_account_id
from kardo_core.workspaces w
where w.id = o.workspace_id and o.account_id is null;
-- Una por cuenta: se queda la abierta, o la más reciente.
delete from kardo_billing.plan_overages o
using kardo_billing.plan_overages other
where o.account_id is not null and other.account_id = o.account_id
  and o.workspace_id <> other.workspace_id
  and ((o.resolved_at is not null and other.resolved_at is null)
    or ((o.resolved_at is null) = (other.resolved_at is null) and o.updated_at < other.updated_at));
delete from kardo_billing.plan_overages where account_id is null;
alter table kardo_billing.plan_overages drop constraint if exists plan_overages_pkey;
alter table kardo_billing.plan_overages add constraint plan_overages_pkey primary key (account_id);

drop policy if exists "customer api plan overages" on kardo_billing.plan_overages;
create policy "customer api plan overages" on kardo_billing.plan_overages
  for select to kardo_customer_api
  using (
    kardo_billing.is_account_holder(account_id)
    or exists (
      select 1 from kardo_core.workspaces w
      where w.billing_account_id = plan_overages.account_id
        and kardo_private.is_workspace_member(w.id)
    )
  );

-- Los límites que cuida la bajada, con los extras de la cuenta.
create or replace function kardo_billing.account_overage_limits(p_account uuid)
returns table (
  plan_code text,
  organizations_limit integer,
  touchpoints_limit integer,
  links_limit integer
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_home uuid := kardo_billing.account_home(p_account);
  v_entitlements jsonb;
  v_code text;
begin
  select p.code into v_code
  from kardo_billing.resolve_account_plan(p_account) r
  join kardo_core.plans p on p.id = r.plan_id;
  if v_home is null or v_code is null then
    return;
  end if;
  v_entitlements := kardo_billing.workspace_entitlements(v_home);
  return query select
    v_code,
    kardo_billing.account_organization_limit(p_account),
    case when jsonb_typeof(v_entitlements -> 'touchpoints.max') = 'number'
      then (v_entitlements ->> 'touchpoints.max')::integer end,
    case when jsonb_typeof(v_entitlements -> 'links.max') = 'number'
      then (v_entitlements ->> 'links.max')::integer end;
end;
$$;
revoke all on function kardo_billing.account_overage_limits(uuid) from public;

-- Compatibilidad: los límites de la bajada de una organización (los de su
-- cuenta).
create or replace function kardo_billing.plan_overage_limits(p_workspace_id uuid)
returns table (plan_code text, touchpoints_limit integer, links_limit integer)
language sql
stable
security definer
set search_path = ''
as $$
  select l.plan_code, l.touchpoints_limit, l.links_limit
  from kardo_billing.account_overage_limits(kardo_billing.account_of(p_workspace_id)) l;
$$;
revoke all on function kardo_billing.plan_overage_limits(uuid) from public;

-- La pausa de un Touchpoint también sigue a su organización fuera del plan.
create or replace function kardo_billing.request_touchpoint_pause(p_touchpoint_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into kardo_billing.touchpoint_pause_sync (touchpoint_id, workspace_id, public_id, paused)
  select t.id, t.workspace_id, t.public_id,
    t.plan_excluded_at is not null
    or exists (
      select 1 from kardo_core.workspaces w
      where w.id = t.workspace_id and w.plan_excluded_at is not null
    )
    or exists (
      select 1 from kardo_billing.access_states a
      where a.workspace_id = t.workspace_id and a.pages_paused_at is not null
    )
  from kardo_core.touchpoints t
  where t.id = p_touchpoint_id and t.status <> 'retired'
  on conflict (touchpoint_id) do update set
    paused = excluded.paused,
    requested_at = now(),
    synced_at = null,
    attempts = 0,
    last_error = null;
$$;
revoke all on function kardo_billing.request_touchpoint_pause(uuid) from public;

-- Interna: saca o devuelve una organización al plan, con sus páginas.
create or replace function kardo_billing.set_workspace_excluded(p_workspace_id uuid, p_excluded boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_touchpoint record;
begin
  update kardo_core.workspaces
  set plan_excluded_at = case when p_excluded then coalesce(plan_excluded_at, now()) else null end,
      updated_at = now()
  where id = p_workspace_id
    and (plan_excluded_at is not null) is distinct from p_excluded;
  if not found then
    return;
  end if;
  for v_touchpoint in
    select t.id from kardo_core.touchpoints t
    where t.workspace_id = p_workspace_id and t.status <> 'retired'
  loop
    perform kardo_billing.request_touchpoint_pause(v_touchpoint.id);
  end loop;
end;
$$;
revoke all on function kardo_billing.set_workspace_excluded(uuid, boolean) from public;

-- Revisa una cuenta contra su plan: devuelve lo que vuelve a caber (primero
-- organizaciones, luego QR y etiquetas y links de las que siguen), abre el
-- plazo de 14 días si algo sobra y lo cierra cuando nada queda fuera.
create or replace function kardo_billing.refresh_account_overage(p_account uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_home uuid;
  v_plan text;
  v_org_limit integer;
  v_tp_limit integer;
  v_ln_limit integer;
  v_kind text;
  v_limit integer;
  v_active integer;
  v_free integer;
  v_org_over integer := 0;
  v_tp_over integer := 0;
  v_ln_over integer := 0;
  v_row kardo_billing.plan_overages%rowtype;
  v_reactivated integer := 0;
  v_moved integer;
  v_target record;
  v_spaces uuid[];
begin
  if p_account is null then
    return jsonb_build_object('status', 'none');
  end if;
  perform 1 from kardo_billing.accounts a where a.id = p_account for update;
  v_home := kardo_billing.account_home(p_account);
  if v_home is null then
    return jsonb_build_object('status', 'none');
  end if;
  select l.plan_code, l.organizations_limit, l.touchpoints_limit, l.links_limit
    into v_plan, v_org_limit, v_tp_limit, v_ln_limit
  from kardo_billing.account_overage_limits(p_account) l;
  if v_plan is null then
    return jsonb_build_object('status', 'none');
  end if;

  -- Organizaciones: vuelven primero las que salieron antes.
  v_active := kardo_billing.account_organization_count(p_account);
  v_free := case when v_org_limit is null then 2147483647 else greatest(v_org_limit - v_active, 0) end;
  if v_free > 0 then
    for v_target in
      select w.id from kardo_core.workspaces w
      where w.billing_account_id = p_account and w.kind = 'organization'
        and w.deleted_at is null and w.plan_excluded_at is not null
        and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)
      order by w.plan_excluded_at, w.created_at
      limit least(v_free, 100000)
    loop
      perform kardo_billing.set_workspace_excluded(v_target.id, false);
      v_reactivated := v_reactivated + 1;
    end loop;
  end if;
  v_active := kardo_billing.account_organization_count(p_account);
  if v_org_limit is not null and v_active > v_org_limit then
    v_org_over := v_active - v_org_limit;
  end if;

  -- QR y etiquetas y links de las organizaciones que siguen: una bolsa.
  v_spaces := array(select kardo_billing.account_workspaces(p_account));
  foreach v_kind in array array['touchpoint', 'link'] loop
    v_limit := case v_kind when 'touchpoint' then v_tp_limit else v_ln_limit end;
    select count(*) into v_active from kardo_core.touchpoints t
    where t.workspace_id = any(v_spaces)
      and (t.kind = 'link') = (v_kind = 'link')
      and t.status in ('assigned', 'active', 'paused')
      and t.plan_excluded_at is null;
    v_free := case when v_limit is null then 2147483647 else greatest(v_limit - v_active, 0) end;
    if v_free > 0 then
      for v_target in
        select t.id from kardo_core.touchpoints t
        where t.workspace_id = any(v_spaces)
          and (t.kind = 'link') = (v_kind = 'link')
          and t.status <> 'retired'
          and t.plan_excluded_at is not null
        order by t.plan_excluded_at, t.created_at
        limit least(v_free, 100000)
      loop
        update kardo_core.touchpoints set plan_excluded_at = null, updated_at = now()
        where id = v_target.id;
        perform kardo_billing.request_touchpoint_pause(v_target.id);
        v_reactivated := v_reactivated + 1;
      end loop;
    end if;
    select count(*) into v_active from kardo_core.touchpoints t
    where t.workspace_id = any(v_spaces)
      and (t.kind = 'link') = (v_kind = 'link')
      and t.status in ('assigned', 'active', 'paused')
      and t.plan_excluded_at is null;
    if v_limit is not null and v_active > v_limit then
      if v_kind = 'touchpoint' then v_tp_over := v_active - v_limit;
      else v_ln_over := v_active - v_limit;
      end if;
    end if;
  end loop;

  select * into v_row from kardo_billing.plan_overages o
  where o.account_id = p_account
  for update;

  if v_org_over > 0 or v_tp_over > 0 or v_ln_over > 0 then
    if not found or v_row.resolved_at is not null then
      insert into kardo_billing.plan_overages (
        account_id, workspace_id, plan_code, organizations_limit, touchpoints_limit, links_limit,
        organizations_over, touchpoints_over, links_over, detected_at, choose_by,
        chosen_at, applied_at, reminded_at, resolved_at, updated_at
      ) values (
        p_account, v_home, v_plan, v_org_limit, v_tp_limit, v_ln_limit,
        v_org_over, v_tp_over, v_ln_over, now(), now() + interval '14 days',
        null, null, null, null, now()
      )
      on conflict (account_id) do update set
        workspace_id = excluded.workspace_id,
        plan_code = excluded.plan_code,
        organizations_limit = excluded.organizations_limit,
        touchpoints_limit = excluded.touchpoints_limit,
        links_limit = excluded.links_limit,
        organizations_over = excluded.organizations_over,
        touchpoints_over = excluded.touchpoints_over,
        links_over = excluded.links_over,
        detected_at = now(),
        choose_by = now() + interval '14 days',
        chosen_at = null, applied_at = null, reminded_at = null, resolved_at = null,
        updated_at = now();
      return jsonb_build_object('status', 'opened', 'reactivated', v_reactivated,
        'organizationsOver', v_org_over, 'touchpointsOver', v_tp_over, 'linksOver', v_ln_over);
    end if;
    -- Ya estaba abierto: si eligió y ahora vuelve a sobrar, el plazo se
    -- reinicia; si no, solo se actualizan los números.
    update kardo_billing.plan_overages set
      workspace_id = v_home,
      plan_code = v_plan,
      organizations_limit = v_org_limit,
      touchpoints_limit = v_tp_limit,
      links_limit = v_ln_limit,
      organizations_over = v_org_over,
      touchpoints_over = v_tp_over,
      links_over = v_ln_over,
      choose_by = case when v_row.applied_at is not null then now() + interval '14 days' else v_row.choose_by end,
      chosen_at = case when v_row.applied_at is not null then null else v_row.chosen_at end,
      applied_at = null,
      updated_at = now()
    where account_id = p_account;
    return jsonb_build_object('status', 'updated', 'reactivated', v_reactivated,
      'organizationsOver', v_org_over, 'touchpointsOver', v_tp_over, 'linksOver', v_ln_over);
  end if;

  -- Ya cabe todo. El plazo se cierra cuando nada queda fuera.
  select count(*) into v_moved from (
    select 1 from kardo_core.workspaces w
    where w.billing_account_id = p_account and w.deleted_at is null and w.plan_excluded_at is not null
    union all
    select 1 from kardo_core.touchpoints t
    where t.workspace_id = any(v_spaces) and t.status <> 'retired' and t.plan_excluded_at is not null
  ) x;
  if v_row.account_id is not null and v_row.resolved_at is null and v_moved = 0 then
    update kardo_billing.plan_overages set
      organizations_over = 0, touchpoints_over = 0, links_over = 0,
      resolved_at = now(), updated_at = now()
    where account_id = p_account;
    return jsonb_build_object('status', 'resolved', 'reactivated', v_reactivated);
  end if;
  return jsonb_build_object('status', 'none', 'reactivated', v_reactivated);
end;
$$;
revoke all on function kardo_billing.refresh_account_overage(uuid) from public;

-- Compatibilidad: el webhook, la tarea horaria y Operations la llaman con
-- una organización; revisa su cuenta.
create or replace function kardo_billing.refresh_plan_overage(p_workspace_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if kardo_billing.is_internal_workspace(p_workspace_id) then
    return jsonb_build_object('status', 'none');
  end if;
  return kardo_billing.refresh_account_overage(kardo_billing.account_of(p_workspace_id));
end;
$$;
revoke all on function kardo_billing.refresh_plan_overage(uuid) from public;
grant execute on function kardo_billing.refresh_plan_overage(uuid) to kardo_billing_sync;

-- Interna: aplica una elección (de la persona o la regla por defecto).
-- `p_keep` lleva organizaciones y QR y etiquetas o links: primero quedan
-- las organizaciones elegidas (dentro de su tope), luego lo elegido de las
-- que siguen.
create or replace function kardo_billing.apply_plan_selection_internal(
  p_workspace_id uuid,
  p_keep uuid[],
  p_by_customer boolean,
  p_actor uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account uuid := kardo_billing.account_of(p_workspace_id);
  v_org_limit integer;
  v_tp_limit integer;
  v_ln_limit integer;
  v_kind text;
  v_limit integer;
  v_total integer;
  v_kept integer;
  v_excluded integer := 0;
  v_included integer := 0;
  v_target record;
  v_spaces uuid[];
begin
  if v_account is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  perform 1 from kardo_billing.accounts a where a.id = v_account for update;
  select l.organizations_limit, l.touchpoints_limit, l.links_limit
    into v_org_limit, v_tp_limit, v_ln_limit
  from kardo_billing.account_overage_limits(v_account) l;

  -- Organizaciones.
  select count(*) into v_total from kardo_core.workspaces w
  where w.billing_account_id = v_account and w.kind = 'organization' and w.deleted_at is null
    and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id);
  if v_org_limit is null or v_total <= v_org_limit then
    for v_target in
      select w.id from kardo_core.workspaces w
      where w.billing_account_id = v_account and w.deleted_at is null and w.plan_excluded_at is not null
    loop
      perform kardo_billing.set_workspace_excluded(v_target.id, false);
      v_included := v_included + 1;
    end loop;
  else
    select count(*) into v_kept from kardo_core.workspaces w
    where w.billing_account_id = v_account and w.kind = 'organization' and w.deleted_at is null
      and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)
      and w.id = any(coalesce(p_keep, '{}'));
    if v_kept = 0 then
      raise exception using errcode = 'P0001', message = 'PLAN_SELECTION_ORGANIZATIONS_REQUIRED';
    end if;
    if v_kept > v_org_limit then
      raise exception using errcode = 'P0001', message = 'PLAN_SELECTION_OVER_LIMIT',
        detail = 'organization';
    end if;
    for v_target in
      select w.id, w.plan_excluded_at is not null as was_excluded,
        w.id = any(coalesce(p_keep, '{}')) as keep
      from kardo_core.workspaces w
      where w.billing_account_id = v_account and w.kind = 'organization' and w.deleted_at is null
        and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)
    loop
      if v_target.keep and v_target.was_excluded then
        perform kardo_billing.set_workspace_excluded(v_target.id, false);
        v_included := v_included + 1;
      elsif not v_target.keep and not v_target.was_excluded then
        perform kardo_billing.set_workspace_excluded(v_target.id, true);
        v_excluded := v_excluded + 1;
      end if;
    end loop;
  end if;

  -- QR y etiquetas y links de las organizaciones que siguen.
  v_spaces := array(select kardo_billing.account_workspaces(v_account));
  foreach v_kind in array array['touchpoint', 'link'] loop
    v_limit := case v_kind when 'touchpoint' then v_tp_limit else v_ln_limit end;
    select count(*) into v_total from kardo_core.touchpoints t
    where t.workspace_id = any(v_spaces)
      and (t.kind = 'link') = (v_kind = 'link')
      and t.status in ('assigned', 'active', 'paused');
    if v_limit is null or v_total <= v_limit then
      for v_target in
        select t.id from kardo_core.touchpoints t
        where t.workspace_id = any(v_spaces)
          and (t.kind = 'link') = (v_kind = 'link')
          and t.plan_excluded_at is not null and t.status <> 'retired'
      loop
        update kardo_core.touchpoints set plan_excluded_at = null, updated_at = now()
        where id = v_target.id;
        perform kardo_billing.request_touchpoint_pause(v_target.id);
        v_included := v_included + 1;
      end loop;
      continue;
    end if;
    select count(*) into v_kept from kardo_core.touchpoints t
    where t.workspace_id = any(v_spaces)
      and (t.kind = 'link') = (v_kind = 'link')
      and t.status in ('assigned', 'active', 'paused')
      and t.id = any(coalesce(p_keep, '{}'));
    if v_kept > v_limit then
      raise exception using errcode = 'P0001', message = 'PLAN_SELECTION_OVER_LIMIT',
        detail = v_kind;
    end if;
    for v_target in
      select t.id, t.plan_excluded_at is not null as was_excluded,
        t.id = any(coalesce(p_keep, '{}')) as keep
      from kardo_core.touchpoints t
      where t.workspace_id = any(v_spaces)
        and (t.kind = 'link') = (v_kind = 'link')
        and t.status in ('assigned', 'active', 'paused')
    loop
      if v_target.keep and v_target.was_excluded then
        update kardo_core.touchpoints set plan_excluded_at = null, updated_at = now()
        where id = v_target.id;
        perform kardo_billing.request_touchpoint_pause(v_target.id);
        v_included := v_included + 1;
      elsif not v_target.keep and not v_target.was_excluded then
        update kardo_core.touchpoints set plan_excluded_at = now(), updated_at = now()
        where id = v_target.id;
        perform kardo_billing.request_touchpoint_pause(v_target.id);
        v_excluded := v_excluded + 1;
      end if;
    end loop;
  end loop;

  update kardo_billing.plan_overages set
    chosen_at = case when p_by_customer then now() else chosen_at end,
    applied_at = now(),
    organizations_over = 0,
    touchpoints_over = 0,
    links_over = 0,
    updated_at = now()
  where account_id = v_account;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    p_workspace_id, p_actor, case when p_by_customer then 'customer' else 'service' end,
    case when p_by_customer then 'billing.plan_selection_saved' else 'billing.plan_selection_default' end,
    'workspace', p_workspace_id, 'succeeded',
    jsonb_build_object('excluded', v_excluded, 'included', v_included, 'accountId', v_account)
  );
  return jsonb_build_object('excluded', v_excluded, 'included', v_included);
end;
$$;
revoke all on function kardo_billing.apply_plan_selection_internal(uuid, uuid[], boolean, uuid) from public;

-- La persona dueña del plan elige.
create or replace function kardo_billing.save_plan_selection(p_workspace_id uuid, p_keep uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
begin
  if v_subject is null
    or not kardo_private.is_workspace_member(p_workspace_id)
    or not kardo_billing.is_account_holder(kardo_billing.account_of(p_workspace_id)) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  return kardo_billing.apply_plan_selection_internal(p_workspace_id, p_keep, true, v_subject);
end;
$$;
revoke all on function kardo_billing.save_plan_selection(uuid, uuid[]) from public;
grant execute on function kardo_billing.save_plan_selection(uuid, uuid[]) to kardo_customer_api;

-- La tarea horaria, al vencer el plazo sin elección.
create or replace function kardo_billing.apply_default_plan_selection(p_workspace_id uuid, p_keep uuid[])
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from kardo_billing.plan_overages o
    where o.account_id = kardo_billing.account_of(p_workspace_id)
      and o.resolved_at is null and o.applied_at is null and o.choose_by <= now()
  ) then
    return jsonb_build_object('status', 'not_due');
  end if;
  return kardo_billing.apply_plan_selection_internal(p_workspace_id, p_keep, false, null)
    || jsonb_build_object('status', 'applied');
end;
$$;
revoke all on function kardo_billing.apply_default_plan_selection(uuid, uuid[]) from public;
grant execute on function kardo_billing.apply_default_plan_selection(uuid, uuid[]) to kardo_billing_sync;

-- Lo que se puede elegir: las organizaciones de la cuenta, y los QR y
-- etiquetas y links vivos de cada una (con su organización).
drop function if exists kardo_billing.plan_selection_candidates(uuid);
create function kardo_billing.plan_selection_candidates(p_workspace_id uuid)
returns table (
  id uuid,
  public_id text,
  kind text,
  name text,
  status text,
  excluded boolean,
  updated_at timestamptz,
  workspace_id uuid
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account uuid := kardo_billing.account_of(p_workspace_id);
begin
  if kardo_private.current_customer_subject() is not null
     and not kardo_private.is_workspace_member(p_workspace_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if v_account is null or kardo_billing.is_internal_workspace(p_workspace_id) then
    return query
    select t.id, t.public_id, t.kind::text, t.operational_name, t.status::text,
      t.plan_excluded_at is not null, t.updated_at, t.workspace_id
    from kardo_core.touchpoints t
    where t.workspace_id = p_workspace_id
      and t.status in ('assigned', 'active', 'paused')
    order by t.kind, t.created_at;
    return;
  end if;
  return query
  select w.id, w.public_id, 'organization'::text, w.name, 'active'::text,
    w.plan_excluded_at is not null, w.updated_at, w.id
  from kardo_core.workspaces w
  where w.billing_account_id = v_account and w.kind = 'organization' and w.deleted_at is null
    and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)
  union all
  select t.id, t.public_id, t.kind::text, t.operational_name, t.status::text,
    t.plan_excluded_at is not null, t.updated_at, t.workspace_id
  from kardo_core.touchpoints t
  join kardo_core.workspaces w on w.id = t.workspace_id
  where w.billing_account_id = v_account and w.deleted_at is null
    and not exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)
    and t.status in ('assigned', 'active', 'paused');
end;
$$;
revoke all on function kardo_billing.plan_selection_candidates(uuid) from public;
grant execute on function kardo_billing.plan_selection_candidates(uuid) to kardo_customer_api, kardo_billing_sync;

-- ---------------------------------------------------------------------------
-- 12. Transferir: la organización pasa al plan de quien la recibe
-- ---------------------------------------------------------------------------

create or replace function kardo_billing.move_workspace_to_owner(p_workspace_id uuid, p_profile uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_from uuid;
  v_to uuid;
  v_from_result jsonb;
  v_to_result jsonb;
begin
  select w.billing_account_id into v_from
  from kardo_core.workspaces w where w.id = p_workspace_id and w.deleted_at is null
  for update;
  if not found then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  -- Solo quien tenía el plan o un Owner de la organización, hacia alguien
  -- que ya es Owner de ella (la transferencia lo promueve antes).
  if v_subject is null
    or not (kardo_billing.is_account_holder(v_from) or kardo_private.workspace_role(p_workspace_id) = 'owner')
    or not exists (
      select 1 from kardo_core.workspace_memberships m
      where m.workspace_id = p_workspace_id and m.profile_id = p_profile and m.role = 'owner'
    ) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_to := kardo_billing.ensure_account(p_profile);
  if v_to is not distinct from v_from then
    return jsonb_build_object('moved', false);
  end if;

  update kardo_core.workspaces
  set billing_account_id = v_to, updated_at = now()
  where id = p_workspace_id;
  -- Entra como dentro del plan: si no le cabe, la bajada de su cuenta lo
  -- dice y abre los 14 días; mientras tanto, sus páginas siguen abriendo.
  perform kardo_billing.set_workspace_excluded(p_workspace_id, false);

  v_to_result := kardo_billing.refresh_account_overage(v_to);
  v_from_result := kardo_billing.refresh_account_overage(v_from);

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    p_workspace_id, v_subject, 'customer', 'billing.workspace_account_moved', 'workspace', p_workspace_id,
    'succeeded', jsonb_build_object('fromAccount', v_from, 'toAccount', v_to,
      'receiverOverage', v_to_result ->> 'status')
  );
  return jsonb_build_object('moved', true, 'receiver', v_to_result, 'giver', v_from_result);
end;
$$;
revoke all on function kardo_billing.move_workspace_to_owner(uuid, uuid) from public;
grant execute on function kardo_billing.move_workspace_to_owner(uuid, uuid) to kardo_customer_api;
