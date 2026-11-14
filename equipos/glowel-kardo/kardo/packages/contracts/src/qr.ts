import {
  type Static,
  type TLiteral,
  type TUnion,
  Type,
} from "@sinclair/typebox";

// ---------------------------------------------------------------------------
// Estudio QR — design model (schema 2)
//
// Every value is a closed choice, a bounded number or a `#rrggbb` color, so
// the design can be stored per Touchpoint and rendered anywhere without ever
// interpolating free-form markup. The Kardo mark is not part of the model: it
// is always drawn in downloads (owner decision).
// Only top-level schemas carry `$id` (see customer-api stripNestedSchemaIds).
// ---------------------------------------------------------------------------

const HexColor = Type.String({ pattern: "^#[0-9a-fA-F]{6}$" });
const Uuid = Type.String({ format: "uuid" });

export const qrModuleShapes = [
  "square",
  "rounded",
  "dots",
  "diamond",
  "fluid",
  "classy",
  "vertical",
  "horizontal",
] as const;
export type QrModuleShape = (typeof qrModuleShapes)[number];

/** Outer 7×7 ring of each position (finder) pattern. */
export const qrEyeFrameShapes = [
  "square",
  "rounded",
  "extra-rounded",
  "circle",
  "leaf",
  "cushion",
] as const;
export type QrEyeFrameShape = (typeof qrEyeFrameShapes)[number];

/**
 * Inner 3×3 centre of each position (finder) pattern. No diamond: decoders
 * cross-check the 1:1:3:1:1 ratio along the diagonals, which a diamond breaks.
 */
export const qrEyeBallShapes = [
  "square",
  "rounded",
  "circle",
  "leaf",
  "cushion",
] as const;
export type QrEyeBallShape = (typeof qrEyeBallShapes)[number];

export const qrErrorCorrectionLevels = ["L", "M", "Q", "H"] as const;
export type QrErrorCorrectionLevel = (typeof qrErrorCorrectionLevels)[number];

export const qrLogoPlates = ["none", "square", "rounded", "circle"] as const;
export type QrLogoPlate = (typeof qrLogoPlates)[number];

export const qrFrameStyles = [
  "none",
  "caption",
  "panel-bottom",
  "panel-top",
  "badge",
  "bubble",
  "ticket",
  "brackets",
  "phone",
] as const;
export type QrFrameStyle = (typeof qrFrameStyles)[number];

export const qrFrameFonts = ["sans", "serif", "mono"] as const;
export type QrFrameFont = (typeof qrFrameFonts)[number];

export const qrFrameIcons = [
  "none",
  "scan",
  "menu",
  "star",
  "phone",
  "wifi",
  "gift",
  "calendar",
  "cart",
  "heart",
  "pointer",
  "info",
] as const;
export type QrFrameIcon = (typeof qrFrameIcons)[number];

/** Frame text limit; `{nombre}` is replaced by the Touchpoint name. */
export const qrFrameTextMaxLength = 40;
export const qrLogoSizeRange = { min: 0.08, max: 0.3 } as const;
export const qrLogoPaddingRange = { min: 0, max: 3 } as const;
export const qrQuietZoneRange = { min: 4, max: 10 } as const;
export const qrVersionRange = { min: 1, max: 25 } as const;
/** Library designs per organization. */
export const maxQrTemplatesPerWorkspace = 50;

/** `Type.Union(values.map(Type.Literal))` would widen to `string`: keep the literal union. */
const closedChoice = <const T extends readonly [string, ...string[]]>(
  values: T,
) =>
  Type.Union(values.map((value) => Type.Literal(value))) as unknown as TUnion<
    TLiteral<T[number]>[]
  >;

export const QrPaintSchema = Type.Union([
  Type.Object(
    { kind: Type.Literal("solid"), color: HexColor },
    { additionalProperties: false },
  ),
  Type.Object(
    {
      kind: Type.Literal("linear"),
      from: HexColor,
      to: HexColor,
      /** Degrees, clockwise from "left → right". */
      angle: Type.Integer({ minimum: 0, maximum: 359 }),
    },
    { additionalProperties: false },
  ),
  Type.Object(
    { kind: Type.Literal("radial"), from: HexColor, to: HexColor },
    { additionalProperties: false },
  ),
]);
export type QrPaint = Static<typeof QrPaintSchema>;

