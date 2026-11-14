import {
  type AccountingPath,
  type CfdiRequestStatus,
  cfdiUses,
  type StaffAccountingMonth,
  type StaffGlobalInvoice,
  taxRegimes,
} from "@kardo/contracts";
import { formatMoney } from "./format.js";

/** Plazo legal para emitir el CFDI individual (RCFF art. 39). */
export const cfdiDeadlineHours = 24;

export const cfdiStatusLabels: Record<CfdiRequestStatus, string> = {
  pending: "Pendientes",
  issued: "Emitidas",
  rejected: "Rechazadas",
  canceled: "Canceladas",
};

export const cfdiStatusTones: Record<
  CfdiRequestStatus,
  "warning" | "success" | "danger" | "neutral"
> = {
  pending: "warning",
  issued: "success",
  rejected: "danger",
  canceled: "neutral",
};

export const satFillingNote =
  "Emite en Genera tu factura del SAT: clave 81112106, unidad E48, objeto 02, método PUE. Verifica estas claves en el catálogo del SAT.";

export const globalInvoiceNote =
  "Emite la global dentro de las 24 horas siguientes al cierre del mes, a RFC XAXX010101000.";

/** Shown in the "Marcar emitida" dialog, above the UUID field. */
export function issueEmailNote(email: string): string {
  return `Antes de marcarla, envía el XML y el PDF al correo fiscal del cliente (${email}); al confirmar le avisamos por correo con el folio fiscal.`;
}

/** Folio fiscal (UUID) que entrega el SAT al timbrar. */
const SAT_UUID = /^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$/;

export function isValidSatUuid(value: string): boolean {
  return SAT_UUID.test(value.trim());
}

/** "601 · General de Ley Personas Morales"; the bare code if unknown. */
export function taxRegimeLabel(code: string): string {
  const found = taxRegimes.find((regime) => regime.code === code);
  return found ? `${found.code} · ${found.label}` : code;
}

export function cfdiUseLabel(code: string): string {
  const found = cfdiUses.find((use) => use.code === code);
  return found ? `${found.code} · ${found.label}` : code;
}

/** Whole hours elapsed since `requestedAt` (never negative). */
export function hoursSince(requestedAt: string, now: Date): number {
  const elapsed = now.getTime() - new Date(requestedAt).getTime();
  return Math.max(0, Math.floor(elapsed / 3_600_000));
}

/** True when a pending request is past the 24 hour legal window. */
export function isOverdue(requestedAt: string, now: Date): boolean {
  return (
    now.getTime() - new Date(requestedAt).getTime() >
    cfdiDeadlineHours * 3_600_000
  );
}

/** "Pedida hace 5 horas", "Pedida hace 2 días". */
export function requestedAgoLabel(requestedAt: string, now: Date): string {
  const hours = hoursSince(requestedAt, now);
  if (hours < 1) return "Pedida hace menos de una hora";
  if (hours === 1) return "Pedida hace 1 hora";
  if (hours < 48) return `Pedida hace ${hours} horas`;
  return `Pedida hace ${Math.floor(hours / 24)} días`;
}

/** Previous calendar month as "YYYY-MM", in Mexico City time. */
export function previousMonth(now: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    timeZone: "America/Mexico_City",
  }).formatToParts(now);
  const year = Number(parts.find((part) => part.type === "year")?.value);
  const month = Number(parts.find((part) => part.type === "month")?.value);
  const previous =
    month === 1 ? { y: year - 1, m: 12 } : { y: year, m: month - 1 };
  return `${previous.y}-${String(previous.m).padStart(2, "0")}`;
}

/** The last `count` months ending at the previous one, newest first. */
export function monthOptions(now: Date, count = 12): string[] {
  const options: string[] = [];
  let [year, month] = previousMonth(now).split("-").map(Number) as [
    number,
    number,
  ];
  for (let index = 0; index < count; index += 1) {
    options.push(`${year}-${String(month).padStart(2, "0")}`);
    month -= 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
  }
  return options;
}

const monthNames = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** "2026-09" becomes "septiembre de 2026". */
export function monthLabel(month: string): string {
  const [year, number] = month.split("-");
  const name = monthNames[Number(number) - 1];
  return name ? `${name} de ${year}` : month;
}

/** Leading characters that Excel, Sheets and Numbers read as a formula. */
const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** One RFC 4180 field. The organization name is written by the customer:
 * a value that would open as a formula gets a leading `'` (the same guard
 * as the leads CSV of the Customer API). */
export function csvCell(value: string): string {
  const guarded = FORMULA_PREFIX.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replaceAll('"', '""')}"`
    : guarded;
}

function pesos(cents: number): string {
  return (cents / 100).toFixed(2);
}

