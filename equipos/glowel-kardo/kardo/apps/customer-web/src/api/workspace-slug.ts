import type {
  BusinessSlugAvailability,
  BusinessSlugSuggestion,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";

/** What the recommendation reads: the business as the owner is writing it. */
export type BusinessAddressContext = {
  name: string;
  city?: string | null | undefined;
  industry?: string | null | undefined;
};

function query(
  context: BusinessAddressContext,
  extra: Record<string, string> = {},
) {
  const params = new URLSearchParams({ ...extra, name: context.name.trim() });
  if (context.city?.trim()) params.set("city", context.city.trim());
  if (context.industry) params.set("industry", context.industry);
  return params.toString();
}

/**
 * The business's public address, kardo.com.mx/<slug> (Links redesign,
 * owner, 2026-10-04): a free recommendation (never with numbers), a live
 * check while the owner types, and saving it (once every 7 days).
 */
export const workspaceSlugApi = {
  suggestion: (
    workspaceId: string,
    context: BusinessAddressContext,
    signal?: AbortSignal,
  ) =>
    apiRequest<BusinessSlugSuggestion>(
      `/v1/workspaces/${workspaceId}/slug/suggestion?${query(context)}`,
      { signal },
    ),
  availability: (
    workspaceId: string,
    slug: string,
    context: BusinessAddressContext,
    signal?: AbortSignal,
  ) =>
    apiRequest<BusinessSlugAvailability>(
      `/v1/workspaces/${workspaceId}/slug/availability?${query(context, { slug })}`,
      { signal },
    ),
  save: (workspaceId: string, slug: string) =>
    apiRequest<{ slug: string }>(`/v1/workspaces/${workspaceId}/slug`, {
      method: "PUT",
      body: { slug },
    }),
};

/** Saves the address; resolves to it, or throws the API's Spanish error. */
export async function saveBusinessAddress(
  workspaceId: string,
  slug: string,
): Promise<string> {
  return (await workspaceSlugApi.save(workspaceId, slug)).slug;
}
