-- Domain audit A2-62 (2026-10-13): the billing rules each function copied.
--
-- Before this, «a subscription that is still live» (trialing, active,
-- past_due) was written out in four functions, «a QR or link that takes a
-- place in the plan» (assigned, active, paused) in nine places, and the
-- 7-day grace, the 90 days before deletion, the 7-day conversion offer and
-- the 14-day window to choose after a downgrade were bare literals. They
-- agreed; a new state or a new term would have changed one place and not
-- the others. Now each rule is one function here, the same values as
-- LIVE_SUBSCRIPTION_STATUSES (contracts), ACCESS_GRACE_DAYS,
-- DELETE_AFTER_DAYS, CONVERSION_COUPON.validDays (packages/billing) and
-- PLAN_OVERAGE_WINDOW_DAYS (contracts); scripts/e2e/billing-sync.mts
-- checks that they stay equal.
--
-- The eight functions below are the definitions live in kardo-dev with
-- only those literals replaced; nothing else in them changes.

create or replace function kardo_billing.is_live_subscription(
  p_status kardo_billing.subscription_status
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_status in ('trialing', 'active', 'past_due')
$$;

comment on function kardo_billing.is_live_subscription(kardo_billing.subscription_status) is
  'A subscription that still gives its plan: trialing, active or past_due (LIVE_SUBSCRIPTION_STATUSES).';

create or replace function kardo_billing.holds_plan_place(
  p_status kardo_core.touchpoint_status
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select p_status in ('assigned', 'active', 'paused')
$$;

comment on function kardo_billing.holds_plan_place(kardo_core.touchpoint_status) is
  'A QR, tag or link that takes a place in the plan: assigned, active or paused (not prepared, available, lost, replaced or retired).';

create or replace function kardo_billing.access_grace_period()
returns interval language sql immutable parallel safe set search_path = ''
as $$ select interval '7 days' $$;

comment on function kardo_billing.access_grace_period() is
  'After a plan or trial ends, pages stay open this long (ACCESS_GRACE_DAYS).';

create or replace function kardo_billing.deletion_period()
returns interval language sql immutable parallel safe set search_path = ''
as $$ select interval '90 days' $$;

comment on function kardo_billing.deletion_period() is
  'After a plan or trial ends without a new one, the organization is deleted after this long (DELETE_AFTER_DAYS).';

create or replace function kardo_billing.conversion_offer_period()
returns interval language sql immutable parallel safe set search_path = ''
as $$ select interval '7 days' $$;

comment on function kardo_billing.conversion_offer_period() is
  'The conversion coupon is offered this long after a trial ends (CONVERSION_COUPON.validDays, ADR 020 §1).';

create or replace function kardo_billing.plan_overage_window()
returns interval language sql immutable parallel safe set search_path = ''
as $$ select interval '14 days' $$;

comment on function kardo_billing.plan_overage_window() is
  'After a downgrade leaves too much, the customer has this long to choose what stays (PLAN_OVERAGE_WINDOW_DAYS).';

-- Only the billing functions use them, and those run as their owner
-- (security definer); no API role calls them directly.
revoke all on function kardo_billing.is_live_subscription(kardo_billing.subscription_status) from public;
revoke all on function kardo_billing.holds_plan_place(kardo_core.touchpoint_status) from public;
revoke all on function kardo_billing.access_grace_period() from public;
revoke all on function kardo_billing.deletion_period() from public;
revoke all on function kardo_billing.conversion_offer_period() from public;
revoke all on function kardo_billing.plan_overage_window() from public;

CREATE OR REPLACE FUNCTION kardo_billing.usage_of(p_workspace_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select jsonb_build_object(
    'organizations.max', (
      select count(*) from kardo_core.workspaces w
      where w.id = any(p_workspace_ids) and w.kind = 'organization'
    ),
    'touchpoints.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = any(p_workspace_ids) and t.kind <> 'link'
        and kardo_billing.holds_plan_place(t.status)
        and t.plan_excluded_at is null
    ),
    'links.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = any(p_workspace_ids) and t.kind = 'link'
        and kardo_billing.holds_plan_place(t.status)
        and t.plan_excluded_at is null
    ),
    -- Personas, no lugares: quien está en dos organizaciones cuenta una vez.
    'members.max', (
      select count(*) from (
        select coalesce(lower(pr.email), m.profile_id::text)
        from kardo_core.workspace_memberships m
        left join kardo_core.profiles pr on pr.id = m.profile_id
        where m.workspace_id = any(p_workspace_ids)
        union
        select lower(i.email) from kardo_core.workspace_invitations i
        where i.workspace_id = any(p_workspace_ids) and i.status = 'pending' and i.expires_at > now()
      ) people
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
$function$;

CREATE OR REPLACE FUNCTION kardo_billing.plan_selection_candidates(p_workspace_id uuid)
 RETURNS TABLE(id uuid, public_id text, kind text, name text, status text, excluded boolean, updated_at timestamp with time zone, workspace_id uuid)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and kardo_billing.holds_plan_place(t.status)
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
    and kardo_billing.holds_plan_place(t.status);
end;
$function$;

CREATE OR REPLACE FUNCTION kardo_billing.apply_plan_selection_internal(p_workspace_id uuid, p_keep uuid[], p_by_customer boolean, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and kardo_billing.holds_plan_place(t.status);
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
      and kardo_billing.holds_plan_place(t.status)
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
        and kardo_billing.holds_plan_place(t.status)
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
$function$;

CREATE OR REPLACE FUNCTION kardo_billing.refresh_account_overage(p_account uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
      and kardo_billing.holds_plan_place(t.status)
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
      and kardo_billing.holds_plan_place(t.status)
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
        v_org_over, v_tp_over, v_ln_over, now(), now() + kardo_billing.plan_overage_window(),
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
        choose_by = now() + kardo_billing.plan_overage_window(),
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
      choose_by = case when v_row.applied_at is not null then now() + kardo_billing.plan_overage_window() else v_row.choose_by end,
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
$function$;

CREATE OR REPLACE FUNCTION kardo_billing.account_extras(p_account uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select coalesce(jsonb_object_agg(x.extra_code, x.quantity), '{}'::jsonb)
  from (
    select i.extra_code, sum(i.quantity)::integer as quantity
    from kardo_billing.subscription_items i
    join kardo_billing.subscriptions s on s.stripe_subscription_id = i.stripe_subscription_id
    where p_account is not null and s.account_id = p_account
      and kardo_billing.is_live_subscription(s.status)
      and i.extra_code is not null and i.quantity > 0
    group by i.extra_code
  ) x;
$function$;

CREATE OR REPLACE FUNCTION kardo_billing.resolve_account_plan(p_account uuid)
 RETURNS TABLE(plan_id uuid, source text, stripe_subscription_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  with live_subscription as (
    select s.plan_id, s.stripe_subscription_id
    from kardo_billing.subscriptions s
    join kardo_core.plans p on p.id = s.plan_id
    where p_account is not null and s.account_id = p_account
      and kardo_billing.is_live_subscription(s.status)
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
$function$;

CREATE OR REPLACE FUNCTION kardo_billing.mark_trial_converted()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if kardo_billing.is_live_subscription(new.status) then
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
$function$;

CREATE OR REPLACE FUNCTION kardo_billing.resolve_workspace_access(p_workspace_id uuid)
 RETURNS TABLE(state text, source text, plan_code text, plan_name text, ends_at timestamp with time zone, lapsed_at timestamp with time zone, grace_ends_at timestamp with time zone, delete_at timestamp with time zone, offer_until timestamp with time zone)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and kardo_billing.is_live_subscription(s.status)
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
      and v_trial_end > now() - kardo_billing.conversion_offer_period()
      and not exists (
        select 1 from kardo_billing.subscriptions s
        where s.account_id = v_account
          and s.status not in ('incomplete', 'incomplete_expired')
      ) then
      v_offer := v_trial_end + kardo_billing.conversion_offer_period();
    end if;

    return query select
      case when now() < v_lapsed + kardo_billing.access_grace_period() then 'limited' else 'paused' end,
      v_source, v_code, v_name, null::timestamptz,
      v_lapsed, v_lapsed + kardo_billing.access_grace_period(),
      v_lapsed + kardo_billing.deletion_period(), v_offer;
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
$function$;
