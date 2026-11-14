import { randomInt } from "node:crypto";
import {
  formatPieceCode,
  KIT_CODE_LENGTH,
  PIECE_CODE_ALPHABET,
  PIECE_CODE_LENGTH,
  type PieceBatchItem,
  type PieceModel,
  pieceModels,
  type StaffCreatePieceBatch,
  type StaffKit,
  type StaffPiece,
  type StaffPieceBatch,
  type StaffPieceBatchList,
  type StaffPieceBatchSummary,
  staffPermissions,
} from "@kardo/contracts";
import type { Sql } from "postgres";
import { requireStaffPermission, withStaffContext } from "../http/context.js";
import {
  StaffNotFoundError,
  StaffPermissionError,
  StaffRepositoryError,
  StaffValidationError,
} from "../http/errors.js";

/*
 * Piezas de Kardo (ADR 026): Kardo creates an order (a kit or loose pieces)
 * and gets back what goes to the workshop in Puebla: each piece's address
 * for its chip and its printed QR, its own code, and the kit's code with
 * the activation card's link. The database (`kardo_private.create_piece_
 * batch`) validates, stores and audits; this layer draws the random codes
 * and addresses.
 */

export type StaffPieceRepository = {
  listKits(subject: string): Promise<StaffKit[]>;
  listBatches(subject: string): Promise<StaffPieceBatchList>;
  getBatch(subject: string, batchId: string): Promise<StaffPieceBatch>;
  createBatch(
    subject: string,
    input: StaffCreatePieceBatch,
  ): Promise<StaffPieceBatch>;
};

export function unavailableStaffPieceRepository(): StaffPieceRepository {
  const unavailable = () => Promise.reject(new StaffRepositoryError());
  return {
    listKits: unavailable,
    listBatches: unavailable,
    getBatch: unavailable,
    createBatch: unavailable,
  };
}

const ADDRESS_ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function randomFrom(alphabet: string, length: number): string {
  let value = "";
  for (let index = 0; index < length; index += 1)
    value += alphabet[randomInt(alphabet.length)];
  return value;
}

/** A piece's permanent address: `kp_` and 20 letters or digits (~119 bits). */
export function newPiecePublicId(): string {
  return `kp_${randomFrom(ADDRESS_ALPHABET, 20)}`;
}

/** A kit's code: 10 Crockford characters (50 bits). */
export function newKitCode(): string {
  return randomFrom(PIECE_CODE_ALPHABET, KIT_CODE_LENGTH);
}

/** A piece's code: 8 Crockford characters (40 bits). */
export function newPieceCode(): string {
  return randomFrom(PIECE_CODE_ALPHABET, PIECE_CODE_LENGTH);
}

/** One piece per unit of each item, in the order the four pieces are shown. */
export function expandItems(
  items: readonly PieceBatchItem[],
): { publicId: string; model: PieceModel; code: string }[] {
  const sorted = [...items].sort(
    (a, b) => pieceModels.indexOf(a.piece) - pieceModels.indexOf(b.piece),
  );
  return sorted.flatMap((item) =>
    Array.from({ length: item.quantity }, () => ({
      publicId: newPiecePublicId(),
      model: item.piece,
      code: newPieceCode(),
    })),
  );
}

/** What the chip is written with and what the printed QR opens. */
export function pieceUrls(
  resolverOrigin: string,
  publicId: string,
): StaffPiece["urls"] {
  const base = new URL(`/t/${publicId}`, resolverOrigin);
  const nfc = new URL(base);
  nfc.searchParams.set("src", "nfc");
  const qr = new URL(base);
  qr.searchParams.set("src", "qr");
  return { nfc: nfc.toString(), qr: qr.toString() };
}

/** The activation card's QR: the site's `/activar/`, which forwards to the
 * panel's «Producto de Kardo» with the code already written. */
export function activationUrl(
  websiteOrigin: string | null,
  code: string | null,
): string | null {
  if (!websiteOrigin || !code) return null;
  const url = new URL("/activar/", websiteOrigin);
  url.searchParams.set("codigo", formatPieceCode(code));
  return url.toString();
}

function mapPieceFunctionError(error: unknown): never {
  const failure = error as { code?: string; message?: string } | null;
  if (failure?.code === "P0001") {
    switch (failure.message) {
      case "FORBIDDEN":
        throw new StaffPermissionError();
      case "KIT_NOT_FOUND":
        throw new StaffValidationError("That kit does not exist.");
      case "INVALID_REASON":
        throw new StaffValidationError("The reason is not valid.");
      case "INVALID_REFERENCE":
        throw new StaffValidationError("The reference is not valid.");
      case "INVALID_ITEMS":
      case "INVALID_PIECES":
        throw new StaffValidationError(
          "An order has between 1 and 100 pieces of the four models.",
        );
    }
  }
  throw error;
}

type BatchRow = {
  id: string;
  kit_code: string | null;
  kit_name: string | null;
  reference: string;
  pieces: number;
  claimed: number;
  workspace_id: string | null;
  workspace_name: string | null;
  panel_outcome: StaffPieceBatchSummary["panelOutcome"];
  created_at: string | Date;
  claimed_at: string | Date | null;
  claim_code: string | null;
};

type PieceRow = {
  touchpoint_id: string;
  public_id: string;
  model: PieceModel;
  code: string | null;
  status: string;
  operational_name: string | null;
  workspace_name: string | null;
  claimed_at: string | Date | null;
};

const iso = (value: string | Date | null): string | null =>
  value === null ? null : new Date(value).toISOString();