/** Payment date and time in Mexico City, "2026-09-12 14:05". */
function paidAtMx(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "America/Mexico_City",
  }).formatToParts(new Date(value));
  const get = (type: string) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`;
}

/** CSV of the global invoice lines, amounts in pesos. */
export function globalInvoiceCsv(invoice: StaffGlobalInvoice): string {
  const header = [
    "Folio Stripe",
    "Organización",
    "Fecha de pago",
    "Total",
    "IVA",
  ];
  const rows = invoice.items.map((item) =>
    [
      item.number ?? item.invoiceId,
      item.workspaceName,
      paidAtMx(item.paidAt),
      pesos(item.total),
      item.tax === null ? "" : pesos(item.tax),
    ]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...rows].join("\r\n");
}

export function globalInvoiceFilename(month: string): string {
  return `factura-global-${month}.csv`;
}

export function moneyOrDash(cents: number | null, currency: string): string {
  return cents === null ? "—" : formatMoney(cents, currency);
}

export const accountingPathLabels: Record<AccountingPath, string> = {
  individual: "CFDI individual",
  individual_pending: "CFDI pendiente",
  global: "Factura global",
  internal: "Cuenta interna",
};

export const accountingNote =
  "Cada cobro del mes (hora de México) aparece una sola vez: con CFDI individual (con su folio fiscal) o en la factura global. El IVA se desglosa de lo cobrado (16 % incluido). La conciliación con Stripe suma cobros, reembolsos y comisiones con su IVA; las claves del SAT y el trato de reembolsos se confirman con el contador.";

/** Signed pesos for the CSV; generated by Kardo, so never formula-guarded. */
function signedPesos(cents: number): string {
  return (cents / 100).toFixed(2);
}

/**
 * CSV for the accountant: one row per payment and per refund (refunds in
 * negative), then a blank line and the month's summary. Text cells written
 * by customers go through the formula guard; amounts are Kardo's own.
 */
export function accountingCsv(report: StaffAccountingMonth): string {
  const header = [
    "Tipo",
    "Fecha (México)",
    "Folio Stripe",
    "Organización",
    "Camino",
    "Folio fiscal (UUID)",
    "CFDI de prueba",
    "Total",
    "Base sin IVA",
    "IVA",
    "Reembolsado",
    "Cobro en Stripe",
    "Comisión Stripe sin IVA",
    "IVA de la comisión",
  ];
  const text = (value: string | null) => (value ? csvCell(value) : "");
  const money = (value: number | null) =>
    value === null ? "" : signedPesos(value);
  const rows = [
    ...report.payments.map((payment) =>
      [
        "Cobro",
        paidAtMx(payment.paidAt),
        text(payment.number ?? payment.invoiceId),
        text(payment.workspaceName),
        accountingPathLabels[payment.path],
        payment.satUuid ?? "",
        payment.cfdiTest ? "Sí" : "",
        money(payment.total),
        money(payment.base),
        money(payment.iva),
        money(payment.refunded || null),
        payment.stripeChargeId ?? "",
        money(payment.stripeFee),
        money(payment.stripeFeeIva),
      ].join(","),
    ),
    ...report.refunds.map((refund) =>
      [
        refund.status === "succeeded"
          ? "Reembolso"
          : `Reembolso (${refund.status})`,
        paidAtMx(refund.createdAt),
        text(refund.number ?? refund.invoiceId ?? refund.refundId),
        text(refund.workspaceName),
        refund.originalPath
          ? `${accountingPathLabels[refund.originalPath]}${refund.originalMonth ? ` de ${refund.originalMonth}` : ""}`
          : "",
        refund.originalSatUuid ?? "",
        "",
        money(-refund.amount),
        money(-refund.base),
        money(-refund.iva),
        "",
        refund.refundId,
        "",
        "",
      ].join(","),
    ),
  ];
  const summaryHeader = ["Resumen", "Pagos", "Total", "Base sin IVA", "IVA"];
  const summary = (
    label: string,
    amounts: StaffAccountingMonth["totals"]["all"],
    sign = 1,
  ) =>
    [
      label,
      String(amounts.count),
      money(sign * amounts.total),
      money(sign * amounts.base),
      money(sign * amounts.iva),
    ].join(",");
  const summaryRows = [
    summary("Con CFDI individual", report.totals.individual),
    summary("CFDI pendiente", report.totals.individual_pending),
    summary("En factura global", report.totals.global),
    summary("Cuenta interna (revisar)", report.totals.internal),
    summary("Total cobrado del mes", report.totals.all),
    summary("Reembolsos del mes", report.totals.refunds, -1),
  ];
  if (report.stripe) {
    summaryRows.push(
      [
        "Stripe: cobros",
        String(report.stripe.charges.count),
        money(report.stripe.charges.amount),
        "",
        "",
      ].join(","),
      [
        "Stripe: reembolsos",
        String(report.stripe.refunds.count),
        money(-report.stripe.refunds.amount),
        "",
        "",
      ].join(","),
      [
        "Stripe: comisiones (gasto)",
        "",
        money(-report.stripe.fees.total),
        money(-report.stripe.fees.amount),
        money(-report.stripe.fees.iva),
      ].join(","),
      ["Stripe: neto", "", money(report.stripe.net), "", ""].join(","),
    );
  }
  return [
    header.join(","),
    ...rows,
    "",
    summaryHeader.join(","),
    ...summaryRows,
  ].join("\r\n");
}

export function accountingFilename(month: string): string {
  return `kardo-contabilidad-${month}.csv`;
}
