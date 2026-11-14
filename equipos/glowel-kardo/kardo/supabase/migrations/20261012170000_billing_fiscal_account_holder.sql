-- Fiscal data and CFDIs belong to the billing account (the subscription), not
-- to an organization (ADR 024; «Cuenta de cobro», borrador cobro por persona
-- cláusula 2.22: reúne el Plan, la Suscripción, el método de pago y las
-- facturas, y cubre las Organizaciones del Propietario). You pay per
-- subscription, and one subscription covers several organizations, so there is
-- one RFC per account — not one per organization (owner, 2026-10-12; security
-- review #3). This also makes the DB enforce the API's holder check as defense
-- in depth: only the account holder reads or writes the fiscal data.
--
-- The one-RFC-per-account rule is the owner's + their accountant's decision
-- (see Docs/fiscal; memory «CFDI separation»). This migration implements it.

-- ---------------------------------------------------------------------------
-- 1. fiscal_profiles: one per billing account. Keep workspace_id as the
--    origin organization (the last one it was saved from); add account_id and
--    make it unique so there is a single RFC per account.
-- ---------------------------------------------------------------------------
alter table kardo_billing.fiscal_profiles
  add column if not exists account_id uuid references kardo_billing.accounts(id) on delete cascade;
update kardo_billing.fiscal_profiles f
set account_id = w.billing_account_id
from kardo_core.workspaces w
where w.id = f.workspace_id and f.account_id is null;
-- Collapse any pre-existing per-organization profiles to one per account,
-- keeping the most recently updated (ties: lowest workspace_id, deterministic).
delete from kardo_billing.fiscal_profiles f
using kardo_billing.fiscal_profiles g
where f.account_id is not null
  and f.account_id = g.account_id
  and f.workspace_id <> g.workspace_id
  and (
    f.updated_at < g.updated_at
    or (f.updated_at = g.updated_at and f.workspace_id < g.workspace_id)
  );
create unique index if not exists billing_fiscal_profiles_account_key
  on kardo_billing.fiscal_profiles (account_id) where account_id is not null;

-- ---------------------------------------------------------------------------
-- 2. cfdi_requests: tie each to the account too (keep workspace_id for which
--    organization's invoice it is). Fill account_id on insert so the sync and
--    the staff path do not need to pass it.
-- ---------------------------------------------------------------------------
alter table kardo_billing.cfdi_requests
  add column if not exists account_id uuid references kardo_billing.accounts(id) on delete restrict;
update kardo_billing.cfdi_requests c
set account_id = w.billing_account_id
from kardo_core.workspaces w
where w.id = c.workspace_id and c.account_id is null;
create index if not exists billing_cfdi_requests_account_idx
  on kardo_billing.cfdi_requests (account_id, requested_at desc);

create or replace function kardo_billing.fill_cfdi_request_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.account_id is null then
    new.account_id := kardo_billing.account_of(new.workspace_id);
  end if;
  return new;
end;
$$;
revoke all on function kardo_billing.fill_cfdi_request_account() from public;
drop trigger if exists cfdi_requests_fill_account on kardo_billing.cfdi_requests;
create trigger cfdi_requests_fill_account before insert on kardo_billing.cfdi_requests
  for each row execute function kardo_billing.fill_cfdi_request_account();

-- The RLS policies below run as kardo_customer_api, so it must be able to call
-- account_of (SECURITY DEFINER; returns only the workspace's billing account).
grant execute on function kardo_billing.account_of(uuid) to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- 3. Read policy: the account holder; when there is no billing account yet,
--    the organization's Owner/Admin (the API's `requireAccountHolder` behaves
--    the same).
-- ---------------------------------------------------------------------------
do $$
declare
  target text;
begin
  foreach target in array array['fiscal_profiles', 'cfdi_requests'] loop
    execute format('drop policy if exists %I on kardo_billing.%I', 'customer api billing fiscal read', target);
    execute format(
      'create policy %I on kardo_billing.%I for select to kardo_customer_api using (
         case
           when account_id is not null then kardo_billing.is_account_holder(account_id)
           else kardo_private.workspace_role(workspace_id) in (''owner'', ''admin'')
         end
       )',
      'customer api billing fiscal read', target
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 4. Customer functions, keyed by account and gated on the holder. They keep
--    the Owner/Admin baseline and the no-account fallback.
-- ---------------------------------------------------------------------------
create or replace function kardo_private.upsert_fiscal_profile(
  p_workspace_id uuid,
  p_rfc text,
  p_legal_name text,
  p_tax_regime text,
  p_postal_code text,
  p_cfdi_use text,
  p_email text,
  p_invoice_each_payment boolean
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_account uuid := kardo_billing.account_of(p_workspace_id);
begin
  if v_subject is null
    or kardo_private.workspace_role(p_workspace_id) not in ('owner', 'admin')
    or (v_account is not null and not kardo_billing.is_account_holder(v_account)) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  -- One RFC per account: drop any profile the account kept under another
  -- organization, then upsert this one (keyed by the workspace PK).
  if v_account is not null then
    delete from kardo_billing.fiscal_profiles
    where account_id = v_account and workspace_id <> p_workspace_id;
  end if;
  begin
    insert into kardo_billing.fiscal_profiles (
      workspace_id, account_id, rfc, legal_name, tax_regime, postal_code,
      cfdi_use, email, invoice_each_payment, updated_by, updated_at
    ) values (
      p_workspace_id, v_account, upper(btrim(p_rfc)), btrim(p_legal_name),
      btrim(p_tax_regime), btrim(p_postal_code), upper(btrim(p_cfdi_use)),
      lower(btrim(p_email)), coalesce(p_invoice_each_payment, false), v_subject, now()
    )
    on conflict (workspace_id) do update set
      account_id = excluded.account_id,
      rfc = excluded.rfc,
      legal_name = excluded.legal_name,
      tax_regime = excluded.tax_regime,
      postal_code = excluded.postal_code,
      cfdi_use = excluded.cfdi_use,
      email = excluded.email,
      invoice_each_payment = excluded.invoice_each_payment,
      updated_by = excluded.updated_by,
      updated_at = now();
  exception when check_violation then
    raise exception using errcode = 'P0001', message = 'INVALID_FISCAL_PROFILE';
  end;
  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    p_workspace_id, v_subject, 'customer', 'billing.fiscal_profile_saved', 'workspace',
    p_workspace_id, 'succeeded',
    jsonb_build_object('invoiceEachPayment', coalesce(p_invoice_each_payment, false))
  );
end;
$$;

create or replace function kardo_private.delete_fiscal_profile(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_account uuid := kardo_billing.account_of(p_workspace_id);
begin
  if v_subject is null
    or kardo_private.workspace_role(p_workspace_id) not in ('owner', 'admin')
    or (v_account is not null and not kardo_billing.is_account_holder(v_account)) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if v_account is not null then
    delete from kardo_billing.fiscal_profiles where account_id = v_account;
  else
    delete from kardo_billing.fiscal_profiles where workspace_id = p_workspace_id;
  end if;
  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    p_workspace_id, v_subject, 'customer', 'billing.fiscal_profile_deleted', 'workspace',
    p_workspace_id, 'succeeded', '{}'::jsonb
  );
end;
$$;

create or replace function kardo_private.request_cfdi(
  p_workspace_id uuid,
  p_invoice_id text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_account uuid := kardo_billing.account_of(p_workspace_id);
  v_profile kardo_billing.fiscal_profiles;
  v_paid_at timestamptz;
  v_existing uuid;
  v_id uuid;
begin
  if v_subject is null
    or kardo_private.workspace_role(p_workspace_id) not in ('owner', 'admin')
    or (v_account is not null and not kardo_billing.is_account_holder(v_account)) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  select i.paid_at into v_paid_at
  from kardo_billing.invoices i
  where i.stripe_invoice_id = p_invoice_id
    and i.workspace_id = p_workspace_id
    and i.status = 'paid'
    and i.amount_paid > 0;
  if v_paid_at is null then
    raise exception using errcode = 'P0001', message = 'INVOICE_NOT_PAID';
  end if;
  if date_trunc('month', v_paid_at at time zone 'America/Mexico_City')
     <> date_trunc('month', now() at time zone 'America/Mexico_City') then
    raise exception using errcode = 'P0001', message = 'CFDI_PERIOD_CLOSED';
  end if;
  -- The account's fiscal profile (ADR 024), wherever it was saved from.
  if v_account is not null then
    select * into v_profile from kardo_billing.fiscal_profiles where account_id = v_account;
  else
    select * into v_profile from kardo_billing.fiscal_profiles where workspace_id = p_workspace_id;
  end if;
  if v_profile.workspace_id is null then
    raise exception using errcode = 'P0001', message = 'FISCAL_PROFILE_REQUIRED';
  end if;

  select r.id into v_existing
  from kardo_billing.cfdi_requests r
  where r.stripe_invoice_id = p_invoice_id and r.status in ('pending', 'issued');
  if v_existing is not null then
    return v_existing;
  end if;

  insert into kardo_billing.cfdi_requests (
    workspace_id, account_id, stripe_invoice_id, fiscal_snapshot, requested_by
  ) values (
    p_workspace_id, v_account, p_invoice_id,
    jsonb_build_object(
      'rfc', v_profile.rfc, 'legalName', v_profile.legal_name,
      'taxRegime', v_profile.tax_regime, 'postalCode', v_profile.postal_code,
      'cfdiUse', v_profile.cfdi_use, 'email', v_profile.email
    ),
    v_subject
  )
  returning id into v_id;
  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    p_workspace_id, v_subject, 'customer', 'billing.cfdi_requested', 'cfdi_request', v_id,
    'succeeded', jsonb_build_object('invoiceId', p_invoice_id)
  );
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Erasing one organization must not drop the account's RFC while the
--    account still has another organization (ADR 024). Rewrites the fiscal
--    clause of `erase_workspace_data` (relevo 38, erase_group_designs); the
--    rest of the function is unchanged.
-- ---------------------------------------------------------------------------
create or replace function kardo_private.erase_workspace_data(
  p_workspace_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
  v_cleanup integer;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 200 then
    raise exception using errcode = 'P0001', message = 'INVALID_REASON';
  end if;
  v_counts := kardo_private.workspace_deletion_counts(p_workspace_id);

  insert into kardo_billing.workspace_deletions (workspace_id, reason, counts)
  values (p_workspace_id, btrim(p_reason), v_counts);

  insert into kardo_billing.deletion_cleanup (workspace_id, kind, target)
  select p_workspace_id, 'resolver', jsonb_build_object('publicId', t.public_id)
  from kardo_core.touchpoints t
  where t.workspace_id = p_workspace_id;
  insert into kardo_billing.deletion_cleanup (workspace_id, kind, target)
  select p_workspace_id, 'asset', jsonb_build_object(
    'assetId', a.id,
    'storageKey', a.storage_key,
    'sha256', case when a.derivative_key is not null then a.sha256 end,
    'deleteDerivative', a.derivative_key is not null and not exists (
      select 1 from kardo_core.assets other
      where other.sha256 = a.sha256
        and other.workspace_id <> p_workspace_id
        and other.status in ('validated', 'published')
    )
  )
  from kardo_core.assets a
  where a.workspace_id = p_workspace_id and a.status <> 'deleted';
  select count(*) into v_cleanup
  from kardo_billing.deletion_cleanup c where c.workspace_id = p_workspace_id;

  update kardo_core.touchpoints set
    status = 'retired',
    operational_name = null,
    qr_design = null,
    qr_design_updated_at = null,
    qr_template_id = null,
    qr_last_export_at = null,
    qr_last_export_fingerprint = null,
    qr_last_export_format = null,
    updated_at = now()
  where workspace_id = p_workspace_id;
  delete from kardo_core.touchpoint_activations
  where touchpoint_id in (
    select t.id from kardo_core.touchpoints t where t.workspace_id = p_workspace_id
  );

  delete from kardo_core.experience_targets where workspace_id = p_workspace_id;
  delete from kardo_core.publication_requests where workspace_id = p_workspace_id;
  delete from kardo_core.item_availability where workspace_id = p_workspace_id;
  delete from kardo_core.publications
  where touchpoint_id in (
    select t.id from kardo_core.touchpoints t where t.workspace_id = p_workspace_id
  );
  delete from kardo_core.experience_assets
  where experience_id in (
    select e.id from kardo_core.experiences e where e.workspace_id = p_workspace_id
  );
  delete from kardo_core.experience_versions
  where experience_id in (
    select e.id from kardo_core.experiences e where e.workspace_id = p_workspace_id
  );
  delete from kardo_core.experiences where workspace_id = p_workspace_id;
  delete from kardo_core.assets where workspace_id = p_workspace_id;

  delete from kardo_core.leads where workspace_id = p_workspace_id;
  delete from kardo_core.lead_deliveries where workspace_id = p_workspace_id;
  delete from kardo_core.lead_delivery_settings where workspace_id = p_workspace_id;
  delete from kardo_core.analytics_raw_events where workspace_id = p_workspace_id;
  delete from kardo_core.analytics_hourly where workspace_id = p_workspace_id;
  delete from kardo_core.analytics_daily where workspace_id = p_workspace_id;
  delete from kardo_core.touchpoint_groups where workspace_id = p_workspace_id;
  delete from kardo_core.qr_design_templates where workspace_id = p_workspace_id;
  delete from kardo_core.dashboard_layouts where workspace_id = p_workspace_id;
  delete from kardo_core.custom_html_ai_usage where workspace_id = p_workspace_id;
  delete from kardo_core.workspace_invitations where workspace_id = p_workspace_id;
  delete from kardo_core.workspace_memberships where workspace_id = p_workspace_id;

  -- The fiscal profile is the account's (ADR 024): keep it while the account
  -- still has another organization; remove it with the account's last one,
  -- unless an issued CFDI of the account backs it (legal retention). An
  -- organization without an account falls back to the old per-workspace rule.
  delete from kardo_billing.fiscal_profiles f
  where (
      (f.account_id is not null
        and f.account_id = kardo_billing.account_of(p_workspace_id)
        and not exists (
          select 1 from kardo_core.workspaces w
          where w.billing_account_id = f.account_id
            and w.id <> p_workspace_id
            and w.deleted_at is null
        ))
      or (f.account_id is null and f.workspace_id = p_workspace_id)
    )
    and not exists (
      select 1 from kardo_billing.cfdi_requests c
      where (
          (f.account_id is not null and c.account_id = f.account_id)
          or (f.account_id is null and c.workspace_id = p_workspace_id)
        )
        and c.status in ('issued', 'canceled')
    );
  update kardo_billing.notices
  set status = 'skipped', last_error = 'workspace deleted'
  where workspace_id = p_workspace_id and status in ('pending', 'failed');
  update kardo_billing.access_states
  set pages_paused_at = null, updated_at = now()
  where workspace_id = p_workspace_id;

  update kardo_core.workspaces set
    name = 'Organización eliminada',
    profile = '{}'::jsonb,
    lead_retention_days = null,
    deleted_at = now(),
    updated_at = now()
  where id = p_workspace_id;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, reason, metadata
  ) values (
    p_workspace_id, null, 'service', 'workspace.deleted', 'workspace', p_workspace_id,
    'succeeded', btrim(p_reason), v_counts || jsonb_build_object('cleanupItems', v_cleanup)
  );

  return jsonb_build_object('status', 'deleted', 'counts', v_counts, 'cleanupItems', v_cleanup);
end;
$$;
revoke all on function kardo_private.erase_workspace_data(uuid, text) from public;
