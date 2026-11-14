import { type Static, Type } from "@sinclair/typebox";
import { DESIGN_LIMITS, designFonts, PageDesignSchema } from "./design.js";
import {
  DESIGN_CONCEPTS_COUNT,
  DesignConceptSchema,
} from "./design-directions.js";

// ---------------------------------------------------------------------------
// Estudio de Experiences — modo HTML (ADR 018, extended 2026-09-29 at the
// owner's request).
//
// The customer writes (or pastes, e.g. from an AI) HTML and CSS. It is kept
// as the author's source and ALWAYS sanitized with the allowlist in
// @kardo/page-render before it is previewed, published or served. On the
// public page it renders inside a declarative shadow root (isolated CSS,
// the Kardo footer stays outside and visible) under the Resolver's CSP,
// which never runs scripts. Scripts, event handlers, iframes, forms,
// external resources and non-https links are removed.
//
// Kardo tokens the source may use:
// - Images: `src="kardo-asset:<asset uuid>"` and `url(kardo-asset:<uuid>)`
//   (library images only; the Publisher swaps the uuid for the hash).
// - Platform widgets (keep analytics, availability and leads working):
//   `<kardo-links></kardo-links>` and, for Página de Link,
//   `<kardo-socials></kardo-socials>` and `<kardo-profile></kardo-profile>`.
// - Plain `<a href="https://…">` links are tracked like buttons.
// Only top-level schemas carry `$id` (see customer-api stripNestedSchemaIds).
// ---------------------------------------------------------------------------

const HexColor = Type.String({ pattern: "^#[0-9a-fA-F]{6}$" });
const Uuid = Type.String({ format: "uuid" });

export const CUSTOM_HTML_LIMITS = {
  /** Characters of HTML source. */
  html: 60_000,
  /** Characters of CSS source. */
  css: 30_000,
  briefDescription: 2_000,
  briefImages: 8,
  briefColors: 6,
} as const;

/** Widgets the HTML source may place; each renders the platform's own
 * content (tracked links, socials, profile header). */
export const customHtmlWidgets = [
  "kardo-links",
  "kardo-socials",
  "kardo-profile",
] as const;
export type CustomHtmlWidget = (typeof customHtmlWidgets)[number];

/** What the customer tells the AI (Kardo's or their own) to design. */
export const ConceptBriefSchema = Type.Object(
  {
    description: Type.String({
      minLength: 1,
      maxLength: CUSTOM_HTML_LIMITS.briefDescription,
    }),
    /** Tone or style words, e.g. "elegante, cálido". */
    tone: Type.Optional(Type.String({ maxLength: 200 })),
    colors: Type.Array(HexColor, { maxItems: CUSTOM_HTML_LIMITS.briefColors }),
    /** Brand images from the library (logo, photos, references). */
    imageRefs: Type.Array(Uuid, { maxItems: CUSTOM_HTML_LIMITS.briefImages }),
    fonts: Type.Array(
      Type.Union(designFonts.map((font) => Type.Literal(font))),
      { maxItems: 2 },
    ),
  },
  { additionalProperties: false },
);
export type ConceptBrief = Static<typeof ConceptBriefSchema>;

export const CustomHtmlSchema = Type.Object(
  {
    schema: Type.Literal(1),
    /** When true the page shows this HTML instead of the design or theme.
     * Turning it off keeps the source for later. */
    active: Type.Boolean(),
    html: Type.String({ maxLength: CUSTOM_HTML_LIMITS.html }),
    css: Type.String({ maxLength: CUSTOM_HTML_LIMITS.css }),
    brief: Type.Optional(ConceptBriefSchema),
  },
  { additionalProperties: false },
);
export type CustomHtml = Static<typeof CustomHtmlSchema>;

