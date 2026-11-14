import { type Static, Type } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

// ---------------------------------------------------------------------------
// Estudio de Experiences — page design (schema 1), ADR 018.
//
// A designed page is stacked sections; each section has 1 to 3 columns of
// blocks. Every value is a closed choice, a bounded number, a `#rrggbb`
// color, plain text or an https URL: the page is always rendered by Kardo's
// own templates and CSS is generated from these values, never written by a
// customer. No HTML, CSS or script ever comes from this model.
//
// Images are referenced by `imageRef`: the workspace asset id (uuid) while
// authoring; the Publisher swaps it for the content hash in the snapshot.
// Addendum 3 (2026-09-30) opens the Estudio to every Experience with a page
// (Menú, Catálogo, Formulario, PDF and Imagen join Enlaces, Perfil and
// Página de Link); only Redirección has no page to design.
//
// The one exception to "no HTML" is the `html` block (addendum 3): its
// source is kept as written and ALWAYS goes through the modo HTML sanitizer
// of @kardo/page-render before it is previewed, published or served.
// Only top-level schemas carry `$id` (see customer-api stripNestedSchemaIds).
// ---------------------------------------------------------------------------

const HexColor = Type.String({ pattern: "^#[0-9a-fA-F]{6}$" });
const BlockId = Type.String({ pattern: "^[a-zA-Z0-9_-]{1,64}$" });
const HttpsUrl = Type.String({
  format: "uri",
  maxLength: 2048,
  pattern: "^https://",
});
/** Asset id while authoring, content hash (64 hex) once published. */
const ImageRef = Type.String({
  pattern:
    "^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|[a-f0-9]{64})$",
});

/** Experience types that accept a design (every type with a page). */
export const designableExperienceTypes = [
  "links",
  "profile",
  "linkpage",
  "menu",
  "catalog",
  "form",
  "document",
  "image",
] as const;
export type DesignableExperienceType =
  (typeof designableExperienceTypes)[number];

/** System stacks plus webfonts the Resolver serves itself (OFL). */
export const designFonts = [
  "system",
  "serif",
  "rounded",
  "mono",
  "geist",
  "dm-sans",
  "poppins",
  "playfair",
  "lora",
  "space-grotesk",
  "cormorant",
  "dm-serif",
  "outfit",
  "manrope",
  "montserrat",
  "bricolage",
  "bebas",
  "oswald",
  "caveat",
] as const;
export type DesignFont = (typeof designFonts)[number];
const DesignFontSchema = Type.Union(designFonts.map((f) => Type.Literal(f)));

export const DESIGN_LIMITS = {
  sections: 24,
  blocksPerColumn: 30,
  blocks: 120,
  buttons: 24,
  images: 24,
  textRuns: 40,
  textChars: 1_500,
  /** Canvas sections (schema 2) per design. */
  canvasSections: 12,
  /** Blocks placed on one canvas section. */
  canvasItems: 60,
  /** Height of a canvas section, in design px. */
  canvasHeight: 3_000,
  /** `html` blocks per design, and the size of each one's source. */
  htmlBlocks: 4,
  htmlBlockHtml: 8_000,
  htmlBlockCss: 4_000,
  /** `menu` blocks per design (each may show some of the sections). */
  menuBlocks: 10,
  /** `featuredItems` blocks per design (a Menú/Catálogo highlighting a few
   * of its own items more than once, e.g. "Lo más pedido" and "Del día"). */
  featuredBlocks: 3,
  /** Serialized design, in characters of JSON. */
  bytes: 64_000,
} as const;

/** Page margin (left and right of flow sections) when a design sets none;
 * new designs start at `DESIGN_DEFAULT_PAGE_PADDING`. */
export const DESIGN_LEGACY_PAGE_PADDING = 16;
export const DESIGN_DEFAULT_PAGE_PADDING = 20;

/**
 * A canvas section is designed on a 390 px wide phone: every position and
 * size of its blocks is in these design px. It renders at the full width of
 * any phone (everything scales together, text included) and, on wider
 * screens, centered at up to `CANVAS_MAX_SCALE` times its design size.
 */
export const CANVAS_WIDTH = 390;
export const CANVAS_MAX_SCALE = 1.5;

/**
 * Networks and apps with an official-logo button (`brandButton`). Each one's
 * glyph and color live in @kardo/page-render with the URL of the brand's
 * own guidelines; customers never upload them.
 */
export const designBrands = [
  "whatsapp",
  "instagram",
  "facebook",
  "messenger",
  "tiktok",
  "youtube",
  "x",
  "threads",
  "pinterest",
  "telegram",
  "spotify",
  "waze",
  "ubereats",
  "mercadopago",
  "tripadvisor",
  "booking",
  "calendly",
] as const;
export type DesignBrand = (typeof designBrands)[number];

/** How a brand button looks: the brand's own color, a neutral button with
 * the logo in color, an outline with the logo in black or white, or a
 * circle with only the logo on the brand color (the label stays as its
 * accessible name; consecutive circles in a column share one row). */
export const brandButtonLooks = [
  "brand",
  "neutral",
  "outline",
  "circle",
] as const;
export type BrandButtonLook = (typeof brandButtonLooks)[number];

