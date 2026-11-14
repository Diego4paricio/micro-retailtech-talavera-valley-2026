import type { PieceModel, StaffPiece } from "@kardo/contracts";

export const pieceModelLabels: Record<PieceModel, string> = {
  stand: "Stand",
  card: "Card",
  magnet: "Magnet",
  sticker: "Sticker",
};

/** «Card 2»: each piece numbered within its model, in the order given. */
export function pieceNumbers(pieces: readonly StaffPiece[]): number[] {
  const seen: Record<string, number> = {};
  return pieces.map((item) => {
    seen[item.model] = (seen[item.model] ?? 0) + 1;
    return seen[item.model] as number;
  });
}

export function pieceLabel(model: PieceModel, n: number): string {
  return `${pieceModelLabels[model]} ${n}`;
}

/** «Card 2, código ABCD-2345», or «activada» once the code is spent. */
export function pieceCaption(item: StaffPiece, n: number): string {
  // The code first: at 35 mm the caption band fits about 18 characters and
  // the workshop needs the code whole («ABCD-2345 Card 2»).
  return `${item.code ?? "Activada"} ${pieceLabel(item.model, n)}`;
}

/** Quote a cell (RFC 4180) and neutralize spreadsheet formulas. */
export function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}

export const workshopCsvColumns = [
  "pieza",
  "modelo",
  "url_nfc",
  "url_qr",
  "codigo_pieza",
  "codigo_kit",
  "url_activacion",
] as const;

export function workshopCsv(
  pieces: readonly StaffPiece[],
  kitCode: string | null,
  activationUrl: string | null,
): string {
  const numbers = pieceNumbers(pieces);
  const rows = pieces.map((item, index) =>
    [
      pieceLabel(item.model, numbers[index] ?? 1),
      item.model,
      item.urls.nfc,
      item.urls.qr,
      item.code ?? "",
      kitCode ?? "",
      activationUrl ?? "",
    ]
      .map(csvCell)
      .join(","),
  );
  return [workshopCsvColumns.join(","), ...rows].join("\r\n");
}

/** A file-name-safe version of a text: no accents, dashes between words. */
export function slugify(value: string): string {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || "lote";
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function downloadCsv(csv: string, filename: string): void {
  downloadBlob(
    new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" }),
    filename,
  );
}

const panelLabels = {
  trial: "Prueba alargada a 30 días",
  courtesy: "Plan del kit por 30 días",
  subscription: "Ya pagaba: sin cambio",
  manual: "Plan manual: sin cambio",
  internal: "Organización interna",
  none: "Sin cuenta de cobro",
} as const;

export function panelOutcomeLabel(
  outcome: keyof typeof panelLabels | null,
  hasKit: boolean,
): string {
  if (outcome) return panelLabels[outcome];
  return hasKit ? "Pendiente" : "No aplica";
}

export function pluralPieces(n: number): string {
  return `${n} ${n === 1 ? "pieza" : "piezas"}`;
}
