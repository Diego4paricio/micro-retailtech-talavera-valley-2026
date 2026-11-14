-- Datos fiscales y cola de CFDI, fase 1 manual (ADR 020 §6, relevo 18 §4.4,
-- Docs/fiscal/2026-09-29-guia-fiscal-kardo.md §5).
--
-- Los datos fiscales son opcionales: nunca se piden en el alta ni en la
-- prueba, y nunca se pide el documento de la Constancia de Situacion Fiscal
-- (CFF 83 fr. IX), solo los datos. Quien quiere factura:
--   - guarda sus datos en Configuracion, Plan ("Datos de facturacion");
--   - pide la factura de un pago del mes en curso, o activa "factura de cada
--     pago" y la tarea de sincronizacion la pide sola al pagarse cada factura.
-- Staff emite el CFDI a mano en "Genera tu factura" del SAT y lo marca como
-- emitido con el folio fiscal (UUID). Lo no solicitado va a la factura
-- global mensual (Operations lista esos pagos).
--
-- Las claves de c_RegimenFiscal y c_UsoCFDI son las del catalogo del SAT
-- para CFDI 4.0; la guia fiscal las marca "no verificadas" hoy contra el
-- catalogo oficial: revisar antes de emitir en vivo.

create table if not exists kardo_billing.fiscal_profiles (
  workspace_id uuid primary key references kardo_core.workspaces(id) on delete cascade,
  -- 12 caracteres persona moral, 13 persona fisica; nunca los genericos.
  rfc text not null check (
    rfc ~ '^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$'
    and rfc not in ('XAXX010101000', 'XEXX010101000')
  ),
  legal_name text not null check (char_length(btrim(legal_name)) between 1 and 300),
  tax_regime text not null check (tax_regime in (
    '601', '603', '605', '606', '607', '608', '610', '611', '612', '614', '615',
    '616', '620', '621', '622', '623', '624', '625', '626'
  )),
  postal_code text not null check (postal_code ~ '^[0-9]{5}$'),
  cfdi_use text not null check (cfdi_use in (
    'G01', 'G02', 'G03', 'I01', 'I02', 'I03', 'I04', 'I05', 'I06', 'I07', 'I08',
    'D01', 'D02', 'D03', 'D04', 'D05', 'D06', 'D07', 'D08', 'D09', 'D10',
    'S01', 'CP01', 'CN01'
  )),
  email text not null check (email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' and char_length(email) <= 320),
  -- Pedir el CFDI de cada pago automaticamente.
  invoice_each_payment boolean not null default false,
  updated_by uuid references kardo_core.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);
create index if not exists billing_fiscal_profiles_updated_by_idx
  on kardo_billing.fiscal_profiles (updated_by);

create table if not exists kardo_billing.cfdi_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  stripe_invoice_id text not null references kardo_billing.invoices(stripe_invoice_id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'issued', 'rejected', 'canceled')),
  -- Los datos fiscales tal como estaban al pedirla (el CFDI se emite con esos).
  fiscal_snapshot jsonb not null check (jsonb_typeof(fiscal_snapshot) = 'object' and pg_column_size(fiscal_snapshot) <= 2048),
  -- null: la pidio "factura de cada pago".
  requested_by uuid references kardo_core.profiles(id) on delete set null,
  requested_at timestamptz not null default now(),
  issued_at timestamptz,
  -- Folio fiscal del SAT.
  sat_uuid text check (sat_uuid is null or sat_uuid ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'),
  notes text check (notes is null or char_length(notes) <= 500),
  handled_by uuid references kardo_staff.staff_profiles(id) on delete set null,
  handled_at timestamptz,
  constraint cfdi_requests_issued_uuid check (status <> 'issued' or (sat_uuid is not null and issued_at is not null))
);
-- Una solicitud viva por pago: pendiente o emitida.
create unique index if not exists billing_cfdi_requests_invoice_open
  on kardo_billing.cfdi_requests (stripe_invoice_id) where status in ('pending', 'issued');
create index if not exists billing_cfdi_requests_status_idx
  on kardo_billing.cfdi_requests (status, requested_at);
