import type {
  PieceModel,
  StaffCreatePieceBatch,
  StaffKit,
} from "@kardo/contracts";
import { pieceModels } from "@kardo/contracts";
import { pieceModelLabels } from "./workshop-file.js";

export const maxBatchPieces = 100;
export const referenceBounds = { min: 3, max: 120 } as const;

export type LooseQuantities = Record<PieceModel, string>;

export const emptyQuantities: LooseQuantities = {
  stand: "0",
  card: "0",
  magnet: "0",
  sticker: "0",
};

function plural(model: PieceModel, quantity: number): string {
  const label = pieceModelLabels[model];
  return `${quantity} ${label}${quantity === 1 ? "" : "s"}`;
}

/** «1 Stand, 2 Cards». */
export function itemsText(
  items: readonly { piece: PieceModel; quantity: number }[],
): string {
  return items.map((item) => plural(item.piece, item.quantity)).join(", ");
}

const planNames: Record<string, string> = {
  profesional: "Profesional",
  negocio: "Negocio",
};

export function kitPlanText(kit: StaffKit): string {
  const name = planNames[kit.panelPlanCode] ?? kit.panelPlanCode;
  return `Incluye ${kit.panelDays} días de ${name}`;
}

export type BatchValidation =
  | { ok: true; body: Omit<StaffCreatePieceBatch, "reason"> }
  | { ok: false; error: string | null; referenceError: string | null };

/** The form's checks, before the reason: kit or loose pieces, and who. */
export function validateBatch(input: {
  kitCode: string | null;
  quantities: LooseQuantities;
  reference: string;
}): BatchValidation {
  const reference = input.reference.trim();
  const referenceError =
    reference.length === 0
      ? null
      : reference.length < referenceBounds.min
        ? `Escribe al menos ${referenceBounds.min} caracteres.`
        : reference.length > referenceBounds.max
          ? `Máximo ${referenceBounds.max} caracteres.`
          : null;
  const referenceOk =
    reference.length >= referenceBounds.min &&
    reference.length <= referenceBounds.max;

  if (input.kitCode) {
    if (!referenceOk) return { ok: false, error: null, referenceError };
    return { ok: true, body: { kitCode: input.kitCode, reference } };
  }

  const items: { piece: PieceModel; quantity: number }[] = [];
  let total = 0;
  for (const model of pieceModels) {
    const raw = input.quantities[model].trim();
    const quantity = raw === "" ? 0 : Number(raw);
    if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100)
      return {
        ok: false,
        error: "Cada cantidad va de 0 a 100, sin decimales.",
        referenceError,
      };
    total += quantity;
    if (quantity > 0) items.push({ piece: model, quantity });
  }
  if (total === 0)
    return {
      ok: false,
      error: "Elige un kit o pon al menos una pieza.",
      referenceError,
    };
  if (total > maxBatchPieces)
    return {
      ok: false,
      error: `Un lote lleva como máximo ${maxBatchPieces} piezas. Ahora van ${total}.`,
      referenceError,
    };
  if (!referenceOk) return { ok: false, error: null, referenceError };
  return { ok: true, body: { kitCode: null, items, reference } };
}
