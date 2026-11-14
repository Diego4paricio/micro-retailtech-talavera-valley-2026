import { whatsappUrlFromPhone } from "@kardo/contracts";

/**
 * Contestar una solicitud (relevo 37, C3a): WhatsApp, Llamar y Correo, cada
 * uno solo cuando el dato existe. Nada aquí toca el DOM, para poder
 * probarlo sin un navegador.
 */

/** El saludo con el que Kardo abre la conversación de WhatsApp. */
export function leadWhatsAppGreeting(
  name: string | null | undefined,
  businessName: string,
): string {
  const who = name?.trim();
  return who
    ? `Hola ${who}, te escribo de ${businessName} por tu solicitud`
    : `Hola, te escribo de ${businessName} por tu solicitud`;
}

/** Lo que se dice cuando no se sabe de qué país es el teléfono. */
export const unknownPhoneCountryNotice =
  "No sabemos de qué país es este número";

/**
 * El enlace base `https://wa.me/<dígitos>` de un teléfono, o `undefined`
 * cuando no se puede saber a qué país pertenece:
 * - con «+» (o «00») al inicio ya trae su clave de país: se respeta;
 * - sin «+», 10 dígitos son un número de México y llevan 52, pero solo si el
 *   negocio es de México (en otro país, los mismos 10 dígitos podrían ser de
 *   cualquiera);
 * - sin «+», de 11 a 15 dígitos se toman como ya con clave de país.
 */
export function leadWhatsAppBase(
  phone: string | null | undefined,
  country = "MX",
): string | undefined {
  const trimmed = phone?.trim() ?? "";
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/\D/g, "");
  if (/^(\+|00)/.test(trimmed)) {
    const international = trimmed.startsWith("00") ? digits.slice(2) : digits;
    return international.length >= 10 && international.length <= 15
      ? `https://wa.me/${international}`
      : undefined;
  }
  return whatsappUrlFromPhone(trimmed, country);
}

/** Hay teléfono, pero no se sabe de qué país es: avisar en vez de adivinar. */
export function leadPhoneCountryUnknown(
  phone: string | null | undefined,
  country = "MX",
): boolean {
  return Boolean(phone?.trim()) && !leadWhatsAppBase(phone, country);
}

/**
 * `https://wa.me/<digits>?text=…` para el teléfono de una solicitud, o
 * `undefined` cuando el teléfono no existe o no se sabe de qué país es.
 */
export function leadWhatsAppUrl(
  phone: string | null | undefined,
  name: string | null | undefined,
  businessName: string,
  country = "MX",
): string | undefined {
  const base = leadWhatsAppBase(phone, country);
  if (!base) return undefined;
  const text = encodeURIComponent(leadWhatsAppGreeting(name, businessName));
  return `${base}?text=${text}`;
}

/**
 * `tel:` con los dígitos del teléfono (y un `+` inicial si lo trae):
 * espacios, paréntesis y guiones solo confunden al marcador.
 */
export function leadTelUrl(
  phone: string | null | undefined,
): string | undefined {
  const trimmed = phone?.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/[^\d+]/g, "");
  return digits ? `tel:${digits}` : undefined;
}

/** `mailto:` con un asunto corto, para que el correo se identifique antes
 * de abrirlo. */
export function leadMailUrl(email: string, businessName: string): string {
  const subject = encodeURIComponent(`Tu solicitud a ${businessName}`);
  return `mailto:${encodeURIComponent(email)}?subject=${subject}`;
}

export type LeadContactLinks = {
  whatsapp?: string;
  tel?: string;
  mailto: string;
};

/** Los tres enlaces de una solicitud; `whatsapp` y `tel` faltan cuando no
 * hay teléfono útil. */
export function leadContactLinks(
  lead: { name?: string | null; phone?: string | null; email: string },
  businessName: string,
  country = "MX",
): LeadContactLinks {
  const whatsapp = leadWhatsAppUrl(
    lead.phone,
    lead.name,
    businessName,
    country,
  );
  const tel = leadTelUrl(lead.phone);
  return {
    ...(whatsapp ? { whatsapp } : {}),
    ...(tel ? { tel } : {}),
    mailto: leadMailUrl(lead.email, businessName),
  };
}

/** La pregunta de confirmación después de tocar un botón de contacto
 * (C3b). */
export function confirmContactedQuestion(
  name: string | null | undefined,
): string {
  const who = name?.trim();
  return who ? `¿Ya atendiste a ${who}?` : "¿Ya atendiste esta solicitud?";
}

/**
 * Solo una solicitud «Por atender» pregunta «¿ya la atendiste?» al tocar un
 * botón de contacto: una ya atendida o cerrada no debe volver atrás.
 */
export function shouldAskIfAttended(
  status: "new" | "contacted" | "closed" | undefined,
): boolean {
  return (status ?? "new") === "new";
}
