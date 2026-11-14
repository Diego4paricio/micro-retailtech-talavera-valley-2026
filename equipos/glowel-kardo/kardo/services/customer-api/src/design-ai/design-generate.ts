import { randomUUID } from "node:crypto";
import {
  CanvasSectionSchema,
  checkDesign,
  DESIGN_LIMITS,
  type DesignableExperienceType,
  DesignBlockSchema,
  type DesignCheckContext,
  type DesignIssue,
  type DesignItemPhoto,
  DesignSectionSchema,
  type PageDesign,
  PageDesignSchema,
} from "@kardo/contracts";
import { Value } from "@sinclair/typebox/value";
import { UnavailableError } from "../errors.js";
// Side-effect only: registers the `uri`/`uuid`/… format checkers
// `Value.Check` needs to evaluate `PageDesignSchema` at all (same
// requirement `validation/experience-content.ts` documents).
import "../validation/formats.js";
import type { CustomHtmlVisionImage } from "../custom-html/assistant.js";
import {
  CUSTOM_HTML_MAX_OUTPUT_TOKENS,
  CUSTOM_HTML_MAX_TOKENS_PER_TURN,
  CUSTOM_HTML_MAX_TURNS,
  type CustomHtmlGenerationAudit,
  type CustomHtmlReviewProgress,
  runCustomHtmlReview,
} from "../custom-html/generate.js";
import type {
  CustomHtmlModel,
  CustomHtmlModelMessage,
} from "../custom-html/model.js";
import { usageCostMicroUsd } from "../custom-html/pricing.js";
import {
  type DesignGenerationDraft,
  isRecord,
  normalizeGeneratedDesign,
  parseDesignGenerationResponse,
} from "./design-assistant.js";
import {
  type LayoutContext,
  type LayoutFix,
  reviewLayout,
} from "./design-layout.js";
import {
  lockWhatsAppLinks,
  repairCommonDesignMistakes,
} from "./design-repair.js";
import {
  applyDesignPatch,
  type DesignVisualReviewer,
  parseVisualReview,
  VISUAL_REVIEW_MESSAGE,
} from "./design-visual-review.js";
import { ensureReadablePalette } from "./readable-palette.js";

// ---------------------------------------------------------------------------
// AI in blocks, full page (ADR 018 addendum 3, 2026-09-30): the review loop
// for `POST …/experiences/:id/design/generations`. Same shape as modo
// HTML's `runCustomHtmlReview` (see `generate.ts`) — turn 1 drafts, then
// Kardo's own schema and `checkDesign` rules check the draft; if something
// is wrong and turns remain, the model gets the exact list of problems, in
// Spanish, and one more try. Bounded the same way: at most
// `CUSTOM_HTML_MAX_TURNS` turns and `CUSTOM_HTML_MAX_OUTPUT_TOKENS` total
// output tokens (reused from `generate.ts`, not redefined, since this is one
// shared protection across every Kardo AI generation kind).
//
// Unlike modo HTML, an invalid draft is never handed back as a last resort:
// a `PageDesign` that fails `checkDesign` is not safely renderable the way a
// half-sanitized HTML page still is, so running out of turns with issues
// still open fails the generation instead.
// ---------------------------------------------------------------------------

function textMessage(
  role: "user" | "assistant",
  text: string,
): CustomHtmlModelMessage {
  return { role, content: [{ type: "text", text }] };
}

const RETRY_FORMAT_MESSAGE =
  "Tu respuesta anterior no vino en el formato pedido. Responde de nuevo únicamente con el objeto JSON con las claves design y notes, sin texto antes ni después y sin bloques de código.";

const RETRY_TOO_LONG_MESSAGE =
  "Tu respuesta anterior se cortó porque llegó al límite de tokens antes de terminar. Responde de nuevo con el objeto JSON completo (design y notes), pero más corto: usa menos secciones o bloques, sin perder lo esencial del diseño.";

