import {
  type BillingGateway,
  BillingGatewayError,
  type BillingSync,
  cents,
  type DeletionMode,
  type FacturapiDocument,
  FacturapiError,
  type FacturapiInvoice,
  type FacturapiInvoiceInput,
  type FacturapiIssuer,
  type InvoiceRow,
  invoiceColumns,
  readWorkspaceAccess,
  readWorkspaceTrial,
  type SubscriptionRow,
  subscriptionColumns,
  toMirroredInvoice,
  toMirroredSubscription,
} from "@kardo/billing";
import {
  type CfdiDocumentFormat,
  type StaffAccessFilter,
  type StaffAccessWorkspace,
  type StaffAccountingMonth,
  type StaffBillingAccount,
  type StaffBillingCancel,
  type StaffBillingEvent,
  type StaffBillingOverview,
  type StaffBillingSubscriptionPage,
  type StaffCfdiRequest,
  type StaffCfdiRequestList,
  type StaffGlobalInvoice,
  type StaffPermission,
  type StaffResolveCfdi,
  type StaffWorkspaceBilling,
  type StaffWorkspaceDeletion,
  staffAccessFilters,
  staffPermissions,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import {
  type AccessReconcile,
  noopAccessReconcile,
} from "../clients/access-reconcile.js";
import {
  containsPattern,
  insertStaffAuditEvent,
  requireStaffPermission,
  withStaffContext,
} from "../http/context.js";
import {
  StaffBillingConflictError,
  StaffBillingUnavailableError,
  StaffConflictError,
  StaffDependencyError,
  StaffNotFoundError,
  StaffPermissionError,
  StaffRepositoryError,
  StaffValidationError,
} from "../http/errors.js";
import { type AccountingRequest, buildAccountingMonth } from "./accounting.js";

// ---------------------------------------------------------------------------
// Suscripciones en Operations (ADR 019). Reads use the staff role and RLS
// (`billing.read`); every action goes through the Stripe API first and then
// mirrors Stripe's answer with `@kardo/billing`'s sync, so the panel shows
// the new state at once and the webhook that follows changes nothing.
// ---------------------------------------------------------------------------

export type SubscriptionFilter = {
  status?: string;
  plan?: string;
  q?: string;
  cursor?: string;
  limit?: number;
};

export type StaffBillingRepository = {
  overview(subject: string): Promise<StaffBillingOverview>;
  listSubscriptions(
    subject: string,
    filter: SubscriptionFilter,
  ): Promise<StaffBillingSubscriptionPage>;
  listEvents(
    subject: string,
    status: "failed" | "all",
  ): Promise<StaffBillingEvent[]>;
  workspaceBilling(
    subject: string,
    workspaceId: string,
  ): Promise<StaffWorkspaceBilling>;
  cancel(
    subject: string,
    subscriptionId: string,
    input: StaffBillingCancel,
  ): Promise<StaffWorkspaceBilling>;
  resume(
    subject: string,
    subscriptionId: string,
    reason: string,
  ): Promise<StaffWorkspaceBilling>;
  extendTrial(
    subject: string,
    subscriptionId: string,
    days: number,
    reason: string,
  ): Promise<StaffWorkspaceBilling>;
  resync(
    subject: string,
    subscriptionId: string,
    reason: string,
  ): Promise<StaffWorkspaceBilling>;
  refund(
    subject: string,
    invoiceId: string,
    input: { amount?: number; reason: string },
  ): Promise<StaffWorkspaceBilling>;
  syncCatalog(
    subject: string,
  ): Promise<{ prices: number; mappedToPlans: number }>;
  /** Organizations by access state (ADR 020 §4 and §8), at most 200. */
  listAccess(
    subject: string,
    filter: StaffAccessFilter,
  ): Promise<StaffAccessWorkspace[]>;
  /** Marks or unmarks an internal/demo organization (`billing.write`). */
  setInternal(
    subject: string,
    workspaceId: string,
    internal: boolean,
    reason: string,
  ): Promise<StaffWorkspaceBilling>;
  /** Extends or reopens the Kardo trial (`billing.write`). */
  extendKardoTrial(
    subject: string,
    workspaceId: string,
    days: number,
    reason: string,
  ): Promise<StaffWorkspaceBilling>;
  /** CFDI queue (phase 1, manual): `billing.read`, at most 200. */
  listCfdiRequests(
    subject: string,
    status: CfdiListStatus,
  ): Promise<StaffCfdiRequestList>;
  /** Marks a CFDI request issued, rejected or canceled (`billing.write`). */
  resolveCfdiRequest(
    subject: string,
    requestId: string,
    input: StaffResolveCfdi,
  ): Promise<StaffCfdiRequest>;
  /** Issues a pending request with Facturapi and marks it issued with its
   * SAT folio (`billing.write`; ADR 020 §6, phase 2). */
  issueCfdiWithFacturapi(
    subject: string,
    requestId: string,
    input: { paymentForm: "04" | "28" },
  ): Promise<StaffCfdiRequest>;
  /** PDF or XML of a CFDI issued with Facturapi (`billing.read`). */
  cfdiDocument(
    subject: string,
    requestId: string,
    format: CfdiDocumentFormat,
  ): Promise<FacturapiDocument>;
  /** Payments of a month (Mexico City) without a live CFDI (`billing.read`). */
  globalInvoice(subject: string, month?: string): Promise<StaffGlobalInvoice>;
  /** The month for the accountant: every payment in exactly one path (CFDI
   * individual or global), IVA broken out, refunds and the Stripe
   * reconciliation (`billing.read`, audited). */
  accountingMonth(
    subject: string,
    month?: string,
  ): Promise<StaffAccountingMonth>;
};

export type CfdiListStatus = "pending" | "issued" | "rejected" | "canceled";

export function unavailableStaffBillingRepository(): StaffBillingRepository {
  const unavailable = () => Promise.reject(new StaffRepositoryError());
  return {
    overview: unavailable,
    listSubscriptions: unavailable,
    listEvents: unavailable,
    workspaceBilling: unavailable,
    cancel: unavailable,
    resume: unavailable,
    extendTrial: unavailable,
    resync: unavailable,
    refund: unavailable,
    syncCatalog: unavailable,
    listAccess: unavailable,
    setInternal: unavailable,
    extendKardoTrial: unavailable,
    listCfdiRequests: unavailable,
    resolveCfdiRequest: unavailable,
    issueCfdiWithFacturapi: unavailable,
    cfdiDocument: unavailable,
    globalInvoice: unavailable,
    accountingMonth: unavailable,
  };
}

const SUBSCRIPTION_STATUSES = new Set([
  "incomplete",
  "incomplete_expired",
  "trialing",
  "active",
  "past_due",
  "canceled",
  "unpaid",
  "paused",
]);

const SUBSCRIPTION_ID = /^sub_[A-Za-z0-9]{6,64}$/;

function encodeCursor(createdAt: Date, id: string): string {
  return Buffer.from(`${createdAt.toISOString()}|${id}`, "utf8").toString(
    "base64url",
  );
}

function decodeCursor(token: string): { createdAt: string; id: string } {
  const decoded = Buffer.from(token, "base64url").toString("utf8");
  const separator = decoded.lastIndexOf("|");
  const createdAt = decoded.slice(0, separator);
  const id = decoded.slice(separator + 1);
  if (
    separator < 0 ||
    Number.isNaN(new Date(createdAt).getTime()) ||
    !SUBSCRIPTION_ID.test(id)
  ) {
    throw new StaffValidationError("The pagination cursor is invalid.");
  }
  return { createdAt, id };
}

/** The database raises `P0001` with a fixed message for expected refusals. */
function mapAccessFunctionError(error: unknown): never {
  const failure = error as { code?: string; message?: string } | null;
  if (failure?.code === "P0001") {
    switch (failure.message) {
      case "FORBIDDEN":
        throw new StaffPermissionError();
      case "NOT_FOUND":
        throw new StaffNotFoundError("Workspace was not found.");
      case "INVALID_REASON":
        throw new StaffValidationError("The reason is not valid.");
      case "INVALID_TRIAL_DAYS":
        throw new StaffValidationError("The trial days are not valid.");
    }
  }
  throw error;
}

/**
 * Issues the CFDI of one request with Facturapi, or reuses the one already
 * issued for it. The request id travels as Facturapi's `external_id`, so a
 * retry after a timeout, a crash or a failed write in Kardo finds the
 * invoice instead of stamping a second one; `idempotency_key` covers two
 * attempts racing each other. Each failed or canceled invoice of the request
 * spent its own key, so a fresh attempt gets a new one.
 */
async function issueOrReuse(
  facturapi: FacturapiIssuer,
  externalId: string,
  input: FacturapiInvoiceInput,
): Promise<FacturapiInvoice> {
  const usable = (invoices: FacturapiInvoice[]) =>
    invoices.find((invoice) => invoice.status === "valid") ??
    invoices.find((invoice) => invoice.status === "pending");
  const previous = await facturapi.findByExternalId(externalId);
  const found = usable(previous);
  if (found) return found;
  try {
    return await facturapi.createInvoice({
      ...input,
      externalId,
      idempotencyKey: `${externalId}-${previous.length}`,
    });
  } catch (error) {
    if (error instanceof FacturapiError && error.status === 409) {
      const raced = usable(await facturapi.findByExternalId(externalId));
      if (raced) return raced;
    }
    throw error;
  }
}

/** Expected refusals of `kardo_private.resolve_cfdi_request`. */
function mapCfdiFunctionError(error: unknown): never {
  const failure = error as { code?: string; message?: string } | null;
  if (failure?.code === "P0001") {
    switch (failure.message) {
      case "FORBIDDEN":
        throw new StaffPermissionError();
      case "NOT_FOUND":
        throw new StaffNotFoundError("The CFDI request was not found.");
      case "INVALID_STATUS":
        throw new StaffValidationError("The status is not valid.");
      case "INVALID_SAT_UUID":
        throw new StaffValidationError("The SAT folio (UUID) is not valid.");
      case "INVALID_REASON":
        throw new StaffValidationError("The notes are not valid.");
      case "INVALID_TRANSITION":
        throw new StaffConflictError(
          "The request cannot move to that status from its current one.",
        );
    }
  }
  throw error;
}

const MONTH = /^[0-9]{4}-(0[1-9]|1[0-2])$/;
const MEXICO_TIME_ZONE = "America/Mexico_City";

/** Previous calendar month (YYYY-MM) as seen in Mexico City. */
export function previousMexicoMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: MEXICO_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);
  let year = Number(parts.find((part) => part.type === "year")?.value);
  let month = Number(parts.find((part) => part.type === "month")?.value);
  month -= 1;
  if (month === 0) {
    month = 12;
    year -= 1;
  }
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
}

