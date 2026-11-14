import type { FormFields } from "./snapshot.js";

export type ParsedLead = {
  email: string;
  name?: string;
  phone?: string;
  message?: string;
};

export type LeadFormResult =
  | { kind: "lead"; lead: ParsedLead }
  | { kind: "honeypot" }
  | { kind: "error"; message: string };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9 +()\-.]{1,40}$/;

/**
 * Parses and validates a `application/x-www-form-urlencoded` lead
 * submission. Never throws: any structural problem comes back as a
 * customer-safe `{ kind: "error" }` result. The honeypot field is checked
 * first so a filled-in bot submission short-circuits before any other field
 * is even read.
 */
export function parseLeadForm(
  body: string,
  fields: FormFields,
): LeadFormResult {
  const params = new URLSearchParams(body);

  if ((params.get("website") ?? "").trim().length > 0) {
    return { kind: "honeypot" };
  }

  if (params.get("consent") !== "yes") {
    return {
      kind: "error",
      message: "Debes aceptar el consentimiento para continuar.",
    };
  }

  const email = (params.get("email") ?? "").trim().toLowerCase();
  if (!email || email.length > 320 || !emailPattern.test(email)) {
    return { kind: "error", message: "Escribe un correo electrónico válido." };
  }
  const lead: ParsedLead = { email };

  if (fields.name !== "hidden") {
    const name = (params.get("name") ?? "").trim();
    if (fields.name === "required" && !name)
      return { kind: "error", message: "Escribe tu nombre." };
    if (name) {
      if (name.length > 120)
        return { kind: "error", message: "El nombre es demasiado largo." };
      lead.name = name;
    }
  }

  if (fields.phone !== "hidden") {
    const phone = (params.get("phone") ?? "").trim();
    if (fields.phone === "required" && !phone)
      return { kind: "error", message: "Escribe tu teléfono." };
    if (phone) {
      if (phone.length < 3 || phone.length > 40 || !phonePattern.test(phone))
        return { kind: "error", message: "Escribe un teléfono válido." };
      lead.phone = phone;
    }
  }

  if (fields.message !== "hidden") {
    const message = (params.get("message") ?? "").trim();
    if (fields.message === "required" && !message)
      return { kind: "error", message: "Escribe tu mensaje." };
    if (message) {
      if (message.length > 2000)
        return { kind: "error", message: "El mensaje es demasiado largo." };
      lead.message = message;
    }
  }

  return { kind: "lead", lead };
}