/** `null` inherits the module fill. */
const QrEyeColorsSchema = Type.Object(
  {
    frame: Type.Union([HexColor, Type.Null()]),
    ball: Type.Union([HexColor, Type.Null()]),
  },
  { additionalProperties: false },
);
export type QrEyeColors = Static<typeof QrEyeColorsSchema>;

export const QrLogoSchema = Type.Object(
  {
    /** `brand`: the organization logo (WorkspaceProfile.logoAssetId). */
    source: Type.Union([Type.Literal("brand"), Type.Literal("asset")]),
    /** Required when `source` is `asset`: a validated image of the library. */
    assetId: Type.Optional(Uuid),
    /** Longest side of the logo as a fraction of the symbol width. */
    size: Type.Number({
      minimum: qrLogoSizeRange.min,
      maximum: qrLogoSizeRange.max,
    }),
    /** Visual plate behind the logo; modules under it are always cleared. */
    plate: closedChoice(qrLogoPlates),
    /** Clear space around the logo, in modules. */
    padding: Type.Number({
      minimum: qrLogoPaddingRange.min,
      maximum: qrLogoPaddingRange.max,
    }),
    /** `null` uses the background color. */
    plateColor: Type.Union([HexColor, Type.Null()]),
  },
  { additionalProperties: false },
);
export type QrLogo = Static<typeof QrLogoSchema>;

export const QrFrameSchema = Type.Object(
  {
    style: closedChoice(qrFrameStyles),
    color: HexColor,
    textColor: HexColor,
    text: Type.String({
      maxLength: qrFrameTextMaxLength,
      // No control characters and no markup delimiters.
      pattern: "^[^\\u0000-\\u001f\\u007f<>]*$",
    }),
    font: closedChoice(qrFrameFonts),
    uppercase: Type.Boolean(),
    icon: closedChoice(qrFrameIcons),
  },
  { additionalProperties: false },
);
export type QrFrame = Static<typeof QrFrameSchema>;

export const QrDesignSchema = Type.Object(
  {
    schema: Type.Literal(2),
    /** With a logo the engine always uses H, whatever is stored here. */
    errorCorrection: closedChoice(qrErrorCorrectionLevels),
    /** `null`: the smallest version that fits the data (and the logo). */
    minVersion: Type.Union([
      Type.Integer({
        minimum: qrVersionRange.min,
        maximum: qrVersionRange.max,
      }),
      Type.Null(),
    ]),
    /** Light margin around the symbol, in modules (ISO/IEC 18004: ≥ 4). */
    quietZone: Type.Integer({
      minimum: qrQuietZoneRange.min,
      maximum: qrQuietZoneRange.max,
    }),
    modules: Type.Object(
      { shape: closedChoice(qrModuleShapes), fill: QrPaintSchema },
      { additionalProperties: false },
    ),
    eyes: Type.Object(
      {
        frameShape: closedChoice(qrEyeFrameShapes),
        ballShape: closedChoice(qrEyeBallShapes),
        topLeft: QrEyeColorsSchema,
        topRight: QrEyeColorsSchema,
        bottomLeft: QrEyeColorsSchema,
      },
      { additionalProperties: false },
    ),
    background: Type.Object(
      {
        /** Also the expected print surface when `transparent` is true. */
        color: HexColor,
        transparent: Type.Boolean(),
      },
      { additionalProperties: false },
    ),
    logo: Type.Union([QrLogoSchema, Type.Null()]),
    frame: QrFrameSchema,
  },
  { $id: "QrDesign", additionalProperties: false },
);
export type QrDesign = Static<typeof QrDesignSchema>;

// ---------------------------------------------------------------------------
// Where a Touchpoint's design comes from
//
// A QR always encodes the Touchpoint's permanent address, so changing its
// design never invalidates a printed code: it only changes how new prints
// look. Designs therefore live in an organization library and are applied by
// reference; a group has a default design its Touchpoints (including future
// ones) inherit; one Touchpoint can still be customized on its own.
//
//   custom  → the Touchpoint's own design (`touchpoints.qr_design`)
//   library → a library design applied to this Touchpoint
//   group   → the default design of the Touchpoint's group
//   default → nothing assigned: Kardo's default design
// ---------------------------------------------------------------------------

