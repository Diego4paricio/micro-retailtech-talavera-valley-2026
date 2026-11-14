import type { PageDesign } from "@kardo/contracts";
import { isRecord } from "./design-assistant.js";

// ---------------------------------------------------------------------------
// Visual review (relevo 29, 2026-10-03; the owner chose to measure it on
// the test bench before deciding on production). Once a design validates,
// the AI sees its own page drawn on a phone and checks it against a short
// rubric. It answers `{ "ok": true }` or a few precise changes to the
// design it sent (JSON Pointer paths), never the whole design again: a
// fix costs hundreds of output tokens, not thousands.
//
// Production has no renderer for it yet (it would need a screenshot
// service, e.g. Cloudflare Browser Rendering next to the Resolver), so the
// review loop only runs this step when its caller passes one; today only
// the test bench does.
// ---------------------------------------------------------------------------

/** One screenshot of the draft, the first screen first. */
export type DesignScreenshot = {
  mediaType: "image/png";
  base64: string;
  /** The local file, for the test bench's answering agent. */
  sourcePath?: string | undefined;
};

export type DesignVisualReviewer = {
  render(design: PageDesign): Promise<DesignScreenshot[]>;
};

export const VISUAL_REVIEW_MESSAGE = [
  "Arriba está tu diseño dibujado por Kardo en un celular de 390 px de ancho: primero la primera pantalla, luego la página completa. Revísalo como director de arte con esta lista:",
  "1. ¿Algo encimado, cortado o fuera de la pantalla?",
  "2. ¿Se lee todo, también sobre fotos y colores?",
  "3. ¿Las fotos llenan su caja o su forma, sin franjas ni huecos?",
  "4. ¿Textos y botones alineados, con márgenes parejos?",
  "5. ¿Hay una sola acción principal clara en la primera pantalla?",
  "6. ¿Algo se ve de plantilla o hecho por IA (etiquetas en mayúsculas sobre cada título, todo en tarjetas iguales, frases de relleno, un nombre repetido)?",
  "7. ¿Se entiende en tres segundos qué es el negocio y qué se puede hacer?",
  'Si todo está bien, responde solo {"ok": true}. Si algo falla, responde solo {"fixes": [...], "notes": "qué corregiste, en una frase"}, con cambios puntuales al diseño que enviaste: { "op": "set", "path": "/sections/0/items/2/y", "value": 412 } o { "op": "remove", "path": "/sections/3" }. Las rutas van al estilo JSON Pointer sobre el objeto design (empiezan con /sections o /style). Máximo 12 cambios; no reescribas el diseño completo y no cambies lo que ya está bien.',
].join("\n");

export type DesignPatchOp =
  | { op: "set"; path: string; value: unknown }
  | { op: "remove"; path: string };

export type VisualReviewAnswer =
  | { ok: true }
  | { ok: false; fixes: DesignPatchOp[]; notes: string };

const MAX_FIXES = 12;

function jsonObjectIn(text: string): unknown {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return undefined;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return undefined;
  }
}

/** The model's answer, or undefined when it is neither "ok" nor fixes. */
export function parseVisualReview(
  text: string,
): VisualReviewAnswer | undefined {
  const value = jsonObjectIn(text);
  if (!isRecord(value)) return undefined;
  if (value.ok === true && !Array.isArray(value.fixes)) return { ok: true };
  if (!Array.isArray(value.fixes)) return undefined;
  const fixes: DesignPatchOp[] = [];
  for (const raw of value.fixes.slice(0, MAX_FIXES)) {
    if (!isRecord(raw) || typeof raw.path !== "string") continue;
    if (raw.op === "remove") fixes.push({ op: "remove", path: raw.path });
    else if ((raw.op === "set" || raw.op === "replace") && "value" in raw)
      fixes.push({ op: "set", path: raw.path, value: raw.value });
  }
  if (fixes.length === 0) return { ok: true };
  return {
    ok: false,
    fixes,
    notes: typeof value.notes === "string" ? value.notes.slice(0, 300) : "",
  };
}

function pointer(path: string): string[] | undefined {
  if (!/^\/(sections|style)(\/|$)/.test(path)) return undefined;
  const parts = path
    .slice(1)
    .split("/")
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  if (parts.some((part) => part === "__proto__" || part === "constructor"))
    return undefined;
  return parts;
}

/**
 * Applies the review's changes to a copy of the design. A change whose
 * path does not exist (or leaves the design's shape) is skipped; the
 * caller validates the result as a whole and keeps the design it had if
 * the result does not pass.
 */
export function applyDesignPatch(
  design: PageDesign,
  ops: readonly DesignPatchOp[],
): { design: unknown; applied: number } {
  const copy = structuredClone(design) as unknown as Record<string, unknown>;
  let applied = 0;
  for (const op of ops) {
    const parts = pointer(op.path);
    if (!parts || parts.length === 0) continue;
    let parent: unknown = copy;
    for (const part of parts.slice(0, -1)) {
      if (Array.isArray(parent)) parent = parent[Number(part)];
      else if (isRecord(parent)) parent = parent[part];
      else parent = undefined;
      if (parent === undefined) break;
    }
    const last = parts.at(-1) as string;
    if (Array.isArray(parent)) {
      const index = Number(last);
      if (!Number.isInteger(index) || index < 0 || index >= parent.length)
        continue;
      if (op.op === "remove") parent.splice(index, 1);
      else parent[index] = op.value;
      applied += 1;
    } else if (isRecord(parent)) {
      if (op.op === "remove") delete parent[last];
      else parent[last] = op.value;
      applied += 1;
    }
  }
  return { design: copy, applied };
}