function toSummary(row: BatchRow): StaffPieceBatchSummary {
  return {
    id: row.id,
    kitCode: row.kit_code,
    kitName: row.kit_name,
    reference: row.reference,
    pieces: Number(row.pieces),
    claimed: Number(row.claimed),
    workspaceId: row.workspace_id,
    workspaceName: row.workspace_name,
    panelOutcome: row.panel_outcome,
    createdAt: iso(row.created_at) ?? new Date().toISOString(),
    claimedAt: iso(row.claimed_at),
  };
}

function batchSelect(tx: Sql) {
  return tx`
    select b.id, b.kit_code, k.name as kit_name, b.reference,
           (select count(*) from kardo_core.touchpoints t where t.piece_batch_id = b.id) as pieces,
           (select count(*) from kardo_core.touchpoints t
             where t.piece_batch_id = b.id and t.workspace_id is not null) as claimed,
           b.workspace_id, w.name as workspace_name, b.panel_outcome,
           b.created_at, b.claimed_at, b.claim_code
    from kardo_core.piece_batches b
    left join kardo_billing.kits k on k.code = b.kit_code
    left join kardo_core.workspaces w on w.id = b.workspace_id
  `;
}

export function createPostgresStaffPieceRepository(
  sql: Sql,
  options: { resolverOrigin: string; websiteOrigin: string | null },
): StaffPieceRepository {
  async function readBatch(tx: Sql, batchId: string): Promise<StaffPieceBatch> {
    const [row] = await tx<BatchRow[]>`
      ${batchSelect(tx)}
      where b.id = ${batchId}::uuid
    `;
    if (!row) throw new StaffNotFoundError("Piece batch was not found.");
    const pieces = await tx<PieceRow[]>`
      select t.id as touchpoint_id, t.public_id, t.piece_model as model,
             a.claim_code as code, t.status::text as status, t.operational_name,
             w.name as workspace_name, a.claimed_at
      from kardo_core.touchpoints t
      left join kardo_core.touchpoint_activations a on a.touchpoint_id = t.id
      left join kardo_core.workspaces w on w.id = t.workspace_id
      where t.piece_batch_id = ${batchId}::uuid
      order by array_position(array['stand', 'card', 'magnet', 'sticker'], t.piece_model), t.created_at, t.public_id
    `;
    return {
      batch: toSummary(row),
      code: row.claim_code ? formatPieceCode(row.claim_code) : null,
      activationUrl: activationUrl(options.websiteOrigin, row.claim_code),
      pieces: pieces.map((piece) => ({
        touchpointId: piece.touchpoint_id,
        publicId: piece.public_id,
        model: piece.model,
        code: piece.code ? formatPieceCode(piece.code) : null,
        status: piece.status,
        operationalName: piece.operational_name,
        workspaceName: piece.workspace_name,
        claimedAt: iso(piece.claimed_at),
        urls: pieceUrls(options.resolverOrigin, piece.public_id),
      })),
    };
  }

  return {
    async listKits(subject) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.piecesRead);
        const rows = await tx<
          {
            code: string;
            name: string;
            panel_plan_code: string;
            panel_days: number;
            items: PieceBatchItem[];
          }[]
        >`
          select code, name, panel_plan_code, panel_days, items
          from kardo_billing.kits
          order by (select coalesce(sum((i->>'quantity')::int), 0) from jsonb_array_elements(items) i), code
        `;
        return rows.map((row) => ({
          code: row.code,
          name: row.name,
          panelPlanCode: row.panel_plan_code,
          panelDays: row.panel_days,
          items: row.items,
        }));
      });
    },

    async listBatches(subject) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.piecesRead);
        const rows = await tx<BatchRow[]>`
          ${batchSelect(tx)}
          order by b.created_at desc
          limit 100
        `;
        return { items: rows.map(toSummary), nextCursor: null };
      });
    },

    async getBatch(subject, batchId) {
      return withStaffContext(sql, subject, async (tx) => {
        await requireStaffPermission(tx, subject, staffPermissions.piecesRead);
        return readBatch(tx, batchId);
      });
    },

    async createBatch(subject, input) {
      const kitCode = input.kitCode ?? null;
      if (!kitCode && !input.items?.length)
        throw new StaffValidationError("Choose a kit or the loose pieces.");
      // A repeated random code or address (very unlikely, but 40 bits run
      // out eventually) fails the unique index: draw them again.
      for (let attempt = 1; ; attempt += 1) {
        try {
          return await createOnce(subject, kitCode, input);
        } catch (error) {
          const unique = (error as { code?: string } | null)?.code === "23505";
          if (!unique || attempt >= 3) throw error;
        }
      }
    },
  };

  async function createOnce(
    subject: string,
    kitCode: string | null,
    input: StaffCreatePieceBatch,
  ): Promise<StaffPieceBatch> {
    return withStaffContext(sql, subject, async (tx) => {
      await requireStaffPermission(tx, subject, staffPermissions.piecesWrite);
      let items: PieceBatchItem[] = input.items ?? [];
      if (kitCode) {
        const [kit] = await tx<{ items: PieceBatchItem[] }[]>`
            select items from kardo_billing.kits where code = ${kitCode}
          `;
        if (!kit) throw new StaffValidationError("That kit does not exist.");
        items = kit.items;
      }
      const [row] = await tx<{ id: string }[]>`
          select kardo_private.create_piece_batch(
            ${kitCode}, ${kitCode ? null : tx.json(items)}, ${input.reference.trim()},
            ${input.reason.trim()}, ${newKitCode()}, ${tx.json(expandItems(items))}
          ) as id
        `.catch(mapPieceFunctionError);
      if (!row) throw new StaffRepositoryError();
      return readBatch(tx, row.id);
    });
  }
}