/** Request to Kardo's AI to draft HTML from a brief (nothing is saved). */
export const CustomHtmlGenerationRequestSchema = Type.Object(
  {
    brief: ConceptBriefSchema,
    /** Current source to refine, if any. */
    current: Type.Optional(
      Type.Object(
        {
          html: Type.String({ maxLength: CUSTOM_HTML_LIMITS.html }),
          css: Type.String({ maxLength: CUSTOM_HTML_LIMITS.css }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: "CustomHtmlGenerationRequest", additionalProperties: false },
);
export type CustomHtmlGenerationRequest = Static<
  typeof CustomHtmlGenerationRequestSchema
>;

export const CustomHtmlGenerationSchema = Type.Object(
  {
    html: Type.String({ maxLength: CUSTOM_HTML_LIMITS.html }),
    css: Type.String({ maxLength: CUSTOM_HTML_LIMITS.css }),
    /** Short explanation from the AI, in Spanish. */
    notes: Type.String({ maxLength: 1_000 }),
    /** Generations left today for this organization. */
    remainingToday: Type.Integer({ minimum: 0 }),
  },
  { $id: "CustomHtmlGeneration", additionalProperties: false },
);
export type CustomHtmlGeneration = Static<typeof CustomHtmlGenerationSchema>;

/**
 * Streamed progress of a generation. A request that sends
 * `Accept: application/x-ndjson` gets one JSON event per line once the
 * checks before the AI call pass (auth, permissions, quotas answer with a
 * normal JSON error and HTTP status, as without streaming). The stream
 * always ends with exactly one `result` or `error` event.
 */
export const CUSTOM_HTML_GENERATION_STREAM = "application/x-ndjson";

export type CustomHtmlGenerationStage =
  /** Waiting for the generator (the dev bridge, or a busy provider). */
  | "queued"
  /** The AI is drafting the page. */
  | "generating"
  /** Kardo's sanitizer is checking the draft. */
  | "reviewing"
  /** The AI is fixing what the sanitizer removed. */
  | "fixing";

export type CustomHtmlGenerationEvent =
  | {
      type: "progress";
      stage: CustomHtmlGenerationStage;
      /** 1-based AI turn. */
      turn: number;
      maxTurns: number;
    }
  /** Keeps proxies from closing a quiet connection (every ~15 s). */
  | { type: "ping" }
  | { type: "result"; generation: CustomHtmlGeneration }
  | {
      type: "error";
      error: { code: string; message: string; remainingToday?: number };
    };

// ---------------------------------------------------------------------------
// The allowlist. The sanitizer (@kardo/page-render) implements exactly this,
// and the AI prompt tells the model exactly this, so both always agree.
// Everything not listed is removed.
// ---------------------------------------------------------------------------

export const customHtmlAllowedTags = [
  // Structure and text
  "div",
  "section",
  "header",
  "footer",
  "main",
  "article",
  "aside",
  "nav",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "span",
  "strong",
  "em",
  "b",
  "i",
  "u",
  "s",
  "small",
  "mark",
  "blockquote",
  "cite",
  "q",
  "abbr",
  "time",
  "address",
  "br",
  "hr",
  "ul",
  "ol",
  "li",
  "dl",
  "dt",
  "dd",
  "figure",
  "figcaption",
  "picture",
  "img",
  "a",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "caption",
  "details",
  "summary",
  // Inline icons (a safe SVG subset)
  "svg",
  "g",
  "path",
  "circle",
  "ellipse",
  "rect",
  "line",
  "polyline",
  "polygon",
  "title",
  // Platform widgets
  ...customHtmlWidgets,
] as const;

/** Attributes allowed on any allowed tag (plus `aria-*` and `data-*`). */
export const customHtmlGlobalAttributes = [
  "class",
  "id",
  "style",
  "title",
  "role",
  "lang",
  "dir",
] as const;

/** Extra attributes per tag. URLs are checked by kind: `href` must be
 * https, mailto: or tel:; `src` must be a `kardo-asset:` token. */
export const customHtmlTagAttributes: Record<string, readonly string[]> = {
  a: ["href", "target"],
  img: ["src", "alt", "width", "height", "loading", "decoding"],
  time: ["datetime"],
  td: ["colspan", "rowspan"],
  th: ["colspan", "rowspan", "scope"],
  details: ["open"],
  svg: [
    "viewBox",
    "width",
    "height",
    "fill",
    "stroke",
    "xmlns",
    "aria-hidden",
    "focusable",
  ],
  g: ["fill", "stroke", "stroke-width", "transform", "opacity"],
  path: [
    "d",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "fill-rule",
    "clip-rule",
    "opacity",
    "transform",
  ],
  circle: ["cx", "cy", "r", "fill", "stroke", "stroke-width", "opacity"],
  ellipse: [
    "cx",
    "cy",
    "rx",
    "ry",
    "fill",
    "stroke",
    "stroke-width",
    "opacity",
  ],
  rect: [
    "x",
    "y",
    "width",
    "height",
    "rx",
    "ry",
    "fill",
    "stroke",
    "stroke-width",
    "opacity",
  ],
  line: [
    "x1",
    "y1",
    "x2",
    "y2",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "opacity",
  ],
  polyline: [
    "points",
    "fill",
    "stroke",
    "stroke-width",
    "stroke-linecap",
    "stroke-linejoin",
    "opacity",
  ],
  polygon: ["points", "fill", "stroke", "stroke-width", "opacity"],
};

/** CSS the sanitizer removes (the rest of standard CSS is allowed, scoped
 * to the page's own shadow root). */
export const customCssForbidden = [
  "@import",
  "@font-face (use the fonts Kardo serves)",
  "url() other than kardo-asset:<uuid>",
  "expression(), behavior, -moz-binding and javascript:",
  "position: fixed and position: sticky",
] as const;

/** Webfonts the page may name in `font-family` (served by Kardo). */
export const customHtmlFontFamilies: Record<string, string> = {
  geist: "Geist",
  "dm-sans": "DM Sans",
  poppins: "Poppins",
  playfair: "Playfair Display",
  lora: "Lora",
  "space-grotesk": "Space Grotesk",
  cormorant: "Cormorant Garamond",
  "dm-serif": "DM Serif Display",
  outfit: "Outfit",
  manrope: "Manrope",
  montserrat: "Montserrat",
  bricolage: "Bricolage Grotesque",
  bebas: "Bebas Neue",
  oswald: "Oswald",
  caveat: "Caveat",
};

// ---------------------------------------------------------------------------
// AI in blocks (ADR 018 addendum 3, 2026-09-30): the two extra ways the
// Kardo AI can help design, alongside the whole-page modo HTML above.
// - Full page design: `POST …/experiences/:id/design/generations` drafts a
//   complete `PageDesign` (schema 1 or 2) for the Experience's own type.
// - One `html` block: the inspector's "Pedir a la IA" drafts or improves a
//   single block's HTML/CSS, sized to `DESIGN_LIMITS.htmlBlock*` instead of
//   a whole page. Its response shape matches `CustomHtmlGeneration` exactly
//   (minus `remainingToday`, added the same way) so the same tolerant parser
//   (`parseCustomHtmlResponse`) and review loop (`runCustomHtmlReview`) the
//   modo HTML path already uses can answer it too, with no new plumbing.
// Nothing here changes an existing schema; only additions.
// ---------------------------------------------------------------------------

/**
 * Photos in an AI design (2026-10-03, owner's request): the customer says
 * whether the page carries photos. "auto" (default): the AI decides from
 * the business and its content. "with": photos are part of the design
 * (the owner's, or photo spaces to fill). "without": no photo anywhere the
 * design controls (no image or gallery blocks, no photo spaces, no photo
 * backgrounds, the menu without photos), e.g. a simple menu. Sent with the
 * request only: never saved with the page.
 */
export const designPhotoModes = ["auto", "with", "without"] as const;
export type DesignPhotoMode = (typeof designPhotoModes)[number];
const DesignPhotoModeSchema = Type.Union(
  designPhotoModes.map((mode) => Type.Literal(mode)),
);

/** Request to draft (or, with `current`, refine) a full page design. */
export const DesignGenerationRequestSchema = Type.Object(
  {
    brief: ConceptBriefSchema,
    current: Type.Optional(PageDesignSchema),
    /** The idea the customer chose among the AI's proposals
     * (`…/design/concepts`): the design follows it. */
    concept: Type.Optional(DesignConceptSchema),
    photos: Type.Optional(DesignPhotoModeSchema),
  },
  { $id: "DesignGenerationRequest", additionalProperties: false },
);
export type DesignGenerationRequest = Static<
  typeof DesignGenerationRequestSchema
>;

/** A photo the owner gave the AI, matched to the dish or product it shows
 * (2026-10-03): applied to the Menú or Catálogo content together with the
 * design. */
export const DesignItemPhotoSchema = Type.Object(
  {
    itemId: Type.String({ minLength: 1, maxLength: 64 }),
    imageRef: Uuid,
  },
  { additionalProperties: false },
);
export type DesignItemPhoto = Static<typeof DesignItemPhotoSchema>;

export const DesignGenerationSchema = Type.Object(
  {
    design: PageDesignSchema,
    /** Short explanation from the AI, in Spanish. */
    notes: Type.String({ maxLength: 1_000 }),
    /** Menú and Catálogo: the owner's photos matched to dishes or products
     * that had none. Dishes left without one keep a photo space in the
     * Estudio. */
    itemPhotos: Type.Optional(
      Type.Array(DesignItemPhotoSchema, { maxItems: 50 }),
    ),
    /** Generations left today for this organization (same daily cap as
     * modo HTML: one pool of `custom_html_ai_usage` counts every kind of
     * Kardo AI generation, so a business cannot get 20 pages plus 20 more
     * designs a day). */
    remainingToday: Type.Integer({ minimum: 0 }),
  },
  { $id: "DesignGeneration", additionalProperties: false },
);
export type DesignGeneration = Static<typeof DesignGenerationSchema>;

/**
 * "3 ideas, then 1 design" (2026-10-03): before designing, the AI proposes
 * `DESIGN_CONCEPTS_COUNT` ideas, each anchored to a direction of
 * `design-directions.ts`. Asking for ideas does not use a generation (the
 * design made from the chosen idea does); its cost still counts toward the
 * month's AI spend.
 */
export const DesignConceptsRequestSchema = Type.Object(
  { brief: ConceptBriefSchema, photos: Type.Optional(DesignPhotoModeSchema) },
  { $id: "DesignConceptsRequest", additionalProperties: false },
);
export type DesignConceptsRequest = Static<typeof DesignConceptsRequestSchema>;

export const DesignConceptsSchema = Type.Object(
  {
    concepts: Type.Array(DesignConceptSchema, {
      minItems: 1,
      maxItems: DESIGN_CONCEPTS_COUNT,
    }),
  },
  { $id: "DesignConcepts", additionalProperties: false },
);
export type DesignConcepts = Static<typeof DesignConceptsSchema>;

/**
 * The Experience's last Kardo AI session (2026-10-03, owner's decision):
 * a generation keeps running on the server when the customer reloads or
 * leaves the Estudio, and what it was showing (the ideas, or the design)
 * waits here for them, for 7 days. One per Experience, shared by everyone
 * who can edit it. `step` is what the session is on; `status` is where
 * that step stands. A design made from an idea keeps the ideas, so
 * "Volver a las ideas" still works after a reload.
 */
export const designAiSessionSteps = ["ideas", "design"] as const;
export const designAiSessionStatuses = ["running", "ready", "failed"] as const;

export const DesignAiSessionSchema = Type.Object(
  {
    step: Type.Union(designAiSessionSteps.map((step) => Type.Literal(step))),
    status: Type.Union(
      designAiSessionStatuses.map((status) => Type.Literal(status)),
    ),
    brief: ConceptBriefSchema,
    photos: DesignPhotoModeSchema,
    /** The design step started from the page's current design. */
    refineCurrent: Type.Boolean(),
    /** While running: the stream's last stage. */
    progress: Type.Optional(
      Type.Object(
        {
          stage: Type.Union([
            Type.Literal("queued"),
            Type.Literal("generating"),
            Type.Literal("reviewing"),
            Type.Literal("fixing"),
          ]),
          turn: Type.Integer({ minimum: 1 }),
          maxTurns: Type.Integer({ minimum: 1 }),
        },
        { additionalProperties: false },
      ),
    ),
    concepts: Type.Optional(
      Type.Array(DesignConceptSchema, { maxItems: DESIGN_CONCEPTS_COUNT }),
    ),
    /** The idea the design step follows. */
    concept: Type.Optional(DesignConceptSchema),
    /** The finished design (step "design", status "ready"). */
    generation: Type.Optional(
      Type.Object(
        {
          design: PageDesignSchema,
          notes: Type.String({ maxLength: 1_000 }),
          itemPhotos: Type.Optional(
            Type.Array(DesignItemPhotoSchema, { maxItems: 50 }),
          ),
        },
        { additionalProperties: false },
      ),
    ),
    /** Why the step failed (status "failed"), as an API error code. */
    errorCode: Type.Optional(Type.String({ maxLength: 64 })),
    startedAt: Type.String({ format: "date-time" }),
    updatedAt: Type.String({ format: "date-time" }),
  },
  { additionalProperties: false },
);
export type DesignAiSession = Static<typeof DesignAiSessionSchema>;

export const DesignAiSessionEnvelopeSchema = Type.Object(
  { session: Type.Union([DesignAiSessionSchema, Type.Null()]) },
  { $id: "DesignAiSessionEnvelope", additionalProperties: false },
);
export type DesignAiSessionEnvelope = Static<
  typeof DesignAiSessionEnvelopeSchema
>;

/**
 * What is left of the organization's Kardo AI (2026-10-03), shown before
 * generating. `day` is the daily abuse cap every organization has; `month`
 * is the plan's `ai.generations_month` (null: the plan sets no limit). A
 * design uses one of each; ideas use none. `spendCapReached`: the month's
 * AI spend (`ai.spend_cents_month`) is used, so nothing more runs this
 * month. `enabled`: the plan includes Kardo's AI at all.
 */
export const DesignAiUsageSchema = Type.Object(
  {
    enabled: Type.Boolean(),
    /** The plan includes the modo HTML (full page and code blocks). The
     * block designs and ideas need only `enabled` (domain audit A2-36). */
    htmlEnabled: Type.Optional(Type.Boolean()),
    day: Type.Object(
      {
        used: Type.Integer({ minimum: 0 }),
        limit: Type.Integer({ minimum: 0 }),
        remaining: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    month: Type.Object(
      {
        used: Type.Integer({ minimum: 0 }),
        limit: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
        remaining: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
      },
      { additionalProperties: false },
    ),
    spendCapReached: Type.Boolean(),
    /** This person's starts in the last hour (designs, ideas, HTML and code
     * blocks share them) and whether one of theirs is running now. The
     * same counter for every AI surface (domain audit A2-37). */
    hour: Type.Optional(
      Type.Object(
        {
          used: Type.Integer({ minimum: 0 }),
          limit: Type.Integer({ minimum: 0 }),
          remaining: Type.Integer({ minimum: 0 }),
        },
        { additionalProperties: false },
      ),
    ),
    running: Type.Optional(Type.Boolean()),
  },
  { $id: "DesignAiUsage", additionalProperties: false },
);
export type DesignAiUsage = Static<typeof DesignAiUsageSchema>;

/** Request to draft (or, with `current`, improve) one `html` block. */
export const HtmlBlockGenerationRequestSchema = Type.Object(
  {
    brief: ConceptBriefSchema,
    /** A short, free-text ask for this one block (e.g. "hazlo más grande"),
     * treated as data like the rest of the brief. */
    instructions: Type.Optional(Type.String({ maxLength: 500 })),
    current: Type.Optional(
      Type.Object(
        {
          html: Type.String({ maxLength: DESIGN_LIMITS.htmlBlockHtml }),
          css: Type.String({ maxLength: DESIGN_LIMITS.htmlBlockCss }),
        },
        { additionalProperties: false },
      ),
    ),
  },
  { $id: "HtmlBlockGenerationRequest", additionalProperties: false },
);
export type HtmlBlockGenerationRequest = Static<
  typeof HtmlBlockGenerationRequestSchema
>;

export const HtmlBlockGenerationSchema = Type.Object(
  {
    html: Type.String({ maxLength: DESIGN_LIMITS.htmlBlockHtml }),
    css: Type.String({ maxLength: DESIGN_LIMITS.htmlBlockCss }),
    notes: Type.String({ maxLength: 1_000 }),
    remainingToday: Type.Integer({ minimum: 0 }),
  },
  { $id: "HtmlBlockGeneration", additionalProperties: false },
);
export type HtmlBlockGeneration = Static<typeof HtmlBlockGenerationSchema>;

/** Streamed progress, same shape and stages as `CustomHtmlGenerationEvent`
 * (see `CUSTOM_HTML_GENERATION_STREAM` above), one per generation kind so a
 * client always knows which `generation` shape a `result` event carries. */
export type DesignGenerationEvent =
  | {
      type: "progress";
      stage: CustomHtmlGenerationStage;
      turn: number;
      maxTurns: number;
    }
  | { type: "ping" }
  | { type: "result"; generation: DesignGeneration }
  | {
      type: "error";
      error: { code: string; message: string; remainingToday?: number };
    };

export type DesignConceptsEvent =
  | {
      type: "progress";
      stage: CustomHtmlGenerationStage;
      turn: number;
      maxTurns: number;
    }
  | { type: "ping" }
  | { type: "result"; generation: DesignConcepts }
  | {
      type: "error";
      error: { code: string; message: string; remainingToday?: number };
    };

export type HtmlBlockGenerationEvent =
  | {
      type: "progress";
      stage: CustomHtmlGenerationStage;
      turn: number;
      maxTurns: number;
    }
  | { type: "ping" }
  | { type: "result"; generation: HtmlBlockGeneration }
  | {
      type: "error";
      error: { code: string; message: string; remainingToday?: number };
    };