create index if not exists billing_cfdi_requests_workspace_idx
  on kardo_billing.cfdi_requests (workspace_id, requested_at desc);
create index if not exists billing_cfdi_requests_requested_by_idx
  on kardo_billing.cfdi_requests (requested_by);
create index if not exists billing_cfdi_requests_handled_by_idx
  on kardo_billing.cfdi_requests (handled_by);

alter table kardo_billing.fiscal_profiles enable row level security;
alter table kardo_billing.cfdi_requests enable row level security;

-- Owner y Admin ven los datos y las solicitudes de su organizacion; escriben
-- solo por funcion.
do $$
declare
  target text;
begin
  foreach target in array array['fiscal_profiles', 'cfdi_requests'] loop
    execute format('drop policy if exists %I on kardo_billing.%I', 'customer api billing fiscal read', target);
    execute format(
      'create policy %I on kardo_billing.%I for select to kardo_customer_api using (kardo_private.workspace_role(workspace_id) in (''owner'', ''admin''))',
      'customer api billing fiscal read', target
    );
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

grant select on kardo_billing.fiscal_profiles, kardo_billing.cfdi_requests
  to kardo_customer_api, kardo_staff_api;
grant select on kardo_billing.fiscal_profiles to kardo_billing_sync;
grant select, insert on kardo_billing.cfdi_requests to kardo_billing_sync;

-- Aviso nuevo: CFDI emitido.
alter table kardo_billing.notices drop constraint if exists notices_kind_check;
alter table kardo_billing.notices add constraint notices_kind_check check (kind in (
  'subscription_started', 'renewal_upcoming', 'trial_ending', 'cancellation_confirmed',
  'trial_started', 'trial_reminder', 'trial_ended',
  'plan_ended', 'pause_upcoming', 'pages_paused', 'deletion_upcoming', 'courtesy_ending',
  'cfdi_issued'
));

-- ---------------------------------------------------------------------------
-- Funciones del cliente (Owner y Admin)
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
begin
  if v_subject is null
    or kardo_private.workspace_role(p_workspace_id) not in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  begin
    insert into kardo_billing.fiscal_profiles (
      workspace_id, rfc, legal_name, tax_regime, postal_code, cfdi_use, email,
      invoice_each_payment, updated_by, updated_at
    ) values (
      p_workspace_id, upper(btrim(p_rfc)), btrim(p_legal_name), btrim(p_tax_regime),
      btrim(p_postal_code), upper(btrim(p_cfdi_use)), lower(btrim(p_email)),
      coalesce(p_invoice_each_payment, false), v_subject, now()
    )
    on conflict (workspace_id) do update set
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
revoke all on function kardo_private.upsert_fiscal_profile(uuid, text, text, text, text, text, text, boolean) from public;
grant execute on function kardo_private.upsert_fiscal_profile(uuid, text, text, text, text, text, text, boolean) to kardo_customer_api;

-- Borra los datos fiscales (derecho de cancelacion, LFPDPPP). Las
-- solicitudes ya hechas conservan su copia: el CFDI emitido es obligatorio.
create or replace function kardo_private.delete_fiscal_profile(p_workspace_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
begin
  if v_subject is null
    or kardo_private.workspace_role(p_workspace_id) not in ('owner', 'admin') then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  delete from kardo_billing.fiscal_profiles where workspace_id = p_workspace_id;
  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    p_workspace_id, v_subject, 'customer', 'billing.fiscal_profile_deleted', 'workspace',
    p_workspace_id, 'succeeded', '{}'::jsonb
  );
end;
$$;
revoke all on function kardo_private.delete_fiscal_profile(uuid) from public;
grant execute on function kardo_private.delete_fiscal_profile(uuid) to kardo_customer_api;

-- Pide el CFDI de un pago del mes en curso (hora de Mexico). Devuelve el id
-- de la solicitud (la existente si ya estaba pendiente o emitida).
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
  v_profile kardo_billing.fiscal_profiles;
  v_paid_at timestamptz;
  v_existing uuid;
  v_id uuid;
