import {
  isPieceCodeShape,
  isPiecePublicId,
  PIECE_CODE_ALPHABET,
  type StaffPieceBatch,
} from "@kardo/contracts";
import { describe, expect, it, vi } from "vitest";
import { buildStaffApi } from "../src/app.js";
import { StaffPermissionError } from "../src/http/errors.js";
import {
  activationUrl,
  expandItems,
  newKitCode,
  newPieceCode,
  newPiecePublicId,
  pieceUrls,
  type StaffPieceRepository,
} from "../src/repositories/pieces.js";
import { staffIdentity } from "./fixtures.js";

const batchId = "6b2e3f40-5a6b-4c7d-8e9f-0a1b2c3d4e5f";

const batch: StaffPieceBatch = {
  batch: {
    id: batchId,
    kitCode: "presentacion",
    kitName: "Kit Presentación",
    reference: "Café Central, pedido del 13",
    pieces: 3,
    claimed: 0,
    workspaceId: null,
    workspaceName: null,
    panelOutcome: null,
    createdAt: "2026-10-13T00:00:00.000Z",
    claimedAt: null,
  },
  code: "ABCDE-23456",
  activationUrl: "https://kardo.test/activar/?codigo=ABCDE-23456",
  pieces: [],
};

function sessionRepository(permissions: string[]) {
  return {
    getActiveStaffSession: async () => ({
      ...staffIdentity,
      displayName: "Staff",
      permissions,
    }),
    readDiagnostics: async () => {
      throw new Error("not used");
    },
  };
}

function pieces(
  overrides: Partial<StaffPieceRepository> = {},
): StaffPieceRepository {
  return {
    listKits: async () => [],
    listBatches: async () => ({ items: [batch.batch], nextCursor: null }),
    getBatch: async () => batch,
    createBatch: async () => batch,
    ...overrides,
  };
}

describe("piece batch routes (ADR 026)", () => {
  it("creates an order for the verified staff member", async () => {
    const createBatch = vi.fn(async () => batch);
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(["pieces.read", "pieces.write"]),
      pieceRepository: pieces({ createBatch }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/staff/piece-batches",
      headers: { authorization: "Bearer staff-token" },
      payload: {
        kitCode: "presentacion",
        reference: "Café Central, pedido del 13",
        reason: "Pedido por WhatsApp",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ code: "ABCDE-23456" });
    expect(createBatch).toHaveBeenCalledWith(staffIdentity.subject, {
      kitCode: "presentacion",
      reference: "Café Central, pedido del 13",
      reason: "Pedido por WhatsApp",
    });
    await app.close();
  });

  it("refuses an order without a reason or with too many pieces of a model", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(["pieces.write"]),
      pieceRepository: pieces(),
    });
    const noReason = await app.inject({
      method: "POST",
      url: "/v1/staff/piece-batches",
      headers: { authorization: "Bearer staff-token" },
      payload: {
        items: [{ piece: "card", quantity: 10 }],
        reference: "Taller B",
      },
    });
    expect(noReason.statusCode).toBe(400);
    const tooMany = await app.inject({
      method: "POST",
      url: "/v1/staff/piece-batches",
      headers: { authorization: "Bearer staff-token" },
      payload: {
        items: [{ piece: "card", quantity: 101 }],
        reference: "Taller B",
        reason: "Pedido suelto",
      },
    });
    expect(tooMany.statusCode).toBe(400);
    await app.close();
  });

  it("answers 403 when the repository says the role cannot", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(["customers.read"]),
      pieceRepository: pieces({
        getBatch: async () => {
          throw new StaffPermissionError();
        },
      }),
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/piece-batches/${batchId}`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("lists the orders, newest first", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(["pieces.read"]),
      pieceRepository: pieces(),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/piece-batches",
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().items[0]).toMatchObject({
      kitName: "Kit Presentación",
    });
    await app.close();
  });
});

describe("piece codes and addresses (ADR 026)", () => {
  it("draws addresses the Resolver knows as pieces", () => {
    const ids = new Set(Array.from({ length: 200 }, newPiecePublicId));
    expect(ids.size).toBe(200);
    for (const id of ids) expect(isPiecePublicId(id)).toBe(true);
  });

  it("draws Crockford codes of 10 for a kit and 8 for a piece", () => {
    for (let index = 0; index < 200; index += 1) {
      const kit = newKitCode();
      const piece = newPieceCode();
      expect(kit).toHaveLength(10);
      expect(piece).toHaveLength(8);
      expect(
        [...kit, ...piece].every((char) => PIECE_CODE_ALPHABET.includes(char)),
      ).toBe(true);
      expect(isPieceCodeShape(kit) && isPieceCodeShape(piece)).toBe(true);
    }
  });

  it("expands an order in the order the pieces are shown", () => {
    const expanded = expandItems([
      { piece: "sticker", quantity: 2 },
      { piece: "magnet", quantity: 3 },
      { piece: "stand", quantity: 1 },
    ]);
    expect(expanded.map((piece) => piece.model)).toEqual([
      "stand",
      "magnet",
      "magnet",
      "magnet",
      "sticker",
      "sticker",
    ]);
    expect(new Set(expanded.map((piece) => piece.code)).size).toBe(6);
  });

  it("writes the chip and prints the QR with their channel", () => {
    expect(
      pieceUrls("https://t.kardo.test", "kp_Ab3dEf6hIj9kLm2nOp4q"),
    ).toEqual({
      nfc: "https://t.kardo.test/t/kp_Ab3dEf6hIj9kLm2nOp4q?src=nfc",
      qr: "https://t.kardo.test/t/kp_Ab3dEf6hIj9kLm2nOp4q?src=qr",
    });
  });

  it("points the activation card at the site's /activar/, only with a site and a code", () => {
    expect(activationUrl("https://kardo.test", "ABCDE23456")).toBe(
      "https://kardo.test/activar/?codigo=ABCDE-23456",
    );
    expect(activationUrl(null, "ABCDE23456")).toBeNull();
    expect(activationUrl("https://kardo.test", null)).toBeNull();
  });
});
