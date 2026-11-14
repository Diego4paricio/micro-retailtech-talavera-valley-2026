import type { PublicationStatus } from "@kardo/contracts";
import { pagePublishState } from "../../experiences/workspace-model.js";

/**
 * "¿Publicada o solo guardada?" (relevo 37, B3d/E6): Mateo and Paola saved a
 * design and had no way to tell whether their customers already saw it. The
 * dot + word next to Publicar (`StudioBar`) and the notice in the IA rail
 * both read this.
 */

/** Matches `components/SettingsBlocks.tsx`'s `StatusText`: a plain colored
 * dot, no box or halo. */
export type PublishTone = "on" | "warning";

export type PublishBadge = { label: string; tone: PublishTone };

export type PublishStatusInput = {
  publicationStatus: PublicationStatus;
  /** Undefined reads as `false` (nothing to compare against yet). */
  hasUnpublishedChanges?: boolean | undefined;
  /** A Touchpoint or group can still show an older, otherwise-"published"
   * version after a newer attempt failed or is mid-flight; this catches it
   * even when `publicationStatus` itself is not `"published"`. */
  liveTouchpointCount?: number | undefined;
  /** An archived page is not shown anywhere and has no badge. */
  archivedAt?: string | null | undefined;
};

export type PublishStatus = {
  /** Shown somewhere, right now, on at least one Touchpoint or Link. */
  live: boolean;
  /** Null while nothing has ever gone live (just "Publicar" is enough) or
   * while a publish is mid-flight or just failed (its own notice already
   * says so — this would only repeat it). */
  badge: PublishBadge | null;
};

export function publishStatusOf(input: PublishStatusInput): PublishStatus {
  // The same rule as the Páginas list (domain audit A2-23).
  const { status, live } = pagePublishState(input);
  if (status === "published")
    return { live, badge: { label: "Publicada", tone: "on" } };
  if (status === "changes")
    return { live, badge: { label: "Cambios sin publicar", tone: "warning" } };
  return { live, badge: null };
}
