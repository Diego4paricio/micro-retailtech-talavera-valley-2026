import type { ExperienceSummary } from "@kardo/contracts";

/** The Experience edited last. Every type can go on a QR or an NFC since
 * «Página de enlaces» became a normal type (Links phase 1, 2026-10-04). */
export function latestExperience(
  items: readonly ExperienceSummary[],
): ExperienceSummary | null {
  const candidates = items.filter((item) => !item.archivedAt);
  candidates.sort((a, b) =>
    (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""),
  );
  return candidates[0] ?? null;
}
