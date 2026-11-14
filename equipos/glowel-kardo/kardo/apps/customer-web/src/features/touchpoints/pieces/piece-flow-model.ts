import {
  formatPieceCode,
  isPieceCodeShape,
  type KardoPieceClaimPreview,
  KIT_CODE_LENGTH,
  normalizePieceCode,
  PIECE_CODE_ALPHABET,
  type PieceModel,
} from "@kardo/contracts";
import { suggestPieceNames } from "../naming.js";
import { piecesSummary, pieceViews } from "./pieces.js";

/*
 * «Producto de Kardo» in «Nuevo QR o etiqueta» (ADR 026): which piece you
 * have, the code that came with it, and the names. Pure, so the steps, the
 * code and the summary are tested without a browser. The draft is kept in
 * this tab's session storage: a reload comes back to the same step (owner's
 * rule for every flow with steps).
 */

export const pieceFlowSteps = [
  { id: "kind", label: "Objeto" },
  { id: "piece", label: "Pieza" },
  { id: "code", label: "Código" },
  { id: "name", label: "Nombre" },
] as const;
export type PieceFlowStep = Exclude<
  (typeof pieceFlowSteps)[number]["id"],
  "kind"
>;

/** One piece, or a kit (or several pieces) with the order's code. */
export type PieceChoice = PieceModel | "kit";

export type PieceGroupMode = "none" | "existing" | "new";

export type PieceFlowDraft = {
  workspaceId: string;
  step: PieceFlowStep;
  choice: PieceChoice | null;
  /** As shown in the field: «ABCD-2345». */
  code: string;
  /** Names the owner changed, by Touchpoint id. */
  names: Record<string, string>;
  /** Pieces left for later (by Touchpoint id). */
  skipped: string[];
  groupMode: PieceGroupMode;
  groupId: string;
  newGroupName: string;
};

export function emptyPieceDraft(workspaceId: string): PieceFlowDraft {
  return {
    workspaceId,
    step: "piece",
    choice: null,
    code: "",
    names: {},
    skipped: [],
    groupMode: "none",
    groupId: "",
    newGroupName: "",
  };
}

/** A draft that arrives with its code (the activation card's QR): the
 * code already says which pieces, so the piece step is only shown done. */
export function draftWithCode(
  workspaceId: string,
  code: string,
): PieceFlowDraft {
  return {
    ...emptyPieceDraft(workspaceId),
    step: "code",
    code: formatCodeInput(code),
  };
}

const storageKey = "kardo.new-piece";
const steps: readonly PieceFlowStep[] = ["piece", "code", "name"];

export function loadPieceDraft(workspaceId: string): PieceFlowDraft | null {
  try {
    const raw = window.sessionStorage.getItem(storageKey);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<PieceFlowDraft> | null;
    if (!value || value.workspaceId !== workspaceId) return null;
    const base = emptyPieceDraft(workspaceId);
    return {
      ...base,
      step: steps.includes(value.step as PieceFlowStep)
        ? (value.step as PieceFlowStep)
        : base.step,
      choice:
        value.choice === "kit" ||
        (typeof value.choice === "string" && value.choice in pieceViews)
          ? (value.choice as PieceChoice)
          : null,
      code: typeof value.code === "string" ? formatCodeInput(value.code) : "",
      names:
        value.names && typeof value.names === "object"
          ? Object.fromEntries(
              Object.entries(value.names).filter(
                (entry): entry is [string, string] =>
                  typeof entry[1] === "string",
              ),
            )
          : {},
      skipped: Array.isArray(value.skipped)
        ? value.skipped.filter((id): id is string => typeof id === "string")
        : [],
      groupMode:
        value.groupMode === "existing" || value.groupMode === "new"
          ? value.groupMode
          : "none",
      groupId: typeof value.groupId === "string" ? value.groupId : "",
      newGroupName:
        typeof value.newGroupName === "string" ? value.newGroupName : "",
    };
  } catch {
    return null;
  }
}

export function savePieceDraft(draft: PieceFlowDraft): void {
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Without storage the flow still works; a reload starts over.
  }
}

export function clearPieceDraft(): void {
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Nothing stored.
  }
}

