import {
  type KardoPieceClaimPreview,
  normalizePieceCode,
  type PieceModel,
} from "@kardo/contracts";
import { ApiRequestError } from "../api.js";

/*
 * «Producto de Kardo» in the demo (ADR 026). Two codes work:
 *   K4RD0-DEM05  a Kit Presentación (1 Stand, 2 Cards) with its 30 days;
 *   DEM0-0001    one loose Magnet.
 * Anything else answers like the API does for a code that opens nothing.
 */
export const demoKitCode = "K4RD0DEM05";
export const demoPieceCode = "DEM00001";

type DemoPiece = { touchpointId: string; publicId: string; model: PieceModel };

const kitPieces: DemoPiece[] = [
  {
    touchpointId: "7c1e0a52-1a2b-4c3d-8e4f-5a6b7c8d9e01",
    publicId: "kp_DemoStand00000000001",
    model: "stand",
  },
  {
    touchpointId: "7c1e0a52-1a2b-4c3d-8e4f-5a6b7c8d9e02",
    publicId: "kp_DemoCard000000000001",
    model: "card",
  },
  {
    touchpointId: "7c1e0a52-1a2b-4c3d-8e4f-5a6b7c8d9e03",
    publicId: "kp_DemoCard000000000002",
    model: "card",
  },
];
const loosePiece: DemoPiece = {
  touchpointId: "7c1e0a52-1a2b-4c3d-8e4f-5a6b7c8d9e04",
  publicId: "kp_DemoMagnet0000000001",
  model: "magnet",
};

const claimed = new Set<string>();
let kitDaysUsed = false;

function piecesFor(code: string): { kit: boolean; pieces: DemoPiece[] } | null {
  const value = normalizePieceCode(code);
  if (value === demoKitCode) return { kit: true, pieces: kitPieces };
  if (value === demoPieceCode) return { kit: false, pieces: [loosePiece] };
  return null;
}

function invalid(): never {
  throw new ApiRequestError(
    "Ese código no abre ninguna pieza. Revísalo letra por letra: viene en la tarjeta de activación de tu pedido y atrás de cada pieza.",
    400,
    "PIECE_CODE_INVALID",
  );
}

export function demoPiecePreview(
  code: string,
  usage: number,
): KardoPieceClaimPreview {
  const found = piecesFor(code);
  if (!found) invalid();
  const left = found.pieces.filter((piece) => !claimed.has(piece.touchpointId));
  if (!left.length)
    throw new ApiRequestError(
      "Ya activaste las piezas de este código. Las encuentras en QR y etiquetas.",
      409,
      "PIECE_CODE_USED",
    );
  return {
    scope: found.kit ? "kit" : "piece",
    pieces: left.map(({ touchpointId, model }) => ({ touchpointId, model })),
    alreadyActive: found.pieces.length - left.length,
    kit: found.kit
      ? {
          kitCode: "presentacion",
          kitName: "Kit Presentación",
          planCode: "profesional",
          planName: "Profesional",
          days: 30,
          pending: !kitDaysUsed,
          outcome: "trial",
        }
      : null,
    limit: {
      limit: 60,
      usage,
      fits: Math.max(0, Math.min(left.length, 60 - usage)),
    },
    planRequired: false,
  };
}

/** The Touchpoints the demo store gets, and the kit's 30 days. */
export function demoPieceClaim(
  code: string,
  chosen: { touchpointId: string; name: string }[],
  groupId: string | null,
): {
  touchpoints: Record<string, unknown>[];
  panel: { outcome: "trial"; planCode: string; endsAt: string } | null;
} {
  const found = piecesFor(code);
  if (!found) invalid();
  const now = new Date();
  const touchpoints = chosen.map((choice) => {
    const piece = found.pieces.find(
      (item) => item.touchpointId === choice.touchpointId,
    );
    if (!piece || claimed.has(piece.touchpointId))
      throw new ApiRequestError(
        "Alguna de esas piezas ya se activó. Revisa el código otra vez para ver las que quedan.",
        409,
        "PIECE_NOT_CLAIMABLE",
      );
    claimed.add(piece.touchpointId);
    return {
      id: piece.touchpointId,
      publicId: piece.publicId,
      operationalName: choice.name,
      physicalType: "card",
      kind: "kardo",
      pieceModel: piece.model,
      status: "assigned",
      groupId,
      createdAt: now.toISOString(),
      live: null,
    };
  });
  const panel =
    found.kit && !kitDaysUsed
      ? {
          outcome: "trial" as const,
          planCode: "profesional",
          endsAt: new Date(now.getTime() + 30 * 86_400_000).toISOString(),
        }
      : null;
  if (found.kit) kitDaysUsed = true;
  return { touchpoints, panel };
}
