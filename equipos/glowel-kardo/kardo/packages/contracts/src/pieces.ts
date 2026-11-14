import { type Static, Type } from "@sinclair/typebox";

/*
 * Piezas de Kardo (ADR 026, fase 2 del ADR 025 §7). Kardo crea en
 * Operations un lote (el pedido de un kit o de piezas sueltas); cada pieza
 * nace como un Touchpoint de tipo `kardo`, sin dueño y con su dirección
 * permanente. El cliente la activa en su panel con el código del kit (todas
 * las piezas del lote) o con el de la pieza (una suelta).
 */

const Uuid = Type.String({ format: "uuid" });
const DateTime = Type.String({ format: "date-time" });

/** The four pieces Kardo sells (ADR 025 §1), in the order they are shown. */
export const pieceModels = ["stand", "card", "magnet", "sticker"] as const;
export type PieceModel = (typeof pieceModels)[number];
export const PieceModelSchema = Type.Union([
  Type.Literal("stand"),
  Type.Literal("card"),
  Type.Literal("magnet"),
  Type.Literal("sticker"),
]);

export function isPieceModel(value: unknown): value is PieceModel {
  return (
    typeof value === "string" &&
    (pieceModels as readonly string[]).includes(value)
  );
}

/**
 * A piece's permanent address (`/t/kp_…`): `kp_` and 20 letters or digits.
 * No other Touchpoint uses this shape (the panel's are 32 hex), so the
 * Resolver knows a piece before anyone activates it. Same rule as the
 * database check `touchpoints_piece_public_id`.
 */
export const PIECE_PUBLIC_ID_PATTERN = /^kp_[A-Za-z0-9]{20}$/;
export function isPiecePublicId(publicId: string): boolean {
  return PIECE_PUBLIC_ID_PATTERN.test(publicId);
}

/** Crockford base32: no I, L, O or U, so nothing reads as another letter. */
export const PIECE_CODE_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
/** A kit's code: 10 characters (50 bits). */
export const KIT_CODE_LENGTH = 10;
/** One piece's code: 8 characters (40 bits). */
export const PIECE_CODE_LENGTH = 8;

/**
 * What the owner typed, the way the database reads it: capitals, no spaces
 * or dashes, and I and L read as 1, O as 0 (Crockford). Same rule as
 * `kardo_private.normalize_piece_code`.
 */
export function normalizePieceCode(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, "")
    .replace(/[IL]/g, "1")
    .replace(/O/g, "0");
}

/** A code with the length of a kit's or a piece's code, only valid letters. */
export function isPieceCodeShape(value: string): boolean {
  const code = normalizePieceCode(value);
  return (
    (code.length === KIT_CODE_LENGTH || code.length === PIECE_CODE_LENGTH) &&
    [...code].every((char) => PIECE_CODE_ALPHABET.includes(char))
  );
}

/** «ABCDE-23456» for a kit, «ABCD-2345» for a piece, as printed. */
export function formatPieceCode(value: string): string {
  const code = normalizePieceCode(value);
  const half = code.length === KIT_CODE_LENGTH ? 5 : 4;
  return code.length > half
    ? `${code.slice(0, half)}-${code.slice(half)}`
    : code;
}

/* ------------------------------------------------------------------------ */
/* Panel: activar piezas                                                     */
/* ------------------------------------------------------------------------ */

const PieceCodeInputSchema = Type.String({ minLength: 4, maxLength: 24 });

/** POST /v1/workspaces/:workspaceId/kardo-pieces/preview */
export const KardoPieceCodeRequestSchema = Type.Object(
  { code: PieceCodeInputSchema },
  { $id: "KardoPieceCodeRequest", additionalProperties: false },
);
export type KardoPieceCodeRequest = Static<typeof KardoPieceCodeRequestSchema>;

/**
 * What activating a kit does to the account's panel (ADR 026 §5):
 * `trial` the trial lasts up to 30 days from today (with the kit's plan if
 * it is higher); `courtesy` the account paid before and gets the kit's plan
 * for those days; `subscription`, `manual` and `internal` change nothing;
 * `none` the organization has no billing account.
 */