/** Lists exactly what `checkDesign` (or the schema check before it) found
 * wrong, wrapped in a Spanish instruction, so the model can fix its own
 * answer instead of guessing. The paths and messages themselves stay as
 * `checkDesign` produced them (the same ones the panel's own Estudio shows,
 * translated there for a person; here they go straight to the model, which
 * reads them just fine as they are). */
function describeDesignIssues(issues: readonly DesignIssue[]): string {
  const shown = issues.slice(0, 20);
  const lines = [
    "El diseño de Kardo no pasó la validación. Corrige exactamente estos problemas y responde de nuevo con el objeto JSON completo (design y notes), no solo la parte que cambió:",
    ...shown.map(
      (issue) => `- ${issue.path || "(el diseño completo)"}: ${issue.message}`,
    ),
  ];
  if (issues.length > shown.length) {
    lines.push(
      `... y ${issues.length - shown.length} problema(s) más del mismo tipo.`,
    );
  }
  return lines.join("\n");
}

/** Where the draft breaks the `PageDesign` schema, field by field (the
 * path and the value received), so the model fixes that field instead of
 * guessing which one it was; until 2026-10-02 it only got "does not match
 * the contract". */
function schemaIssues(draft: unknown): DesignIssue[] {
  const seen = new Set<string>();
  const issues: DesignIssue[] = [];
  const add = (path: string, message: string, value: unknown) => {
    if (seen.has(path) || issues.length >= 8) return;
    seen.add(path);
    const received = JSON.stringify(value);
    issues.push({
      path,
      message: `valor no permitido aquí (${message}); recibido: ${
        received === undefined ? "nada" : received.slice(0, 80)
      }. Revisa el nombre del campo y los valores que acepta el contrato.`,
    });
  };
  for (const error of Value.Errors(PageDesignSchema, draft)) {
    const path = error.path || "";
    // A section is a union (columns or canvas): TypeBox stops at "Expected
    // union value", which names no field. Check it against the variant its
    // own `kind` asks for, to name the exact field inside it.
    if (/^\/sections\/\d+$/.test(path) && isRecord(error.value)) {
      const schema =
        error.value.kind === "canvas"
          ? CanvasSectionSchema
          : DesignSectionSchema;
      const inner = [...Value.Errors(schema, error.value)];
      for (const nested of inner) {
        add(`${path}${nested.path}`, nested.message, nested.value);
      }
      if (inner.length > 0) continue;
    }
    add(path, error.message, error.value);
  }
  return issues.length
    ? issues
    : [
        {
          path: "",
          message:
            "El diseño no sigue el contrato PageDesign (revisa nombres de campos y valores permitidos).",
        },
      ];
}

type BlockVariant = { properties?: { kind?: { const?: string } } };

/** The block's own schema, picked by its `kind` from the block union. */
function blockVariantFor(kind: unknown): unknown {
  return (DesignBlockSchema as unknown as { anyOf: BlockVariant[] }).anyOf.find(
    (variant) => variant.properties?.kind?.const === kind,
  );
}

/** The block a `checkDesign` path points at (`sections[0].columns[1][2]`
 * or `sections[0].items[3].block`), if any. */
function blockAt(design: unknown, path: string): unknown {
  const match =
    /^sections\[(\d+)\](?:\.columns\[(\d+)\]\[(\d+)\]|\.items\[(\d+)\]\.block)$/.exec(
      path,
    );
  if (!match || !isRecord(design) || !Array.isArray(design.sections))
    return undefined;
  const section = design.sections[Number(match[1])];
  if (!isRecord(section)) return undefined;
  if (match[2] !== undefined && Array.isArray(section.columns)) {
    const column = section.columns[Number(match[2])];
    return Array.isArray(column) ? column[Number(match[3])] : undefined;
  }
  if (match[4] !== undefined && Array.isArray(section.items)) {
    const item = section.items[Number(match[4])];
    return isRecord(item) ? item.block : undefined;
  }
  return undefined;
}

/**
 * `checkDesign` says only "Invalid block." (the panel shows its own words
 * for it); the model needs the field. Each such issue becomes one line per
 * wrong field of that block, checked against its own kind's schema
 * (2026-10-02: the test bench saw `style: { maxWidth, margin, textAlign }`,
 * CSS names the block style does not have).
 */