const Px = (maximum: number) =>
  Type.Integer({ minimum: 0, maximum, multipleOf: 1 });

export const DesignBackgroundSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("none"),
      Type.Literal("solid"),
      Type.Literal("gradient"),
      Type.Literal("image"),
    ]),
    color: Type.Optional(HexColor),
    colorTo: Type.Optional(HexColor),
    angle: Type.Optional(Type.Integer({ minimum: 0, maximum: 360 })),
    imageRef: Type.Optional(ImageRef),
    /** Darkens an image for legibility (0–80 %). */
    overlay: Type.Optional(Type.Integer({ minimum: 0, maximum: 80 })),
    /** Where an image is anchored when cropped. */
    position: Type.Optional(
      Type.Union([
        Type.Literal("center"),
        Type.Literal("top"),
        Type.Literal("bottom"),
      ]),
    ),
  },
  { additionalProperties: false },
);
export type DesignBackground = Static<typeof DesignBackgroundSchema>;

/**
 * The blurred color field behind the page ("fondo difuminado", addendum 3).
 * It fills the screen around the content column on computers and shows
 * through every gap between sections and cards, so no bare strip is left.
 * `auto` (the default, also when absent) derives soft glows from the
 * palette that contrast with the surface color, so cards stand out; with an
 * image background it is that image, blurred. `custom` uses the given
 * colors. `none` paints the page background only, as before.
 */
export const DesignAmbientSchema = Type.Object(
  {
    kind: Type.Union([
      Type.Literal("auto"),
      Type.Literal("custom"),
      Type.Literal("none"),
    ]),
    color: Type.Optional(HexColor),
    colorTo: Type.Optional(HexColor),
    /** How visible the glows are, 0 to 100 (default 60). */
    strength: Type.Optional(Type.Integer({ minimum: 0, maximum: 100 })),
  },
  { additionalProperties: false },
);
export type DesignAmbient = Static<typeof DesignAmbientSchema>;

/** Page-wide look. Blocks may override parts of it. */
export const DesignStyleSchema = Type.Object(
  {
    palette: Type.Object(
      {
        background: HexColor,
        surface: HexColor,
        text: HexColor,
        muted: HexColor,
        accent: HexColor,
      },
      { additionalProperties: false },
    ),
    fonts: Type.Object(
      { heading: DesignFontSchema, body: DesignFontSchema },
      { additionalProperties: false },
    ),
    /** Base corner radius in px, used by cards, images and buttons. */
    radius: Px(32),
    buttonStyle: Type.Union([
      Type.Literal("solid"),
      Type.Literal("soft"),
      Type.Literal("outline"),
    ]),
    buttonShape: Type.Union([
      Type.Literal("pill"),
      Type.Literal("rounded"),
      Type.Literal("square"),
    ]),
    shadow: Type.Union([
      Type.Literal("none"),
      Type.Literal("soft"),
      Type.Literal("strong"),
    ]),
    background: DesignBackgroundSchema,
    /** Width of the content column on wide screens, in px. */
    maxWidth: Type.Integer({ minimum: 360, maximum: 960 }),
    /** Blurred field behind the page; absent means `auto`. */
    ambient: Type.Optional(DesignAmbientSchema),
    /** Left and right margin of flow sections, in px (absent: 16). Canvas
     * sections stay full bleed and show it as a guide. */
    pagePadding: Type.Optional(Type.Integer({ minimum: 0, maximum: 48 })),
  },
  { additionalProperties: false },
);
export type DesignStyle = Static<typeof DesignStyleSchema>;

const ColorToken = Type.Union([
  HexColor,
  Type.Literal("text"),
  Type.Literal("muted"),
  Type.Literal("accent"),
  Type.Literal("surface"),
  Type.Literal("background"),
]);

/** Fine-grained overrides ("modo avanzado"). Every field is optional. */
export const BlockStyleSchema = Type.Object(
  {
    align: Type.Optional(
      Type.Union([
        Type.Literal("start"),
        Type.Literal("center"),
        Type.Literal("end"),
      ]),
    ),
    color: Type.Optional(ColorToken),
    background: Type.Optional(Type.Union([ColorToken, Type.Literal("none")])),
    /** Second stop: with it, `background` becomes a gradient. */
    backgroundTo: Type.Optional(ColorToken),
    backgroundAngle: Type.Optional(Type.Integer({ minimum: 0, maximum: 360 })),
    /** A solid border around the block. */
    borderWidth: Type.Optional(Px(12)),
    borderColor: Type.Optional(ColorToken),
    /** px */
    fontSize: Type.Optional(Type.Integer({ minimum: 12, maximum: 72 })),
    fontWeight: Type.Optional(
      Type.Union([
        Type.Literal(400),
        Type.Literal(500),
        Type.Literal(600),
        Type.Literal(700),
      ]),
    ),
    font: Type.Optional(DesignFontSchema),
    /** Hundredths of an em, -5 to 30 (−0.05em to 0.30em). */
    letterSpacing: Type.Optional(Type.Integer({ minimum: -5, maximum: 30 })),
    /** Tenths, 10 to 20 (1.0 to 2.0). */
    lineHeight: Type.Optional(Type.Integer({ minimum: 10, maximum: 20 })),
    radius: Type.Optional(Px(48)),
    paddingX: Type.Optional(Px(64)),
    paddingY: Type.Optional(Px(64)),
    marginTop: Type.Optional(Px(96)),
    marginBottom: Type.Optional(Px(96)),
    /** Percent, 20 to 100. */
    opacity: Type.Optional(Type.Integer({ minimum: 20, maximum: 100 })),
    shadow: Type.Optional(
      Type.Union([
        Type.Literal("none"),
        Type.Literal("soft"),
        Type.Literal("strong"),
      ]),
    ),
    width: Type.Optional(
      Type.Union([Type.Literal("auto"), Type.Literal("full")]),
    ),
  },
  { additionalProperties: false },
);
export type BlockStyle = Static<typeof BlockStyleSchema>;