export const KitPanelOutcomeSchema = Type.Union([
  Type.Literal("trial"),
  Type.Literal("courtesy"),
  Type.Literal("subscription"),
  Type.Literal("manual"),
  Type.Literal("internal"),
  Type.Literal("none"),
]);
export type KitPanelOutcome = Static<typeof KitPanelOutcomeSchema>;

export const KardoPieceToClaimSchema = Type.Object(
  { touchpointId: Uuid, model: PieceModelSchema },
  { additionalProperties: false },
);
export type KardoPieceToClaim = Static<typeof KardoPieceToClaimSchema>;

export const KardoPieceClaimPreviewSchema = Type.Object(
  {
    /** The kit's code opens every piece of the order still free; a piece's
     * code opens that one. */
    scope: Type.Union([Type.Literal("kit"), Type.Literal("piece")]),
    /** The pieces this code activates now, in the order they are shown. */
    pieces: Type.Array(KardoPieceToClaimSchema, { minItems: 1, maxItems: 100 }),
    /** Pieces of this same code already active in this organization. */
    alreadyActive: Type.Integer({ minimum: 0 }),
    /** The kit the order belongs to and its panel days; null for loose
     * pieces. `pending: false` once its days were applied. */
    kit: Type.Union([
      Type.Object(
        {
          kitCode: Type.String({ maxLength: 40 }),
          kitName: Type.String({ maxLength: 80 }),
          planCode: Type.String({ maxLength: 64 }),
          planName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
          days: Type.Integer({ minimum: 1 }),
          pending: Type.Boolean(),
          outcome: KitPanelOutcomeSchema,
        },
        { additionalProperties: false },
      ),
      Type.Null(),
    ]),
    /**
     * The plan's limit of QR y etiquetas after the activation (with the
     * kit's days applied), what is in use before it, and how many fit. A
     * null limit means no limit. Activating more than fit is refused whole.
     */
    limit: Type.Object(
      {
        limit: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
        usage: Type.Integer({ minimum: 0 }),
        fits: Type.Integer({ minimum: 0 }),
      },
      { additionalProperties: false },
    ),
    /** Even after the activation the organization would have no plan
     * (loose pieces, trial over): it needs a plan first. */
    planRequired: Type.Boolean(),
  },
  { $id: "KardoPieceClaimPreview", additionalProperties: false },
);
export type KardoPieceClaimPreview = Static<
  typeof KardoPieceClaimPreviewSchema
>;

/** POST /v1/workspaces/:workspaceId/kardo-pieces/claim */
export const ClaimKardoPiecesSchema = Type.Object(
  {
    code: PieceCodeInputSchema,
    pieces: Type.Array(
      Type.Object(
        {
          touchpointId: Uuid,
          name: Type.String({ minLength: 1, maxLength: 120 }),
        },
        { additionalProperties: false },
      ),
      { minItems: 1, maxItems: 100 },
    ),
    groupId: Type.Optional(Type.Union([Uuid, Type.Null()])),
  },
  { $id: "ClaimKardoPieces", additionalProperties: false },
);
export type ClaimKardoPieces = Static<typeof ClaimKardoPiecesSchema>;

export const KitPanelGrantSchema = Type.Object(
  {
    outcome: KitPanelOutcomeSchema,
    planCode: Type.Optional(Type.String({ maxLength: 64 })),
    endsAt: Type.Optional(DateTime),
  },
  { additionalProperties: false },
);
export type KitPanelGrant = Static<typeof KitPanelGrantSchema>;

/* ------------------------------------------------------------------------ */
/* Operations: lotes de piezas                                               */
/* ------------------------------------------------------------------------ */

export const PieceBatchItemSchema = Type.Object(
  {
    piece: PieceModelSchema,
    quantity: Type.Integer({ minimum: 1, maximum: 100 }),
  },
  { additionalProperties: false },
);
export type PieceBatchItem = Static<typeof PieceBatchItemSchema>;

/** A kit as the database knows it (kits-catalog.json, without prices). */
export const StaffKitSchema = Type.Object(
  {
    code: Type.String({ maxLength: 40 }),
    name: Type.String({ maxLength: 80 }),
    panelPlanCode: Type.String({ maxLength: 64 }),
    panelDays: Type.Integer({ minimum: 1 }),
    items: Type.Array(PieceBatchItemSchema, { maxItems: 10 }),
  },
  { $id: "StaffKit", additionalProperties: false },
);
export type StaffKit = Static<typeof StaffKitSchema>;

