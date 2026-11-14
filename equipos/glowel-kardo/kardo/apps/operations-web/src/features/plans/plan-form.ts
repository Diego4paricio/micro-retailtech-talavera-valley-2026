import { billingEntitlements, planEntitlementKeys } from "@kardo/contracts";

/** Form state of one entitlement: a limit (number or unlimited) or a switch. */
export type LimitField = { kind: "limit"; unlimited: boolean; value: string };
export type FeatureField = { kind: "feature"; enabled: boolean };
export type EntitlementField = LimitField | FeatureField;
export type EntitlementForm = Record<string, EntitlementField>;

type Stored = Record<string, number | boolean | null>;

export function isFeatureKey(key: string): boolean {
  return (
    (billingEntitlements as Record<string, { kind: string } | undefined>)[key]
      ?.kind === "feature"
  );
}

/**
 * Builds the form state from a plan's stored entitlements. A missing or null
 * limit means "sin límite"; a missing feature means it is off.
 */
export function toEntitlementForm(stored: Stored | undefined): EntitlementForm {
  const form: EntitlementForm = {};
  for (const key of planEntitlementKeys) {
    const raw = stored?.[key];
    if (isFeatureKey(key)) {
      form[key] = { kind: "feature", enabled: raw === true };
    } else {
      const unlimited = raw === null || raw === undefined || raw === true;
      form[key] = {
        kind: "limit",
        unlimited: unlimited || typeof raw !== "number",
        value: typeof raw === "number" ? String(raw) : "",
      };
    }
  }
  return form;
}

export type EntitlementsResult =
  | { ok: true; entitlements: Stored }
  | { ok: false; key: string };

/** Serializes the form; a limit needs a whole number >= 0 unless unlimited. */
export function fromEntitlementForm(form: EntitlementForm): EntitlementsResult {
  const entitlements: Stored = {};
  for (const key of planEntitlementKeys) {
    const field = form[key];
    if (!field) {
      entitlements[key] = isFeatureKey(key) ? false : null;
      continue;
    }
    if (field.kind === "feature") {
      entitlements[key] = field.enabled;
      continue;
    }
    if (field.unlimited) {
      entitlements[key] = null;
      continue;
    }
    const text = field.value.trim();
    if (!/^\d+$/.test(text)) return { ok: false, key };
    entitlements[key] = Number.parseInt(text, 10);
  }
  return { ok: true, entitlements };
}

/** Trial days: empty means no trial, otherwise a whole number 1..90. */
export function parseTrialDays(
  input: string,
): { ok: true; value: number | null } | { ok: false } {
  const text = input.trim();
  if (text === "") return { ok: true, value: null };
  if (!/^\d+$/.test(text)) return { ok: false };
  const value = Number.parseInt(text, 10);
  return value >= 1 && value <= 90 ? { ok: true, value } : { ok: false };
}

/** Sort order: whole number 0..1000, empty counts as 0. */
export function parseSortOrder(
  input: string,
): { ok: true; value: number } | { ok: false } {
  const text = input.trim();
  if (text === "") return { ok: true, value: 0 };
  if (!/^\d+$/.test(text)) return { ok: false };
  const value = Number.parseInt(text, 10);
  return value <= 1000 ? { ok: true, value } : { ok: false };
}

/** Card text for one entitlement: "Sí"/"No" for features, "Ilimitado" for a null limit. */
export function displayEntitlement(
  key: string,
  value: number | boolean | null | undefined,
): string {
  if (isFeatureKey(key)) return value === true ? "Sí" : "No";
  if (value === null || value === undefined || value === true)
    return "Ilimitado";
  if (value === false) return "0";
  return new Intl.NumberFormat("es-MX").format(value);
}
