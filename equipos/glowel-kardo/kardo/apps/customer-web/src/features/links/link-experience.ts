import type { ExperienceSummary, Touchpoint } from "@kardo/contracts";

/**
 * A Link shows one Experience, like a QR (Links redesign, owner,
 * 2026-10-04): any type, a Página de enlaces included.
 */

/** What the link shows: an Experience being published there right now
 * (it takes a few seconds), else the published one, else the newest that
 * targets it without being published yet. */
export function experienceOnLink(
  link: Touchpoint,
  experiences: readonly ExperienceSummary[],
): {
  experience: ExperienceSummary | null;
  live: boolean;
  publishing: boolean;
} {
  const targeting = experiences
    .filter(
      (item) =>
        !item.archivedAt &&
        (item.targets?.touchpointIds.includes(link.id) ||
          item.touchpointId === link.id),
    )
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
  const publishing = targeting.find(
    (item) =>
      (item.publicationStatus === "pending" ||
        item.publicationStatus === "processing") &&
      item.id !== link.live?.experienceId,
  );
  if (publishing)
    return { experience: publishing, live: false, publishing: true };
  const live = link.live
    ? (experiences.find((item) => item.id === link.live?.experienceId) ?? null)
    : null;
  if (live) return { experience: live, live: true, publishing: false };
  return { experience: targeting[0] ?? null, live: false, publishing: false };
}

/**
 * What «Aún no tienes links» tells the owner (C7c), and whether it still
 * offers «Nuevo link» (C7b, relevo 37): without a dirección the owner
 * cannot create one yet, so the empty state explains that in one line
 * instead of showing a silently disabled button.
 */
export function linksEmptyStateCopy(hasAddress: boolean): {
  description: string;
  offersNewLink: boolean;
} {
  if (!hasAddress)
    return {
      description: "Primero elige tu link en Kardo.",
      offersNewLink: false,
    };
  return {
    description:
      "Una dirección para compartir tu página por WhatsApp o Instagram. Tu página ya se ve en tu QR.",
    offersNewLink: true,
  };
}
