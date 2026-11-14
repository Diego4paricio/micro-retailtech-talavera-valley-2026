import type {
  CreateLink,
  LinkSlugAvailability,
  LinkSlugSuggestion,
  Touchpoint,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";
import { experiencesApi } from "./experiences.js";
import { touchpointsApi } from "./touchpoints.js";

/** What a link's address recommendation reads: the Experience it shows. */
export type LinkAddressContext = {
  name?: string | undefined;
  type?: string | undefined;
  /** The link being renamed: its own address is never «taken». */
  touchpointId?: string | undefined;
};

function linkQuery(context: LinkAddressContext, extra: Record<string, string>) {
  const params = new URLSearchParams(extra);
  if (context.name?.trim()) params.set("name", context.name.trim());
  if (context.type) params.set("type", context.type);
  if (context.touchpointId) params.set("touchpointId", context.touchpointId);
  return params.toString();
}

/**
 * A Link is a Touchpoint with `kind: "link"` that shows one Experience,
 * like a QR (Links redesign, owner, 2026-10-04), at its own address,
 * kardo.com.mx/<negocio>/<link>.
 */
export const linksApi = {
  /**
   * Creates a Link that shows `experienceId` at kardo.com.mx/<negocio>/<slug>
   * and adds it to the Experience's destinations, without publishing: the
   * publish dialog decides where the page goes before publishing (round 4,
   * B1 — a page that never went live goes only to its new link).
   */
  createWithoutPublishing: (workspaceId: string, input: CreateLink) =>
    apiRequest<Touchpoint>(`/v1/workspaces/${workspaceId}/links`, {
      method: "POST",
      body: input,
    }),
  /**
   * Creates a Link that already shows `experienceId` at
   * kardo.com.mx/<negocio>/<slug>, then publishes the Experience there. The
   * business needs its address first (Primeros pasos, paso 1, or
   * Configuración). When publishing fails the Link still exists:
   * `published: false` and `publishError` say why.
   */
  createForExperience: async (workspaceId: string, input: CreateLink) => {
    const link = await apiRequest<Touchpoint>(
      `/v1/workspaces/${workspaceId}/links`,
      { method: "POST", body: input },
    );
    try {
      // A brand-new link never takes over another page's QR or link (round
      // 4, B1): whatever else the page carries from before is kept.
      await experiencesApi.publish(workspaceId, input.experienceId, undefined, {
        replaceTargets: [],
      });
      return { link, published: true as const, publishError: null };
    } catch (error) {
      return { link, published: false as const, publishError: error };
    }
  },
  slugSuggestion: (
    workspaceId: string,
    context: { name: string; type?: string | undefined },
    signal?: AbortSignal,
  ) =>
    apiRequest<LinkSlugSuggestion>(
      `/v1/workspaces/${workspaceId}/links/slug-suggestion?${linkQuery(context, {})}`,
      { signal },
    ),
  slugAvailability: (
    workspaceId: string,
    slug: string,
    context: LinkAddressContext,
    signal?: AbortSignal,
  ) =>
    apiRequest<LinkSlugAvailability>(
      `/v1/workspaces/${workspaceId}/links/slug-availability?${linkQuery(context, { slug })}`,
      { signal },
    ),
  /** Once every 7 days; the old address keeps leading to the new one. */
  setSlug: (workspaceId: string, linkId: string, slug: string) =>
    apiRequest<Touchpoint>(
      `/v1/workspaces/${workspaceId}/links/${linkId}/slug`,
      { method: "PUT", body: { slug } },
    ),
  /** The Link that kardo.com.mx/<negocio> opens. */
  setMain: (workspaceId: string, linkId: string) =>
    apiRequest<void>(`/v1/workspaces/${workspaceId}/main-link`, {
      method: "PUT",
      body: { touchpointId: linkId },
    }),
  retire: (workspaceId: string, linkId: string) =>
    touchpointsApi.retire(workspaceId, linkId),
  /** Paused: whoever opens it sees that it is not available; nothing is
   * lost and it resumes as it was. Only a published (active) link pauses. */
  setPaused: (workspaceId: string, linkId: string, paused: boolean) =>
    touchpointsApi.setStatus(workspaceId, linkId, {
      status: paused ? "paused" : "active",
    }),
};

// The public addresses live in one place with the QR's (domain audit A9-22).
export { linkAddressLabel, linkPublicUrl } from "../lib/touchpoint-urls.js";
