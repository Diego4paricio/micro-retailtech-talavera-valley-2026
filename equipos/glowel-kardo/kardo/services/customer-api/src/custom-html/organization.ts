import {
  type OrganizationPromptData,
  organizationPromptData,
  type WorkspaceProfile,
} from "@kardo/contracts";
import type { CustomerIdentity } from "../repositories/context.js";
import type { WorkspaceProfileRepository } from "../repositories/workspace-profile.js";
import type { CustomHtmlPromptImage } from "./images.js";

/**
 * The organization's brand for Kardo's AI (2026-10-02): the profile is read
 * on every generation so the giro, city, "Sobre tu negocio", brand colors,
 * logo and cover reach the prompt without the customer choosing or typing
 * them again. A profile that cannot be read never fails the generation: it
 * just goes without it, as before.
 */
export async function loadOrganizationProfile(
  repository: WorkspaceProfileRepository,
  identity: CustomerIdentity,
  workspaceId: string,
): Promise<WorkspaceProfile | null> {
  try {
    return await repository.getProfile(identity, workspaceId);
  } catch {
    return null;
  }
}

/** Which library images the prompt looks at, in order: the logo first (the
 * one image every design should use), then the ones the customer chose for
 * this page, then the cover. Duplicates go away; `collectCustomHtmlPromptImages`
 * keeps the first `MAX_CUSTOM_HTML_GENERATION_IMAGES`. */
export function organizationImageRefs(
  profile: WorkspaceProfile | null,
  briefRefs: readonly string[],
): string[] {
  const refs = [profile?.logoAssetId, ...briefRefs, profile?.coverAssetId];
  return [
    ...new Set(refs.filter((ref): ref is string => typeof ref === "string")),
  ];
}

/** The profile as prompt data, naming the logo and the cover only when the
 * prompt really carries them (an image that failed to read is not offered),
 * and the prompt images relabeled so the model knows which is which. */
export function organizationPromptInput(
  profile: WorkspaceProfile | null,
  images: readonly CustomHtmlPromptImage[],
): {
  organization: OrganizationPromptData;
  images: { ref: string; label: string }[];
} {
  const has = (ref: string | undefined) =>
    ref !== undefined && images.some((image) => image.ref === ref);
  const logoRef = has(profile?.logoAssetId) ? profile?.logoAssetId : undefined;
  const coverRef = has(profile?.coverAssetId)
    ? profile?.coverAssetId
    : undefined;
  return {
    // The same builder as the panel's «Copiar prompt» (A2-43).
    organization: organizationPromptData(profile, { logoRef, coverRef }),
    images: images.map((image) => ({
      ref: image.ref,
      label:
        image.ref === logoRef
          ? "Logo del negocio"
          : image.ref === coverRef
            ? "Portada del negocio"
            : image.label,
    })),
  };
}