begin
  if v_subject is null
    or kardo_private.workspace_role(p_workspace_id) not in ('owner', 'admin') then
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
  select * into v_profile from kardo_billing.fiscal_profiles where workspace_id = p_workspace_id;
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
    workspace_id, stripe_invoice_id, fiscal_snapshot, requested_by
  ) values (
    p_workspace_id, p_invoice_id,
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
revoke all on function kardo_private.request_cfdi(uuid, text) from public;
grant execute on function kardo_private.request_cfdi(uuid, text) to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- Staff: marcar emitida, rechazada o cancelada
-- ---------------------------------------------------------------------------

create or replace function kardo_private.resolve_cfdi_request(
  p_request_id uuid,
  p_status text,
  p_sat_uuid text,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_staff uuid := kardo_private.current_staff_subject();
  v_request kardo_billing.cfdi_requests;
  v_invoice kardo_billing.invoices;
  v_name text;
begin
  if v_staff is null or not kardo_private.staff_has_permission('billing.write') then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_status not in ('issued', 'rejected', 'canceled') then
    raise exception using errcode = 'P0001', message = 'INVALID_STATUS';
  end if;
  if p_status = 'issued' and (p_sat_uuid is null
    or btrim(p_sat_uuid) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception using errcode = 'P0001', message = 'INVALID_SAT_UUID';
  end if;
  if p_status in ('rejected', 'canceled') and (p_notes is null or char_length(btrim(p_notes)) < 3) then
    raise exception using errcode = 'P0001', message = 'INVALID_REASON';
  end if;
  if p_notes is not null and char_length(p_notes) > 500 then
    raise exception using errcode = 'P0001', message = 'INVALID_REASON';
  end if;

  select * into v_request from kardo_billing.cfdi_requests where id = p_request_id for update;
  if v_request.id is null then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  -- pendiente -> emitida o rechazada; emitida -> cancelada (se cancelo en el SAT).
  if not (
    (v_request.status = 'pending' and p_status in ('issued', 'rejected'))
    or (v_request.status = 'issued' and p_status = 'canceled')
  ) then
    raise exception using errcode = 'P0001', message = 'INVALID_TRANSITION';
  end if;

  update kardo_billing.cfdi_requests set
    status = p_status,
    sat_uuid = case when p_status = 'issued' then lower(btrim(p_sat_uuid)) else sat_uuid end,
    issued_at = case when p_status = 'issued' then now() else issued_at end,
    notes = nullif(btrim(coalesce(p_notes, '')), ''),
    handled_by = v_staff,
    handled_at = now()
  where id = p_request_id;

  if p_status = 'issued' then
    select * into v_invoice from kardo_billing.invoices where stripe_invoice_id = v_request.stripe_invoice_id;
    select w.name into v_name from kardo_core.workspaces w where w.id = v_request.workspace_id;
    insert into kardo_billing.notices (workspace_id, kind, dedupe_key, payload)
    values (
      v_request.workspace_id, 'cfdi_issued', 'cfdi_issued:' || p_request_id::text,
      jsonb_build_object(
        'workspaceName', coalesce(v_name, 'Tu organización'),
        'planName', 'Kardo',
        'amount', v_invoice.amount_paid,
        'currency', coalesce(v_invoice.currency, 'mxn'),
        'interval', null,
        'invoiceNumber', v_invoice.number,
        'paidAt', v_invoice.paid_at,
        'satUuid', lower(btrim(p_sat_uuid)),
        'fiscalEmail', v_request.fiscal_snapshot->>'email'
      )
    )
    on conflict (dedupe_key) do nothing;
  end if;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, reason, metadata
  ) values (
    v_request.workspace_id, v_staff, 'staff', 'billing.cfdi_' || p_status, 'cfdi_request',
    p_request_id, 'succeeded', nullif(btrim(coalesce(p_notes, '')), ''),
    jsonb_build_object('invoiceId', v_request.stripe_invoice_id, 'satUuid', lower(btrim(coalesce(p_sat_uuid, ''))))
  );
end;
$$;
revoke all on function kardo_private.resolve_cfdi_request(uuid, text, text, text) from public;
grant execute on function kardo_private.resolve_cfdi_request(uuid, text, text, text) to kardo_staff_api;
