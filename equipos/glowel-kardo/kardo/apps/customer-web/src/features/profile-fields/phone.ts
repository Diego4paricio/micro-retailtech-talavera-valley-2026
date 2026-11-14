import { whatsappUrlFromPhone } from "@kardo/contracts";

/**
 * The organization's WhatsApp, numbers only (owner, 2026-10-03). A Mexican
 * number is the 10 digits people write («222 123 4567»); the country code
 * goes beside the field and `whatsappUrlFromPhone` adds it to the link.
 * Elsewhere the number carries its country code («+34 612 345 678»).
 */

const MX_DIGITS = 10;
const INTL_MAX = 15;

/** The digits of what someone typed or pasted. A Mexican number pasted
 * with +52 (or the old +52 1) keeps only its 10 digits. */
export function phoneDigits(value: string, country = "MX"): string {
  let digits = value.replace(/\D/g, "");
  if (country !== "MX") return digits.slice(0, INTL_MAX);
  if (digits.length === 13 && digits.startsWith("521"))
    digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith("52"))
    digits = digits.slice(2);
  return digits.slice(0, MX_DIGITS);
}

/** Mexico City, Guadalajara and Monterrey dial a two-digit area code. */
const twoDigitAreas = new Set(["33", "55", "56", "81"]);

/** «222 123 4567» («55 1234 5678» in the cities with a two-digit area
 * code) as the digits come in; elsewhere groups of three from the end,
 * which leaves the country code in front («34 612 345 678»). */
export function formatPhone(digits: string, country = "MX"): string {
  if (country === "MX") {
    const area = twoDigitAreas.has(digits.slice(0, 2)) ? 2 : 3;
    const middle = area === 2 ? 4 : 3;
    return [
      digits.slice(0, area),
      digits.slice(area, area + middle),
      digits.slice(area + middle, 10),
    ]
      .filter(Boolean)
      .join(" ");
  }
  const groups: string[] = [];
  for (let end = digits.length; end > 0; end -= 3)
    groups.unshift(digits.slice(Math.max(0, end - 3), end));
  return groups.join(" ");
}

/** What the profile keeps: «222 123 4567», or «+34 612 345 678». */
export function phoneForProfile(digits: string, country = "MX"): string {
  if (!digits) return "";
  const formatted = formatPhone(digits, country);
  return country === "MX" ? formatted : `+${formatted}`;
}

/** Whether WhatsApp can open the number as it would be saved: the link
 * comes from `whatsappUrlFromPhone` (@kardo/contracts), the one rule the
 * panel, the pages and the AI share (A2-29), not a copy of it here. */
function opensWhatsApp(digits: string, country: string): boolean {
  return Boolean(
    whatsappUrlFromPhone(phoneForProfile(digits, country), country),
  );
}

/** Why the number is not one WhatsApp can open yet, or null. */
export function phoneProblem(value: string, country = "MX"): string | null {
  const digits = phoneDigits(value, country);
  if (!digits) return null;
  if (country === "MX") {
    const missing = MX_DIGITS - digits.length;
    if (missing <= 0) return null;
    return missing === 1 ? "Falta 1 número." : `Faltan ${missing} números.`;
  }
  return opensWhatsApp(digits, country)
    ? null
    : "Escribe el número con la clave de tu país.";
}

export function isPhoneComplete(value: string, country = "MX"): boolean {
  const digits = phoneDigits(value, country);
  return Boolean(digits) && opensWhatsApp(digits, country);
}
