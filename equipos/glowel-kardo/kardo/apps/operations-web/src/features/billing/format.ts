import {
  type BillingInterval,
  type BillingInvoice,
  type BillingSubscription,
  billingEntitlements,
  type PlanSource,
  type StaffAccessFilter,
  type StaffBillingAccount,
  type StaffBillingEvent,
  type StaffBillingNotice,
  type StaffBillingOverview,
  type StaffWorkspaceAccess,
  type StaffWorkspaceBilling,
  type StaffWorkspaceDeletion,
  type SubscriptionStatus,
  type WorkspaceAccessSource,
  type WorkspaceAccessState,
} from "@kardo/contracts";
import type { StatusTone } from "../../lib/format.js";

/**
 * Pure helpers for the subscriptions area (money, labels, validation). No
 * React and no DOM so they are unit tested directly. Every amount arrives in
 * cents of the currency (MXN, IVA included), see ADR 019.
 */

const locale = "es-MX";

export const minReasonLength = 3;
export const maxReasonLength = 500;

// --- Money ------------------------------------------------------------------

/**
 * Formats cents as currency: "$1,499" for whole pesos and "$1,499.50" when
 * there are centavos. With `withCode` it appends the ISO code ("$1,499 MXN").
 */
export function formatMoney(
  cents: number,
  currency = "mxn",
  options: { withCode?: boolean } = {},
): string {
  const code = currency.toUpperCase();
  const whole = cents % 100 === 0;
  const text = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: code,
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(cents / 100);
  return options.withCode ? `${text} ${code}` : text;
}

/** "$499 / mes" or "$4,990 / año"; "—" while the amount is unknown. */
export function formatPrice(
  cents: number | null,
  currency: string | null,
  interval: string | null,
): string {
  if (cents === null) return "—";
  const amount = formatMoney(cents, currency ?? "mxn");
  if (interval === "month") return `${amount} / mes`;
  if (interval === "year") return `${amount} / año`;
  return amount;
}

/** Rounds a chart maximum up to a readable value (1, 2, 2.5, 5 x 10^n). */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const fraction = value / magnitude;
  const step = [1, 2, 2.5, 5, 10].find((candidate) => fraction <= candidate);
  return (step ?? 10) * magnitude;
}

// --- Billing account (ADR 024) ----------------------------------------------

/** "Mariana Ríos · mariana@correo.mx", with whatever of the two exists. */
export function holderLine(
  account: Pick<StaffBillingAccount, "holderName" | "holderEmail">,
): string {
  const parts = [account.holderName, account.holderEmail].filter(
    (part): part is string => Boolean(part),
  );
  return parts.length > 0 ? parts.join(" · ") : "Sin titular";
}

/** "2 de 3", or "2, sin tope" when the plan has no number of organizations. */
export function organizationsLine(
  account: Pick<
    StaffBillingAccount,
    "organizationsUsed" | "organizationsLimit"
  >,
): string {
  return account.organizationsLimit === null
    ? `${account.organizationsUsed}, sin tope`
    : `${account.organizationsUsed} de ${account.organizationsLimit}`;
}

/** "10 QR y etiquetas más ×1, Organización extra ×2" or "Sin extras". */
export function extrasLine(extras: StaffBillingAccount["extras"]): string {
  if (extras.length === 0) return "Sin extras";
  return extras.map((extra) => `${extra.name} ×${extra.quantity}`).join(", ");
}

/** The monthly charge of the whole account, "—" while unknown. */
export function monthlyChargeLine(
  cents: number | null,
  currency = "mxn",
): string {
  return cents === null ? "—" : `${formatMoney(cents, currency)} / mes`;
}

/** Corporativo is the custom plan whose organizations Kardo can set. */
export function isCorporatePlanCode(code: string | null | undefined): boolean {
  return code === "corporativo";
}

/**
 * The "Organizaciones" field of the manual plan dialog: empty means the
 * plan's own number (null), otherwise a whole number from 0 to 1000.
 */
export function parseOrganizationsMax(
  text: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = text.trim();
  if (trimmed === "") return { ok: true, value: null };
  if (!/^\d+$/.test(trimmed)) return { ok: false };
  const value = Number(trimmed);
  return value <= 1000 ? { ok: true, value } : { ok: false };
}

// --- Labels -----------------------------------------------------------------

