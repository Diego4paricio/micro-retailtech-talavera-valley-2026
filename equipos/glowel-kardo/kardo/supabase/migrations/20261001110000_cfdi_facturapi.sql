-- CFDI con Facturapi (ADR 020 §6, fase 2 adelantada en modo prueba; relevo
-- 20, T5). Operations emite la factura de una solicitud pendiente con
-- Facturapi y la marca emitida con su folio fiscal; el Customer API y el
-- Staff API descargan el PDF y el XML de Facturapi con su id. La fase 1
-- (portal del SAT, folio a mano) sigue igual: proveedor `manual`.

alter table kardo_billing.cfdi_requests
  add column if not exists provider text
    check (provider is null or provider in ('manual', 'facturapi')),
  add column if not exists provider_invoice_id text
    check (provider_invoice_id is null or provider_invoice_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  -- false: CFDI de prueba de Facturapi, sin validez fiscal (no se timbro ante el SAT).
  add column if not exists provider_livemode boolean,
  add constraint cfdi_requests_provider_invoice check (
    provider is distinct from 'facturapi'
    or (provider_invoice_id is not null and provider_livemode is not null)
  );

-- Marca emitida una solicitud pendiente con un CFDI de Facturapi. Mismas
-- reglas, aviso `cfdi_issued` y auditoria que la emision manual.
create or replace function kardo_private.issue_cfdi_with_provider(
  p_request_id uuid,
  p_sat_uuid text,
  p_provider_invoice_id text,
  p_livemode boolean,
  p_notes text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_provider_invoice_id is null or p_provider_invoice_id !~ '^[A-Za-z0-9_-]{6,64}$' or p_livemode is null then
    raise exception using errcode = 'P0001', message = 'INVALID_PROVIDER_INVOICE';
  end if;
  perform kardo_private.resolve_cfdi_request(p_request_id, 'issued', p_sat_uuid, p_notes);
  update kardo_billing.cfdi_requests set
    provider = 'facturapi',
    provider_invoice_id = p_provider_invoice_id,
    provider_livemode = p_livemode
  where id = p_request_id;
  -- El aviso dice que el PDF y el XML estan en el panel (y si es de prueba).
  update kardo_billing.notices set
    payload = payload || jsonb_build_object('cfdiInPanel', true, 'cfdiTest', not p_livemode)
  where dedupe_key = 'cfdi_issued:' || p_request_id::text and status = 'pending';
end;
$$;
revoke all on function kardo_private.issue_cfdi_with_provider(uuid, text, text, boolean, text) from public;
grant execute on function kardo_private.issue_cfdi_with_provider(uuid, text, text, boolean, text) to kardo_staff_api;
