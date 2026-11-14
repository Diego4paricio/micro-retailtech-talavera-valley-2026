import {
  type Industry,
  type WorkspaceProfile,
  whatsappUrlFromPhone,
} from "@kardo/contracts";
import { useMemo } from "react";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useWorkspaceProfile } from "../settings/use-workspace-profile.js";
import type { StudioOrganizationBrand } from "./model/organization-brand.js";

/** The template giro (`StudioTemplate.giro`) that fits the organization's
 * `industry` best, to open the template list already filtered. Exhaustive
 * on purpose: a giro added to the catalog cannot be forgotten here
 * (domain audit A2-5). */
const templateGiroByIndustry: Record<Industry, string | null> = {
  restaurante: "restaurante",
  cafeteria: "café",
  bar: "restaurante",
  hotel: "hotel",
  retail: "tienda",
  salud: "profesional",
  belleza: "salón",
  servicios: "profesional",
  eventos: "eventos",
  educacion: "escuela",
  inmobiliaria: "inmobiliaria",
  floreria: "florería",
  panaderia: "café",
  agencia: "profesional",
  papeleria: "tienda",
  otro: null,
};

/** The template giro for a profile's industry (`null`: none fits). */
export function templateGiroFor(
  industry: string | null | undefined,
): string | null {
  return industry && industry in templateGiroByIndustry
    ? templateGiroByIndustry[industry as Industry]
    : null;
}

/**
 * Configuración → Marca and Organización as the Estudio uses them on its
 * own (2026-10-02): the logo, the cover, the brand colors and the giro,
 * and since 2026-10-03 the WhatsApp and the hours the templates fill in.
 * `null` until the profile loads (or when it cannot be read).
 */
export function useOrganizationBrand(): {
  brand: StudioOrganizationBrand | null;
  templateGiro: string | null;
  /** Configuración → General's raw record, for a field that offers to save
   * something there itself (C5e: a WhatsApp number typed on a button;
   * IA6: one typed in the IA's own form). `null` until it loads. */
  profile: WorkspaceProfile | null;
  /** Re-reads the profile after such a save, so `brand.whatsappUrl` (and
   * every button or template that fills itself from it) catches up without
   * reloading the whole Estudio. */
  reload: () => Promise<void>;
} {
  const { workspace } = useWorkspace();
  const profile = useWorkspaceProfile();
  const derived = useMemo(() => {
    const data = profile.data;
    if (!data) return { brand: null, templateGiro: null };
    return {
      brand: {
        name: workspace.name,
        logoAssetId: data.logoAssetId,
        coverAssetId: data.coverAssetId,
        brand: data.brand,
        whatsappUrl: whatsappUrlFromPhone(data.phone, data.country),
        hours: data.hours,
      },
      templateGiro: templateGiroFor(data.industry),
    };
  }, [profile.data, workspace.name]);
  return { ...derived, profile: profile.data, reload: profile.reload };
}