export const subscriptionStatusLabels: Record<SubscriptionStatus, string> = {
  incomplete: "Incompleta",
  incomplete_expired: "Expirada",
  trialing: "En prueba",
  active: "Activa",
  past_due: "En mora",
  canceled: "Cancelada",
  unpaid: "Impaga",
  paused: "Pausada",
};

export function subscriptionStatusView(status: SubscriptionStatus): {
  label: string;
  tone: StatusTone;
} {
  const label = subscriptionStatusLabels[status] ?? status;
  switch (status) {
    case "active":
      return { label, tone: "success" };
    case "trialing":
      return { label, tone: "info" };
    case "past_due":
    case "incomplete":
    case "paused":
      return { label, tone: "warning" };
    case "unpaid":
      return { label, tone: "danger" };
    default:
      return { label, tone: "neutral" };
  }
}

export const intervalLabels: Record<BillingInterval, string> = {
  month: "Mensual",
  year: "Anual",
};

export function intervalLabel(interval: string | null): string {
  if (interval === "month" || interval === "year")
    return intervalLabels[interval];
  return "—";
}

export const planSourceLabels: Record<PlanSource, string> = {
  subscription: "Suscripción de Stripe",
  manual: "Asignado por Kardo (cortesía)",
  trial: "Prueba de Kardo",
  default: "Plan por defecto",
};

export const invoiceStatusLabels = {
  draft: "Borrador",
  open: "Pendiente",
  paid: "Pagada",
  uncollectible: "Incobrable",
  void: "Anulada",
} as const;

export function invoiceStatusView(status: BillingInvoice["status"]): {
  label: string;
  tone: StatusTone;
} {
  if (status === null) return { label: "Sin estado", tone: "neutral" };
  const label = invoiceStatusLabels[status];
  switch (status) {
    case "paid":
      return { label, tone: "success" };
    case "open":
      return { label, tone: "warning" };
    case "uncollectible":
      return { label, tone: "danger" };
    default:
      return { label, tone: "neutral" };
  }
}

export function eventStatusView(status: StaffBillingEvent["status"]): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "processed":
      return { label: "Procesado", tone: "success" };
    case "failed":
      return { label: "Falló", tone: "danger" };
    case "ignored":
      return { label: "Ignorado", tone: "neutral" };
    default:
      return { label: "Recibido", tone: "info" };
  }
}

/** Customer notices required by the LFPC (art. 76 Bis). */
export function noticeKindLabel(kind: StaffBillingNotice["kind"]): string {
  switch (kind) {
    case "subscription_started":
      return "Confirmación de contratación";
    case "renewal_upcoming":
      return "Aviso de renovación";
    case "trial_ending":
      return "Fin de prueba sin tarjeta";
    case "trial_started":
      return "Inicio de la prueba";
    case "trial_reminder":
      return "Recordatorio de prueba";
    case "trial_ended":
      return "Fin de la prueba";
    case "plan_ended":
      return "Fin del plan";
    case "pause_upcoming":
      return "Páginas por pausarse";
    case "pages_paused":
      return "Páginas en pausa";
    case "deletion_upcoming":
      return "Aviso de borrado";
    case "courtesy_ending":
      return "Fin de cortesía";
    case "cfdi_issued":
      return "Factura emitida";
    default:
      return "Confirmación de cancelación";
  }
}

export function noticeStatusView(status: StaffBillingNotice["status"]): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "sent":
      return { label: "Enviado", tone: "success" };
    case "failed":
      return { label: "Reintentando", tone: "warning" };
    case "skipped":
      return { label: "Sin correo", tone: "danger" };
    default:
      return { label: "Pendiente", tone: "info" };
  }
}

export function livemodeView(livemode: boolean): {
  label: string;
  tone: StatusTone;
} {
  return livemode
    ? { label: "Vivo", tone: "success" }
    : { label: "Prueba", tone: "warning" };
}

/** Human summary of the saved card, e.g. "Visa terminada en 4242 (vence 08/27)". */
export function paymentMethodSummary(
  method: BillingSubscription["paymentMethod"],
): string {
  if (!method) return "Sin método de pago";
  const brand = method.brand
    ? method.brand.charAt(0).toUpperCase() + method.brand.slice(1)
    : "Tarjeta";
  const last4 = method.last4 ? ` terminada en ${method.last4}` : "";
  const expiry =
    method.expMonth && method.expYear
      ? ` (vence ${String(method.expMonth).padStart(2, "0")}/${String(method.expYear).slice(-2)})`
      : "";
  return `${brand}${last4}${expiry}`;
}

