import {
  type Asset,
  buildCustomHtmlPrompt,
  type ConceptBrief,
  type CustomHtmlPromptInput,
  type DesignableExperienceType,
  type ExperienceContent,
  organizationPromptData,
  type WorkspaceProfile,
} from "@kardo/contracts";

/**
 * "Copiar instrucciones para tu IA": the prompt a customer pastes into
 * ChatGPT, Claude or Gemini, built by `buildCustomHtmlPrompt` from
 * `@kardo/contracts` (the same builder Kardo's AI uses on the server) in its
 * `code` output: one HTML code block that starts with <style>.
 */

export type { CustomHtmlPromptInput };

type AnyContent = {
  title?: string;
  description?: string;
  displayName?: string;
  headline?: string;
  bio?: string;
  links?: { label: string; url: string }[];
  socials?: { network: string }[];
};

/** A readable name for a library image ("logo-cafe-nube.png" → "logo cafe nube"). */
export function imageLabel(asset: Pick<Asset, "filename"> | undefined): string {
  const name = asset?.filename?.replace(/\.[a-z0-9]{2,5}$/i, "") ?? "";
  const readable = name.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return readable || "Imagen de tu marca";
}

/** Everything the prompt needs, from the page, its brief and the library. */
export function promptInputFrom({
  type,
  businessName,
  brief,
  content,
  assets,
  profile,
}: {
  type: DesignableExperienceType;
  businessName: string;
  brief: ConceptBrief;
  content: ExperienceContent;
  assets: readonly Pick<Asset, "id" | "filename">[];
  /** The organization's profile: the same brand Kardo's AI uses on its own
   * (giro, city, "Sobre tu negocio", colors, logo and cover) goes into the
   * copied instructions too. */
  profile?: WorkspaceProfile | null | undefined;
}): CustomHtmlPromptInput {
  const value = content as AnyContent;
  const text = (item: string | undefined) => item?.trim() || undefined;
  const byId = new Map(assets.map((asset) => [asset.id, asset]));
  const links = (value.links ?? [])
    .filter((link) => link.label.trim() && link.url.trim())
    .map((link) => ({ label: link.label.trim(), url: link.url.trim() }));
  const headline =
    type === "linkpage"
      ? text(value.bio)
      : type === "profile"
        ? text(value.headline)
        : text(value.description);
  const title = type === "links" ? text(value.title) : undefined;
  const displayName = type === "links" ? undefined : text(value.displayName);
  return {
    type,
    businessName: businessName.trim() || displayName || title || "Mi negocio",
    brief: {
      ...brief,
      description: brief.description.trim(),
      ...(brief.tone?.trim() ? { tone: brief.tone.trim() } : {}),
    },
    images: [
      ...new Set(
        [
          profile?.logoAssetId,
          ...brief.imageRefs,
          profile?.coverAssetId,
        ].filter((ref): ref is string => typeof ref === "string"),
      ),
    ].map((ref) => ({
      ref,
      label:
        ref === profile?.logoAssetId
          ? "Logo del negocio"
          : ref === profile?.coverAssetId
            ? "Portada del negocio"
            : imageLabel(byId.get(ref)),
    })),
    ...(profile
      ? {
          // The same builder as Kardo's AI in the API (A2-43).
          organization: organizationPromptData(profile, {
            logoRef: profile.logoAssetId,
            coverRef: profile.coverAssetId,
          }),
        }
      : {}),
    content: {
      ...(title ? { title } : {}),
      ...(displayName ? { displayName } : {}),
      ...(headline ? { headline } : {}),
      links,
      ...(type === "linkpage"
        ? {
            socials: (value.socials ?? []).map((social) => ({
              network: social.network,
            })),
          }
        : {}),
    },
  };
}

/** The prompt for the customer's own AI. */
export function customHtmlPrompt(input: CustomHtmlPromptInput): string {
  return buildCustomHtmlPrompt({ ...input, output: "code" });
}

// ---------------------------------------------------------------------------
// Opening the prompt in another AI
// ---------------------------------------------------------------------------

export type AiService = "chatgpt" | "claude" | "gemini";

export const aiServices: Record<
  AiService,
  { label: string; home: string; prefill: ((q: string) => string) | null }
> = {
  chatgpt: {
    label: "ChatGPT",
    home: "https://chatgpt.com/",
    prefill: (q) => `https://chatgpt.com/?q=${q}`,
  },
  claude: {
    label: "Claude",
    home: "https://claude.ai/new",
    prefill: (q) => `https://claude.ai/new?q=${q}`,
  },
  // Gemini has no supported way to prefill a prompt from a link.
  gemini: {
    label: "Gemini",
    home: "https://gemini.google.com/app",
    prefill: null,
  },
};

/** Longest prefilled link we open; longer prompts are pasted instead. */
export const maxPrefillUrlLength = 7_000;

/**
 * Where "Abrir en …" goes: the prompt prefilled in the link when the service
 * supports it and the link stays short enough; otherwise the service's home
 * (the prompt is on the clipboard to paste).
 */
export function aiServiceUrl(
  service: AiService,
  prompt: string,
): { url: string; prefilled: boolean } {
  const spec = aiServices[service];
  if (spec.prefill) {
    const url = spec.prefill(encodeURIComponent(prompt));
    if (url.length <= maxPrefillUrlLength) return { url, prefilled: true };
  }
  return { url: spec.home, prefilled: false };
}
