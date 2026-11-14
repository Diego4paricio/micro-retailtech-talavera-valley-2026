import type {
  CfdiRequest,
  FiscalProfile,
  UpsertFiscalProfile,
  WorkspaceFiscal,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  ApiError,
  ConflictError,
  NotFoundError,
  WorkspaceAccessError,
} from "../errors.js";
import {
  type CustomerIdentity,
  requireMembershipWithPermission,
  withCustomerContext,
} from "../repositories/context.js";

// ---------------------------------------------------------------------------
// Datos fiscales y solicitudes de CFDI (ADR 020 §6, fase 1 manual). Solo el
// titular de la cuenta (ADR 024) lee y escribe: la factura es suya, no de
// quien administra la organización (ver `requireAccountHolder`). Las
// escrituras pasan por funciones SECURITY DEFINER que validan y auditan.
// Nunca se pide la Constancia, solo los datos (CFF 83 fr. IX). Funciona en
// cualquier estado de acceso.
// ---------------------------------------------------------------------------

export type FiscalRepository = {
  get(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<WorkspaceFiscal>;
  save(
    identity: CustomerIdentity,
    workspaceId: string,
    input: UpsertFiscalProfile,
  ): Promise<WorkspaceFiscal>;
  remove(
    identity: CustomerIdentity,
    workspaceId: string,
  ): Promise<WorkspaceFiscal>;
  requestCfdi(
    identity: CustomerIdentity,
    workspaceId: string,
    invoiceId: string,
  ): Promise<CfdiRequest>;
  /** The Facturapi CFDI of an issued request, to download its PDF or XML
   * (Owner and Admin). Null when it has no document. */
  cfdiDocument(
    identity: CustomerIdentity,
    workspaceId: string,
    requestId: string,
  ): Promise<{ providerInvoiceId: string; test: boolean } | null>;
};

type ProfileRow = {
  rfc: string;
  legal_name: string;
  tax_regime: FiscalProfile["taxRegime"];
  postal_code: string;
  cfdi_use: FiscalProfile["cfdiUse"];
  email: string;
  invoice_each_payment: boolean;
  updated_at: Date;
};

type RequestRow = {
  id: string;
  stripe_invoice_id: string;
  status: CfdiRequest["status"];
  requested_at: Date;
  issued_at: Date | null;
  sat_uuid: string | null;
  notes: string | null;
  requested_by: string | null;
  provider: "manual" | "facturapi" | null;
  provider_livemode: boolean | null;
};

const iso = (value: Date | null): string | null =>
  value ? new Date(value).toISOString() : null;

function toRequest(row: RequestRow): CfdiRequest {
  return {
    id: row.id,
    invoiceId: row.stripe_invoice_id,
    status: row.status,
    requestedAt: new Date(row.requested_at).toISOString(),
    issuedAt: iso(row.issued_at),
    satUuid: row.sat_uuid,
    notes: row.notes,
    automatic: row.requested_by === null,
    document:
      row.provider === "facturapi" && row.status !== "pending"
        ? { provider: "facturapi", test: row.provider_livemode !== true }
        : null,
  };
}

async function readFiscal(
  tx: Sql,
  workspaceId: string,
): Promise<WorkspaceFiscal> {
  // One RFC per account (ADR 024): read the account's profile, wherever it
  // was saved from, so every organization of the holder shows the same data.
  // Only the holder reaches here (the route checks `requireAccountHolder`).
  const [profile] = await tx<ProfileRow[]>`
    select rfc, legal_name, tax_regime, postal_code, cfdi_use, email,
      invoice_each_payment, updated_at
    from kardo_billing.fiscal_profiles f
    where f.account_id = (
        select w.billing_account_id from kardo_core.workspaces w
        where w.id = ${workspaceId}::uuid
      )
      or (f.account_id is null and f.workspace_id = ${workspaceId}::uuid)
    -- Prefer the account-scoped row and read exactly one, in case a legacy
    -- null-account row lingers for this workspace (code review of 3255ddb).
    order by (f.account_id is not null) desc
    limit 1
  `;
  const requests = await tx<RequestRow[]>`
    select id, stripe_invoice_id, status, requested_at, issued_at, sat_uuid,
      notes, requested_by, provider, provider_livemode
    from kardo_billing.cfdi_requests
    where workspace_id = ${workspaceId}::uuid
    order by requested_at desc
    limit 50
  `;
  const requestable = await tx<{ stripe_invoice_id: string }[]>`
    select i.stripe_invoice_id
    from kardo_billing.invoices i
    where i.workspace_id = ${workspaceId}::uuid
      and i.status = 'paid' and i.amount_paid > 0
      and date_trunc('month', i.paid_at at time zone 'America/Mexico_City')
        = date_trunc('month', now() at time zone 'America/Mexico_City')
      and not exists (
        select 1 from kardo_billing.cfdi_requests r
        where r.stripe_invoice_id = i.stripe_invoice_id
          and r.status in ('pending', 'issued')
      )
    order by i.paid_at desc
    limit 24
  `;
  return {
    profile: profile
      ? {
          rfc: profile.rfc,
          legalName: profile.legal_name,
          taxRegime: profile.tax_regime,
          postalCode: profile.postal_code,
          cfdiUse: profile.cfdi_use,
          email: profile.email,
          invoiceEachPayment: profile.invoice_each_payment,
          updatedAt: new Date(profile.updated_at).toISOString(),
        }
      : null,
    requests: requests.map(toRequest),
    requestableInvoiceIds: requestable.map((row) => row.stripe_invoice_id),
  };
}

/** `P0001` messages raised by the fiscal functions → API errors. */
function fiscalError(error: unknown): never {
  const message = error instanceof Error ? error.message : "";
  if (message.includes("FORBIDDEN")) throw new WorkspaceAccessError();
  if (message.includes("INVALID_FISCAL_PROFILE")) {
    throw new ApiError(
      "INVALID_FISCAL_PROFILE",
      400,
      "The fiscal data is not valid.",
    );
  }
  if (message.includes("INVOICE_NOT_PAID")) {
    throw new NotFoundError("The payment was not found.");
  }
  if (
    message.includes("CFDI_PERIOD_CLOSED") ||
    message.includes("FISCAL_PROFILE_REQUIRED")
  ) {
    throw new ConflictError(
      "BILLING_CONFLICT",
      message.includes("CFDI_PERIOD_CLOSED")
        ? "Only payments of the current month can request an invoice."
        : "Add the fiscal data first.",
    );
  }
  throw error;
}

/**
 * ADR 024: the plan — and so the fiscal data and the CFDIs of the payments —
 * belong to the account holder, who may not be the organization's Owner or
 * Admin. `billing.read` alone let a non-holder Admin read the holder's RFC and
 * email and, worse, set their own RFC and `invoiceEachPayment` so the holder's
 * payments were invoiced in the Admin's name — an issued CFDI is hard to undo
 * (security review 2026-10-12). Require the holder for every fiscal operation.
 * A personal account has no separate billing account, so its sole owner passes.
 */
async function requireAccountHolder(
  tx: Sql,
  workspaceId: string,
): Promise<void> {
  const [row] = await tx<{ account_id: string | null; holder: boolean }[]>`
    select w.billing_account_id as account_id,
      kardo_billing.is_account_holder(w.billing_account_id) as holder
    from kardo_core.workspaces w where w.id = ${workspaceId}::uuid
  `;
  if (row?.account_id && row.holder !== true) throw new WorkspaceAccessError();
}

export function createPostgresFiscalRepository(sql: Sql): FiscalRepository {
  return {
    get(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "billing.read",
        );
        await requireAccountHolder(tx, workspaceId);
        return readFiscal(tx, workspaceId);
      });
    },

    save(identity, workspaceId, input) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "billing.read",
        );
        await requireAccountHolder(tx, workspaceId);
        await tx`
          select kardo_private.upsert_fiscal_profile(
            ${workspaceId}::uuid, ${input.rfc}, ${input.legalName}, ${input.taxRegime},
            ${input.postalCode}, ${input.cfdiUse}, ${input.email}, ${input.invoiceEachPayment}
          )
        `.catch(fiscalError);
        return readFiscal(tx, workspaceId);
      });
    },

    remove(identity, workspaceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "billing.read",
        );
        await requireAccountHolder(tx, workspaceId);
        await tx`select kardo_private.delete_fiscal_profile(${workspaceId}::uuid)`.catch(
          fiscalError,
        );
        return readFiscal(tx, workspaceId);
      });
    },

    requestCfdi(identity, workspaceId, invoiceId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "billing.read",
        );
        await requireAccountHolder(tx, workspaceId);
        const [created] = await tx<{ id: string }[]>`
          select kardo_private.request_cfdi(${workspaceId}::uuid, ${invoiceId}) as id
        `.catch(fiscalError);
        const [row] = await tx<RequestRow[]>`
          select id, stripe_invoice_id, status, requested_at, issued_at, sat_uuid,
            notes, requested_by, provider, provider_livemode
          from kardo_billing.cfdi_requests where id = ${created?.id ?? null}::uuid
        `;
        if (!row) throw new NotFoundError("The invoice request was not found.");
        return toRequest(row);
      });
    },
    cfdiDocument(identity, workspaceId, requestId) {
      return withCustomerContext(sql, identity, async (tx) => {
        await requireMembershipWithPermission(
          tx,
          identity,
          workspaceId,
          "billing.read",
        );
        await requireAccountHolder(tx, workspaceId);
        const [row] = await tx<
          { provider_invoice_id: string; provider_livemode: boolean }[]
        >`
          select provider_invoice_id, provider_livemode
          from kardo_billing.cfdi_requests
          where id = ${requestId}::uuid and workspace_id = ${workspaceId}::uuid
            and provider = 'facturapi' and status in ('issued', 'canceled')
        `;
        return row
          ? {
              providerInvoiceId: row.provider_invoice_id,
              test: row.provider_livemode !== true,
            }
          : null;
      });
    },
  };
}

export function unavailableFiscalRepository(): FiscalRepository {
  const unavailable = () =>
    Promise.reject(
      new ApiError(
        "BILLING_UNAVAILABLE",
        503,
        "Billing is not configured in this environment.",
      ),
    );
  return {
    get: unavailable,
    save: unavailable,
    remove: unavailable,
    requestCfdi: unavailable,
    cfdiDocument: unavailable,
  };
}