export const qrDesignSources = [
  "custom",
  "library",
  "group",
  "default",
] as const;
export type QrDesignSource = (typeof qrDesignSources)[number];

export const qrExportFormats = ["png", "svg", "pdf", "sheet"] as const;
export type QrExportFormat = (typeof qrExportFormats)[number];

const DateTime = Type.String({ format: "date-time" });
/** SHA-256 of the canonical design JSON (see `designFingerprint`). */
const Fingerprint = Type.String({ pattern: "^[a-f0-9]{64}$" });
const TemplateName = Type.String({
  minLength: 1,
  maxLength: 60,
  pattern: "^[^\\u0000-\\u001f\\u007f<>]*\\S[^\\u0000-\\u001f\\u007f<>]*$",
});
const TemplateRef = Type.Object(
  { id: Uuid, name: Type.String({ minLength: 1, maxLength: 60 }) },
  { additionalProperties: false },
);

export const TouchpointQrDesignSchema = Type.Object(
  {
    source: closedChoice(qrDesignSources),
    /** The design in effect; `null` only when `source` is `default`. */
    design: Type.Union([QrDesignSchema, Type.Null()]),
    /** When the custom design was last saved (`null` otherwise). */
    updatedAt: Type.Union([DateTime, Type.Null()]),
    /** The library design in effect (`library` or `group` source). */
    template: Type.Union([TemplateRef, Type.Null()]),
    /** The Touchpoint's group and the design it gives its Touchpoints. */
    group: Type.Union([
      Type.Object(
        {
          id: Uuid,
          name: Type.String({ minLength: 1, maxLength: 120 }),
          template: Type.Union([TemplateRef, Type.Null()]),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    /** Last export of this Touchpoint's code (print tracking). */
    lastExport: Type.Union([
      Type.Object(
        {
          at: DateTime,
          fingerprint: Fingerprint,
          format: closedChoice(qrExportFormats),
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
  },
  { $id: "TouchpointQrDesign", additionalProperties: false },
);
export type TouchpointQrDesign = Static<typeof TouchpointQrDesignSchema>;

/**
 * `{ design }` customizes this Touchpoint only; `{ templateId }` applies a
 * library design; `{ inherit: true }` goes back to the group's design (or
 * Kardo's default).
 */
export const SaveTouchpointQrDesignSchema = Type.Union(
  [
    Type.Object({ design: QrDesignSchema }, { additionalProperties: false }),
    Type.Object({ templateId: Uuid }, { additionalProperties: false }),
    Type.Object(
      { inherit: Type.Literal(true) },
      { additionalProperties: false },
    ),
  ],
  { $id: "SaveTouchpointQrDesign" },
);
export type SaveTouchpointQrDesign = Static<
  typeof SaveTouchpointQrDesignSchema
>;

export const QrTemplateSchema = Type.Object(
  {
    id: Uuid,
    name: Type.String({ minLength: 1, maxLength: 60 }),
    design: QrDesignSchema,
    createdAt: DateTime,
    updatedAt: DateTime,
    /** Touchpoints applied directly and groups using it as their default. */
    usage: Type.Object(
      {
        touchpoints: Type.Integer({ minimum: 0 }),
        groups: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
  },
  { $id: "QrTemplate", additionalProperties: false },
);
export type QrTemplate = Static<typeof QrTemplateSchema>;

export const QrTemplateListSchema = Type.Array(QrTemplateSchema, {
  $id: "QrTemplateList",
  maxItems: maxQrTemplatesPerWorkspace,
});

export const QrTemplateDetailSchema = Type.Object(
  {
    template: QrTemplateSchema,
    /** Touchpoints the design is applied to directly. */
    touchpointIds: Type.Array(Uuid, { maxItems: 5000 }),
    /** Groups that use it as their default design. */
    groupIds: Type.Array(Uuid, { maxItems: 1000 }),
  },
  { $id: "QrTemplateDetail", additionalProperties: false },
);
export type QrTemplateDetail = Static<typeof QrTemplateDetailSchema>;

export const CreateQrTemplateSchema = Type.Object(
  { name: TemplateName, design: QrDesignSchema },
  { $id: "CreateQrTemplate", additionalProperties: false },
);
export type CreateQrTemplate = Static<typeof CreateQrTemplateSchema>;

/** Editing a library design updates every Touchpoint and group using it. */
export const UpdateQrTemplateSchema = Type.Object(
  {
    name: Type.Optional(TemplateName),
    design: Type.Optional(QrDesignSchema),
  },
  { $id: "UpdateQrTemplate", additionalProperties: false, minProperties: 1 },
);
export type UpdateQrTemplate = Static<typeof UpdateQrTemplateSchema>;

/** Applies a library design to Touchpoints and/or as the default of groups. */
export const ApplyQrTemplateSchema = Type.Object(
  {
    touchpointIds: Type.Array(Uuid, { maxItems: 500, uniqueItems: true }),
    groupIds: Type.Array(Uuid, { maxItems: 100, uniqueItems: true }),
  },
  { $id: "ApplyQrTemplate", additionalProperties: false },
);
export type ApplyQrTemplate = Static<typeof ApplyQrTemplateSchema>;

export const ApplyQrTemplateResultSchema = Type.Object(
  {
    touchpoints: Type.Integer({ minimum: 0 }),
    groups: Type.Integer({ minimum: 0 }),
    /** Not QR, retired or not found in this organization. */
    skipped: Type.Integer({ minimum: 0 }),
  },
  { $id: "ApplyQrTemplateResult", additionalProperties: false },
);
export type ApplyQrTemplateResult = Static<typeof ApplyQrTemplateResultSchema>;

/** `null` removes the group's default design. */
export const SetGroupQrTemplateSchema = Type.Object(
  { templateId: Type.Union([Uuid, Type.Null()]) },
  { $id: "SetGroupQrTemplate", additionalProperties: false },
);
export type SetGroupQrTemplate = Static<typeof SetGroupQrTemplateSchema>;

/** Records which design each exported code was printed with. */
export const RecordQrExportsSchema = Type.Object(
  {
    format: closedChoice(qrExportFormats),
    items: Type.Array(
      Type.Object(
        { touchpointId: Uuid, fingerprint: Fingerprint },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 500 },
    ),
  },
  { $id: "RecordQrExports", additionalProperties: false },
);
export type RecordQrExports = Static<typeof RecordQrExportsSchema>;

/** One row per active QR Touchpoint: where its design comes from. */
export const QrDesignOverviewSchema = Type.Array(
  Type.Object(
    {
      touchpointId: Uuid,
      source: closedChoice(qrDesignSources),
      /** Library design in effect (`library` or `group` source). */
      templateId: Type.Union([Uuid, Type.Null()]),
      /** Only for `custom`: the Touchpoint's own design. */
      design: Type.Union([QrDesignSchema, Type.Null()]),
      lastExport: Type.Union([
        Type.Object(
          {
            at: DateTime,
            fingerprint: Fingerprint,
            format: closedChoice(qrExportFormats),
          },
          { additionalProperties: false },
        ),
        Type.Null(),
      ]),
    },
    { additionalProperties: false },
  ),
  { $id: "QrDesignOverview", maxItems: 5000 },
);
export type QrDesignOverview = Static<typeof QrDesignOverviewSchema>;

/** Short-lived, signed URL to read one validated image of the library. */
export const AssetReadAuthorizationSchema = Type.Object(
  {
    url: Type.String({ format: "uri", maxLength: 2048 }),
    mediaType: Type.Union([
      Type.Literal("image/png"),
      Type.Literal("image/jpeg"),
      Type.Literal("image/webp"),
    ]),
    expiresAt: Type.String({ format: "date-time" }),
  },
  { $id: "AssetReadAuthorization", additionalProperties: false },
);
export type AssetReadAuthorization = Static<
  typeof AssetReadAuthorizationSchema
>;
