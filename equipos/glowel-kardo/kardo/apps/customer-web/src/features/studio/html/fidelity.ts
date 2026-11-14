import type {
  DesignableExperienceType,
  DesignBlock,
  DesignBlockKind,
  PageDesign,
} from "@kardo/contracts";
import { blockKindLabel } from "../model/blocks.js";
import { brandName } from "../model/brands.js";
import { locateBlock } from "../model/operations.js";
import type { SyncPlan } from "./to-design.js";

/**
 * "No llevar a bloques lo que no se interpreta bien" (addendum: the owner's
 * complaint — deleting something in the HTML made the WhatsApp logo grow
 * huge, and that should block "Llevar a bloques" instead of carrying the
 * broken module into bloques). Pure logic only: the size-difference rule, the
 * friendly module names, and which "changed" units of a `SyncPlan` need
 * measuring. The actual measurement (rendering each one isolated in a hidden
 * iframe and in the live HTML preview, `getBoundingClientRect`) is DOM work
 * done by `use-fidelity-gate.ts`, which calls these.
 */

export type ElementSize = { width: number; height: number };

/** How forgiving the size check is: an image or an icon (a brand button's
 * logo) is flagged as soon as it grows past 1.5× — small glyphs are exactly
 * where a missing CSS rule balloons to a browser's default render size. */
export type FidelityKind = "image" | "icon" | "generic";

const BIG_ABSOLUTE_PX = 24;
const BIG_RELATIVE = 0.25;
const BIG_GROWTH_RATIO = 1.5;

function relativeDiff(base: number, value: number): number {
  if (base <= 0) return value > 0 ? 1 : 0;
  return Math.abs(value - base) / base;
}

/**
 * Whether a module's isolated render (as the `html` bloque it would become)
 * differs enough from how it looks right now in the HTML preview to call it
 * "no se ve igual": more than `BIG_ABSOLUTE_PX` or `BIG_RELATIVE` off in
 * width or height, or — for an image or an icon — the isolated render comes
 * out more than `BIG_GROWTH_RATIO` bigger in either dimension.
 */
export function sizesDiffer(
  live: ElementSize,
  isolated: ElementSize,
  kind: FidelityKind = "generic",
): boolean {
  const widthDiff = Math.abs(isolated.width - live.width);
  const heightDiff = Math.abs(isolated.height - live.height);
  if (widthDiff > BIG_ABSOLUTE_PX || heightDiff > BIG_ABSOLUTE_PX) return true;
  if (
    relativeDiff(live.width, isolated.width) > BIG_RELATIVE ||
    relativeDiff(live.height, isolated.height) > BIG_RELATIVE
  )
    return true;
  if (kind === "image" || kind === "icon") {
    const widthRatio = live.width > 0 ? isolated.width / live.width : 1;
    const heightRatio = live.height > 0 ? isolated.height / live.height : 1;
    if (widthRatio > BIG_GROWTH_RATIO || heightRatio > BIG_GROWTH_RATIO)
      return true;
  }
  return false;
}

/** The original block kind decides how forgiving the check is. */
export function fidelityKindOf(kind: DesignBlockKind): FidelityKind {
  if (kind === "image" || kind === "imageMain") return "image";
  if (kind === "brandButton") return "icon";
  return "generic";
}

function textSnippetOf(block: DesignBlock): string | null {
  if (block.kind === "heading") return block.text;
  if (block.kind === "text") return block.runs.map((run) => run.text).join("");
  return null;
}

const SNIPPET_LENGTH = 30;

/** A name a business owner understands ("Botón de WhatsApp", "Texto:
 * Bienvenido a Café Luna…"), for the list "Llevar a bloques" shows when a
 * module would not look the same as a bloque. */
export function fidelityModuleLabel(
  block: DesignBlock,
  type?: DesignableExperienceType,
): string {
  if (block.kind === "brandButton") return `Botón de ${brandName(block.brand)}`;
  const snippet = textSnippetOf(block);
  if (snippet !== null) {
    const trimmed = snippet.trim();
    const short = trimmed.slice(0, SNIPPET_LENGTH);
    return `Texto: ${short || "(vacío)"}${trimmed.length > short.length ? "…" : ""}`;
  }
  return blockKindLabel(block.kind, type);
}

/** One module the gate measures: its friendly name, its fidelity bucket and
 * the html/css it would become as a bloque (ready for an isolated render). */
export type FidelityModule = {
  blockId: string;
  label: string;
  kind: FidelityKind;
  html: string;
  css: string;
};

/**
 * The modules of `plan` worth measuring: only "changed" units (a block that
 * already existed, matched by its `data-block-id`, and now differs from what
 * bloques would have generated). "added" units are brand-new content with no
 * earlier bloque to compare against, and "removed" ones are gone — neither
 * needs an isolated-vs-live render check.
 */
export function fidelityModulesOf(
  oldDesign: PageDesign,
  plan: SyncPlan,
  type?: DesignableExperienceType,
): FidelityModule[] {
  const modules: FidelityModule[] = [];
  for (const entry of plan.changedBlocks) {
    if (entry.action !== "changed") continue;
    const before = locateBlock(oldDesign, entry.blockId);
    const after = locateBlock(plan.design, entry.blockId);
    if (!before || !after || after.block.kind !== "html") continue;
    modules.push({
      blockId: entry.blockId,
      label: fidelityModuleLabel(before.block, type),
      kind: fidelityKindOf(before.block.kind),
      html: after.block.html,
      css: after.block.css,
    });
  }
  return modules;
}

export type FidelityMeasurement = FidelityModule & {
  live: ElementSize;
  isolated: ElementSize;
};

export type FidelityIssue = { blockId: string; label: string };

/** The modules whose isolated render does not match their live size —
 * "Llevar a bloques" stays disabled while any of these exist. */
export function fidelityIssues(
  measurements: readonly FidelityMeasurement[],
): FidelityIssue[] {
  return measurements
    .filter((measurement) =>
      sizesDiffer(measurement.live, measurement.isolated, measurement.kind),
    )
    .map((measurement) => ({
      blockId: measurement.blockId,
      label: measurement.label,
    }));
}