const blockBase = {
  id: BlockId,
  style: Type.Optional(BlockStyleSchema),
};

export const TextRunSchema = Type.Object(
  {
    text: Type.String({ minLength: 1, maxLength: 1_500 }),
    bold: Type.Optional(Type.Boolean()),
    italic: Type.Optional(Type.Boolean()),
    /** Plain link (not tracked); https only. */
    href: Type.Optional(HttpsUrl),
  },
  { additionalProperties: false },
);
export type TextRun = Static<typeof TextRunSchema>;

/** Shapes a `shape` block draws. All of them scale with their box (CSS
 * clip-path polygons and radii in percent, no script). */
export const designShapes = [
  "rect",
  "ellipse",
  "pill",
  "triangle",
  "diamond",
  "hexagon",
  "star",
  "arch",
  "blob",
] as const;
export type DesignShape = (typeof designShapes)[number];

/** Closed set of icons a `features` block may use. Each id maps to one
 * lucide-static icon (see `@kardo/page-render`'s `feature-icons.ts`, which
 * ships the actual SVG markup under the ISC license). */
export const featureIcons = [
  "clock",
  "map-pin",
  "phone",
  "calendar",
  "truck",
  "bag",
  "card",
  "cash",
  "wifi",
  "car",
  "paw",
  "leaf",
  "flame",
  "star",
  "heart",
  "gift",
  "coffee",
  "utensils",
  "wine",
  "beer",
  "cake",
  "ice-cream",
  "bed",
  "pool",
  "scissors",
  "flower",
  "book",
  "graduation",
  "stethoscope",
  "shield",
  "check",
  "award",
  "users",
  "home",
  "key",
  "music",
  "baby",
  "accessible",
  "globe",
  "chat",
  "mail",
  "camera",
  "tag",
  "percent",
  "package",
  "sun",
  "snowflake",
  "dumbbell",
] as const;
export type FeatureIcon = (typeof featureIcons)[number];

/** Masks that crop an image into a shape ("none" keeps the rectangle with
 * the page radius). */
export const imageMasks = [
  "none",
  "circle",
  "rounded",
  "arch",
  "blob",
  "diamond",
  "hexagon",
  "star",
] as const;
export type ImageMask = (typeof imageMasks)[number];

