import type { AssetUsage } from "@kardo/contracts";

/**
 * Where a library file is in use, in the words of the «Dónde se usa» list
 * (domain audit A2-45): not only pages, also the business profile (logo,
 * portada, fondo) and the QR designs that carry it as their logo. A file the
 * profile uses cannot be deleted; a QR logo is taken out of its designs.
 */

const profileLabels = {
  logo: "Logo de tu negocio",
  cover: "Portada",
  background: "Fondo de tus páginas",
} as const;

export type AssetUsageSummary = {
  /** Profile uses and QR logos, as list lines. */
  extras: { key: string; text: string }[];
  /** Deleting is blocked: a page or the profile still uses the file. */
  blocksDelete: boolean;
  /** Nothing at all uses it. */
  isUnused: boolean;
};

export function summarizeAssetUsage(usage: AssetUsage): AssetUsageSummary {
  const extras: { key: string; text: string }[] = (usage.profile ?? []).map(
    (use) => ({ key: `profile-${use}`, text: profileLabels[use] }),
  );
  const qr = usage.qrLogoCount ?? 0;
  if (qr > 0)
    extras.push({
      key: "qr-logo",
      text: qr === 1 ? "Logo de 1 diseño de QR" : `Logo de ${qr} diseños de QR`,
    });
  const usedByPage = usage.experiences.length > 0;
  return {
    extras,
    blocksDelete: usedByPage || (usage.profile?.length ?? 0) > 0,
    isUnused: !usedByPage && extras.length === 0,
  };
}
