import { CANVAS_WIDTH } from "@kardo/contracts";
import { useSyncExternalStore } from "react";
import type {
  CanvasBox,
  CanvasPoint,
  MeasuredSection,
} from "../model/canvas.js";

/**
 * What the canvas editor reads from the live preview: where each canvas
 * frame sits in the iframe and the rendered box of every placed block, in
 * design px. The overlay publishes it after every render so the inspector
 * and the keyboard can use real heights (text grows with its content).
 */

/** One canvas frame of the preview. */
export type CanvasFrame = {
  sectionId: string;
  /** The frame in iframe CSS px (viewport of the preview document). */
  left: number;
  top: number;
  width: number;
  height: number;
  /** Iframe px per design px: `width / CANVAS_WIDTH`. */
  u: number;
  /** Rendered boxes of the placed blocks, in design px, by block id. */
  items: ReadonlyMap<string, CanvasBox>;
};

function isElement(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Node).nodeType === 1
  );
}

/** The canvas frame under a point of the preview (iframe client px). */
export function frameAt(
  frames: ReadonlyMap<string, CanvasFrame>,
  x: number,
  y: number,
): CanvasFrame | null {
  for (const frame of frames.values())
    if (
      x >= frame.left &&
      x <= frame.left + frame.width &&
      y >= frame.top &&
      y <= frame.top + frame.height
    )
      return frame;
  return null;
}

export function sectionSelector(sectionId: string): string {
  return `[data-section-id="${CSS.escape(sectionId)}"]`;
}

export function measureCanvasFrames(doc: Document): Map<string, CanvasFrame> {
  const frames = new Map<string, CanvasFrame>();
  for (const section of doc.querySelectorAll(".kd-canvas[data-section-id]")) {
    const sectionId = section.getAttribute("data-section-id");
    const frame = section.querySelector(".kd-canvas-frame");
    if (!sectionId || !isElement(frame)) continue;
    const rect = frame.getBoundingClientRect();
    if (!rect.width) continue;
    const u = rect.width / CANVAS_WIDTH;
    const items = new Map<string, CanvasBox>();
    for (const item of frame.querySelectorAll("[data-item-id]")) {
      const id = item.getAttribute("data-item-id");
      if (!id || !isElement(item)) continue;
      // Layout boxes (offset*) ignore transforms, so a rotated item keeps
      // its own box instead of the larger box around its rotated shape.
      if (item.offsetParent === frame) {
        items.set(id, {
          x: item.offsetLeft / u,
          y: item.offsetTop / u,
          w: item.offsetWidth / u,
          h: item.offsetHeight / u,
        });
        continue;
      }
      const box = item.getBoundingClientRect();
      items.set(id, {
        x: (box.left - rect.left) / u,
        y: (box.top - rect.top) / u,
        w: box.width / u,
        h: box.height / u,
      });
    }
    frames.set(sectionId, {
      sectionId,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      height: rect.height,
      u,
      items,
    });
  }
  return frames;
}