export const DesignBlockSchema = Type.Union([
  // Free blocks.
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("heading"),
      text: Type.String({ minLength: 1, maxLength: 160 }),
      level: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("text"),
      runs: Type.Array(TextRunSchema, {
        minItems: 1,
        maxItems: DESIGN_LIMITS.textRuns,
      }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("image"),
      /** "Sin banco de fotos" (2026-10-03): absent means no photo yet. The
       * page draws a dashed "espacio para foto" in its place (panel preview
       * only; never on the public page) until the owner uploads one in the
       * Estudio, using `alt` to say what photo belongs there. */
      imageRef: Type.Optional(ImageRef),
      alt: Type.String({ maxLength: 200 }),
      aspect: Type.Union([
        Type.Literal("auto"),
        Type.Literal("1:1"),
        Type.Literal("4:3"),
        Type.Literal("3:4"),
        Type.Literal("16:9"),
      ]),
      fit: Type.Union([Type.Literal("cover"), Type.Literal("contain")]),
      href: Type.Optional(HttpsUrl),
      /** Crops the image into a shape. */
      mask: Type.Optional(Type.Union(imageMasks.map((m) => Type.Literal(m)))),
    },
    { additionalProperties: false },
  ),
  /** A short list of highlights ("Datos clave"): hours, delivery, parking,
   * payment methods, amenities. Each item is one closed icon plus a title
   * and an optional one-line note. */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("features"),
      items: Type.Array(
        Type.Object(
          {
            icon: Type.Union(featureIcons.map((i) => Type.Literal(i))),
            title: Type.String({ minLength: 1, maxLength: 40 }),
            text: Type.Optional(Type.String({ maxLength: 120 })),
          },
          { additionalProperties: false },
        ),
        { minItems: 1, maxItems: 8 },
      ),
      layout: Type.Union([
        Type.Literal("grid"),
        Type.Literal("list"),
        Type.Literal("row"),
        Type.Literal("chips"),
      ]),
      /** How each icon is framed; absent means "circle". */
      iconStyle: Type.Optional(
        Type.Union([
          Type.Literal("plain"),
          Type.Literal("circle"),
          Type.Literal("square"),
        ]),
      ),
      /** `grid` only; absent means 2. */
      columns: Type.Optional(Type.Union([Type.Literal(2), Type.Literal(3)])),
    },
    { additionalProperties: false },
  ),
  /** A set of photos ("Galería"), drawn with no script (CSS grid/scroll-snap
   * only). Every image counts toward `DESIGN_LIMITS.images`. */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("gallery"),
      images: Type.Array(
        Type.Object(
          {
            /** "Sin banco de fotos" (2026-10-03): absent means this slot has
             * no photo yet; see the `image` block's own doc comment. */
            imageRef: Type.Optional(ImageRef),
            alt: Type.String({ maxLength: 200 }),
          },
          { additionalProperties: false },
        ),
        { minItems: 2, maxItems: 12 },
      ),
      layout: Type.Union([
        Type.Literal("grid"),
        Type.Literal("carousel"),
        Type.Literal("mosaic"),
      ]),
      aspect: Type.Union([
        Type.Literal("1:1"),
        Type.Literal("4:3"),
        Type.Literal("3:4"),
        Type.Literal("16:9"),
      ]),
      /** `grid` and `mosaic` only; absent means 2. */
      columns: Type.Optional(Type.Union([Type.Literal(2), Type.Literal(3)])),
    },
    { additionalProperties: false },
  ),
  /** Tracked through the Resolver's /go/{id}, like content links. */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("button"),
      label: Type.String({ minLength: 1, maxLength: 60 }),
      href: HttpsUrl,
      variant: Type.Union([Type.Literal("primary"), Type.Literal("secondary")]),
    },
    { additionalProperties: false },
  ),
  /** A button with a network's or app's official logo and color; tracked
   * through /go/{id} like `button`. */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("brandButton"),
      brand: Type.Union(designBrands.map((b) => Type.Literal(b))),
      label: Type.String({ minLength: 1, maxLength: 60 }),
      href: HttpsUrl,
      look: Type.Union(brandButtonLooks.map((l) => Type.Literal(l))),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { ...blockBase, kind: Type.Literal("divider") },
    { additionalProperties: false },
  ),
  /** A decorative shape; only on canvas sections, where it takes the
   * item's size. `fillTo` turns the fill into a gradient. */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("shape"),
      shape: Type.Union(designShapes.map((s) => Type.Literal(s))),
      fill: ColorToken,
      fillTo: Type.Optional(ColorToken),
      angle: Type.Optional(Type.Integer({ minimum: 0, maximum: 360 })),
      /** Outline (drawn inside the box; rect, ellipse and pill only). */
      stroke: Type.Optional(ColorToken),
      strokeWidth: Type.Optional(Px(24)),
    },
    { additionalProperties: false },
  ),
  /**
   * The customer's own HTML and CSS as one block (addendum 3). Kept as
   * written; the modo HTML sanitizer cleans it before every preview,
   * publication and page view, and it renders inside its own shadow root.
   * Links are plain (not tracked); images come from the library only.
   */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("html"),
      html: Type.String({ maxLength: DESIGN_LIMITS.htmlBlockHtml }),
      css: Type.String({ maxLength: DESIGN_LIMITS.htmlBlockCss }),
      /** Name shown in Capas. */
      label: Type.Optional(Type.String({ maxLength: 60 })),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("spacer"),
      height: Type.Integer({ minimum: 4, maximum: 160 }),
    },
    { additionalProperties: false },
  ),
  // Bound blocks: they show the Experience's own content, which stays the
  // source of truth (validation, tracked clicks, analytics). Each appears at
  // most once per design.
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("contentTitle"),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("profileHeader"),
      layout: Type.Union([Type.Literal("stacked"), Type.Literal("inline")]),
      avatarShape: Type.Union([
        Type.Literal("circle"),
        Type.Literal("rounded"),
        Type.Literal("none"),
      ]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("contentLinks"),
      layout: Type.Union([Type.Literal("list"), Type.Literal("grid")]),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("contentSocials"),
      size: Type.Union([
        Type.Literal("small"),
        Type.Literal("medium"),
        Type.Literal("large"),
      ]),
      /** "brand": each network's official logo and color where Kardo has
       * one; absent or "theme": Kardo's line icons in the page accent. */
      look: Type.Optional(
        Type.Union([Type.Literal("theme"), Type.Literal("brand")]),
      ),
    },
    { additionalProperties: false },
  ),
  // Bound blocks of the other Experience types (addendum 3). The content
  // stays in the Experience (prices, photos, live availability, leads, the
  // PDF); these only choose how it looks.
  /** Menú: its sections and dishes. Several may split the menu. */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("menu"),
      layout: Type.Union([
        Type.Literal("list"),
        Type.Literal("cards"),
        Type.Literal("grid"),
        Type.Literal("compact"),
      ]),
      /** Dish photos: hidden, small thumbnails or large. */
      photos: Type.Union([
        Type.Literal("none"),
        Type.Literal("small"),
        Type.Literal("large"),
      ]),
      photoShape: Type.Optional(
        Type.Union([
          Type.Literal("rounded"),
          Type.Literal("circle"),
          Type.Literal("square"),
        ]),
      ),
      /** Show dish descriptions (default true). */
      descriptions: Type.Optional(Type.Boolean()),
      /** How each menu section's name looks. */
      sectionStyle: Type.Optional(
        Type.Union([
          Type.Literal("line"),
          Type.Literal("plain"),
          Type.Literal("pill"),
          Type.Literal("card"),
        ]),
      ),
      priceStyle: Type.Optional(
        Type.Union([
          Type.Literal("plain"),
          Type.Literal("accent"),
          Type.Literal("pill"),
        ]),
      ),
      /** Columns of dishes on wide screens (phones always use one). */
      columns: Type.Optional(Type.Union([Type.Literal(1), Type.Literal(2)])),
      /** Menu section ids this block shows, in the menu's order; absent
       * shows every section. */
      sectionIds: Type.Optional(
        Type.Array(BlockId, { minItems: 1, maxItems: 10 }),
      ),
    },
    { additionalProperties: false },
  ),
  /** Catálogo: its products. */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("catalog"),
      layout: Type.Union([
        Type.Literal("grid"),
        Type.Literal("list"),
        Type.Literal("cards"),
      ]),
      /** Grid columns on phones (wide screens add one more, up to 4). */
      columns: Type.Union([Type.Literal(1), Type.Literal(2), Type.Literal(3)]),
      imageAspect: Type.Optional(
        Type.Union([
          Type.Literal("1:1"),
          Type.Literal("4:3"),
          Type.Literal("3:4"),
        ]),
      ),
      descriptions: Type.Optional(Type.Boolean()),
      /** The product's link button ("Ver más" when absent). */
      buttonLabel: Type.Optional(Type.String({ minLength: 1, maxLength: 24 })),
      priceStyle: Type.Optional(
        Type.Union([
          Type.Literal("plain"),
          Type.Literal("accent"),
          Type.Literal("pill"),
        ]),
      ),
    },
    { additionalProperties: false },
  ),
  /** Featured dishes or products ("Destacados"), for a Menú or a Catálogo:
   * a short, chosen subset of the content's own real items (never invented),
   * drawn with the same live availability (ADR 017) as `menu`/`catalog`.
   * Several may appear (e.g. "Lo más pedido" and "Del día"). */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("featuredItems"),
      /** Real dish/product ids, in the order they are shown; no repeats. */
      itemIds: Type.Array(BlockId, { minItems: 1, maxItems: 6 }),
      layout: Type.Union([
        Type.Literal("hero"),
        Type.Literal("cards"),
        Type.Literal("carousel"),
      ]),
      /** Short label above the block, e.g. "Lo más pedido". */
      label: Type.Optional(Type.String({ minLength: 1, maxLength: 32 })),
      /** Show each item's description (default true). */
      descriptions: Type.Optional(Type.Boolean()),
    },
    { additionalProperties: false },
  ),
  /** Formulario: the lead form (fields, consent and privacy notice come
   * from the content and are always shown). */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("leadForm"),
      /** Field look: boxed, on a card, or underlined. */
      look: Type.Union([
        Type.Literal("boxed"),
        Type.Literal("card"),
        Type.Literal("underline"),
      ]),
      buttonWidth: Type.Optional(
        Type.Union([Type.Literal("full"), Type.Literal("auto")]),
      ),
    },
    { additionalProperties: false },
  ),
  /** PDF: the document's pages (visor) or its download card. */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("documentPages"),
      pageStyle: Type.Union([
        Type.Literal("shadow"),
        Type.Literal("border"),
        Type.Literal("flat"),
      ]),
      /** Space between pages, px. */
      gap: Type.Optional(Px(48)),
    },
    { additionalProperties: false },
  ),
  /** Imagen: the Experience's main image. */
  Type.Object(
    {
      ...blockBase,
      kind: Type.Literal("imageMain"),
      fit: Type.Union([Type.Literal("contain"), Type.Literal("cover")]),
      frame: Type.Union([
        Type.Literal("none"),
        Type.Literal("card"),
        Type.Literal("shadow"),
      ]),
      aspect: Type.Optional(
        Type.Union([
          Type.Literal("auto"),
          Type.Literal("1:1"),
          Type.Literal("4:3"),
          Type.Literal("3:4"),
          Type.Literal("16:9"),
          Type.Literal("9:16"),
        ]),
      ),
      mask: Type.Optional(Type.Union(imageMasks.map((m) => Type.Literal(m)))),
    },
    { additionalProperties: false },
  ),
]);
export type DesignBlock = Static<typeof DesignBlockSchema>;
export type DesignBlockKind = DesignBlock["kind"];

