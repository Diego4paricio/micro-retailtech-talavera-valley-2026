import type { CanvasItem } from "@kardo/contracts";

/**
 * ⌘C / ⌘V of the Estudio: copied blocks stay in memory for the design they
 * came from (`scope`, the Experience id). They never leave the panel and
 * never paste into another page, whose limits and bound content differ.
 */

type Clip = { scope: string; items: CanvasItem[]; at: number };

let clip: Clip | null = null;

export function copyItems(scope: string, items: readonly CanvasItem[]): void {
  clip = { scope, items: structuredClone([...items]), at: Date.now() };
}

/** The copied items for this design, or null. */
export function copiedItems(scope: string): CanvasItem[] | null {
  return clip && clip.scope === scope && clip.items.length
    ? structuredClone(clip.items)
    : null;
}

/** For tests. */
export function clearClipboard(): void {
  clip = null;
}