// --- Subscription state -----------------------------------------------------

const endedStatuses: readonly SubscriptionStatus[] = [
  "canceled",
  "incomplete_expired",
];

export function isEnded(status: SubscriptionStatus): boolean {
  return endedStatuses.includes(status);
}

/** Which date matters for a subscription row, and how to call it. */
export function nextDateOf(
  subscription: Pick<
    BillingSubscription,
    | "status"
    | "trialEnd"
    | "currentPeriodEnd"
    | "cancelAtPeriodEnd"
    | "canceledAt"
  >,
): { label: string; date: string | null } {
  if (subscription.status === "trialing")
    return { label: "Fin de prueba", date: subscription.trialEnd };
  if (isEnded(subscription.status))
    return { label: "Cancelada el", date: subscription.canceledAt };
  if (subscription.cancelAtPeriodEnd)
    return { label: "Termina el", date: subscription.currentPeriodEnd };
  return { label: "Próximo cobro", date: subscription.currentPeriodEnd };
}

export type SubscriptionActions = {
  cancel: boolean;
  /** Only `immediately` remains when the cancellation is already scheduled. */
  cancelPeriodEnd: boolean;
  resume: boolean;
  extendTrial: boolean;
  resync: boolean;
};

/** Which actions make sense for a subscription in its current state. */
export function availableActions(
  subscription: Pick<BillingSubscription, "status" | "cancelAtPeriodEnd">,
): SubscriptionActions {
  const ended = isEnded(subscription.status);
  return {
    cancel: !ended,
    cancelPeriodEnd: !ended && !subscription.cancelAtPeriodEnd,
    resume: !ended && subscription.cancelAtPeriodEnd,
    extendTrial: subscription.status === "trialing",
    resync: true,
  };
}

// --- Usage vs limits --------------------------------------------------------

export function entitlementLabel(key: string): string {
  const known = (
    billingEntitlements as Record<string, { label: string } | undefined>
  )[key];
  return known?.label ?? key;
}

export type MeterView =
  | {
      kind: "limit";
      limit: number | null;
      usage: number | null;
      /** 0..1 when both usage and a limit exist. */
      ratio: number | null;
      tone: StatusTone;
    }
  | { kind: "feature"; enabled: boolean };

/** Interprets one entitlement value and its (optional) consumption. */
export function meterView(
  key: string,
  value: number | boolean | null | undefined,
  usage: number | undefined,
): MeterView {
  const known = (
    billingEntitlements as Record<string, { kind: string } | undefined>
  )[key];
  if (typeof value === "boolean" || known?.kind === "feature")
    return { kind: "feature", enabled: value === true };
  const limit = typeof value === "number" ? value : null;
  const used = usage ?? null;
  const ratio =
    limit !== null && used !== null ? (limit === 0 ? 1 : used / limit) : null;
  const tone: StatusTone =
    ratio === null
      ? "neutral"
      : ratio >= 1
        ? "danger"
        : ratio >= 0.8
          ? "warning"
          : "success";
  return { kind: "limit", limit, usage: used, ratio, tone };
}

// --- Validation -------------------------------------------------------------

export function isValidReason(reason: string): boolean {
  const length = reason.trim().length;
  return length >= minReasonLength && length <= maxReasonLength;
}

/** Pesos still refundable on a paid invoice, in cents. */
export function refundableCents(
  invoice: Pick<BillingInvoice, "amountPaid" | "amountRefunded">,
): number {
  return Math.max(0, invoice.amountPaid - invoice.amountRefunded);
}

export function canRefundInvoice(
  invoice: Pick<BillingInvoice, "status" | "amountPaid" | "amountRefunded">,
): boolean {
  return invoice.status === "paid" && refundableCents(invoice) > 0;
}

