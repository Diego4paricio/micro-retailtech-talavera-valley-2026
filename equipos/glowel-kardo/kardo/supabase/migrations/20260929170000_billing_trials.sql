-- Prueba de 15 dias en Kardo, sin tarjeta y una por persona (ADR 020 §3).
--
-- La prueba vive en Kardo, no en Stripe: empieza al completar el alta con el
-- plan elegido en /precios/ (o el de la prueba) y nunca genera cargos. Una por
-- persona: por perfil y por hash del correo, asi que borrar la cuenta y
-- registrarse otra vez con el mismo correo no da otra prueba. El registro de
-- la prueba se conserva aunque la organizacion se borre (workspace_id nulo).
--
-- Plan efectivo: suscripcion viva > plan manual de staff > prueba vigente >
-- plan por defecto. Los avisos de la prueba (dias 0, 8, 12 y 15) van al
-- correo de quien la inicio; el dia 0 se encola aqui y los demas la tarea
-- horaria (kardo_billing.notices).

create table if not exists kardo_billing.trials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid unique references kardo_core.workspaces(id) on delete set null,
  profile_id uuid references kardo_core.profiles(id) on delete set null,
  -- sha256 del correo en minusculas (nunca el correo): una prueba por persona.
  email_sha256 text not null check (email_sha256 ~ '^[0-9a-f]{64}$'),
  plan_id uuid not null references kardo_core.plans(id) on delete restrict,
  billing_interval text not null default 'month' check (billing_interval in ('month', 'year')),
  started_at timestamptz not null default now(),
  ends_at timestamptz not null,
  -- Cuando la organizacion contrato (la suscripcion manda desde entonces).
  converted_at timestamptz,
  constraint trials_period check (ends_at > started_at)
);
create unique index if not exists billing_trials_profile_unique
  on kardo_billing.trials (profile_id) where profile_id is not null;
create unique index if not exists billing_trials_email_unique
  on kardo_billing.trials (email_sha256);
create index if not exists billing_trials_open_idx
  on kardo_billing.trials (ends_at) where converted_at is null;

alter table kardo_billing.trials enable row level security;

-- Cualquier miembro ve la prueba de su organizacion (franja de dias
-- restantes); nunca el hash del correo.
drop policy if exists "customer api billing trials read" on kardo_billing.trials;
create policy "customer api billing trials read" on kardo_billing.trials
  for select to kardo_customer_api
  using (workspace_id is not null and kardo_private.is_workspace_member(workspace_id));
grant select (id, workspace_id, plan_id, billing_interval, started_at, ends_at, converted_at)
  on kardo_billing.trials to kardo_customer_api;

drop policy if exists "staff api billing read" on kardo_billing.trials;
create policy "staff api billing read" on kardo_billing.trials
  for select to kardo_staff_api using (kardo_private.staff_has_permission('billing.read'));
grant select (id, workspace_id, profile_id, plan_id, billing_interval, started_at, ends_at, converted_at)
  on kardo_billing.trials to kardo_staff_api;

drop policy if exists "billing sync all" on kardo_billing.trials;
create policy "billing sync all" on kardo_billing.trials
  for all to kardo_billing_sync using (true) with check (true);
grant select, update on kardo_billing.trials to kardo_billing_sync;

-- Los avisos de una prueba sin Customer de Stripe van al correo del perfil
-- que la inicio.
grant select (id, email) on kardo_core.profiles to kardo_billing_sync;

-- Avisos nuevos de la prueba.
alter table kardo_billing.notices drop constraint if exists notices_kind_check;
alter table kardo_billing.notices add constraint notices_kind_check check (kind in (
  'subscription_started', 'renewal_upcoming', 'trial_ending', 'cancellation_confirmed',
  'trial_started', 'trial_reminder', 'trial_ended'
));

-- Plan efectivo con la prueba.
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
  trial as (
    select t.plan_id
    from kardo_billing.trials t
    where t.workspace_id = p_workspace_id
      and t.converted_at is null
      and t.ends_at > now()
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
revoke all on function kardo_billing.resolve_effective_plan(uuid) from public;

-- Inicia la prueba de una organizacion al completar el alta. Solo el Owner;
-- devuelve null (sin error) si no corresponde: la organizacion ya tiene
-- prueba, suscripcion o plan manual, o la persona ya uso su prueba. El plan
-- pedido se usa si esta en venta; si no, el plan de la prueba.
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

  if exists (select 1 from kardo_billing.trials t where t.workspace_id = p_workspace_id)
    or exists (select 1 from kardo_billing.subscriptions s where s.workspace_id = p_workspace_id)
    or exists (select 1 from kardo_core.workspace_plans wp where wp.workspace_id = p_workspace_id) then
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
revoke all on function kardo_private.start_workspace_trial(uuid, text, text, text, integer) from public;
grant execute on function kardo_private.start_workspace_trial(uuid, text, text, text, integer) to kardo_customer_api;

-- Al contratar (la suscripcion llega viva por webhook o resincronizacion), la
-- prueba queda convertida y deja de contar para el plan efectivo.
create or replace function kardo_billing.mark_trial_converted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status in ('trialing', 'active', 'past_due') then
    update kardo_billing.trials
    set converted_at = now()
    where workspace_id = new.workspace_id and converted_at is null;
  end if;
  return new;
end;
$$;
revoke all on function kardo_billing.mark_trial_converted() from public;
drop trigger if exists subscriptions_mark_trial_converted on kardo_billing.subscriptions;
create trigger subscriptions_mark_trial_converted
  after insert or update of status on kardo_billing.subscriptions
  for each row execute function kardo_billing.mark_trial_converted();

-- La tarea horaria no avisa "tu prueba termina" a quien tiene una cortesia
-- vigente de staff: necesita leer los planes manuales.
drop policy if exists "billing sync workspace plans read" on kardo_core.workspace_plans;
create policy "billing sync workspace plans read" on kardo_core.workspace_plans
  for select to kardo_billing_sync using (true);
grant select on kardo_core.workspace_plans to kardo_billing_sync;
