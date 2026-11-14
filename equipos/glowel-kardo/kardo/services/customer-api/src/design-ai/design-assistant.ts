import { PageDesignSchema } from "@kardo/contracts";
import { Value } from "@sinclair/typebox/value";
import { UnavailableError } from "../errors.js";
// Side-effect only: registers the `uri`/`uuid`/… format checkers
// `Value.Check` needs to evaluate `PageDesignSchema` at all — required here
// too since `checkDesignSchemaShape` below is also called standalone (by
// `scripts/dev/ai-bridge/check.mjs`), not only from `design-generate.ts`
// (which already imports this module transitively).
import "../validation/formats.js";
import { extractFenced, tryParseJsonObject } from "../custom-html/assistant.js";

// ---------------------------------------------------------------------------
// AI in blocks (ADR 018 addendum 3, 2026-09-30): parsing and normalizing a
// full `PageDesign` the AI drafted, before `design-generate.ts` runs it
// through `Value.Check(PageDesignSchema, …)` and `checkDesign`. Mirrors
// `assistant.ts`'s role for the modo HTML path, reusing its tolerant JSON
// extraction instead of duplicating it.
// ---------------------------------------------------------------------------

export type DesignGenerationDraft = {
  /** Not yet validated: `Value.Check(PageDesignSchema, …)` and `checkDesign`
   * (both in `design-generate.ts`) are what actually decide this is a real
   * `PageDesign`. */
  design: unknown;
  notes: string;
  /** Menú and Catálogo: the owner's photos matched to dishes or products,
   * not yet checked (`pickItemPhotos` in `design-generate.ts` does). */
  itemPhotos?: unknown;
};

/**
 * Robustly reads a model's answer as `{ design, notes }`, whether it comes
 * back as a bare JSON object or one fenced in a ```json block. Unlike modo
 * HTML's answer, there is no sensible fallback shape to recover from prose:
 * a design is a whole object graph, not two named text fields, so an answer
 * that is not valid JSON with a `design` object throws.
 */
export function parseDesignGenerationResponse(
  raw: string,
): DesignGenerationDraft {
  const candidates = [extractFenced(raw, "json"), raw.trim()].filter(
    (value): value is string => value !== undefined && value.length > 0,
  );
  for (const candidate of candidates) {
    const parsed = tryParseJsonObject(candidate);
    if (parsed && typeof parsed.design === "object" && parsed.design !== null) {
      return {
        design: parsed.design,
        notes: typeof parsed.notes === "string" ? parsed.notes : "",
        ...(parsed.itemPhotos !== undefined
          ? { itemPhotos: parsed.itemPhotos }
          : {}),
      };
    }
  }
  throw new UnavailableError(
    "AI_UNAVAILABLE",
    "Kardo's AI design generator did not return a usable design.",
  );
}

export type UnknownRecord = Record<string, unknown>;

export function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Gives a section/block id a valid shape (`^[a-zA-Z0-9_-]{1,64}$`), unique
 * against every id already reserved (content items, and every id normalized
 * so far in this same design): a made-up or repeated id from the model is
 * replaced with a fresh one instead of failing the whole generation over
 * something `checkDesign` would otherwise flag as "Repeated id.". */
function normalizeId(raw: unknown, used: Set<string>, prefix: string): string {
  const cleaned =
    typeof raw === "string"
      ? raw.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)
      : "";
  if (cleaned && !used.has(cleaned)) {
    used.add(cleaned);
    return cleaned;
  }
  let n = used.size + 1;
  let candidate = `${prefix}-${n}`;
  while (used.has(candidate)) {
    n += 1;
    candidate = `${prefix}-${n}`;
  }
  used.add(candidate);
  return candidate;
}

/**
 * Walks a freshly parsed, untrusted design draft and (1) normalizes every
 * section and block id, (2) removes any image reference outside the
 * library the prompt offered. Mutates and returns the input for convenience.
 * The caller still runs the real schema and rule checks afterward — this
 * only keeps two whole classes of otherwise-certain validation failures
 * (bad ids, invented images) from burning a correction turn.
 */