/** First day of a YYYY-MM and of the month after it, as local dates. */
function monthBounds(month: string): { start: string; end: string } {
  const year = Number(month.slice(0, 4));
  const number = Number(month.slice(5, 7));
  const nextYear = number === 12 ? year + 1 : year;
  const nextMonth = number === 12 ? 1 : number + 1;
  const pad = (value: number, size: number) =>
    String(value).padStart(size, "0");
  return {
    start: `${pad(year, 4)}-${pad(number, 2)}-01`,
    end: `${pad(nextYear, 4)}-${pad(nextMonth, 2)}-01`,
  };
}

type CfdiRow = {
  id: string;
  stripe_invoice_id: string;
  status: StaffCfdiRequest["status"];
  requested_at: Date;
  issued_at: Date | null;
  sat_uuid: string | null;
  notes: string | null;
  requested_by: string | null;
  handled_at: Date | null;
  fiscal_snapshot: Record<string, unknown> | null;
  workspace_id: string;
  workspace_name: string | null;
  number: string | null;
  amount_paid: string | number | null;
  tax: string | number | null;
  currency: string | null;
  paid_at: Date | null;
  livemode: boolean | null;
  provider: "manual" | "facturapi" | null;
  provider_livemode: boolean | null;
};

function toStaffCfdiRequest(
  row: CfdiRow,
  facturapi: StaffCfdiRequest["facturapi"],
): StaffCfdiRequest {
  const snapshot = row.fiscal_snapshot ?? {};
  const text = (key: string): string => {
    const value = snapshot[key];
    return typeof value === "string" ? value : "";
  };
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
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name ?? "",
    invoiceNumber: row.number,
    amountPaid: cents(row.amount_paid ?? 0),
    tax: row.tax === null || row.tax === undefined ? null : Number(row.tax),
    currency: row.currency ?? "mxn",
    paidAt: iso(row.paid_at),
    fiscal: {
      rfc: text("rfc"),
      legalName: text("legalName"),
      taxRegime: text("taxRegime"),
      postalCode: text("postalCode"),
      cfdiUse: text("cfdiUse"),
      email: text("email"),
    },
    stripeInvoiceUrl:
      row.livemode === null
        ? null
        : `https://dashboard.stripe.com/${row.livemode ? "" : "test/"}invoices/${row.stripe_invoice_id}`,
    handledAt: iso(row.handled_at),
    facturapi,
  };
}

const iso = (value: Date | null): string | null =>
  value ? new Date(value).toISOString() : null;

const WORKSPACE_DELETED_MESSAGE = "La organización fue eliminada.";

/** Columns of a deletion record plus its pending cleanup (alias `d`). */
type DeletionColumns = {
  deletion_at: Date | null;
  deletion_reason: string | null;
  deletion_counts: Record<string, unknown> | null;
  deletion_cleanup_completed_at: Date | null;
  deletion_cleanup_pending: number | null;
  deletion_last_error: string | null;
};

const deletionColumns = (sql: Sql) => sql`
  d.deleted_at as deletion_at, d.reason as deletion_reason,
  d.counts as deletion_counts,
  d.cleanup_completed_at as deletion_cleanup_completed_at,
  (select count(*)::int from kardo_billing.deletion_cleanup c
   where c.workspace_id = d.workspace_id and c.done_at is null) as deletion_cleanup_pending,
  (select c.last_error from kardo_billing.deletion_cleanup c
   where c.workspace_id = d.workspace_id and c.done_at is null
     and c.last_error is not null
   order by c.created_at desc limit 1) as deletion_last_error
`;

function toDeletion(row: DeletionColumns): StaffWorkspaceDeletion | null {
  if (!row.deletion_at) return null;
  const counts: Record<string, number> = {};
  for (const [key, value] of Object.entries(row.deletion_counts ?? {})) {
    const count = Number(value);
    if (/^[A-Za-z]{1,40}$/.test(key) && Number.isFinite(count) && count >= 0) {
      counts[key] = Math.trunc(count);
    }
  }
  return {
    deletedAt: new Date(row.deletion_at).toISOString(),
    reason: row.deletion_reason ?? "",
    counts,
    cleanupPending: Number(row.deletion_cleanup_pending ?? 0),
    cleanupCompletedAt: iso(row.deletion_cleanup_completed_at),
    lastCleanupError: row.deletion_last_error,
  };
}

type EventRow = {
  stripe_event_id: string;
  event_type: string;
  status: StaffBillingEvent["status"];
  attempts: number;
  last_error: string | null;
  workspace_id: string | null;
  received_at: Date;
};