/**
 * The code as the owner types it: capitals, only letters that exist in a
 * code (I and L become 1, O becomes 0) and the dash where it is printed:
 * «ABCD-2345» for a piece, «ABCDE-23456» for a kit.
 */
export function formatCodeInput(value: string): string {
  const code = [...normalizePieceCode(value)]
    .filter((char) => PIECE_CODE_ALPHABET.includes(char))
    .join("")
    .slice(0, KIT_CODE_LENGTH);
  return code.length > 4 ? formatPieceCode(code) : code;
}

export function codeIsComplete(value: string): boolean {
  return isPieceCodeShape(value);
}

/** Where the code is, for the piece the owner picked. */
export function codeHint(choice: PieceChoice | null): string {
  if (choice === "kit" || choice === null)
    return "Viene en la tarjeta de activación de tu pedido. Si escaneas su QR con tu celular, el código se escribe solo.";
  return `Viene atrás de tu ${pieceViews[choice].name} y en la tarjeta de activación de tu pedido.`;
}

/** What a preview brings, in one line: «Kit Refri: 25 Magnets, 2 Stickers». */
export function previewHeadline(preview: KardoPieceClaimPreview): string {
  const pieces = piecesSummary(preview.pieces.map((piece) => piece.model));
  return preview.kit && preview.scope === "kit"
    ? `${preview.kit.kitName}: ${pieces}`
    : pieces;
}

/** The pieces to activate now, with the name each one will get. */
export function piecesToActivate(
  preview: KardoPieceClaimPreview,
  draft: Pick<PieceFlowDraft, "names" | "skipped">,
  existingNames: readonly string[],
): { touchpointId: string; model: PieceModel; name: string }[] {
  const suggested = suggestPieceNames(
    preview.pieces.map((piece) => piece.model),
    existingNames,
  );
  return preview.pieces
    .map((piece, index) => ({
      touchpointId: piece.touchpointId,
      model: piece.model,
      name: draft.names[piece.touchpointId] ?? suggested[index] ?? "",
    }))
    .filter((piece) => !draft.skipped.includes(piece.touchpointId));
}

/**
 * Why the activation cannot go yet, or null. Over the plan's limit it says
 * how many fit (activating more is refused whole, ADR 026 §6).
 */
export function claimProblem(
  preview: KardoPieceClaimPreview,
  draft: Pick<
    PieceFlowDraft,
    "names" | "skipped" | "groupMode" | "groupId" | "newGroupName"
  >,
  existingNames: readonly string[],
): string | null {
  const chosen = piecesToActivate(preview, draft, existingNames);
  if (preview.planRequired)
    return "Esta organización no tiene plan: elige uno para activar tus piezas.";
  if (!chosen.length) return "Elige al menos una pieza para activar.";
  if (chosen.some((piece) => !piece.name.trim()))
    return "Ponle nombre a cada pieza.";
  const { fits } = preview.limit;
  if (chosen.length > fits)
    return fits === 0
      ? "Tu plan ya no tiene lugar para más QR y etiquetas. Agrega más a tu plan o quita alguno que ya no uses."
      : `Tu plan tiene lugar para ${fits} ${fits === 1 ? "pieza más" : "piezas más"}. Deja para después las que no quepan, o agrega más QR y etiquetas a tu plan.`;
  if (draft.groupMode === "existing" && !draft.groupId)
    return "Elige el grupo.";
  if (draft.groupMode === "new" && !draft.newGroupName.trim())
    return "Ponle nombre al grupo.";
  return null;
}

/** What activating the kit does to the panel, said before confirming. */
export function panelSentence(preview: KardoPieceClaimPreview): string | null {
  const kit = preview.kit;
  if (!kit?.pending) return null;
  const plan = kit.planName ?? "el plan del kit";
  if (kit.outcome === "trial" || kit.outcome === "courtesy")
    return `Tu ${kit.kitName} incluye ${kit.days} días del panel con ${plan}: empiezan al activar y no te pedimos tarjeta.`;
  if (kit.outcome === "subscription")
    return `Ya tienes un plan, así que tu ${kit.kitName} no lo cambia.`;
  return null;
}

/** «Activar 27 piezas» / «Activar pieza». */
export function activateLabel(count: number): string {
  return count === 1 ? "Activar pieza" : `Activar ${count} piezas`;
}