function explainInvalidBlocks(
  issues: DesignIssue[],
  design: unknown,
): DesignIssue[] {
  return issues.flatMap((issue) => {
    if (issue.message !== "Invalid block.") return [issue];
    const block = blockAt(design, issue.path);
    const kind = isRecord(block) ? block.kind : undefined;
    const variant = blockVariantFor(kind);
    if (!variant) {
      return [
        {
          path: issue.path,
          message: `bloque con kind desconocido (${JSON.stringify(kind)}); usa uno de los kinds del contrato.`,
        },
      ];
    }
    const errors = [
      ...Value.Errors(variant as typeof DesignBlockSchema, block),
    ].slice(0, 4);
    if (errors.length === 0) return [issue];
    return errors.map((error) => ({
      path: `${issue.path}${error.path}`,
      message: `${error.message === "Unexpected property" ? "campo que no existe en este bloque" : `valor no permitido (${error.message})`}; recibido: ${JSON.stringify(error.value)?.slice(0, 60) ?? "nada"}.`,
    }));
  });
}

export type DesignReviewResult = {
  design: PageDesign;
  notes: string;
  /** The owner's photos matched to dishes or products (Menú, Catálogo). */
  itemPhotos: DesignItemPhoto[];
  /** What the layout review moved or fixed (relevo 29). */
  layoutFixes: LayoutFix[];
  /** The visual review, when it ran: whether the AI found the page fine
   * and how many of its changes were kept. */
  visualReview?: { ok: boolean; applied: number; notes: string };
  audit: CustomHtmlGenerationAudit;
};

/** Which dishes or products may take a photo from the AI's answer, and
 * which images may be given to them (2026-10-03). */
export type ItemPhotoTargets = {
  /** Dishes or products that have no photo yet. */
  itemIds: ReadonlySet<string>;
  /** Photos the owner gave for this page (never the logo or the cover). */
  imageRefs: ReadonlySet<string>;
};

/**
 * Keeps the matches that make sense: a real dish or product without a
 * photo, one of the owner's own photos, each dish and each photo used once.
 * Anything else is dropped silently (never worth another turn): that dish
 * simply keeps its photo space in the Estudio.
 */
export function pickItemPhotos(
  raw: unknown,
  targets: ItemPhotoTargets | undefined,
): DesignItemPhoto[] {
  if (!targets || !Array.isArray(raw)) return [];
  const items = new Set<string>();
  const images = new Set<string>();
  const picked: DesignItemPhoto[] = [];
  for (const entry of raw) {
    if (!isRecord(entry)) continue;
    const { itemId, imageRef } = entry;
    if (typeof itemId !== "string" || typeof imageRef !== "string") continue;
    if (!targets.itemIds.has(itemId) || !targets.imageRefs.has(imageRef))
      continue;
    if (items.has(itemId) || images.has(imageRef)) continue;
    items.add(itemId);
    images.add(imageRef);
    picked.push({ itemId, imageRef });
  }
  return picked;
}

export type DesignReviewInput = {
  model: CustomHtmlModel;
  type: DesignableExperienceType;
  system: string;
  userMessage: string;
  images: readonly CustomHtmlVisionImage[];
  /** Every id the design must not reuse (content links, socials, …). */
  contentItemIds: readonly string[];
  /** Extra content `checkDesign` needs to validate bound blocks precisely
   * (e.g. a Menú's real section ids for a `menu` block's `sectionIds`). */
  checkContext?: DesignCheckContext;
  /** The library images the prompt actually offered: anything else the
   * model writes as an `imageRef` is dropped before validation. */
  allowedImageRefs: ReadonlySet<string>;
  /** Menú and Catálogo: where the owner's photos may go. */
  itemPhotoTargets?: ItemPhotoTargets | undefined;
  /** What the layout review needs beyond the design: the bound texts, the
   * customer's photo choice and the logo (relevo 29). */
  layout?: Omit<LayoutContext, "type"> | undefined;
  /** Draws the validated design so the AI can review it on a phone
   * (design-visual-review.ts). Only the test bench passes one today. */
  visualReviewer?: DesignVisualReviewer | undefined;
  /** False when the caller lacks `experiences.custom_html`: any `html`
   * block the model still drafted is silently dropped before validation,
   * the same way an invented image is — cheaper and safer than asking the
   * model not to (it does not know the caller's permissions) and then
   * refusing the whole generation over it. */
  allowHtmlBlocks: boolean;
  /** The organization's WhatsApp (`whatsappUrlFromPhone`), the only one a
   * button may link to; absent when the business has no phone, and then a
   * WhatsApp button the model still drafts is dropped (design-repair.ts). */
  whatsappUrl?: string | undefined;
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: CustomHtmlReviewProgress) => void) | undefined;
  onSpend?: ((costMicroUsd: number) => void | Promise<void>) | undefined;
};

