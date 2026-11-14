import type {
  AvailabilityExperience,
  AvailabilityOverview,
  SaveItemAvailability,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}`;

/**
 * Disponibilidad: live state of Menu and Catalog items. Changes apply on top
 * of the published version at once: they never create a version and never go
 * through publishing.
 */
export const availabilityApi = {
  /** Every non-archived Menu and Catalog with the live state of its items. */
  overview: (workspaceId: string, signal?: AbortSignal) =>
    apiRequest<AvailabilityOverview>(`${base(workspaceId)}/availability`, {
      signal,
    }),
  /**
   * Changes only the listed items (1 to 150). 503
   * `ITEM_AVAILABILITY_UNAVAILABLE` means the public service could not
   * confirm it and nothing was applied; 409 `EXPERIENCE_ARCHIVED` when the
   * Experience was archived meanwhile.
   */
  save: (
    workspaceId: string,
    experienceId: string,
    body: SaveItemAvailability,
  ) =>
    apiRequest<AvailabilityExperience>(
      `${base(workspaceId)}/experiences/${experienceId}/availability`,
      { method: "PUT", body },
    ),
};
