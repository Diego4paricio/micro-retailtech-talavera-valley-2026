import {
  type BillingInvoice,
  type CfdiRequest,
  type CfdiRequestStatus,
  cfdiUses,
  EMAIL_PATTERN,
  type FiscalProfile,
  RFC_PATTERN,
  taxRegimes,
  type UpsertFiscalProfile,
  type WorkspaceBilling,
  type WorkspaceFiscal,
} from "@kardo/contracts";
import { isAccountHolder } from "./extras-model.js";

/**
 * Datos de facturación (ADR 020 §6). Optional and only for whoever wants a
 * CFDI. Only the data is asked for, never the Constancia document.
 */

const rfcRegex = new RegExp(RFC_PATTERN);
const genericRfcs = ["XAXX010101000", "XEXX010101000"];
const emailRegex = EMAIL_PATTERN;

export type FiscalForm = {
  rfc: string;
  legalName: string;
  taxRegime: string;
  postalCode: string;
  cfdiUse: string;
  email: string;
  invoiceEachPayment: boolean;
};

export type FiscalErrors = Partial<Record<keyof FiscalForm, string>>;

export const defaultCfdiUse = "G03";

export const emptyFiscalForm = (email = ""): FiscalForm => ({
  rfc: "",
  legalName: "",
  taxRegime: "",
  postalCode: "",
  cfdiUse: defaultCfdiUse,
  email,
  invoiceEachPayment: false,
});

export const formFromProfile = (profile: FiscalProfile): FiscalForm => ({
  rfc: profile.rfc,
  legalName: profile.legalName,
  taxRegime: profile.taxRegime,
  postalCode: profile.postalCode,
  cfdiUse: profile.cfdiUse,
  email: profile.email,
  invoiceEachPayment: profile.invoiceEachPayment,
});

/** Uppercase, no spaces or dashes, at most 13 characters. */
export function normalizeRfc(value: string): string {
  return value.toUpperCase().replace(/[\s-]/g, "").slice(0, 13);
}

export function rfcError(value: string): string | null {
  const rfc = normalizeRfc(value);
  if (rfc === "") return "Escribe tu RFC.";
  if (genericRfcs.includes(rfc))
    return "Escribe tu RFC propio; los RFC genéricos no sirven para facturar.";
  if (rfc.length !== 12 && rfc.length !== 13)
    return "El RFC tiene 12 caracteres (persona moral) o 13 (persona física).";
  if (!rfcRegex.test(rfc))
    return "Revisa tu RFC: son letras, 6 dígitos de fecha y 3 caracteres de homoclave.";
  return null;
}

export function postalCodeError(value: string): string | null {
  if (value.trim() === "")
    return "Escribe el código postal de tu domicilio fiscal.";
  if (!/^[0-9]{5}$/.test(value.trim()))
    return "El código postal tiene 5 dígitos.";
  return null;
}

export function validateFiscalForm(form: FiscalForm): FiscalErrors {
  const errors: FiscalErrors = {};
  const rfc = rfcError(form.rfc);
  if (rfc) errors.rfc = rfc;
  const name = form.legalName.trim();
  if (name === "") errors.legalName = "Escribe tu nombre o razón social.";
  else if (name.length > 300) errors.legalName = "Usa máximo 300 caracteres.";
  if (!taxRegimes.some((item) => item.code === form.taxRegime))
    errors.taxRegime = "Elige tu régimen fiscal.";
  const postal = postalCodeError(form.postalCode);
  if (postal) errors.postalCode = postal;
  if (!cfdiUses.some((item) => item.code === form.cfdiUse))
    errors.cfdiUse = "Elige el uso del CFDI.";
  const email = form.email.trim();
  if (email === "")
    errors.email = "Escribe el correo donde recibirás la factura.";
  else if (!emailRegex.test(email) || email.length > 320)
    errors.email = "Revisa el correo, parece incompleto.";
  return errors;
}

export const hasErrors = (errors: FiscalErrors) =>
  Object.keys(errors).length > 0;

/** Request body; call only when `validateFiscalForm` found no errors. */
export function toUpsert(form: FiscalForm): UpsertFiscalProfile {
  return {
    rfc: normalizeRfc(form.rfc),
    legalName: form.legalName.trim(),
    taxRegime: form.taxRegime as UpsertFiscalProfile["taxRegime"],
    postalCode: form.postalCode.trim(),
    cfdiUse: form.cfdiUse as UpsertFiscalProfile["cfdiUse"],
    email: form.email.trim(),
    invoiceEachPayment: form.invoiceEachPayment,
  };
}

/**
 * The fiscal data belong to the person who pays (the account holder), not to
 * a role: an Admin who is not the holder would only get a 403 (A2-65).
 */
export function canManageFiscal(billing: WorkspaceBilling | null): boolean {
  return billing !== null && isAccountHolder(billing);
}

/** First 8 characters of the SAT folio, enough to recognize it. */
export const shortSatUuid = (uuid: string | null) =>
  uuid ? `${uuid.slice(0, 8).toUpperCase()}…` : "";

export type CfdiStatusView = {
  tone: "info" | "success" | "danger" | "neutral";
  text: string;
};

export function cfdiStatusView(request: CfdiRequest): CfdiStatusView {
  const map: Record<CfdiRequestStatus, () => CfdiStatusView> = {
    pending: () => ({ tone: "info", text: "Factura pedida" }),
    issued: () => ({
      tone: "success",
      text: request.satUuid
        ? `Factura emitida · folio fiscal ${shortSatUuid(request.satUuid)}`
        : "Factura emitida",
    }),
    rejected: () => ({
      tone: "danger",
      text: request.notes
        ? `Factura rechazada: ${request.notes}`
        : "Factura rechazada",
    }),
    canceled: () => ({ tone: "neutral", text: "Factura cancelada" }),
  };
  return map[request.status]();
}

export type InvoiceFiscalView =
  | { kind: "request"; request: CfdiRequest; status: CfdiStatusView }
  | { kind: "can-request"; hasProfile: boolean }
  | { kind: "global" };

/**
 * What the invoice list shows for a payment: its request status, the button to
 * ask for the CFDI (current month) or the note about the monthly global one.
 */
export function invoiceFiscalView(
  invoice: Pick<BillingInvoice, "id" | "status">,
  fiscal: Pick<
    WorkspaceFiscal,
    "profile" | "requests" | "requestableInvoiceIds"
  >,
): InvoiceFiscalView | null {
  const request = fiscal.requests.find((item) => item.invoiceId === invoice.id);
  if (request)
    return { kind: "request", request, status: cfdiStatusView(request) };
  if (fiscal.requestableInvoiceIds.includes(invoice.id))
    return { kind: "can-request", hasProfile: fiscal.profile !== null };
  if (invoice.status === "paid") return { kind: "global" };
  return null;
}