/** Removes every `html` block (flow and canvas) from a freshly parsed
 * design draft, in place. Never a problem for `checkDesign`'s "must keep
 * the required bound block" rule: `html` is never a required block for any
 * Experience type. */
function stripHtmlBlocks(raw: unknown): void {
  if (!isRecord(raw) || !Array.isArray(raw.sections)) return;
  for (const section of raw.sections) {
    if (!isRecord(section)) continue;
    if (Array.isArray(section.items)) {
      section.items = section.items.filter(
        (item: unknown) =>
          !isRecord(item) ||
          !isRecord(item.block) ||
          item.block.kind !== "html",
      );
    } else if (Array.isArray(section.columns)) {
      section.columns = section.columns.map((column: unknown) =>
        Array.isArray(column)
          ? column.filter(
              (block: unknown) => !isRecord(block) || block.kind !== "html",
            )
          : column,
      );
    }
  }
}

export async function runDesignReview(
  input: DesignReviewInput,
): Promise<DesignReviewResult> {
  const startedAt = Date.now();
  const jobId = randomUUID();
  const maxTurns = CUSTOM_HTML_MAX_TURNS;

  const messages: CustomHtmlModelMessage[] = [
    {
      role: "user",
      content: [
        ...input.images.map((image) => ({
          type: "image" as const,
          mediaType: image.mediaType,
          base64: image.base64,
        })),
        { type: "text" as const, text: input.userMessage },
      ],
    },
  ];

  let turn = 1;
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheReadTokens = 0;
  let totalCacheWriteTokens = 0;
  let totalCostMicroUsd = 0;
  let lastStopReason = "end_turn";
  /** The answer that validated, for the visual review that follows it. */
  let acceptedText = "";
  let visualReview: DesignReviewResult["visualReview"];
  let best:
    | {
        design: PageDesign;
        notes: string;
        itemPhotos: DesignItemPhoto[];
        layoutFixes: LayoutFix[];
      }
    | undefined;

  for (;;) {
    input.onProgress?.({
      stage: turn === 1 ? "generating" : "fixing",
      turn,
      maxTurns,
    });

    const result = await input.model.complete({
      jobId,
      turn,
      maxTurns,
      system: input.system,
      messages,
      maxTokens: CUSTOM_HTML_MAX_TOKENS_PER_TURN,
      signal: input.signal,
      responseContract: "design",
      onStage: (stage) =>
        input.onProgress?.({
          stage:
            stage === "queued"
              ? "queued"
              : turn === 1
                ? "generating"
                : "fixing",
          turn,
          maxTurns,
        }),
    });

    const turnCostMicroUsd = usageCostMicroUsd(input.model.model, result.usage);
    totalInputTokens += result.usage.inputTokens;
    totalOutputTokens += result.usage.outputTokens;
    totalCacheReadTokens += result.usage.cacheReadTokens;
    totalCacheWriteTokens += result.usage.cacheWriteTokens;
    totalCostMicroUsd += turnCostMicroUsd;
    lastStopReason = result.stopReason;
    await input.onSpend?.(turnCostMicroUsd);

    const canRetry =
      turn < maxTurns && totalOutputTokens < CUSTOM_HTML_MAX_OUTPUT_TOKENS;

    if (result.stopReason === "refusal") {
      throw new UnavailableError(
        "AI_UNAVAILABLE",
        "Kardo's AI design generator declined to answer.",
      );
    }

    let parsedDraft: DesignGenerationDraft | undefined;
    try {
      parsedDraft = parseDesignGenerationResponse(result.text);
    } catch {
      parsedDraft = undefined;
    }

    if (!parsedDraft) {
      if (!canRetry) {
        throw new UnavailableError(
          "AI_UNAVAILABLE",
          "Kardo's AI design generator did not return a usable design.",
        );
      }
      messages.push(textMessage("assistant", result.text));
      messages.push(
        textMessage(
          "user",
          result.stopReason === "max_tokens"
            ? RETRY_TOO_LONG_MESSAGE
            : RETRY_FORMAT_MESSAGE,
        ),
      );
      turn += 1;
      continue;
    }

    const normalized = normalizeGeneratedDesign(
      parsedDraft.design,
      input.contentItemIds,
      input.allowedImageRefs,
    );
    if (!input.allowHtmlBlocks) stripHtmlBlocks(normalized);
    // Mistakes with one obvious meaning are fixed here, not in another turn.
    repairCommonDesignMistakes(normalized);
    lockWhatsAppLinks(normalized, input.whatsappUrl);

    input.onProgress?.({ stage: "reviewing", turn, maxTurns });

    const issues: DesignIssue[] = Value.Check(PageDesignSchema, normalized)
      ? explainInvalidBlocks(
          checkDesign(
            input.type,
            normalized as PageDesign,
            input.contentItemIds,
            input.checkContext,
          ),
          normalized,
        )
      : schemaIssues(normalized);

    if (issues.length === 0) {
      // Contrast is arithmetic: fixed here, never worth another turn.
      const readable = ensureReadablePalette(normalized as PageDesign);
      // Placement in numbers (design-layout.ts): margins, alignment, texts
      // that fit, photos in their frame, the customer's photo choice. A
      // review that would break a rule is dropped, never shipped.
      const laidOut = reviewLayout(readable.design, {
        type: input.type,
        ...input.layout,
      });
      const safe =
        checkDesign(
          input.type,
          laidOut.design,
          input.contentItemIds,
          input.checkContext,
        ).length === 0;
      best = {
        design: safe ? laidOut.design : readable.design,
        notes: parsedDraft.notes.slice(0, 1_000),
        itemPhotos: pickItemPhotos(
          parsedDraft.itemPhotos,
          input.itemPhotoTargets,
        ),
        layoutFixes: safe ? laidOut.fixes : [],
      };
      acceptedText = result.text;
      break;
    }

    if (!canRetry) {
      throw new UnavailableError(
        "AI_UNAVAILABLE",
        "Kardo's AI design generator did not return a design Kardo could validate.",
      );
    }

    messages.push(textMessage("assistant", result.text));
    messages.push(textMessage("user", describeDesignIssues(issues)));
    turn += 1;
  }

  if (!best) {
    throw new UnavailableError(
      "AI_UNAVAILABLE",
      "Kardo's AI design generator did not return a usable design.",
    );
  }

  // The AI looks at its own page (only with a renderer; see
  // design-visual-review.ts). Its changes are kept only when the result
  // still validates; otherwise the design it had stays.
  if (
    input.visualReviewer &&
    turn < maxTurns &&
    totalOutputTokens < CUSTOM_HTML_MAX_OUTPUT_TOKENS
  ) {
    const shots = await input.visualReviewer.render(best.design);
    if (shots.length > 0) {
      turn += 1;
      input.onProgress?.({ stage: "reviewing", turn, maxTurns });
      messages.push(textMessage("assistant", acceptedText));
      messages.push({
        role: "user",
        content: [
          ...shots.map((shot) => ({
            type: "image" as const,
            mediaType: shot.mediaType,
            base64: shot.base64,
            ...(shot.sourcePath ? { sourcePath: shot.sourcePath } : {}),
          })),
          { type: "text" as const, text: VISUAL_REVIEW_MESSAGE },
        ],
      });
      const result = await input.model.complete({
        jobId,
        turn,
        maxTurns,
        system: input.system,
        messages,
        maxTokens: CUSTOM_HTML_MAX_TOKENS_PER_TURN,
        signal: input.signal,
        responseContract: "design-review",
      });
      const turnCostMicroUsd = usageCostMicroUsd(
        input.model.model,
        result.usage,
      );
      totalInputTokens += result.usage.inputTokens;
      totalOutputTokens += result.usage.outputTokens;
      totalCacheReadTokens += result.usage.cacheReadTokens;
      totalCacheWriteTokens += result.usage.cacheWriteTokens;
      totalCostMicroUsd += turnCostMicroUsd;
      lastStopReason = result.stopReason;
      await input.onSpend?.(turnCostMicroUsd);

      const answer = parseVisualReview(result.text);
      if (answer?.ok === false) {
        const patched = applyDesignPatch(best.design, answer.fixes);
        repairCommonDesignMistakes(patched.design);
        lockWhatsAppLinks(patched.design, input.whatsappUrl);
        const valid =
          Value.Check(PageDesignSchema, patched.design) &&
          checkDesign(
            input.type,
            patched.design as PageDesign,
            input.contentItemIds,
            input.checkContext,
          ).length === 0;
        const laidOut = valid
          ? reviewLayout(
              ensureReadablePalette(patched.design as PageDesign).design,
              { type: input.type, ...input.layout },
            )
          : undefined;
        const kept =
          laidOut !== undefined &&
          checkDesign(
            input.type,
            laidOut.design,
            input.contentItemIds,
            input.checkContext,
          ).length === 0;
        if (kept && laidOut) {
          best = {
            ...best,
            design: laidOut.design,
            layoutFixes: [...best.layoutFixes, ...laidOut.fixes],
          };
        }
        visualReview = {
          ok: false,
          applied: kept ? patched.applied : 0,
          notes: answer.notes,
        };
      } else {
        visualReview = { ok: answer !== undefined, applied: 0, notes: "" };
      }
    }
  }

  return {
    ...best,
    ...(visualReview ? { visualReview } : {}),
    audit: {
      provider: input.model.provider,
      model: input.model.model,
      turns: turn,
      inputTokens: totalInputTokens,
      outputTokens: totalOutputTokens,
      cacheReadTokens: totalCacheReadTokens,
      cacheWriteTokens: totalCacheWriteTokens,
      costMicroUsd: totalCostMicroUsd,
      durationMs: Date.now() - startedAt,
      stopReason: lastStopReason,
    },
  };
}