/** Bound blocks each Experience type may place (at most once each, except
 * the ones in `repeatableBoundBlocks`). */
export const boundBlocksByType: Record<
  DesignableExperienceType,
  readonly DesignBlockKind[]
> = {
  links: ["contentTitle", "contentLinks"],
  profile: ["profileHeader", "contentLinks"],
  linkpage: ["profileHeader", "contentSocials", "contentLinks"],
  menu: ["contentTitle", "menu", "featuredItems"],
  catalog: ["contentTitle", "catalog", "featuredItems"],
  form: ["contentTitle", "leadForm"],
  document: ["contentTitle", "documentPages"],
  image: ["imageMain"],
};

/** Bound blocks that may appear more than once (a menu split in parts, or a
 * Menú/Catálogo highlighting a few items more than once). */
export const repeatableBoundBlocks: readonly DesignBlockKind[] = [
  "menu",
  "featuredItems",
];

/** The bound block a design of each type must keep. */
export const requiredBlockByType: Record<
  DesignableExperienceType,
  DesignBlockKind
> = {
  links: "contentLinks",
  profile: "profileHeader",
  linkpage: "profileHeader",
  menu: "menu",
  catalog: "catalog",
  form: "leadForm",
  document: "documentPages",
  image: "imageMain",
};

/** Every bound block kind (content-driven, never free). */
export const boundBlockKinds: readonly DesignBlockKind[] = [
  ...new Set(Object.values(boundBlocksByType).flat()),
];

