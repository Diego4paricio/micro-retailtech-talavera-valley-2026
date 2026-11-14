import type {
  ExperienceSummary,
  PublicationBatch,
  PublishIntentOptions,
} from "@kardo/contracts";
import { experiencesApi } from "../../api/experiences.js";
import { emptyTargets } from "./targets.js";

/*
 * What a page shows where (domain audit 2026-10-13, A9-7 and A9-8). Putting a
 * page on a QR, a tag or a link, and publishing it again where it already
 * shows, are Páginas operations: every screen that does it (the QR's and the
 * link's «Cambiar lo que muestra», «Nuevo QR o etiqueta», Primeros pasos,
 * «Editar productos», «Crea un QR con esta página») goes through here, so
 * they all take over exactly what the owner chose and nothing else. The
 * server drops the place from the page that loses it (A9-4).
 */

/** Publishing that takes over only `touchpointIds` (never any other place
 * that shows another page). */
export function replacing(
  touchpointIds: readonly string[],
): PublishIntentOptions {
  return { replaceTargets: [...touchpointIds] };
}

/**
 * Puts `experience` on one QR, tag or link and publishes it. It keeps every
 * other place the page had and only takes this one over: the page showing
 * there before stops listing it.
 */
export async function showExperienceOn(
  workspaceId: string,
  experience: Pick<ExperienceSummary, "id" | "targets">,
  touchpointId: string,
): Promise<PublicationBatch> {
  const targets = experience.targets ?? emptyTargets;
  if (!targets.touchpointIds.includes(touchpointId))
    await experiencesApi.setTargets(workspaceId, experience.id, {
      touchpointIds: [...targets.touchpointIds, touchpointId],
      groupIds: targets.groupIds,
    });
  return experiencesApi.publish(
    workspaceId,
    experience.id,
    undefined,
    replacing([touchpointId]),
  );
}

/**
 * Publishes a page again where it already is (a price change, a new style):
 * it never takes a QR or a link from another page.
 */
export function republishInPlace(
  workspaceId: string,
  experienceId: string,
): Promise<PublicationBatch> {
  return experiencesApi.publish(
    workspaceId,
    experienceId,
    undefined,
    replacing([]),
  );
}

/**
 * Publishes again a page that is already live, so a change made in
 * Primeros pasos (its items, its style) reaches the customers without
 * another step (2026-10-04, Chrome test with the owner). A page that is
 * not live yet waits for «Cómo te encuentran».
 */
export async function republishIfLive(
  workspaceId: string,
  experience: Pick<ExperienceSummary, "id" | "liveTouchpointCount">,
): Promise<boolean> {
  if ((experience.liveTouchpointCount ?? 0) === 0) return false;
  await republishInPlace(workspaceId, experience.id);
  return true;
}