// ---------------------------------------------------------------------------
// AI in blocks, one `html` block (the inspector's "Pedir a la IA"): reuses
// modo HTML's entire review loop (same `{ html, css, notes }` shape, same
// sanitizer-driven correction turns), since the only real difference is the
// prompt and the block's smaller size limit — both handled here without
// duplicating `runCustomHtmlReview`.
// ---------------------------------------------------------------------------

export type HtmlBlockReviewResult = {
  html: string;
  css: string;
  notes: string;
  audit: CustomHtmlGenerationAudit;
};

export async function runHtmlBlockReview(input: {
  model: CustomHtmlModel;
  system: string;
  userMessage: string;
  images: readonly CustomHtmlVisionImage[];
  signal?: AbortSignal | undefined;
  onProgress?: ((progress: CustomHtmlReviewProgress) => void) | undefined;
  onSpend?: ((costMicroUsd: number) => void | Promise<void>) | undefined;
}): Promise<HtmlBlockReviewResult> {
  const result = await runCustomHtmlReview({
    ...input,
    responseContract: "html-block",
  });
  return {
    html: result.html.slice(0, DESIGN_LIMITS.htmlBlockHtml),
    css: result.css.slice(0, DESIGN_LIMITS.htmlBlockCss),
    notes: result.notes,
    audit: result.audit,
  };
}