export const sectionLayouts = ["1", "1-1", "1-2", "2-1", "1-1-1"] as const;
export type SectionLayout = (typeof sectionLayouts)[number];
/** Number of columns each layout has. */
export const layoutColumns: Record<SectionLayout, number> = {
  "1": 1,
  "1-1": 2,
  "1-2": 2,
  "2-1": 2,
  "1-1-1": 3,
};

/**
 * A block inside a section, checked loosely by the schema (an id and a
 * kind) so every validator that embeds a design (8 content schemas, each
 * in several routes) does not compile the full block union again.
 * `checkDesign`, which the Customer API, the Publisher, the Resolver and
 * the panel all run after the schema, checks every block against
 * `DesignBlockSchema` exactly.
 */
const LooseBlockSchema = Type.Unsafe<DesignBlock>(
  Type.Object(
    { id: BlockId, kind: Type.String({ minLength: 1, maxLength: 32 }) },
    { additionalProperties: true },
  ),
);

/** A flow section: columns of blocks in order. Schema 1 designs have only
 * these (without `kind`). */
export const DesignSectionSchema = Type.Object(
  {
    id: BlockId,
    kind: Type.Optional(Type.Literal("flow")),
    layout: Type.Union(sectionLayouts.map((l) => Type.Literal(l))),
    /** One array of blocks per column (length = layoutColumns[layout]). On
     * phones columns stack in this order. */
    columns: Type.Array(
      Type.Array(LooseBlockSchema, {
        maxItems: DESIGN_LIMITS.blocksPerColumn,
      }),
      { minItems: 1, maxItems: 3 },
    ),
    background: Type.Optional(DesignBackgroundSchema),
    /** Draws the section as a card over the page background. */
    card: Type.Optional(Type.Boolean()),
    paddingTop: Px(160),
    paddingBottom: Px(160),
    gap: Px(64),
    align: Type.Union([
      Type.Literal("start"),
      Type.Literal("center"),
      Type.Literal("end"),
    ]),
  },
  { additionalProperties: false },
);
export type DesignSection = Static<typeof DesignSectionSchema>;

/**
 * One block placed freely on a canvas section ("lienzo libre", schema 2).
 * Everything is in design px of a `CANVAS_WIDTH` wide phone. Blocks may
 * bleed past the edges (they are clipped there) but must overlap the
 * canvas. `h` sizes images and shapes; other blocks grow with their text.
 * `z` orders what is drawn on top; the reading order of the page is always
 * top to bottom, then left to right.
 */
export const CanvasItemSchema = Type.Object(
  {
    /** Checked loosely here, exactly by `checkDesign` (see LooseBlockSchema). */
    block: LooseBlockSchema,
    x: Type.Integer({ minimum: -CANVAS_WIDTH, maximum: CANVAS_WIDTH }),
    y: Type.Integer({ minimum: -400, maximum: DESIGN_LIMITS.canvasHeight }),
    w: Type.Integer({ minimum: 8, maximum: CANVAS_WIDTH * 2 }),
    h: Type.Optional(
      Type.Integer({ minimum: 8, maximum: DESIGN_LIMITS.canvasHeight }),
    ),
    z: Type.Optional(Type.Integer({ minimum: 0, maximum: 99 })),
    /** Rotation in degrees around the item's center (addendum 3). */
    r: Type.Optional(Type.Integer({ minimum: -180, maximum: 180 })),
    /** The Estudio will not move or resize it (the page ignores it). */
    locked: Type.Optional(Type.Boolean()),
    /** Kept in the design but not drawn on the page. */
    hidden: Type.Optional(Type.Boolean()),
  },
  { additionalProperties: false },
);
export type CanvasItem = Static<typeof CanvasItemSchema>;

export const CanvasSectionSchema = Type.Object(
  {
    id: BlockId,
    kind: Type.Literal("canvas"),
    /** Design px at `CANVAS_WIDTH`; scales with the canvas width. */
    height: Type.Integer({ minimum: 80, maximum: DESIGN_LIMITS.canvasHeight }),
    background: Type.Optional(DesignBackgroundSchema),
    items: Type.Array(CanvasItemSchema, {
      maxItems: DESIGN_LIMITS.canvasItems,
    }),
  },
  { additionalProperties: false },
);
export type CanvasSection = Static<typeof CanvasSectionSchema>;

/** Any section of a page: flow (columns) or canvas. */
export type PageSection = DesignSection | CanvasSection;