/** The placed box of `blockId` in the preview document, if drawn. */
export function itemElement(
  doc: Document,
  blockId: string,
): HTMLElement | null {
  const element = doc.querySelector(`[data-item-id="${CSS.escape(blockId)}"]`);
  return isElement(element) ? element : null;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

type Layout = {
  doc: Document | null;
  frames: ReadonlyMap<string, CanvasFrame>;
};

let layout: Layout = { doc: null, frames: new Map() };
const listeners = new Set<() => void>();

export function publishCanvasLayout(
  doc: Document | null,
  frames: ReadonlyMap<string, CanvasFrame>,
): void {
  layout = { doc, frames };
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The preview document the overlay last measured. */
export function previewDocument(): Document | null {
  return layout.doc;
}

/** The measured box of a canvas block, in design px (non-reactive). */
export function measuredItemBox(blockId: string): CanvasBox | null {
  for (const frame of layout.frames.values()) {
    const box = frame.items.get(blockId);
    if (box) return box;
  }
  return null;
}

/** The measured height of a canvas block, rounded, if the preview drew it. */
export function measuredItemHeight(blockId: string): number | undefined {
  const box = measuredItemBox(blockId);
  return box ? Math.round(box.h) : undefined;
}

/** The measured box of a canvas block, re-read after every render. */
export function useMeasuredItemBox(blockId: string): CanvasBox | null {
  const frames = useSyncExternalStore(
    subscribe,
    () => layout.frames,
    () => layout.frames,
  );
  for (const frame of frames.values()) {
    const box = frame.items.get(blockId);
    if (box) return box;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Pointer positions and "Convertir en lienzo"
// ---------------------------------------------------------------------------

/**
 * A pointer position of the Estudio (client px of the panel window) as a
 * design point on the canvas `sectionId` of the preview, for drops.
 */
export function canvasPointFromClient(
  doc: Document,
  sectionId: string,
  clientX: number,
  clientY: number,
): CanvasPoint | null {
  const iframe = doc.defaultView?.frameElement;
  const frame = doc.querySelector(
    `${sectionSelector(sectionId)} .kd-canvas-frame`,
  );
  if (!isElement(iframe) || !isElement(frame) || !iframe.offsetWidth)
    return null;
  const outer = iframe.getBoundingClientRect();
  const scale = outer.width / iframe.offsetWidth;
  const rect = frame.getBoundingClientRect();
  const u = rect.width / CANVAS_WIDTH;
  if (!scale || !u) return null;
  return {
    x: Math.round(((clientX - outer.left) / scale - rect.left) / u),
    y: Math.round(((clientY - outer.top) / scale - rect.top) / u),
  };
}

/** Reads a flow section of a phone-wide (390 px) preview document. */
function readSection(doc: Document, sectionId: string): MeasuredSection | null {
  const section = doc.querySelector(sectionSelector(sectionId));
  const container = doc.querySelector(".kd-container");
  if (!isElement(section) || !isElement(container)) return null;
  const page = container.getBoundingClientRect();
  const top = section.getBoundingClientRect().top;
  // On phones a canvas spans the whole content column, padding included.
  const u = page.width / CANVAS_WIDTH;
  const view = doc.defaultView;
  const blocks: Record<string, CanvasBox> = {};
  for (const element of section.querySelectorAll("[data-block-id]")) {
    const id = element.getAttribute("data-block-id");
    if (!id || blocks[id]) continue;
    const rect = element.getBoundingClientRect();
    const marginTop = Number.parseFloat(
      view?.getComputedStyle(element).marginTop ?? "0",
    );
    blocks[id] = {
      x: (rect.left - page.left) / u,
      y: (rect.top - (marginTop || 0) - top) / u,
      w: rect.width / u,
      h: rect.height / u,
    };
  }
  return {
    height: section.getBoundingClientRect().height / u,
    blocks,
  };
}

/**
 * Measures a flow section as a 390 px phone shows it: from the live
 * preview when it is the phone, else from a hidden copy of it at 390 px
 * (the desktop preview lays columns side by side).
 */
export async function measureSectionOnPhone(
  sectionId: string,
): Promise<MeasuredSection | null> {
  const doc = layout.doc;
  if (!doc?.documentElement) return null;
  if (Math.round(doc.documentElement.clientWidth) === CANVAS_WIDTH)
    return readSection(doc, sectionId);

  const iframe = document.createElement("iframe");
  iframe.setAttribute("sandbox", "allow-same-origin");
  iframe.setAttribute("aria-hidden", "true");
  iframe.tabIndex = -1;
  Object.assign(iframe.style, {
    position: "fixed",
    left: "-10000px",
    top: "0",
    width: `${CANVAS_WIDTH}px`,
    height: "900px",
    border: "0",
    visibility: "hidden",
    pointerEvents: "none",
  });
  iframe.srcdoc = `<!doctype html>${doc.documentElement.outerHTML}`;
  try {
    await new Promise<void>((resolve) => {
      const done = window.setTimeout(resolve, 3_000);
      iframe.addEventListener(
        "load",
        () => {
          window.clearTimeout(done);
          resolve();
        },
        { once: true },
      );
      document.body.append(iframe);
    });
    const copy = iframe.contentDocument;
    if (!copy) return null;
    await Promise.race([
      copy.fonts?.ready,
      new Promise((resolve) => window.setTimeout(resolve, 1_500)),
    ]);
    return readSection(copy, sectionId);
  } finally {
    iframe.remove();
  }
}