export function normalizeGeneratedDesign(
  raw: unknown,
  reservedIds: readonly string[],
  allowedImageRefs: ReadonlySet<string>,
): unknown {
  if (!isRecord(raw)) return raw;
  const used = new Set(reservedIds);

  // A photo background without a usable photo stays a photo background
  // with no `imageRef` (a photo space: its `color` shows until the owner
  // uploads one). Until 2026-10-03 it became `kind: "none"`, which drops
  // the dark color the guide asks for, so the white text on top landed on
  // the light page (the test bench's vet and school covers).
  function normalizeBackground(value: unknown): void {
    if (!isRecord(value)) return;
    if (value.kind !== "image") return;
    const ref = value.imageRef;
    if (
      ref !== undefined &&
      (typeof ref !== "string" || !allowedImageRefs.has(ref))
    )
      delete value.imageRef;
  }

  // "Sin banco de fotos" (2026-10-03): an absent imageRef is a deliberate
  // empty slot ("espacio para foto"), never a reason to drop a block. Only a
  // ref the prompt never offered is stripped (falls back to a placeholder)
  // instead of discarding the whole block/photo the way an earlier required
  // `imageRef` used to.
  function normalizeImageRef(value: UnknownRecord): void {
    const ref = value.imageRef;
    if (ref === undefined) return;
    if (typeof ref !== "string" || !allowedImageRefs.has(ref))
      delete value.imageRef;
  }

  function normalizeBlock(block: unknown): UnknownRecord | null {
    if (!isRecord(block)) return null;
    if (block.kind === "image") normalizeImageRef(block);
    if (block.kind === "gallery" && Array.isArray(block.images)) {
      block.images = block.images.filter(isRecord);
      for (const image of block.images as UnknownRecord[])
        normalizeImageRef(image);
    }
    block.id = normalizeId(block.id, used, "b");
    return block;
  }

  if (isRecord(raw.style)) normalizeBackground(raw.style.background);

  if (Array.isArray(raw.sections)) {
    raw.sections = raw.sections
      .map((section: unknown): UnknownRecord | null => {
        if (!isRecord(section)) return null;
        section.id = normalizeId(section.id, used, "s");
        normalizeBackground(section.background);

        if (Array.isArray(section.items)) {
          section.items = section.items
            .map((item: unknown): UnknownRecord | null => {
              if (!isRecord(item)) return null;
              const block = normalizeBlock(item.block);
              if (!block) return null;
              item.block = block;
              return item;
            })
            .filter(
              (item: UnknownRecord | null): item is UnknownRecord =>
                item !== null,
            );
        } else if (Array.isArray(section.columns)) {
          section.columns = section.columns.map((column: unknown) =>
            Array.isArray(column)
              ? column
                  .map((block: unknown) => normalizeBlock(block))
                  .filter((block): block is UnknownRecord => block !== null)
              : column,
          );
        }
        return section;
      })
      .filter(
        (section: UnknownRecord | null): section is UnknownRecord =>
          section !== null,
      );
  }

  return raw;
}

/**
 * Just the schema-shape half of validating a design (`Value.Check` against
 * `PageDesignSchema`), exposed on its own so a caller that does not itself
 * depend on `@sinclair/typebox` — `scripts/dev/ai-bridge/check.mjs`,
 * resolving this module by a relative path outside any package's own
 * `node_modules` — can still run it. `design-generate.ts`'s review loop
 * uses `Value.Check` directly instead (no need to go through this).
 */
export function checkDesignSchemaShape(design: unknown): {
  ok: boolean;
  errors: string[];
} {
  if (Value.Check(PageDesignSchema, design)) return { ok: true, errors: [] };
  const errors = [...Value.Errors(PageDesignSchema, design)]
    .slice(0, 15)
    .map((error) => `${error.path || "(root)"}: ${error.message}`);
  return { ok: false, errors };
}
