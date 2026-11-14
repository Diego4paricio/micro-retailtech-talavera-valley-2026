import type { FirstStepId, FirstStepsPlan } from "./first-steps-model.js";

/** Step names in the owner's words, never the platform's (relevo 31). */
export const firstStepTitles: Record<FirstStepId, string> = {
  business: "Tu negocio",
  content: "Tu página",
  look: "Cómo se ve",
  qr: "Cómo te encuentran",
  try: "Pruébalo",
};

export function firstStepDetail(id: FirstStepId, plan: FirstStepsPlan): string {
  switch (id) {
    case "business":
      return "Tipo de negocio, WhatsApp y horario";
    case "content":
      return plan.type === "menu"
        ? "Escribe tu menú o sube el que ya tienes"
        : `Escribe tus ${plan.noun.many} o sube lo que ya tienes`;
    case "look":
      return "Así la ven tus clientes; elige su estilo";
    case "qr":
      return "Un QR, una etiqueta NFC o un link";
    case "try":
      return "Ábrela como lo haría un cliente";
  }
}