/** GET /v1/staff/kits */
export const StaffKitListSchema = Type.Object(
  { items: Type.Array(StaffKitSchema, { maxItems: 50 }) },
  { $id: "StaffKitList", additionalProperties: false },
);
export type StaffKitList = Static<typeof StaffKitListSchema>;

/** POST /v1/staff/piece-batches. A kit, or loose pieces (`items`). */
export const StaffCreatePieceBatchSchema = Type.Object(
  {
    kitCode: Type.Optional(
      Type.Union([Type.String({ maxLength: 40 }), Type.Null()]),
    ),
    items: Type.Optional(
      Type.Array(PieceBatchItemSchema, { minItems: 1, maxItems: 4 }),
    ),
    reference: Type.String({ minLength: 3, maxLength: 120 }),
    reason: Type.String({ minLength: 3, maxLength: 500 }),
  },
  { $id: "StaffCreatePieceBatch", additionalProperties: false },
);
export type StaffCreatePieceBatch = Static<typeof StaffCreatePieceBatchSchema>;

export const StaffPieceBatchSummarySchema = Type.Object(
  {
    id: Uuid,
    kitCode: Type.Union([Type.String({ maxLength: 40 }), Type.Null()]),
    kitName: Type.Union([Type.String({ maxLength: 80 }), Type.Null()]),
    reference: Type.String({ maxLength: 120 }),
    pieces: Type.Integer({ minimum: 0 }),
    claimed: Type.Integer({ minimum: 0 }),
    workspaceId: Type.Union([Uuid, Type.Null()]),
    workspaceName: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    panelOutcome: Type.Union([KitPanelOutcomeSchema, Type.Null()]),
    createdAt: DateTime,
    claimedAt: Type.Union([DateTime, Type.Null()]),
  },
  { $id: "StaffPieceBatchSummary", additionalProperties: false },
);
export type StaffPieceBatchSummary = Static<
  typeof StaffPieceBatchSummarySchema
>;

/** GET /v1/staff/piece-batches */
export const StaffPieceBatchListSchema = Type.Object(
  {
    items: Type.Array(StaffPieceBatchSummarySchema, { maxItems: 100 }),
    nextCursor: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
  },
  { $id: "StaffPieceBatchList", additionalProperties: false },
);
export type StaffPieceBatchList = Static<typeof StaffPieceBatchListSchema>;

export const StaffPieceSchema = Type.Object(
  {
    touchpointId: Uuid,
    publicId: Type.String({ maxLength: 32 }),
    model: PieceModelSchema,
    /** The piece's own code, «ABCD-2345», while it can still be used. */
    code: Type.Union([Type.String({ maxLength: 12 }), Type.Null()]),
    status: Type.String({ maxLength: 16 }),
    operationalName: Type.Union([Type.String({ maxLength: 120 }), Type.Null()]),
    workspaceName: Type.Union([Type.String({ maxLength: 200 }), Type.Null()]),
    claimedAt: Type.Union([DateTime, Type.Null()]),
    /** What the chip is written with and what the printed QR opens. */
    urls: Type.Object(
      {
        nfc: Type.String({ maxLength: 300 }),
        qr: Type.String({ maxLength: 300 }),
      },
      { additionalProperties: false },
    ),
  },
  { additionalProperties: false },
);
export type StaffPiece = Static<typeof StaffPieceSchema>;

/** GET /v1/staff/piece-batches/:batchId */
export const StaffPieceBatchSchema = Type.Object(
  {
    batch: StaffPieceBatchSummarySchema,
    /** The kit's code, «ABCDE-23456», while a piece is left to activate. */
    code: Type.Union([Type.String({ maxLength: 12 }), Type.Null()]),
    /** The activation card's QR: `<sitio>/activar/?codigo=…`. Null while
     * the Staff API has no WEBSITE_URL, or once the code is spent. */
    activationUrl: Type.Union([Type.String({ maxLength: 300 }), Type.Null()]),
    pieces: Type.Array(StaffPieceSchema, { maxItems: 100 }),
  },
  { $id: "StaffPieceBatch", additionalProperties: false },
);
export type StaffPieceBatch = Static<typeof StaffPieceBatchSchema>;
