import { CUSTOM_HTML_LIMITS, type ImageMediaType } from "@kardo/contracts";
import { UnavailableError } from "../errors.js";

/** The vision input a generation sends per image: just enough to build a
 * model `image` content block. See `custom-html/images.ts` for the richer
 * `CustomHtmlPromptImage` (adds `ref`/`label`) the route collects these
 * from. */
export type CustomHtmlVisionImage = {
  mediaType: ImageMediaType;
  base64: string;
};

/** One turn's drafted page, before the review loop's own sanitizer check
 * (`generate.ts`) — the shape every provider's answer parses into. */
export type CustomHtmlGeneration = {
  html: string;
  css: string;
  notes: string;
};

export function enforceLimits(
  generation: CustomHtmlGeneration,
): CustomHtmlGeneration {
  return {
    html: generation.html.slice(0, CUSTOM_HTML_LIMITS.html),
    css: generation.css.slice(0, CUSTOM_HTML_LIMITS.css),
    notes: generation.notes.slice(0, 1_000),
  };
}

/**
 * Robustly reads a model's answer as `{ html, css, notes }`, whether it
 * comes back as a bare JSON object, a JSON object fenced in a ```json
 * block, or (when the model ignores the JSON instruction) separate ```html
 * and ```css fenced blocks with prose notes around them.
 */
export function parseCustomHtmlResponse(raw: string): CustomHtmlGeneration {
  const jsonCandidates = [extractFenced(raw, "json"), raw.trim()].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
  for (const candidate of jsonCandidates) {
    const parsed = tryParseJsonObject(candidate);
    if (
      parsed &&
      typeof parsed.html === "string" &&
      typeof parsed.css === "string"
    ) {
      return {
        html: parsed.html,
        css: parsed.css,
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
      };
    }
  }

  const html = extractFenced(raw, "html");
  if (html !== undefined) {
    const css = extractFenced(raw, "css") ?? "";
    const notes = raw.replace(/```[\s\S]*?```/g, "").trim();
    return { html, css, notes: notes.slice(0, 1_000) };
  }

  throw new UnavailableError(
    "AI_UNAVAILABLE",
    "Kardo's AI HTML generator did not return a usable design.",
  );
}

/** Exported (2026-09-30, AI in blocks) so `design-assistant.ts` reuses the
 * exact same tolerant JSON-object parsing for the `{ design, notes }` and
 * html-block shapes instead of duplicating it. */
export function tryParseJsonObject(
  value: string,
): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

/** Exported for the same reason as `tryParseJsonObject` above. */
export function extractFenced(
  text: string,
  language: string,
): string | undefined {
  const pattern = new RegExp(`\`\`\`${language}\\s*([\\s\\S]*?)\`\`\``, "i");
  const match = text.match(pattern);
  return match?.[1]?.trim();
}
