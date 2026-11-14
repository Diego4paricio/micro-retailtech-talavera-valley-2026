// Kardo AI test bench: what the "perfil" mode hands the prompt builders on
// its own, read from the case's organization profile (giro, city, "Sobre tu
// negocio", brand colors, logo and cover), the same fields the API reads from
// `WorkspaceProfile` for a real organization.

import { whatsappUrlFromPhone } from "../../../packages/contracts/src/organization-prompt.ts";
import type { EvalCase } from "./cases.mts";

export function buildOrganizationPromptInput(
  item: EvalCase,
  imageRefs: readonly string[],
) {
  const [logoRef, coverRef] = imageRefs;
  return {
    industry: item.business.industry,
    city: item.business.city,
    about: item.business.about,
    brand: item.business.brand,
    ...(logoRef ? { logoRef } : {}),
    ...(coverRef ? { coverRef } : {}),
    ...(whatsappUrlFromPhone(item.business.phone)
      ? { whatsappUrl: whatsappUrlFromPhone(item.business.phone) }
      : {}),
  };
}