function toEvent(row: EventRow): StaffBillingEvent {
  return {
    id: row.stripe_event_id,
    type: row.event_type,
    status: row.status,
    attempts: row.attempts,
    lastError: row.last_error,
    workspaceId: row.workspace_id,
    receivedAt: new Date(row.received_at).toISOString(),
  };
}

function entitlementsOf(
  raw: Record<string, unknown> | null,
): StaffWorkspaceBilling["entitlements"] {
  const result: StaffWorkspaceBilling["entitlements"] = {};
  for (const [key, value] of Object.entries(raw ?? {})) {
    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isInteger(value) && value >= 0)
    ) {
      result[key] = value;
    }
  }
  return result;
}

/** Every line of a subscription (plan and extras, ADR 024), or its plan's
 * amount before lines were mirrored. Cents per period. */
const periodAmount = (sql: Sql) => sql`
  coalesce(
    (select sum(i.unit_amount * i.quantity) from kardo_billing.subscription_items i
     where i.stripe_subscription_id = s.stripe_subscription_id),
    s.unit_amount
  )
`;

/** Monthly-normalized amount of a subscription row, in cents. */
const monthlyAmount = (sql: Sql) => sql`
  case s.billing_interval
    when 'year' then ${periodAmount(sql)} / (12.0 * coalesce(s.interval_count, 1))
    when 'month' then ${periodAmount(sql)} / (1.0 * coalesce(s.interval_count, 1))
    when 'week' then ${periodAmount(sql)} * 52 / (12.0 * coalesce(s.interval_count, 1))
    when 'day' then ${periodAmount(sql)} * 365 / (12.0 * coalesce(s.interval_count, 1))
    else 0
  end
`;