export function isCanvasSection(
  section: PageSection,
): section is CanvasSection {
  return section.kind === "canvas";
}

/** Blocks that can be placed on a canvas. Content that grows with every
 * item (links, menu, catalog, form, PDF pages) and spacers, which mean
 * nothing without a flow, stay in flow sections; shapes only exist on
 * canvases. */
export const canvasBlockKinds: readonly DesignBlock["kind"][] = [
  "heading",
  "text",
  "image",
  "button",
  "brandButton",
  "divider",
  "shape",
  "html",
  "contentTitle",
  "profileHeader",
  "contentSocials",
  "imageMain",
];

export const PageDesignSchema = Type.Object(
  {
    /** 1: flow sections only. 2: may include canvas sections. */
    schema: Type.Union([Type.Literal(1), Type.Literal(2)]),
    style: DesignStyleSchema,
    sections: Type.Array(
      Type.Union([DesignSectionSchema, CanvasSectionSchema]),
      {
        minItems: 1,
        maxItems: DESIGN_LIMITS.sections,
      },
    ),
  },
  // No `$id`: always embedded in Experience content schemas.
  { additionalProperties: false },
);
export type PageDesign = Static<typeof PageDesignSchema>;

/** A canvas's items in reading order: top to bottom, then left to right. */
export function canvasReadingOrder(items: readonly CanvasItem[]): CanvasItem[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** The blocks of one section, in reading order. */
export function sectionBlocks(section: PageSection): DesignBlock[] {
  return isCanvasSection(section)
    ? canvasReadingOrder(section.items).map((item) => item.block)
    : section.columns.flat();
}

/** Every block of a design, in reading order. */
export function designBlocks(design: PageDesign): DesignBlock[] {
  return design.sections.flatMap(sectionBlocks);
}

/** Image references a design uses (blocks, section and page backgrounds,
 * and every photo of a `gallery` block). */
export function designImageRefs(design: PageDesign): string[] {
  const refs = new Set<string>();
  if (design.style.background.imageRef)
    refs.add(design.style.background.imageRef);
  for (const section of design.sections) {
    if (section.background?.imageRef) refs.add(section.background.imageRef);
    for (const block of sectionBlocks(section)) {
      if (block.kind === "image" && block.imageRef) refs.add(block.imageRef);
      if (block.kind === "gallery")
        for (const image of block.images)
          if (image.imageRef) refs.add(image.imageRef);
    }
  }
  return [...refs];
}

/** `kardo-asset:<ref>` tokens written in the source of `html` blocks (asset
 * ids while authoring, content hashes once published). Best-effort text
 * scan; the sanitizer decides what is actually kept. */
export function designHtmlAssetRefs(design: PageDesign): string[] {
  const refs = new Set<string>();
  const pattern = /kardo-asset:([0-9a-fA-F-]{32,64})/g;
  for (const block of designBlocks(design)) {
    if (block.kind !== "html") continue;
    for (const source of [block.html, block.css])
      for (const match of source.matchAll(pattern))
        if (match[1]) refs.add(match[1].toLowerCase());
  }
  return [...refs];
}

export type DesignIssue = { path: string; message: string };

/** What `checkDesign` may know about the Experience's own content, besides
 * the ids its items already use. */
export type DesignCheckContext = {
  /** Section ids of a Menú: a `menu` block may only name these. */
  menuSectionIds?: readonly string[];
  /** Real dish/product ids of a Menú or a Catálogo: a `featuredItems` block
   * may only name these. */
  featurableItemIds?: readonly string[];
};

/**
 * Rules the schema alone cannot express. Returns an empty list when the
 * design is valid for the given type and content item ids. Shared by the
 * Customer API, the Publisher, the Resolver and the panel. Blocks are
 * checked here against `DesignBlockSchema` exactly (the section schemas
 * only check an id and a kind, see LooseBlockSchema), so callers must
 * register the "uri" format as they already do.
 */
export function checkDesign(
  type: DesignableExperienceType,
  design: PageDesign,
  contentItemIds: readonly string[] = [],
  context: DesignCheckContext = {},
): DesignIssue[] {
  const issues: DesignIssue[] = [];
  const allowedBound = new Set(boundBlocksByType[type]);
  const boundSeen = new Set<string>();
  const ids = new Set<string>(contentItemIds);
  const menuSections = context.menuSectionIds
    ? new Set(context.menuSectionIds)
    : null;
  const featurableItems = context.featurableItemIds
    ? new Set(context.featurableItemIds)
    : null;
  let blocks = 0;
  let buttons = 0;
  let images = 0;
  let canvases = 0;
  let htmlBlocks = 0;
  let menuBlocks = 0;
  let featuredBlocks = 0;
  const anyBound = new Set<DesignBlockKind>(boundBlockKinds);
  const repeatable = new Set<DesignBlockKind>(repeatableBoundBlocks);

  const checkBlock = (block: DesignBlock, blockPath: string): boolean => {
    if (!Value.Check(DesignBlockSchema, block)) {
      issues.push({ path: blockPath, message: "Invalid block." });
      return false;
    }
    blocks += 1;
    if (ids.has(block.id))
      issues.push({ path: blockPath, message: "Repeated id." });
    ids.add(block.id);
    if (block.kind === "button" || block.kind === "brandButton") buttons += 1;
    if (block.kind === "image") images += 1;
    if (block.kind === "gallery") images += block.images.length;
    if (block.kind === "html") htmlBlocks += 1;
    if (block.kind === "text") {
      const chars = block.runs.reduce((n, run) => n + run.text.length, 0);
      if (chars > DESIGN_LIMITS.textChars)
        issues.push({ path: blockPath, message: "Text is too long." });
    }
    if (block.kind === "menu") {
      menuBlocks += 1;
      const seen = new Set<string>();
      for (const sectionId of block.sectionIds ?? []) {
        if (seen.has(sectionId))
          issues.push({
            path: blockPath,
            message: "A menu section is listed twice.",
          });
        seen.add(sectionId);
        if (menuSections && !menuSections.has(sectionId))
          issues.push({
            path: blockPath,
            message: "The menu block names a section the menu does not have.",
          });
      }
    }
    if (block.kind === "featuredItems") {
      featuredBlocks += 1;
      const seen = new Set<string>();
      for (const itemId of block.itemIds) {
        if (seen.has(itemId))
          issues.push({
            path: blockPath,
            message: "A featured item is listed twice.",
          });
        seen.add(itemId);
        if (featurableItems && !featurableItems.has(itemId))
          issues.push({
            path: blockPath,
            message:
              "The featuredItems block names an item the content does not have.",
          });
      }
    }
    if (anyBound.has(block.kind)) {
      if (!allowedBound.has(block.kind))
        issues.push({
          path: blockPath,
          message: `${block.kind} is not available for ${type}.`,
        });
      if (boundSeen.has(block.kind) && !repeatable.has(block.kind))
        issues.push({
          path: blockPath,
          message: `${block.kind} can appear only once.`,
        });
      boundSeen.add(block.kind);
    }
    return true;
  };

  design.sections.forEach((section, sectionIndex) => {
    const path = `sections[${sectionIndex}]`;
    if (ids.has(section.id)) issues.push({ path, message: "Repeated id." });
    ids.add(section.id);

    if (isCanvasSection(section)) {
      canvases += 1;
      section.items.forEach((item, itemIndex) => {
        const itemPath = `${path}.items[${itemIndex}]`;
        if (!checkBlock(item.block, `${itemPath}.block`)) return;
        if (!canvasBlockKinds.includes(item.block.kind))
          issues.push({
            path: itemPath,
            message: `${item.block.kind} cannot be placed on a canvas.`,
          });
        // Bleeding past an edge is fine; lying entirely outside is not.
        const bottom = item.y + (item.h ?? 1);
        if (
          item.x >= CANVAS_WIDTH ||
          item.x + item.w <= 0 ||
          item.y >= section.height ||
          bottom <= 0
        )
          issues.push({ path: itemPath, message: "Outside the canvas." });
      });
      return;
    }

    if (section.columns.length !== layoutColumns[section.layout])
      issues.push({
        path,
        message: `Layout ${section.layout} needs ${layoutColumns[section.layout]} columns.`,
      });
    section.columns.forEach((column, columnIndex) => {
      column.forEach((block, blockIndex) => {
        const blockPath = `${path}.columns[${columnIndex}][${blockIndex}]`;
        if (!checkBlock(block, blockPath)) return;
        if (block.kind === "shape")
          issues.push({
            path: blockPath,
            message: "Shapes can only be placed on a canvas.",
          });
      });
    });
  });

  if (canvases > 0 && design.schema !== 2)
    issues.push({
      path: "schema",
      message: "Canvas sections need design schema 2.",
    });
  if (canvases > DESIGN_LIMITS.canvasSections)
    issues.push({ path: "sections", message: "Too many canvas sections." });

  if (!boundSeen.has(requiredBlockByType[type]))
    issues.push({
      path: "sections",
      message: `The design must keep ${requiredBlockByType[type]}.`,
    });
  if (blocks > DESIGN_LIMITS.blocks)
    issues.push({ path: "sections", message: "Too many blocks." });
  if (buttons > DESIGN_LIMITS.buttons)
    issues.push({ path: "sections", message: "Too many buttons." });
  if (images > DESIGN_LIMITS.images)
    issues.push({ path: "sections", message: "Too many images." });
  if (htmlBlocks > DESIGN_LIMITS.htmlBlocks)
    issues.push({ path: "sections", message: "Too many HTML blocks." });
  if (menuBlocks > DESIGN_LIMITS.menuBlocks)
    issues.push({ path: "sections", message: "Too many menu blocks." });
  if (featuredBlocks > DESIGN_LIMITS.featuredBlocks)
    issues.push({
      path: "sections",
      message: "Too many featuredItems blocks.",
    });
  if (JSON.stringify(design).length > DESIGN_LIMITS.bytes)
    issues.push({ path: "", message: "The design is too large." });
  return issues;
}

/** The `html` blocks of a design, in reading order (the sanitizer runs on
 * each one before it is previewed, published or served). */
export function designHtmlBlocks(
  design: PageDesign,
): Extract<DesignBlock, { kind: "html" }>[] {
  return designBlocks(design).filter(
    (block): block is Extract<DesignBlock, { kind: "html" }> =>
      block.kind === "html",
  );
}