/** Parses "123", "123.4" or "1,234.50" (pesos) into cents; null when invalid. */
export function parsePesosToCents(input: string): number | null {
  const text = input.trim().replaceAll(",", "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole = "0", fraction = ""] = text.split(".");
  return (
    Number.parseInt(whole, 10) * 100 +
    Number.parseInt(fraction.padEnd(2, "0") || "0", 10)
  );
}

export type RefundValidation =
  | { ok: true; amount: number }
  | { ok: false; error: string };

/**
 * Validates the refund amount typed in pesos. Empty means "everything still
 * refundable" (resolved here to an explicit amount so the request is exact).
 */
export function validateRefund(
  input: string,
  invoice: Pick<BillingInvoice, "amountPaid" | "amountRefunded" | "currency">,
): RefundValidation {
  const refundable = refundableCents(invoice);
  if (refundable <= 0)
    return {
      ok: false,
      error: "Esta factura ya no tiene saldo por reembolsar.",
    };
  if (input.trim() === "") return { ok: true, amount: refundable };
  const cents = parsePesosToCents(input);
  if (cents === null)
    return {
      ok: false,
      error: "Escribe un monto válido en pesos, con hasta dos decimales.",
    };
  if (cents <= 0)
    return { ok: false, error: "El monto debe ser mayor a cero." };
  if (cents > refundable)
    return {
      ok: false,
      error: `El monto no puede superar ${formatMoney(refundable, invoice.currency)} (pagado menos reembolsado).`,
    };
  return { ok: true, amount: cents };
}

export type DaysValidation =
  | { ok: true; days: number }
  | { ok: false; error: string };

/** Extend-trial days: whole number 1..60 (contract limit). */
export function validateTrialDays(input: string): DaysValidation {
  const text = input.trim();
  if (!/^\d+$/.test(text))
    return { ok: false, error: "Escribe un número entero de días." };
  const days = Number.parseInt(text, 10);
  if (days < 1 || days > 60)
    return { ok: false, error: "Elige entre 1 y 60 días." };
  return { ok: true, days };
}

/**
 * Turns a `yyyy-mm-dd` date (from an `<input type="date">`) into the end of
 * that day in the local timezone, as an ISO string; null when invalid.
 */
export function endOfDayIso(date: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const value = new Date(`${date}T23:59:59`);
  return Number.isNaN(value.getTime()) ? null : value.toISOString();
}

/** Today as `yyyy-mm-dd` in the local timezone (min for date inputs). */
export function todayInputValue(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// --- Access state (ADR 020 §4 and §8) ----------------------------------------

export const accessStateLabels: Record<WorkspaceAccessState, string> = {
  internal: "Interna",
  active: "Activa",
  trial: "En prueba",
  limited: "Limitada",
  paused: "En pausa",
  deleted: "Eliminada",
  legacy: "Anterior (sin límites)",
};

export function accessStateView(state: WorkspaceAccessState): {
  label: string;
  tone: StatusTone;
} {
  const label = accessStateLabels[state] ?? state;
  switch (state) {
    case "active":
      return { label, tone: "success" };
    case "trial":
    case "internal":
      return { label, tone: "info" };
    case "limited":
      return { label, tone: "warning" };
    case "paused":
      return { label, tone: "danger" };
    default:
      return { label, tone: "neutral" };
  }
}

export const accessSourceLabels: Record<WorkspaceAccessSource, string> = {
  trial: "Prueba",
  subscription: "Suscripción",
  manual: "Cortesía",
  none: "Sin plan",
  internal: "Cuenta interna",
  legacy: "Anterior al modelo actual",
  excluded: "Fuera del plan",
};

export const accessFilterLabels: Record<StaffAccessFilter, string> = {
  trial: "En prueba",
  limited: "Limitadas",
  paused: "En pausa",
  deletion: "Por borrar",
  internal: "Internas",
  deleted: "Eliminadas",
};

export type DeletionMode = StaffBillingOverview["access"]["deletionMode"];

/** What the "Por borrar" list means, depending on the automatic deletion mode. */
export function deletionModeNote(mode: DeletionMode): string {
  switch (mode) {
    case "on":
      return "Se borran solas al cumplir su fecha, con aviso 15 días antes.";
    case "dry-run":
      return "Modo de ensayo: la tarea cuenta lo que borraría, sin borrar.";
    default:
      return "El borrado automático está apagado; esta lista es para revisión.";
  }
}

const deletedCountLabels: [string, string][] = [
  ["touchpoints", "Touchpoints"],
  ["experiences", "Experiences"],
  ["experienceVersions", "Versiones de Experiences"],
  ["assets", "Archivos"],
  ["leads", "Leads"],
  ["members", "Miembros"],
  ["invitations", "Invitaciones"],
  ["groups", "Grupos"],
  ["qrTemplates", "Plantillas de QR"],
  ["analyticsRows", "Registros de analítica"],
];

const keptCountLabels: [string, string][] = [
  ["invoicesKept", "Facturas conservadas"],
  ["cfdiKept", "CFDI conservados"],
];

export type DeletionLine = { label: string; count: number };

function countLines(
  counts: StaffWorkspaceDeletion["counts"],
  labels: [string, string][],
  keepZero = false,
): DeletionLine[] {
  return labels.flatMap(([key, label]) => {
    const count = counts[key] ?? 0;
    return count > 0 || (keepZero && key in counts) ? [{ label, count }] : [];
  });
}

/** What the deletion removed and what the law keeps, only non-zero counts. */
/** Why an organization was deleted, in words (the code if it is a new one). */
/** Personal or business, as declared at sign up; null when unknown. */
export function accountTypeLabel(
  type: StaffWorkspaceBilling["accountType"],
): string | null {
  if (type === "personal") return "Cuenta personal";
  if (type === "business") return "Cuenta de negocio";
  return null;
}

export function deletionReasonLabel(reason: string): string {
  return reason === "billing.retention_expired"
    ? "Se cumplieron 90 días sin plan (ADR 020)."
    : reason;
}

export function deletionSummary(deletion: StaffWorkspaceDeletion): {
  deleted: DeletionLine[];
  kept: DeletionLine[];
} {
  return {
    deleted: countLines(deletion.counts, deletedCountLabels),
    // Kept records show even at zero: "0 CFDI" is a fact worth reading.
    kept: countLines(deletion.counts, keptCountLabels, true),
  };
}

/** "Limpieza terminada el …" or "Limpieza pendiente: N objetos". */
export function deletionCleanupText(
  deletion: StaffWorkspaceDeletion,
  format: (value: string) => string,
): string {
  if (deletion.cleanupCompletedAt)
    return `Limpieza terminada el ${format(deletion.cleanupCompletedAt)}`;
  const pending = deletion.cleanupPending;
  return `Limpieza pendiente: ${pending} ${pending === 1 ? "objeto" : "objetos"}`;
}

export const pausePendingNote =
  "Pausa pendiente: el Resolver no está configurado";

export type AccessDateRow = { label: string; value: string | null };

/**
 * Dates worth showing for an access state. `endsAt` is the end of the Kardo
 * trial or of the courtesy, whichever applies. `pagesPausedAt` on a paused
 * organization that has none means the Resolver never applied the pause.
 */
export function accessDateRows(
  access: Pick<
    StaffWorkspaceAccess,
    "state" | "lapsedAt" | "graceEndsAt" | "deleteAt" | "pagesPausedAt"
  >,
  endsAt: string | null,
  format: (value: string) => string,
): AccessDateRow[] {
  const rows: AccessDateRow[] = [];
  const add = (label: string, value: string | null) => {
    if (value) rows.push({ label, value: format(value) });
  };
  if (access.state === "deleted") {
    add("Eliminada", access.deleteAt);
    return rows;
  }
  add("Fin de prueba o cortesía", endsAt);
  add("Terminó", access.lapsedAt);
  add("Las páginas se pausan", access.graceEndsAt);
  if (access.pagesPausedAt) add("En pausa desde", access.pagesPausedAt);
  else if (access.state === "paused")
    rows.push({ label: "En pausa desde", value: pausePendingNote });
  add("Se borra", access.deleteAt);
  return rows;
}

/** End of the running Kardo trial or of the staff courtesy, if any. */
export function accessEndsAt(
  billing: Pick<StaffWorkspaceBilling, "trial" | "manualPlanUntil" | "access">,
): string | null {
  if (billing.access.state === "trial" && billing.trial?.status === "active")
    return billing.trial.endsAt;
  return billing.manualPlanUntil ?? null;
}

/** The Kardo trial exists and has not turned into a subscription. */
export function hasUnconvertedKardoTrial(
  trial: StaffWorkspaceBilling["trial"],
): boolean {
  return trial !== null && trial.status !== "converted";
}