export function createPostgresStaffBillingRepository(options: {
  sql: Sql;
  gateway: BillingGateway | null;
  sync: BillingSync | null;
  /** Best-effort pause/resume of public pages after a change commits. */
  reconcile?: AccessReconcile;
  /** Clock, for the default month of the global invoice. */
  now?: () => Date;
  /** Automatic deletion mode (`BILLING_DELETE_ENABLED`). */
  deletionMode?: DeletionMode;
  /** CFDI with Facturapi (FACTURAPI_KEY); null: manual issuance only. */
  facturapi?: FacturapiIssuer | null;
}): StaffBillingRepository {
  const { sql, gateway, sync } = options;
  const reconcile = options.reconcile ?? noopAccessReconcile;
  const livemode = gateway?.livemode ?? false;
  const now = options.now ?? (() => new Date());
  const deletionMode = options.deletionMode ?? "off";
  const facturapi = options.facturapi ?? null;
  const facturapiMode: StaffCfdiRequest["facturapi"] = facturapi
    ? facturapi.livemode
      ? "live"
      : "test"
    : null;
  const toCfdi = (row: CfdiRow) => toStaffCfdiRequest(row, facturapiMode);

  /** Deleted organizations accept no staff action (409). */
  async function rejectDeleted(tx: Sql, workspaceId: string): Promise<void> {
    const [row] = await tx<{ deleted_at: Date | null }[]>`
      select deleted_at from kardo_core.workspaces
      where id = ${workspaceId}::uuid
    `;
    if (row?.deleted_at) {
      throw new StaffConflictError(WORKSPACE_DELETED_MESSAGE);
    }
  }

  const cfdiSelect = (tx: Sql) => tx`
    select r.id, r.stripe_invoice_id, r.status, r.requested_at, r.issued_at,
      r.sat_uuid, r.notes, r.requested_by, r.handled_at, r.fiscal_snapshot,
      r.workspace_id, w.name as workspace_name, i.number, i.amount_paid, i.tax,
      i.currency, i.paid_at, i.livemode, r.provider, r.provider_livemode
    from kardo_billing.cfdi_requests r
    left join kardo_core.workspaces w on w.id = r.workspace_id
    left join kardo_billing.invoices i on i.stripe_invoice_id = r.stripe_invoice_id
  `;

  function requireStripe(): { gateway: BillingGateway; sync: BillingSync } {
    if (!gateway || !sync) throw new StaffBillingUnavailableError();
    return { gateway, sync };
  }

  async function readWorkspaceBilling(
    tx: Sql,
    workspaceId: string,
  ): Promise<StaffWorkspaceBilling> {
    const [workspace] = await tx<
      { name: string; account_type: "personal" | "business" | null }[]
    >`
      select name, account_type from kardo_core.workspaces where id = ${workspaceId}::uuid
    `;
    if (!workspace) throw new StaffNotFoundError("Workspace was not found.");

    // ADR 024: the person's billing account (its Customer, subscriptions
    // and invoices); before accounts, the organization's own.
    const [scope] = await tx<{ account_id: string | null }[]>`
      select billing_account_id as account_id from kardo_core.workspaces
      where id = ${workspaceId}::uuid
    `;
    const accountId = scope?.account_id ?? null;
    const owned = accountId
      ? tx`account_id = ${accountId}::uuid`
      : tx`workspace_id = ${workspaceId}::uuid`;
    const [customer] = await tx<
      {
        stripe_customer_id: string;
        livemode: boolean;
        trial_consumed_at: Date | null;
      }[]
    >`
      select stripe_customer_id, livemode, trial_consumed_at
      from kardo_billing.customers where ${owned}
      order by (livemode = ${livemode}) desc, created_at desc
      limit 1
    `;
    const [plan] = await tx<
      {
        plan_code: string;
        plan_name: string;
        source: "subscription" | "manual" | "trial" | "default";
        entitlements: Record<string, unknown> | null;
      }[]
    >`
      select plan_code, plan_name, source, entitlements
      from kardo_billing.effective_plan(${workspaceId}::uuid)
    `;
    const trial = await readWorkspaceTrial(tx, workspaceId);
    const [usageRow] = await tx<{ usage: Record<string, unknown> | null }[]>`
      select kardo_billing.workspace_usage(${workspaceId}::uuid) as usage
    `;
    const usage: Record<string, number> = {};
    for (const [key, value] of Object.entries(usageRow?.usage ?? {})) {
      const count = Number(value);
      if (Number.isFinite(count) && count >= 0) usage[key] = Math.trunc(count);
    }
    const [manual] = await tx<{ override_until: Date | null }[]>`
      select override_until from kardo_billing.account_plans
      where account_id = ${accountId}::uuid
      union all
      select override_until from kardo_core.workspace_plans
      where workspace_id = ${workspaceId}::uuid
      limit 1
    `;
    const subscriptions = await tx<SubscriptionRow[]>`
      select ${subscriptionColumns(tx)}
      from kardo_billing.subscriptions s
      left join kardo_core.plans p on p.id = s.plan_id
      where ${accountId ? tx`s.account_id = ${accountId}::uuid` : tx`s.workspace_id = ${workspaceId}::uuid`}
      order by s.stripe_created_at desc
      limit 20
    `;
    const invoices = await tx<InvoiceRow[]>`
      select ${invoiceColumns(tx)}
      from kardo_billing.invoices
      where ${owned}
      order by stripe_created_at desc
      limit 50
    `;
    const refunds = await tx<
      {
        stripe_refund_id: string;
        stripe_invoice_id: string | null;
        amount: string;
        currency: string;
        status: string;
        reason: string | null;
        created_at: Date;
      }[]
    >`
      select stripe_refund_id, stripe_invoice_id, amount, currency, status, reason, created_at
      from kardo_billing.refunds
      where workspace_id = ${workspaceId}::uuid
      order by created_at desc
      limit 50
    `;
    const events = await tx<EventRow[]>`
      select stripe_event_id, event_type, status, attempts, last_error, workspace_id, received_at
      from kardo_billing.webhook_events
      where workspace_id = ${workspaceId}::uuid
      order by received_at desc
      limit 50
    `;

    const accessRow = await readWorkspaceAccess(tx, workspaceId);
    if (!accessRow) throw new StaffNotFoundError("Workspace was not found.");
    const [pauseState] = await tx<{ pages_paused_at: Date | null }[]>`
      select pages_paused_at from kardo_billing.access_states
      where workspace_id = ${workspaceId}::uuid
    `;
    const [internalMark] = await tx<
      {
        reason: string;
        set_at: Date;
        set_by_name: string | null;
      }[]
    >`
      select i.reason, i.set_at, sp.display_name as set_by_name
      from kardo_billing.internal_workspaces i
      left join kardo_staff.staff_profiles sp on sp.id = i.set_by
      where i.workspace_id = ${workspaceId}::uuid
    `;

    const [deletionRow] = await tx<DeletionColumns[]>`
      select ${deletionColumns(tx)}
      from kardo_billing.workspace_deletions d
      where d.workspace_id = ${workspaceId}::uuid
    `;

    const notices = await tx<
      {
        id: string;
        kind: StaffWorkspaceBilling["notices"][number]["kind"];
        status: StaffWorkspaceBilling["notices"][number]["status"];
        stripe_subscription_id: string | null;
        folio: string | null;
        sent_to: string | null;
        attempts: number;
        created_at: Date;
        sent_at: Date | null;
      }[]
    >`
      select id, kind, status, stripe_subscription_id, payload->>'folio' as folio,
        sent_to, attempts, created_at, sent_at
      from kardo_billing.notices
      where workspace_id = ${workspaceId}::uuid
      order by created_at desc
      limit 50
    `;

    // ADR 024: the person's account, its organizations, extras and charge.
    let account: StaffWorkspaceBilling["account"] = null;
    if (accountId) {
      const [row] = await tx<
        {
          account: {
            holderName: string | null;
            organizationsUsed: number;
            organizationsLimit: number | null;
            extras: Record<string, number>;
            organizations: StaffBillingAccount["organizations"];
          } | null;
          email: string | null;
          monthly: string | null;
        }[]
      >`
        select kardo_billing.workspace_account(${workspaceId}::uuid) as account,
          (select p.email from kardo_billing.accounts a
           join kardo_core.profiles p on p.id = a.profile_id
           where a.id = ${accountId}::uuid) as email,
          (select round(${monthlyAmount(tx)}) from kardo_billing.subscriptions s
           where s.account_id = ${accountId}::uuid
             and s.status in ('trialing', 'active', 'past_due')
           order by s.stripe_created_at desc
           limit 1) as monthly
      `;
      const extraNames = await tx<{ code: string; name: string }[]>`
        select code, name from kardo_billing.extras order by sort_order
      `;
      if (row?.account) {
        account = {
          accountId,
          holderName: row.account.holderName,
          holderEmail: row.email,
          organizationsUsed: row.account.organizationsUsed,
          organizationsLimit: row.account.organizationsLimit,
          organizations: row.account.organizations.slice(0, 1000),
          extras: extraNames
            .filter((extra) => (row.account?.extras[extra.code] ?? 0) > 0)
            .map((extra) => ({
              code: extra.code as StaffBillingAccount["extras"][number]["code"],
              name: extra.name,
              quantity: Number(row.account?.extras[extra.code] ?? 0),
            })),
          monthlyAmount: row.monthly === null ? null : Number(row.monthly),
        };
      }
    }

    const customerLivemode = customer?.livemode ?? livemode;
    return {
      workspaceId,
      workspaceName: workspace.name,
      accountType: workspace.account_type,
      stripeCustomerId: customer?.stripe_customer_id ?? null,
      stripeDashboardUrl: customer
        ? `https://dashboard.stripe.com/${customerLivemode ? "" : "test/"}customers/${customer.stripe_customer_id}`
        : null,
      trialConsumedAt: iso(customer?.trial_consumed_at ?? null),
      trial,
      access: {
        state: accessRow.state,
        source: accessRow.source,
        lapsedAt: iso(accessRow.lapsed_at),
        graceEndsAt: iso(accessRow.grace_ends_at),
        deleteAt: iso(accessRow.delete_at),
        pagesPausedAt: iso(pauseState?.pages_paused_at ?? null),
        internal: internalMark
          ? {
              reason: internalMark.reason,
              setAt: new Date(internalMark.set_at).toISOString(),
              setByName: internalMark.set_by_name,
            }
          : null,
        deletion: deletionRow ? toDeletion(deletionRow) : null,
      },
      plan: plan
        ? { code: plan.plan_code, name: plan.plan_name, source: plan.source }
        : null,
      manualPlanUntil: iso(manual?.override_until ?? null),
      entitlements: entitlementsOf(plan?.entitlements ?? null),
      usage,
      subscriptions: subscriptions.map(toMirroredSubscription),
      invoices: invoices.map(toMirroredInvoice),
      refunds: refunds.map((row) => ({
        id: row.stripe_refund_id,
        invoiceId: row.stripe_invoice_id,
        amount: cents(row.amount),
        currency: row.currency,
        status: row.status,
        reason: row.reason,
        createdAt: new Date(row.created_at).toISOString(),
      })),
      events: events.map(toEvent),
      notices: notices.map((row) => ({
        id: row.id,
        kind: row.kind,
        status: row.status,
        subscriptionId: row.stripe_subscription_id,
        folio: row.folio,
        sentTo: row.sent_to,
        attempts: row.attempts,
        createdAt: new Date(row.created_at).toISOString(),
        sentAt: iso(row.sent_at),
      })),
      account,
    };
  }

  /** Permission check + the workspace a subscription belongs to. */
  async function subscriptionTarget(
    subject: string,
    subscriptionId: string,
    permission: StaffPermission,
  ): Promise<{ workspaceId: string; status: string; trialEnd: Date | null }> {
    return withStaffContext(sql, subject, async (tx) => {
      await requireStaffPermission(tx, subject, permission);
      const [row] = await tx<
        { workspace_id: string; status: string; trial_end: Date | null }[]
      >`
        select workspace_id, status::text as status, trial_end
        from kardo_billing.subscriptions
        where stripe_subscription_id = ${subscriptionId}
      `;
      if (!row) throw new StaffNotFoundError("Subscription was not found.");
      return {
        workspaceId: row.workspace_id,
        status: row.status,
        trialEnd: row.trial_end,
      };
    });
  }

  /** Audits the action and returns the refreshed workspace view. */
  async function finish(
    subject: string,
    workspaceId: string,
    action: string,
    reason: string,
    metadata: Record<string, unknown>,
  ): Promise<StaffWorkspaceBilling> {
    const billing = await withStaffContext(sql, subject, async (tx) => {
      await insertStaffAuditEvent(tx, {
        workspaceId,
        actorSubject: subject,
        action,
        targetType: "workspace",
        targetId: workspaceId,
        result: "succeeded",
        reason,
        metadata,
      });
      return readWorkspaceBilling(tx, workspaceId);
    });
    // A cancel, resume or resync can change the access state: pause or
    // resume the public pages now, after the commit (best effort).
    await reconcile(workspaceId);
    return billing;
  }

  function conflictFrom(error: unknown): never {
    if (error instanceof BillingGatewayError) {
      throw new StaffBillingConflictError(error.message);
    }
    throw error;
  }

  return {
    async overview(subject) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.billingRead);
        const [totals] = await tx<
          {
            mrr: string | null;
            active: number;
            trialing: number;
            past_due: number;
            canceled_last_30_days: number;
            trials_ending: number;
          }[]
        >`
          select
            round(coalesce(sum(${monthlyAmount(tx)}) filter (where s.status in ('active', 'past_due')), 0)) as mrr,
            count(*) filter (where s.status = 'active')::int as active,
            count(*) filter (where s.status = 'trialing')::int as trialing,
            count(*) filter (where s.status in ('past_due', 'unpaid'))::int as past_due,
            count(*) filter (
              where s.status = 'canceled' and s.ended_at > now() - interval '30 days'
            )::int as canceled_last_30_days,
            count(*) filter (
              where s.status = 'trialing' and s.trial_end between now() and now() + interval '7 days'
            )::int as trials_ending
          from kardo_billing.subscriptions s
          where s.livemode = ${livemode} and coalesce(s.currency, 'mxn') = 'mxn'
            and not exists (
              select 1 from kardo_billing.internal_workspaces i
              where i.workspace_id = s.workspace_id
            )
        `;
        const byPlan = await tx<
          {
            plan_code: string | null;
            plan_name: string | null;
            subscriptions: number;
            mrr: string | null;
          }[]
        >`
          select p.code as plan_code, p.name as plan_name,
            count(*)::int as subscriptions,
            round(coalesce(sum(${monthlyAmount(tx)}) filter (where s.status in ('active', 'past_due')), 0)) as mrr
          from kardo_billing.subscriptions s
          left join kardo_core.plans p on p.id = s.plan_id
          where s.livemode = ${livemode} and coalesce(s.currency, 'mxn') = 'mxn'
            and s.status in ('trialing', 'active', 'past_due')
            and not exists (
              select 1 from kardo_billing.internal_workspaces i
              where i.workspace_id = s.workspace_id
            )
          group by p.code, p.name, p.sort_order
          order by p.sort_order nulls last, p.code
          limit 50
        `;
        const [access] = await tx<
          {
            kardo_trials: number;
            limited: number;
            paused: number;
            pending_deletion: number;
            deleted: number;
            internal: number;
          }[]
        >`
          with acc as (
            select a.state, a.delete_at
            from kardo_core.workspaces w
            cross join lateral kardo_billing.workspace_access(w.id) a
          )
          select
            count(*) filter (where state = 'trial')::int as kardo_trials,
            count(*) filter (where state = 'limited')::int as limited,
            count(*) filter (where state = 'paused')::int as paused,
            count(*) filter (
              where state in ('limited', 'paused')
                and delete_at <= now() + interval '15 days'
            )::int as pending_deletion,
            count(*) filter (where state = 'deleted')::int as deleted,
            count(*) filter (where state = 'internal')::int as internal
          from acc
        `;
        const [failed] = await tx<{ count: number }[]>`
          select count(*)::int as count from kardo_billing.webhook_events
          where status = 'failed'
        `;
        return {
          currency: "mxn",
          mrr: cents(totals?.mrr ?? 0),
          active: totals?.active ?? 0,
          trialing: totals?.trialing ?? 0,
          pastDue: totals?.past_due ?? 0,
          canceledLast30Days: totals?.canceled_last_30_days ?? 0,
          trialsEndingNext7Days: totals?.trials_ending ?? 0,
          failedWebhookEvents: failed?.count ?? 0,
          access: {
            kardoTrials: access?.kardo_trials ?? 0,
            limited: access?.limited ?? 0,
            paused: access?.paused ?? 0,
            pendingDeletion: access?.pending_deletion ?? 0,
            deleted: access?.deleted ?? 0,
            deletionMode,
            internal: access?.internal ?? 0,
          },
          byPlan: byPlan.map((row) => ({
            planCode: row.plan_code,
            planName: row.plan_name,
            subscriptions: row.subscriptions,
            mrr: cents(row.mrr ?? 0),
          })),
        };
      });
    },

    async listSubscriptions(subject, filter) {
      if (filter.status && !SUBSCRIPTION_STATUSES.has(filter.status)) {
        throw new StaffValidationError("Unknown subscription status.");
      }
      const limit = Math.min(Math.max(filter.limit ?? 25, 1), 100);
      const cursor = filter.cursor ? decodeCursor(filter.cursor) : null;
      const pattern = filter.q?.trim()
        ? containsPattern(filter.q.trim())
        : null;
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.billingRead);
        const rows = await tx<
          (SubscriptionRow & {
            workspace_id: string;
            workspace_name: string;
            owner_email: string | null;
            stripe_customer_id: string;
            livemode: boolean;
          })[]
        >`
          select ${subscriptionColumns(tx)},
            s.workspace_id, w.name as workspace_name, s.stripe_customer_id, s.livemode,
            (select pr.email from kardo_core.workspace_memberships m
             join kardo_core.profiles pr on pr.id = m.profile_id
             where m.workspace_id = s.workspace_id and m.role = 'owner'
             limit 1) as owner_email
          from kardo_billing.subscriptions s
          join kardo_core.workspaces w on w.id = s.workspace_id
          left join kardo_core.plans p on p.id = s.plan_id
          where true
            ${filter.status ? tx`and s.status::text = ${filter.status}` : tx``}
            ${filter.plan ? tx`and p.code = ${filter.plan}` : tx``}
            ${
              pattern
                ? tx`and (
                    w.name ilike ${pattern} escape '\\'
                    or s.stripe_customer_id ilike ${pattern} escape '\\'
                    or s.stripe_subscription_id ilike ${pattern} escape '\\'
                    or exists (
                      select 1 from kardo_core.workspace_memberships m
                      join kardo_core.profiles pr on pr.id = m.profile_id
                      where m.workspace_id = s.workspace_id and m.role = 'owner'
                        and pr.email ilike ${pattern} escape '\\'
                    )
                  )`
                : tx``
            }
            ${
              cursor
                ? tx`and (s.stripe_created_at, s.stripe_subscription_id) < (${cursor.createdAt}::timestamptz, ${cursor.id})`
                : tx``
            }
          order by s.stripe_created_at desc, s.stripe_subscription_id desc
          limit ${limit + 1}
        `;
        const page = rows.slice(0, limit);
        const last = page.at(-1);
        return {
          items: page.map((row) => ({
            ...toMirroredSubscription(row),
            workspaceId: row.workspace_id,
            workspaceName: row.workspace_name,
            ownerEmail: row.owner_email,
            stripeCustomerId: row.stripe_customer_id,
            livemode: row.livemode,
          })),
          nextCursor:
            rows.length > limit && last
              ? encodeCursor(
                  new Date(last.stripe_created_at),
                  last.stripe_subscription_id,
                )
              : null,
        };
      });
    },

    async listEvents(subject, status) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.billingRead);
        const rows = await tx<EventRow[]>`
          select stripe_event_id, event_type, status, attempts, last_error, workspace_id, received_at
          from kardo_billing.webhook_events
          ${status === "failed" ? tx`where status = 'failed'` : tx``}
          order by received_at desc
          limit 100
        `;
        return rows.map(toEvent);
      });
    },

    async workspaceBilling(subject, workspaceId) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.billingRead);
        return readWorkspaceBilling(tx, workspaceId);
      });
    },

    async cancel(subject, subscriptionId, input) {
      const target = await subscriptionTarget(
        subject,
        subscriptionId,
        staffPermissions.billingWrite,
      );
      const stripe = requireStripe();
      const snapshot = await stripe.gateway.cancelSubscription(
        subscriptionId,
        input.mode,
        input.reason,
      );
      await stripe.sync.applySubscription(snapshot);
      return finish(
        subject,
        target.workspaceId,
        "staff.billing_subscription_canceled",
        input.reason,
        { subscriptionId, mode: input.mode },
      );
    },

    async resume(subject, subscriptionId, reason) {
      const target = await subscriptionTarget(
        subject,
        subscriptionId,
        staffPermissions.billingWrite,
      );
      if (!["trialing", "active", "past_due"].includes(target.status)) {
        throw new StaffBillingConflictError(
          "Only a live subscription can be resumed.",
        );
      }
      const stripe = requireStripe();
      const snapshot = await stripe.gateway.resumeSubscription(subscriptionId);
      await stripe.sync.applySubscription(snapshot);
      return finish(
        subject,
        target.workspaceId,
        "staff.billing_subscription_resumed",
        reason,
        { subscriptionId },
      );
    },

    async extendTrial(subject, subscriptionId, days, reason) {
      const target = await subscriptionTarget(
        subject,
        subscriptionId,
        staffPermissions.billingWrite,
      );
      if (target.status !== "trialing") {
        throw new StaffBillingConflictError(
          "Only a trialing subscription can be extended.",
        );
      }
      const stripe = requireStripe();
      const base = Math.max(Date.now(), target.trialEnd?.getTime() ?? 0);
      const trialEnd = new Date(base + days * 24 * 60 * 60 * 1000);
      const snapshot = await stripe.gateway
        .extendTrial(subscriptionId, trialEnd)
        .catch(conflictFrom);
      await stripe.sync.applySubscription(snapshot);
      return finish(
        subject,
        target.workspaceId,
        "staff.billing_trial_extended",
        reason,
        { subscriptionId, days, trialEnd: trialEnd.toISOString() },
      );
    },

    async resync(subject, subscriptionId, reason) {
      const target = await subscriptionTarget(
        subject,
        subscriptionId,
        staffPermissions.billingWrite,
      );
      const stripe = requireStripe();
      await stripe.sync.syncSubscription(subscriptionId);
      return finish(
        subject,
        target.workspaceId,
        "staff.billing_subscription_resynced",
        reason,
        { subscriptionId },
      );
    },

    async refund(subject, invoiceId, input) {
      const invoice = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.billingRefund,
        );
        const [row] = await tx<
          {
            workspace_id: string;
            status: string | null;
            amount_paid: string;
            amount_refunded: string;
          }[]
        >`
          select workspace_id, status, amount_paid, amount_refunded
          from kardo_billing.invoices where stripe_invoice_id = ${invoiceId}
        `;
        if (!row) throw new StaffNotFoundError("Invoice was not found.");
        return row;
      });
      const refundable =
        cents(invoice.amount_paid) - cents(invoice.amount_refunded);
      if (invoice.status !== "paid" || refundable <= 0) {
        throw new StaffBillingConflictError(
          "The invoice has nothing to refund.",
        );
      }
      if (input.amount !== undefined && input.amount > refundable) {
        throw new StaffValidationError(
          "The refund exceeds the refundable amount.",
        );
      }
      const stripe = requireStripe();
      const refund = await stripe.gateway
        .refundInvoice({
          invoiceId,
          ...(input.amount !== undefined ? { amount: input.amount } : {}),
          reason: input.reason,
          staffId: subject,
          // Same invoice, same amount, same refunded-so-far: a double submit
          // gets Stripe's first answer instead of a second refund.
          idempotencyKey: `kardo-refund-${invoiceId}-${input.amount ?? "full"}-${cents(invoice.amount_refunded)}`,
        })
        .catch(conflictFrom);
      await stripe.sync.applyRefund(refund, subject);
      return finish(
        subject,
        invoice.workspace_id,
        "staff.billing_invoice_refunded",
        input.reason,
        { invoiceId, refundId: refund.id, amount: refund.amount },
      );
    },

    async listAccess(subject, filter) {
      if (!staffAccessFilters.includes(filter)) {
        throw new StaffValidationError("Unknown access filter.");
      }
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.billingRead);
        const where = {
          trial: tx`a.state = 'trial'`,
          limited: tx`a.state = 'limited'`,
          paused: tx`a.state = 'paused'`,
          deletion: tx`a.state in ('limited', 'paused') and a.delete_at <= now() + interval '15 days'`,
          internal: tx`a.state = 'internal'`,
          deleted: tx`a.state = 'deleted'`,
        }[filter];
        const order = {
          trial: tx`a.ends_at asc nulls last`,
          limited: tx`a.grace_ends_at asc nulls last`,
          paused: tx`a.delete_at asc nulls last`,
          deletion: tx`a.delete_at asc nulls last`,
          internal: tx`i.set_at desc nulls last`,
          deleted: tx`d.deleted_at desc nulls last`,
        }[filter];
        const rows = await tx<
          ({
            workspace_id: string;
            workspace_name: string;
            owner_email: string | null;
            state: StaffAccessWorkspace["state"];
            source: StaffAccessWorkspace["source"];
            plan_name: string | null;
            ends_at: Date | null;
            lapsed_at: Date | null;
            grace_ends_at: Date | null;
            delete_at: Date | null;
            pages_paused_at: Date | null;
            internal_reason: string | null;
            internal_set_at: Date | null;
            internal_set_by_name: string | null;
          } & DeletionColumns)[]
        >`
          select w.id as workspace_id, w.name as workspace_name,
            (select pr.email from kardo_core.workspace_memberships m
             join kardo_core.profiles pr on pr.id = m.profile_id
             where m.workspace_id = w.id and m.role = 'owner'
             limit 1) as owner_email,
            a.state, a.source, a.plan_name, a.ends_at, a.lapsed_at,
            a.grace_ends_at, a.delete_at,
            st.pages_paused_at,
            i.reason as internal_reason, i.set_at as internal_set_at,
            sp.display_name as internal_set_by_name,
            ${deletionColumns(tx)}
          from kardo_core.workspaces w
          cross join lateral kardo_billing.workspace_access(w.id) a
          left join kardo_billing.access_states st on st.workspace_id = w.id
          left join kardo_billing.internal_workspaces i on i.workspace_id = w.id
          left join kardo_staff.staff_profiles sp on sp.id = i.set_by
          left join kardo_billing.workspace_deletions d on d.workspace_id = w.id
          where ${where}
          order by ${order}, w.id
          limit 200
        `;
        return rows.map((row) => ({
          workspaceId: row.workspace_id,
          workspaceName: row.workspace_name,
          ownerEmail: row.owner_email,
          state: row.state,
          source: row.source,
          lapsedAt: iso(row.lapsed_at),
          graceEndsAt: iso(row.grace_ends_at),
          deleteAt: iso(row.delete_at),
          pagesPausedAt: iso(row.pages_paused_at),
          internal:
            row.internal_reason !== null && row.internal_set_at !== null
              ? {
                  reason: row.internal_reason,
                  setAt: new Date(row.internal_set_at).toISOString(),
                  setByName: row.internal_set_by_name,
                }
              : null,
          deletion: toDeletion(row),
          planName: row.plan_name,
          endsAt: iso(row.ends_at),
        }));
      });
    },

    async setInternal(subject, workspaceId, internal, reason) {
      const billing = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.billingWrite,
        );
        await rejectDeleted(tx, workspaceId);
        await tx`
          select kardo_private.set_workspace_internal(
            ${workspaceId}::uuid, ${internal}, ${reason}
          )
        `;
        return readWorkspaceBilling(tx, workspaceId);
      }).catch(mapAccessFunctionError);
      // Marking internal reopens paused pages; unmarking may pause them.
      await reconcile(workspaceId);
      return billing;
    },

    async extendKardoTrial(subject, workspaceId, days, reason) {
      const billing = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.billingWrite,
        );
        await rejectDeleted(tx, workspaceId);
        await tx`
          select kardo_private.extend_workspace_trial(
            ${workspaceId}::uuid, ${days}::int, ${reason}
          )
        `;
        return readWorkspaceBilling(tx, workspaceId);
      }).catch(mapAccessFunctionError);
      // A reopened trial resumes paused pages.
      await reconcile(workspaceId);
      return billing;
    },

    async listCfdiRequests(subject, status) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.billingRead);
        // Pending: oldest first (the law asks for the CFDI within 24 hours of
        // the charge). The rest: most recently handled first.
        const order =
          status === "pending"
            ? tx`r.requested_at asc, r.id`
            : tx`r.handled_at desc nulls last, r.requested_at desc, r.id`;
        const rows = await tx<CfdiRow[]>`
          ${cfdiSelect(tx)}
          where r.status = ${status}
          order by ${order}
          limit 200
        `;
        return rows.map(toCfdi);
      });
    },

    async resolveCfdiRequest(subject, requestId, input) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.billingWrite,
        );
        await tx`
          select kardo_private.resolve_cfdi_request(
            ${requestId}::uuid, ${input.status}, ${input.satUuid ?? null},
            ${input.notes ?? null}
          )
        `;
        const [row] = await tx<CfdiRow[]>`
          ${cfdiSelect(tx)}
          where r.id = ${requestId}::uuid
        `;
        if (!row)
          throw new StaffNotFoundError("The CFDI request was not found.");
        return toCfdi(row);
      }).catch(mapCfdiFunctionError);
    },

    async issueCfdiWithFacturapi(subject, requestId, input) {
      if (!facturapi) {
        throw new StaffDependencyError("Facturapi is not configured.");
      }
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(
          tx,
          subject,
          staffPermissions.billingWrite,
        );
        // Locks the request while Facturapi answers: two clicks never issue
        // two CFDI for one payment. An advisory lock, because the staff role
        // only reads the table (`for update` needs UPDATE).
        await tx`select pg_advisory_xact_lock(hashtextextended(${`kardo-cfdi:${requestId}`}, 0))`;
        const [locked] = await tx<{ status: string }[]>`
          select status from kardo_billing.cfdi_requests
          where id = ${requestId}::uuid
        `;
        if (!locked)
          throw new StaffNotFoundError("The CFDI request was not found.");
        if (locked.status !== "pending") {
          throw new StaffConflictError("Only a pending request can be issued.");
        }
        const [row] = await tx<CfdiRow[]>`
          ${cfdiSelect(tx)}
          where r.id = ${requestId}::uuid
        `;
        if (!row)
          throw new StaffNotFoundError("The CFDI request was not found.");
        const request = toCfdi(row);
        let issued: FacturapiInvoice;
        try {
          issued = await issueOrReuse(facturapi, `kardo-cfdi-${requestId}`, {
            customer: {
              legalName: request.fiscal.legalName,
              taxId: request.fiscal.rfc,
              taxSystem: request.fiscal.taxRegime,
              zip: request.fiscal.postalCode,
              email: request.fiscal.email,
            },
            description: request.invoiceNumber
              ? `Suscripción a Kardo, recibo ${request.invoiceNumber}`
              : "Suscripción a Kardo",
            total: request.amountPaid / 100,
            paymentForm: input.paymentForm,
            use: request.fiscal.cfdiUse,
            series: "KARDO",
          });
        } catch (error) {
          if (
            error instanceof FacturapiError &&
            error.status >= 400 &&
            error.status < 500
          ) {
            throw new StaffConflictError(`Facturapi: ${error.message}`);
          }
          throw new StaffDependencyError("Facturapi did not answer.");
        }
        if (issued.status !== "valid" || !issued.uuid) {
          // A SAT outage: Facturapi answered 202 and keeps stamping this
          // invoice for up to 50 minutes. The request stays pending; the next
          // attempt finds the same invoice by its external id.
          throw new StaffConflictError(
            "Facturapi is still stamping this CFDI; try again in a few minutes. No second CFDI will be issued.",
          );
        }
        await tx`
          select kardo_private.issue_cfdi_with_provider(
            ${requestId}::uuid, ${issued.uuid}, ${issued.id}, ${issued.livemode},
            ${issued.livemode ? "Facturapi" : "Facturapi (prueba, sin validez fiscal)"}
          )
        `.catch((error: unknown) => {
          // The CFDI exists in Facturapi but Kardo could not record it. The
          // request stays pending and the next attempt reuses this invoice
          // (found by its external id); the log keeps the id meanwhile.
          console.error(
            JSON.stringify({
              message: "CFDI issued in Facturapi but not recorded",
              requestId,
              facturapiInvoiceId: issued.id,
            }),
          );
          throw error;
        });
        const [updated] = await tx<CfdiRow[]>`
          ${cfdiSelect(tx)}
          where r.id = ${requestId}::uuid
        `;
        if (!updated)
          throw new StaffNotFoundError("The CFDI request was not found.");
        return toCfdi(updated);
      }).catch(mapCfdiFunctionError);
    },

    async cfdiDocument(subject, requestId, format) {
      if (!facturapi) {
        throw new StaffDependencyError("Facturapi is not configured.");
      }
      const providerInvoiceId = await withStaffContext(
        sql,
        subject,
        async (tx) => {
          await requireStaffPermission(
            tx,
            subject,
            staffPermissions.billingRead,
          );
          const [row] = await tx<{ provider_invoice_id: string }[]>`
          select provider_invoice_id from kardo_billing.cfdi_requests
          where id = ${requestId}::uuid and provider = 'facturapi'
        `;
          return row?.provider_invoice_id ?? null;
        },
      );
      if (!providerInvoiceId)
        throw new StaffNotFoundError("The CFDI has no document.");
      return facturapi.download(providerInvoiceId, format).catch(() => {
        throw new StaffDependencyError("Facturapi did not answer.");
      });
    },

    async globalInvoice(subject, requestedMonth) {
      if (requestedMonth !== undefined && !MONTH.test(requestedMonth)) {
        throw new StaffValidationError("The month must be YYYY-MM.");
      }
      const month = requestedMonth ?? previousMexicoMonth(now());
      const { start, end } = monthBounds(month);
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.billingRead);
        // Paid in that calendar month (Mexico City), with no pending or
        // issued CFDI, and not from an internal organization.
        const eligible = tx`
          from kardo_billing.invoices i
          join kardo_core.workspaces w on w.id = i.workspace_id
          where i.status = 'paid'
            and i.amount_paid > 0
            and i.livemode = ${livemode}
            and (i.paid_at at time zone 'America/Mexico_City') >= ${start}::timestamp
            and (i.paid_at at time zone 'America/Mexico_City') < ${end}::timestamp
            and not exists (
              select 1 from kardo_billing.cfdi_requests r
              where r.stripe_invoice_id = i.stripe_invoice_id
                and r.status in ('pending', 'issued')
            )
            and not exists (
              select 1 from kardo_billing.internal_workspaces x
              where x.workspace_id = i.workspace_id
            )
        `;
        const [totals] = await tx<
          {
            total: string | number | null;
            tax: string | number | null;
            currency: string | null;
          }[]
        >`
          select coalesce(sum(i.amount_paid), 0) as total,
            coalesce(sum(i.tax), 0) as tax,
            min(i.currency) as currency
          ${eligible}
        `;
        const rows = await tx<
          {
            stripe_invoice_id: string;
            number: string | null;
            workspace_name: string;
            paid_at: Date;
            amount_paid: string | number;
            tax: string | number | null;
          }[]
        >`
          select i.stripe_invoice_id, i.number, w.name as workspace_name,
            i.paid_at, i.amount_paid, i.tax
          ${eligible}
          order by i.paid_at, i.stripe_invoice_id
          limit 2000
        `;
        return {
          month,
          currency: totals?.currency ?? "mxn",
          total: cents(totals?.total ?? 0),
          tax: Number(totals?.tax ?? 0),
          items: rows.map((row) => ({
            invoiceId: row.stripe_invoice_id,
            number: row.number,
            workspaceName: row.workspace_name,
            paidAt: new Date(row.paid_at).toISOString(),
            total: cents(row.amount_paid),
            tax:
              row.tax === null || row.tax === undefined
                ? null
                : Number(row.tax),
          })),
        };
      });
    },

    async accountingMonth(subject, requestedMonth) {
      if (requestedMonth !== undefined && !MONTH.test(requestedMonth)) {
        throw new StaffValidationError("The month must be YYYY-MM.");
      }
      const month = requestedMonth ?? previousMexicoMonth(now());
      const { start, end } = monthBounds(month);
      const LIMIT = 5000;
      type RequestJson = {
        status: AccountingRequest["status"];
        satUuid: string | null;
        provider: AccountingRequest["provider"];
        providerLivemode: boolean | null;
        requestedAt: string;
      };
      const toRequests = (value: RequestJson[] | null) =>
        (value ?? []).map((request) => ({
          ...request,
          requestedAt: new Date(request.requestedAt),
        }));
      const read = await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.billingRead);
        const [bounds] = await tx<{ from: Date; to: Date }[]>`
          select (${start}::timestamp at time zone 'America/Mexico_City') as "from",
            (${end}::timestamp at time zone 'America/Mexico_City') as "to"
        `;
        const payments = await tx<
          {
            stripe_invoice_id: string;
            number: string | null;
            workspace_name: string;
            stripe_customer_id: string;
            paid_at: Date;
            amount_paid: string | number;
            total: string | number;
            tax: string | number | null;
            amount_refunded: string | number;
            internal: boolean;
            requests: RequestJson[] | null;
          }[]
        >`
          select i.stripe_invoice_id, i.number, w.name as workspace_name,
            i.stripe_customer_id, i.paid_at, i.amount_paid, i.total, i.tax,
            i.amount_refunded,
            exists (
              select 1 from kardo_billing.internal_workspaces x
              where x.workspace_id = i.workspace_id
            ) as internal,
            (
              select json_agg(json_build_object(
                'status', r.status, 'satUuid', r.sat_uuid, 'provider', r.provider,
                'providerLivemode', r.provider_livemode, 'requestedAt', r.requested_at
              ) order by r.requested_at)
              from kardo_billing.cfdi_requests r
              where r.stripe_invoice_id = i.stripe_invoice_id
            ) as requests
          from kardo_billing.invoices i
          join kardo_core.workspaces w on w.id = i.workspace_id
          where i.status = 'paid'
            and i.amount_paid > 0
            and i.livemode = ${livemode}
            and (i.paid_at at time zone 'America/Mexico_City') >= ${start}::timestamp
            and (i.paid_at at time zone 'America/Mexico_City') < ${end}::timestamp
          order by i.paid_at, i.stripe_invoice_id
          limit ${LIMIT + 1}
        `;
        const refunds = await tx<
          {
            stripe_refund_id: string;
            stripe_invoice_id: string | null;
            number: string | null;
            workspace_name: string | null;
            created_at: Date;
            status: string;
            amount: string | number;
            invoice_paid_at: Date | null;
            internal: boolean;
            requests: RequestJson[] | null;
          }[]
        >`
          select f.stripe_refund_id, f.stripe_invoice_id, i.number,
            w.name as workspace_name, f.created_at, f.status, f.amount,
            i.paid_at as invoice_paid_at,
            exists (
              select 1 from kardo_billing.internal_workspaces x
              where x.workspace_id = f.workspace_id
            ) as internal,
            (
              select json_agg(json_build_object(
                'status', r.status, 'satUuid', r.sat_uuid, 'provider', r.provider,
                'providerLivemode', r.provider_livemode, 'requestedAt', r.requested_at
              ) order by r.requested_at)
              from kardo_billing.cfdi_requests r
              where r.stripe_invoice_id = f.stripe_invoice_id
            ) as requests
          from kardo_billing.refunds f
          left join kardo_billing.invoices i on i.stripe_invoice_id = f.stripe_invoice_id
          left join kardo_core.workspaces w on w.id = f.workspace_id
          where f.livemode = ${livemode}
            and (f.created_at at time zone 'America/Mexico_City') >= ${start}::timestamp
            and (f.created_at at time zone 'America/Mexico_City') < ${end}::timestamp
          order by f.created_at, f.stripe_refund_id
          limit ${LIMIT + 1}
        `;
        const canceledEarlier = await tx<
          { stripe_invoice_id: string; number: string | null; paid_at: Date }[]
        >`
          select r.stripe_invoice_id, i.number, i.paid_at
          from kardo_billing.cfdi_requests r
          join kardo_billing.invoices i on i.stripe_invoice_id = r.stripe_invoice_id
          where r.status = 'canceled'
            and i.livemode = ${livemode}
            and (r.handled_at at time zone 'America/Mexico_City') >= ${start}::timestamp
            and (r.handled_at at time zone 'America/Mexico_City') < ${end}::timestamp
            and (i.paid_at at time zone 'America/Mexico_City') < ${start}::timestamp
          order by r.handled_at
          limit 500
        `;
        await insertStaffAuditEvent(tx, {
          actorSubject: subject,
          action: "staff.billing_accounting_viewed",
          targetType: "billing_month",
          result: "succeeded",
          metadata: { month },
        });
        return { bounds, payments, refunds, canceledEarlier };
      });

      // Stripe is read outside the transaction (it can take seconds).
      let movements = null;
      if (gateway?.listBalanceMovements && read.bounds) {
        movements = await gateway
          .listBalanceMovements(
            new Date(read.bounds.from),
            new Date(read.bounds.to),
            LIMIT,
          )
          .catch(() => null);
      }

      return buildAccountingMonth({
        month,
        livemode,
        currency: "mxn",
        now: now(),
        truncated:
          read.payments.length > LIMIT ||
          read.refunds.length > LIMIT ||
          (movements?.length ?? 0) >= LIMIT,
        payments: read.payments.slice(0, LIMIT).map((row) => ({
          invoiceId: row.stripe_invoice_id,
          number: row.number,
          workspaceName: row.workspace_name,
          customerId: row.stripe_customer_id,
          paidAt: new Date(row.paid_at),
          amountPaid: cents(row.amount_paid),
          total: cents(row.total),
          tax: row.tax === null ? null : Number(row.tax),
          refunded: cents(row.amount_refunded),
          internal: row.internal,
          requests: toRequests(row.requests),
        })),
        refunds: read.refunds.slice(0, LIMIT).map((row) => ({
          refundId: row.stripe_refund_id,
          invoiceId: row.stripe_invoice_id,
          number: row.number,
          workspaceName: row.workspace_name ?? "Organización",
          createdAt: new Date(row.created_at),
          status: row.status,
          amount: cents(row.amount),
          invoicePaidAt: row.invoice_paid_at
            ? new Date(row.invoice_paid_at)
            : null,
          internal: row.internal,
          requests: toRequests(row.requests),
        })),
        canceledEarlier: read.canceledEarlier.map((row) => ({
          invoiceId: row.stripe_invoice_id,
          number: row.number,
          paidAt: new Date(row.paid_at),
        })),
        stripe: movements,
      });
    },

    async syncCatalog(subject) {
      await withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.plansWrite);
      });
      const stripe = requireStripe();
      const result = await stripe.sync.syncCatalog();
      await withStaffContext(sql, subject, async (tx) => {
        await insertStaffAuditEvent(tx, {
          actorSubject: subject,
          action: "staff.billing_catalog_synced",
          targetType: "plan",
          result: "succeeded",
          metadata: result,
        });
      });
      return result;
    },
  };
}
