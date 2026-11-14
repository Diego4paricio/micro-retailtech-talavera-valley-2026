import { useDndContext, useDroppable } from "@dnd-kit/core";
import {
  CANVAS_WIDTH,
  type CanvasItem,
  DESIGN_LEGACY_PAGE_PADDING,
  DESIGN_LIMITS,
  type PageDesign,
} from "@kardo/contracts";
import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "../../../components/Icon.js";
import { type DragData, stageCanvasId } from "../dnd.js";
import {
  type CanvasBox,
  canvasContentBottom,
  canvasItemOf,
  moveCanvasItems,
  moveCanvasItemToSection,
  resizeCanvasItem,
  rotateCanvasItem,
  rotationFromPointer,
  setCanvasHeight,
  snapRotation,
} from "../model/canvas.js";
import {
  CANVAS_GRIP,
  canPlaceOnCanvas,
  clampItem,
  fillsItem,
  itemHeight,
  minCanvasHeight,
} from "../model/canvas-items.js";
import {
  type Guide,
  marginGuides,
  type SpacingGap,
  snapMove,
  snapResize,
  snapValue,
} from "../model/guides.js";
import {
  findCanvasSection,
  locateBlock,
  sectionIndexOf,
} from "../model/operations.js";
import { selectedBlockIds, useStudio } from "../StudioContext.js";
import { type Handle, resizeBox } from "./canvas-geometry.js";
import {
  type CanvasFrame,
  frameAt,
  itemElement,
  measureCanvasFrames,
  measuredItemHeight,
  publishCanvasLayout,
  sectionSelector,
} from "./canvas-measure.js";
import { insideEditing } from "./PreviewFrame.js";
import { boxesInRect, rectBetween, selectionOf } from "./selection.js";

export { useCanvasKeyboard } from "./canvas-keyboard.js";

/**
 * The free canvas editor over the preview ("lienzo libre"), Canva style:
 * drag a block (or several) to move them with smart guides, the page
 * margins and an X · Y badge; resize the selected one with its handles and
 * turn it with the round handle above it (Shift: steps of 15°); drag a
 * block onto another canvas to move it there; draw a box on an empty part
 * of a canvas to select what it touches (Shift adds); change a canvas's
 * height from the grip under it. Locked blocks stay where they are.
 *
 * While a gesture runs the page is not re-rendered: blocks move inside the
 * iframe with inline styles and the design changes once, on release, as
 * one undo step. Alt turns snapping off.
 *
 * Rendered by the Stage inside its overlay layer, which sits exactly on the
 * iframe's viewport: an iframe px maps to `scale` overlay px. Numbers in the
 * design are design px; one of them is `frame.u` iframe px.
 */

/** Snapping reach, in screen px. */
const SNAP_PX = 6;
/** A press becomes a drag after this many iframe px. */
const DRAG_START_PX = 3;
/** Near the top or bottom of the screen a drag scrolls the page. */
const EDGE_PX = 36;
/** Distance of the rotation handle above the box, in screen px (its own
 * hit area reaches 9px further still, see `.es-cv-rotate::after`; the
 * floating toolbar reserves room for both, see `Stage.tsx`). */
export const ROTATE_OFFSET = 26;
/** The handle's hit area beyond its own circle (`.es-cv-rotate::after`). */
export const ROTATE_HIT_MARGIN = 9;

const allHandles: readonly Handle[] = [
  "nw",
  "n",
  "ne",
  "e",
  "se",
  "s",
  "sw",
  "w",
];
const widthHandles: readonly Handle[] = ["e", "w"];

type MoveGesture = {
  kind: "move";
  /** The pressed block; with several selected, the whole group moves. */
  lead: string;
  ids: string[];
  frame: CanvasFrame;
  canvasHeight: number;
  elements: HTMLElement[];
  captureTarget: Element;
  pointerId: number;
  startX: number;
  startY: number;
  startScroll: number;
  lastX: number;
  lastY: number;
  /** Boxes of the moving blocks when the gesture started. */
  origins: Map<string, CanvasBox>;
  bounds: CanvasBox;
  others: CanvasBox[];
  started: boolean;
  dx: number;
  dy: number;
  /** Where a single block lands on another canvas, if it left its own. */
  target: { frame: CanvasFrame; x: number; y: number } | null;
};

type ResizeGesture = {
  kind: "resize";
  handle: Handle;
  blockId: string;
  item: CanvasItem;
  frame: CanvasFrame;
  canvasHeight: number;
  element: HTMLElement;
  pointerId: number;
  startX: number;
  startY: number;
  origin: CanvasBox;
  others: CanvasBox[];
  fills: boolean;
  box: CanvasBox;
};

type RotateGesture = {
  kind: "rotate";
  blockId: string;
  frame: CanvasFrame;
  element: HTMLElement;
  pointerId: number;
  /** Center of the block in the Estudio's client px. */
  center: { x: number; y: number };
  origin: number;
  angle: number;
};

type HeightGesture = {
  kind: "height";
  sectionId: string;
  frame: CanvasFrame;
  element: HTMLElement;
  pointerId: number;
  startY: number;
  origin: number;
  min: number;
  contentBottom: number;
  height: number;
};

type MarqueeGesture = {
  kind: "marquee";
  frame: CanvasFrame;
  captureTarget: Element;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  started: boolean;
  additive: boolean;
};

type Gesture =
  | MoveGesture
  | ResizeGesture
  | RotateGesture
  | HeightGesture
  | MarqueeGesture;

/** What the overlay draws while a gesture runs. */
type GestureView = {
  kind: Gesture["kind"];
  sectionId: string;
  blockId?: string;
  /** Moving: the offset of the group (design px) on its own canvas. */
  offset?: { dx: number; dy: number };
  box?: CanvasBox;
  height?: number;
  angle?: number;
  /** Marquee rectangle, in iframe px. */
  rect?: { left: number; top: number; width: number; height: number };
  guides: Guide[];
  gaps: SpacingGap[];
  badge: string;
};

function isElement(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    typeof (value as Element).closest === "function"
  );
}

function canvasBox(height: number): CanvasBox {
  return { x: 0, y: 0, w: CANVAS_WIDTH, h: height };
}

function boundsOfBoxes(boxes: readonly CanvasBox[]): CanvasBox {
  const left = Math.min(...boxes.map((box) => box.x));
  const top = Math.min(...boxes.map((box) => box.y));
  const right = Math.max(...boxes.map((box) => box.x + box.w));
  const bottom = Math.max(...boxes.map((box) => box.y + box.h));
  return { x: left, y: top, w: right - left, h: bottom - top };
}

/** A design box of `frame` in overlay px. */
function screenBox(frame: CanvasFrame, box: CanvasBox, scale: number) {
  return {
    left: (frame.left + box.x * frame.u) * scale,
    top: (frame.top + box.y * frame.u) * scale,
    width: box.w * frame.u * scale,
    height: box.h * frame.u * scale,
  };
}

const inlineProperties = [
  "transform",
  "translate",
  "rotate",
  "left",
  "top",
  "width",
  "height",
  "aspect-ratio",
  "opacity",
  "z-index",
];

function clearInline(element: HTMLElement) {
  for (const property of inlineProperties)
    element.style.removeProperty(property);
}

/** How far a group may move so every block keeps a grip on its canvas
 * (the same rule `clampItem` applies to each one). */
function clampGroup(
  origins: ReadonlyMap<string, CanvasBox>,
  canvasHeight: number,
  dx: number,
  dy: number,
): { dx: number; dy: number } {
  let minDx = Number.NEGATIVE_INFINITY;
  let maxDx = Number.POSITIVE_INFINITY;
  let minDy = Number.NEGATIVE_INFINITY;
  let maxDy = Number.POSITIVE_INFINITY;
  const bottomLimit = Math.max(
    0,
    Math.min(DESIGN_LIMITS.canvasHeight, canvasHeight - CANVAS_GRIP),
  );
  for (const box of origins.values()) {
    minDx = Math.max(
      minDx,
      Math.max(-CANVAS_WIDTH, CANVAS_GRIP - box.w) - box.x,
    );
    maxDx = Math.min(maxDx, CANVAS_WIDTH - CANVAS_GRIP - box.x);
    minDy = Math.max(minDy, Math.max(-400, CANVAS_GRIP - box.h) - box.y);
    maxDy = Math.min(maxDy, bottomLimit - box.y);
  }
  return {
    dx: Math.round(Math.min(maxDx, Math.max(minDx, dx))),
    dy: Math.round(Math.min(maxDy, Math.max(minDy, dy))),
  };
}

export function CanvasOverlay({
  doc,
  scale,
  version,
  readOnly,
}: {
  doc: Document | null;
  scale: number;
  /** Changes whenever the preview re-renders, scrolls or resizes. */
  version: number;
  readOnly: boolean;
}) {
  const { design, change, selection, select } = useStudio();
  const rootRef = useRef<HTMLDivElement>(null);
  const [frames, setFrames] = useState<ReadonlyMap<string, CanvasFrame>>(
    () => new Map(),
  );
  const [view, setView] = useState<GestureView | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const framesRef = useRef(frames);
  const margin = design.style.pagePadding ?? DESIGN_LEGACY_PAGE_PADDING;
  const latest = useRef({
    design,
    change,
    selection,
    select,
    readOnly,
    scale,
    margin,
  });
  latest.current = {
    design,
    change,
    selection,
    select,
    readOnly,
    scale,
    margin,
  };

  // The canvas blocks of the selection (all on one canvas).
  const selectedIds = selectedBlockIds(selection).filter(
    (id) => canvasItemOf(design, id) !== null,
  );
  const selectedAt =
    selectedIds.length === 1 && selectedIds[0]
      ? canvasItemOf(design, selectedIds[0])
      : null;
  const selectedSectionId = selectedIds[0]
    ? (canvasItemOf(design, selectedIds[0])?.section.id ?? null)
    : null;

  // --- Measure the canvases after every render of the preview -------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: the preview relayouts with `version` and the design
  useLayoutEffect(() => {
    const next = doc
      ? measureCanvasFrames(doc)
      : new Map<string, CanvasFrame>();
    framesRef.current = next;
    setFrames(next);
    publishCanvasLayout(doc, next);
  }, [doc, version, design]);
  useEffect(() => () => publishCanvasLayout(null, new Map()), []);

  // --- Inline styles stay until the committed change is drawn -------------
  const held = useRef<{ elements: HTMLElement[]; timer: number } | null>(null);
  const release = () => {
    if (!held.current) return;
    window.clearTimeout(held.current.timer);
    for (const element of held.current.elements) clearInline(element);
    held.current = null;
  };
  const hold = (elements: HTMLElement[]) => {
    release();
    // A new render replaces the elements; this only covers a render that
    // never comes (a change the history found equal).
    held.current = {
      elements,
      timer: window.setTimeout(release, 2_000),
    };
  };
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new render replaced the elements
  useEffect(() => {
    if (held.current?.elements.every((element) => !element.isConnected)) {
      window.clearTimeout(held.current.timer);
      held.current = null;
    }
  }, [version]);

  // --- What the overlay draws, at most once per frame ---------------------
  const pendingView = useRef<GestureView | null>(null);
  const viewRequest = useRef(0);
  const show = (next: GestureView | null) => {
    pendingView.current = next;
    if (!next) {
      cancelAnimationFrame(viewRequest.current);
      viewRequest.current = 0;
      setView(null);
      return;
    }
    if (viewRequest.current) return;
    viewRequest.current = requestAnimationFrame(() => {
      viewRequest.current = 0;
      setView(pendingView.current);
    });
  };
  const flag = (on: boolean) => {
    const layer = rootRef.current?.parentElement;
    if (on) layer?.setAttribute("data-canvas-gesture", "");
    else layer?.removeAttribute("data-canvas-gesture");
  };

  const cancel = () => {
    const current = gesture.current;
    gesture.current = null;
    if (!current) return;
    if (current.kind === "move")
      for (const element of current.elements) clearInline(element);
    else if (current.kind !== "marquee") clearInline(current.element);
    flag(false);
    show(null);
  };

  // --- Editor styles inside the preview: move cursor, touch drags ---------
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new render may replace the preview's head
  useEffect(() => {
    const head = doc?.head;
    if (!doc || !head) return;
    let style = head.querySelector("style[data-studio-canvas]");
    if (!style) {
      style = doc.createElement("style");
      style.setAttribute("data-studio-canvas", "");
      head.append(style);
    }
    // Touch drags only start on selected blocks: elsewhere a finger still
    // scrolls the page. Locked blocks keep the arrow.
    const lockedIds = design.sections.flatMap((section) =>
      section.kind === "canvas"
        ? section.items
            .filter((item) => item.locked)
            .map((item) => item.block.id)
        : [],
    );
    style.textContent = readOnly
      ? ""
      : `.kd-ci,.kd-ci [data-block-id]{cursor:move}${lockedIds
          .map(
            (id) =>
              `[data-item-id="${CSS.escape(id)}"],[data-item-id="${CSS.escape(id)}"] [data-block-id]{cursor:default}`,
          )
          .join("")}${selectedIds
          .map((id) => `[data-item-id="${CSS.escape(id)}"]{touch-action:none}`)
          .join("")}`;
  }, [doc, version, selectedIds.join(","), readOnly, design]);

  // --- The Stage's own outline gives way to the handles --------------------
  const onCanvas = selectedIds.length > 0;
  useEffect(() => {
    const layer = rootRef.current?.parentElement;
    if (onCanvas) layer?.setAttribute("data-canvas-selected", "");
    else layer?.removeAttribute("data-canvas-selected");
  }, [onCanvas]);

  // --- Gestures that start inside the page (move, marquee) ----------------
  // biome-ignore lint/correctness/useExhaustiveDependencies: handlers read `latest`; bound once per document
  useEffect(() => {
    if (!doc) return;
    const view = doc.defaultView;
    let scrollRequest = 0;

    const onPointerDown = (event: PointerEvent) => {
      const { design, selection, readOnly } = latest.current;
      if (readOnly || gesture.current || event.button !== 0 || !event.isPrimary)
        return;
      const target = event.target;
      if (!isElement(target) || insideEditing(target)) return;
      const element = target.closest("[data-item-id]");
      if (!isElement(element)) {
        startMarquee(event, target);
        return;
      }
      // Shift+click adds to the selection (the click does it); no drag.
      if (event.shiftKey) return;
      const blockId = element.getAttribute("data-item-id") ?? "";
      const at = canvasItemOf(design, blockId);
      const frame = at ? framesRef.current.get(at.section.id) : undefined;
      if (!at || !frame || at.item.locked) return;
      const selected = selectedBlockIds(selection);
      const inSelection = selected.includes(blockId);
      // Fingers and pens first select (a tap), then drag the selection.
      if (event.pointerType !== "mouse" && !inSelection) return;
      const ids = (inSelection ? selected : [blockId]).filter((id) => {
        const other = canvasItemOf(design, id);
        return (
          other !== null &&
          other.section.id === at.section.id &&
          !other.item.locked &&
          frame.items.has(id)
        );
      });
      if (!ids.includes(blockId)) ids.push(blockId);
      const origins = new Map<string, CanvasBox>();
      const elements: HTMLElement[] = [];
      for (const id of ids) {
        const other = canvasItemOf(design, id);
        const measured = frame.items.get(id);
        if (!other) continue;
        origins.set(id, {
          x: other.item.x,
          y: other.item.y,
          w: other.item.w,
          h: itemHeight(other.item, measured?.h),
        });
        const node = itemElement(doc, id);
        if (node) elements.push(node);
      }
      gesture.current = {
        kind: "move",
        lead: blockId,
        ids: [...origins.keys()],
        frame,
        canvasHeight: at.section.height,
        elements,
        captureTarget: target,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startScroll: view?.scrollY ?? 0,
        lastX: event.clientX,
        lastY: event.clientY,
        origins,
        bounds: boundsOfBoxes([...origins.values()]),
        others: [...frame.items]
          .filter(([id]) => !origins.has(id))
          .map(([, box]) => box),
        started: false,
        dx: 0,
        dy: 0,
        target: null,
      };
    };

    const startMarquee = (event: PointerEvent, target: HTMLElement) => {
      if (event.pointerType === "touch") return;
      const frameElement = target.closest(".kd-canvas-frame");
      const sectionId = frameElement
        ?.closest("[data-section-id]")
        ?.getAttribute("data-section-id");
      const frame = sectionId ? framesRef.current.get(sectionId) : undefined;
      if (!frame) return;
      gesture.current = {
        kind: "marquee",
        frame,
        captureTarget: target,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
        started: false,
        additive: event.shiftKey,
      };
    };

    const moveTo = (clientX: number, clientY: number, altKey: boolean) => {
      const current = gesture.current;
      if (current?.kind !== "move") return;
      const scrolled = (view?.scrollY ?? 0) - current.startScroll;
      const { frame, origins, bounds } = current;
      const rawDx = (clientX - current.startX) / frame.u;
      const rawDy = (clientY - current.startY + scrolled) / frame.u;
      const threshold = SNAP_PX / (latest.current.scale * frame.u);
      const options = { margin: latest.current.margin };

      // One block dragged onto another canvas moves there.
      const over =
        current.ids.length === 1
          ? frameAt(framesRef.current, clientX, clientY)
          : null;
      if (over && over.sectionId !== frame.sectionId) {
        const origin = origins.get(current.lead);
        const box = origin ?? bounds;
        // Where the block sits under the pointer, as it was grabbed.
        const grabX = (current.startX - frame.left) / frame.u - box.x;
        const grabY = (current.startY - frame.top - scrolled) / frame.u - box.y;
        const proposed = {
          ...box,
          x: (clientX - over.left) / over.u - grabX,
          y: (clientY - over.top) / over.u - grabY,
        };
        const others = [...over.items.values()];
        const snapped = altKey
          ? {
              x: Math.round(proposed.x),
              y: Math.round(proposed.y),
              guides: [],
              gaps: [],
            }
          : snapMove(
              proposed,
              others,
              canvasBox(over.height / over.u),
              SNAP_PX / (latest.current.scale * over.u),
              options,
            );
        current.target = { frame: over, x: snapped.x, y: snapped.y };
        for (const element of current.elements) element.style.opacity = "0.25";
        show({
          kind: "move",
          sectionId: over.sectionId,
          blockId: current.lead,
          box: { ...box, x: snapped.x, y: snapped.y },
          guides: snapped.guides,
          gaps: snapped.gaps,
          badge: `Mover a la sección ${sectionIndexOf(latest.current.design, over.sectionId) + 1}`,
        });
        return;
      }
      if (current.target) {
        current.target = null;
        for (const element of current.elements)
          element.style.removeProperty("opacity");
      }

      const proposed = { ...bounds, x: bounds.x + rawDx, y: bounds.y + rawDy };
      const snapped = altKey
        ? {
            x: Math.round(proposed.x),
            y: Math.round(proposed.y),
            guides: [],
            gaps: [],
          }
        : snapMove(
            proposed,
            current.others,
            canvasBox(current.canvasHeight),
            threshold,
            options,
          );
      const clamped = clampGroup(
        origins,
        current.canvasHeight,
        snapped.x - bounds.x,
        snapped.y - bounds.y,
      );
      current.dx = clamped.dx;
      current.dy = clamped.dy;
      for (const element of current.elements)
        element.style.translate = `${clamped.dx * frame.u}px ${clamped.dy * frame.u}px`;
      const moved = {
        ...bounds,
        x: bounds.x + clamped.dx,
        y: bounds.y + clamped.dy,
      };
      show({
        kind: "move",
        sectionId: frame.sectionId,
        blockId: current.lead,
        offset: clamped,
        box: moved,
        guides: snapped.guides,
        gaps: snapped.gaps,
        badge: `X ${moved.x} · Y ${moved.y}`,
      });
    };

    // Near the top or bottom edge of the screen the page scrolls, so a
    // block can travel to a canvas further down without letting go.
    const autoScroll = () => {
      scrollRequest = 0;
      const current = gesture.current;
      if (current?.kind !== "move" || !current.started || !view) return;
      const height = view.innerHeight;
      const speed =
        current.lastY < EDGE_PX
          ? -Math.ceil((EDGE_PX - current.lastY) / 3)
          : current.lastY > height - EDGE_PX
            ? Math.ceil((current.lastY - (height - EDGE_PX)) / 3)
            : 0;
      if (!speed) return;
      const before = view.scrollY;
      view.scrollBy(0, speed);
      if (view.scrollY !== before) {
        framesRef.current = measureCanvasFrames(doc);
        moveTo(current.lastX, current.lastY, false);
      }
      scrollRequest = view.requestAnimationFrame(autoScroll);
    };

    const onPointerMove = (event: PointerEvent) => {
      const current = gesture.current;
      if (
        current?.kind === "marquee" &&
        event.pointerId === current.pointerId
      ) {
        const moved = Math.hypot(
          event.clientX - current.startX,
          event.clientY - current.startY,
        );
        if (!current.started && moved < DRAG_START_PX * 2) return;
        if (!current.started) {
          current.started = true;
          try {
            current.captureTarget.setPointerCapture(current.pointerId);
          } catch {
            // The pointer is gone already; pointerup will clean up.
          }
          flag(true);
        }
        event.preventDefault();
        current.x = event.clientX;
        current.y = event.clientY;
        const rect = rectBetween(
          { x: current.startX, y: current.startY },
          { x: current.x, y: current.y },
        );
        show({
          kind: "marquee",
          sectionId: current.frame.sectionId,
          rect: { left: rect.x, top: rect.y, width: rect.w, height: rect.h },
          guides: [],
          gaps: [],
          badge: "",
        });
        return;
      }
      if (current?.kind !== "move" || event.pointerId !== current.pointerId)
        return;
      const moved = Math.hypot(
        event.clientX - current.startX,
        event.clientY - current.startY,
      );
      if (!current.started) {
        if (moved < DRAG_START_PX) return;
        current.started = true;
        release();
        // Moves keep coming while the pointer leaves the preview.
        try {
          current.captureTarget.setPointerCapture(current.pointerId);
        } catch {
          // The pointer is gone already; pointerup will clean up.
        }
        flag(true);
        // The pressed block joins (or becomes) the selection.
        const selected = selectedBlockIds(latest.current.selection);
        if (!selected.includes(current.lead))
          latest.current.select({ kind: "block", id: current.lead });
      }
      event.preventDefault();
      current.lastX = event.clientX;
      current.lastY = event.clientY;
      moveTo(event.clientX, event.clientY, event.altKey);
      if (!scrollRequest && view)
        scrollRequest = view.requestAnimationFrame(autoScroll);
    };

    // After a drag the dragged block is selected here; the click that may
    // follow would select whatever sits under the pointer, so it is dropped.
    const dropNextClick = () => {
      if (!view) return;
      const stop = (event: Event) => {
        event.preventDefault();
        event.stopPropagation();
        done();
      };
      // The click comes right after pointerup, if it comes at all.
      const timer = window.setTimeout(() => done(), 100);
      const done = () => {
        window.clearTimeout(timer);
        view.removeEventListener("click", stop, true);
      };
      view.addEventListener("click", stop, true);
    };

    const onPointerUp = (event: PointerEvent) => {
      const current = gesture.current;
      if (!current || !("pointerId" in current)) return;
      if (event.pointerId !== current.pointerId) return;
      if (current.kind === "marquee") {
        gesture.current = null;
        if (!current.started) return;
        flag(false);
        show(null);
        dropNextClick();
        const { frame } = current;
        const rect = rectBetween(
          {
            x: (current.startX - frame.left) / frame.u,
            y: (current.startY - frame.top) / frame.u,
          },
          {
            x: (current.x - frame.left) / frame.u,
            y: (current.y - frame.top) / frame.u,
          },
        );
        const { design, selection } = latest.current;
        const unlocked = new Map(
          [...frame.items].filter(
            ([id]) => !canvasItemOf(design, id)?.item.locked,
          ),
        );
        const hit = boxesInRect(unlocked, rect);
        const kept = current.additive
          ? selectedBlockIds(selection).filter(
              (id) => canvasItemOf(design, id)?.section.id === frame.sectionId,
            )
          : [];
        latest.current.select(selectionOf([...kept, ...hit]));
        return;
      }
      if (current.kind !== "move") return;
      gesture.current = null;
      if (scrollRequest && view) view.cancelAnimationFrame(scrollRequest);
      scrollRequest = 0;
      if (!current.started) return;
      flag(false);
      show(null);
      dropNextClick();
      const { ids, lead, target, dx, dy } = current;
      const measured = (id: string) => measuredItemHeight(id);
      if (target) {
        latest.current.change((next) =>
          moveCanvasItemToSection(
            next,
            lead,
            target.frame.sectionId,
            target.x,
            target.y,
            measured,
          ),
        );
        latest.current.select({ kind: "block", id: lead });
        hold(current.elements);
        return;
      }
      if (!dx && !dy) {
        for (const element of current.elements) clearInline(element);
        return;
      }
      latest.current.change((next) =>
        moveCanvasItems(next, ids, dx, dy, measured),
      );
      hold(current.elements);
    };

    const onPointerCancel = (event: PointerEvent) => {
      const current = gesture.current;
      if (
        current &&
        (current.kind === "move" || current.kind === "marquee") &&
        event.pointerId === current.pointerId
      )
        cancel();
    };

    doc.addEventListener("pointerdown", onPointerDown);
    doc.addEventListener("pointermove", onPointerMove);
    doc.addEventListener("pointerup", onPointerUp);
    doc.addEventListener("pointercancel", onPointerCancel);
    return () => {
      doc.removeEventListener("pointerdown", onPointerDown);
      doc.removeEventListener("pointermove", onPointerMove);
      doc.removeEventListener("pointerup", onPointerUp);
      doc.removeEventListener("pointercancel", onPointerCancel);
      if (scrollRequest && view) view.cancelAnimationFrame(scrollRequest);
      gesture.current = null;
    };
  }, [doc]);

  // Escape cancels a gesture (keys pressed in the preview reach the panel).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `cancel` reads refs only
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const current = gesture.current;
      if (event.key !== "Escape" || !current) return;
      if (
        (current.kind === "move" || current.kind === "marquee") &&
        !current.started
      )
        return;
      event.stopPropagation();
      cancel();
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, []);

  // --- Resizing the selected block (handles in the overlay) ---------------
  const startResize =
    (handle: Handle) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || readOnly || gesture.current || !doc) return;
      const at = selectedAt;
      const frame = at ? framesRef.current.get(at.section.id) : undefined;
      const element = at ? itemElement(doc, at.block.id) : null;
      if (!at || !frame || !element || at.item.locked) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      release();
      const origin = {
        x: at.item.x,
        y: at.item.y,
        w: at.item.w,
        h: itemHeight(at.item, frame.items.get(at.block.id)?.h),
      };
      gesture.current = {
        kind: "resize",
        handle,
        blockId: at.block.id,
        item: at.item,
        frame,
        canvasHeight: at.section.height,
        element,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        origin,
        others: [...frame.items]
          .filter(([id]) => id !== at.block.id)
          .map(([, box]) => box),
        fills: fillsItem(at.block.kind),
        box: origin,
      };
      flag(true);
    };

  const moveResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.kind !== "resize" || event.pointerId !== current.pointerId)
      return;
    const { frame, origin, handle, fills, item } = current;
    // Overlay pointer events come in screen px.
    const perDesignPx = scale * frame.u;
    const dx = (event.clientX - current.startX) / perDesignPx;
    const dy = (event.clientY - current.startY) / perDesignPx;
    const rotation = item.r ?? 0;
    const keepAspect = event.shiftKey && fills && handle.length === 2;
    let box = resizeBox(origin, rotation, handle, dx, dy, fills, keepAspect);
    let guides: Guide[] = [];
    // Guides only make sense for boxes square with the canvas.
    if (!event.altKey && !keepAspect && rotation === 0) {
      const snapped = snapResize(
        box,
        {
          left: handle.includes("w"),
          right: handle.includes("e"),
          top: fills && handle.includes("n"),
          bottom: fills && handle.includes("s"),
        },
        current.others,
        canvasBox(current.canvasHeight),
        SNAP_PX / perDesignPx,
        8,
        { margin },
      );
      box = snapped.box;
      guides = snapped.guides;
    }
    const placed = clampItem(
      {
        ...item,
        x: box.x,
        y: box.y,
        w: box.w,
        ...(fills ? { h: box.h } : {}),
      },
      current.canvasHeight,
      origin.h,
    );
    const { element } = current;
    element.style.left = `${placed.x * frame.u}px`;
    element.style.top = `${placed.y * frame.u}px`;
    element.style.width = `${placed.w * frame.u}px`;
    if (fills && placed.h) element.style.height = `${placed.h * frame.u}px`;
    // Text reflows with its new width: read the height it takes now.
    const height = fills
      ? (placed.h ?? origin.h)
      : element.offsetHeight / frame.u;
    current.box = { x: placed.x, y: placed.y, w: placed.w, h: height };
    show({
      kind: "resize",
      sectionId: frame.sectionId,
      blockId: current.blockId,
      box: current.box,
      guides,
      gaps: [],
      badge: fills
        ? `${placed.w} × ${Math.round(height)}`
        : `Ancho ${placed.w}`,
    });
  };

  const endResize = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.kind !== "resize" || event.pointerId !== current.pointerId)
      return;
    gesture.current = null;
    flag(false);
    show(null);
    const { box, origin, blockId, fills } = current;
    if (
      box.x === origin.x &&
      box.y === origin.y &&
      box.w === origin.w &&
      (!fills || box.h === origin.h)
    ) {
      clearInline(current.element);
      return;
    }
    change((next) =>
      resizeCanvasItem(
        next,
        blockId,
        { x: box.x, y: box.y, w: box.w, h: fills ? box.h : undefined },
        Math.round(box.h),
      ),
    );
    hold([current.element]);
  };

  // --- Turning the selected block (the round handle above it) ------------
  const startRotate = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || readOnly || gesture.current || !doc) return;
    const at = selectedAt;
    const frame = at ? framesRef.current.get(at.section.id) : undefined;
    const element = at ? itemElement(doc, at.block.id) : null;
    const box = at && frame ? frame.items.get(at.block.id) : undefined;
    const root = rootRef.current?.getBoundingClientRect();
    if (!at || !frame || !element || !box || !root || at.item.locked) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    release();
    const screen = screenBox(frame, box, scale);
    gesture.current = {
      kind: "rotate",
      blockId: at.block.id,
      frame,
      element,
      pointerId: event.pointerId,
      center: {
        x: root.left + screen.left + screen.width / 2,
        y: root.top + screen.top + screen.height / 2,
      },
      origin: at.item.r ?? 0,
      angle: at.item.r ?? 0,
    };
    flag(true);
  };

  const moveRotate = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.kind !== "rotate" || event.pointerId !== current.pointerId)
      return;
    const raw = rotationFromPointer(current.center, {
      x: event.clientX,
      y: event.clientY,
    });
    let angle = event.shiftKey ? snapRotation(raw, 15) : Math.round(raw);
    // A light pull toward straight and diagonal angles.
    if (!event.shiftKey && !event.altKey) {
      const near = snapRotation(raw, 45);
      if (Math.abs(near - raw) <= 3) angle = near;
    }
    current.angle = angle;
    const { element } = current;
    element.style.rotate = "none";
    element.style.transform = angle ? `rotate(${angle}deg)` : "none";
    show({
      kind: "rotate",
      sectionId: current.frame.sectionId,
      blockId: current.blockId,
      angle,
      guides: [],
      gaps: [],
      badge: `${angle}°`,
    });
  };

  const endRotate = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.kind !== "rotate" || event.pointerId !== current.pointerId)
      return;
    gesture.current = null;
    flag(false);
    show(null);
    if (current.angle === current.origin) {
      clearInline(current.element);
      return;
    }
    const { blockId, angle } = current;
    change((next) => rotateCanvasItem(next, blockId, angle));
    hold([current.element]);
  };

  // --- A canvas's height (the handle under its frame) ---------------------
  const startHeight =
    (sectionId: string) => (event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || readOnly || gesture.current || !doc) return;
      const section = findCanvasSection(design, sectionId);
      const frame = framesRef.current.get(sectionId);
      const element = doc.querySelector(
        `${sectionSelector(sectionId)} .kd-canvas-frame`,
      );
      if (!section || !frame || !isElement(element)) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      release();
      gesture.current = {
        kind: "height",
        sectionId,
        frame,
        element,
        pointerId: event.pointerId,
        startY: event.clientY,
        origin: section.height,
        min: minCanvasHeight(section),
        contentBottom: Math.round(
          canvasContentBottom(section, (id) => frame.items.get(id)?.h),
        ),
        height: section.height,
      };
      flag(true);
    };

  const moveHeight = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.kind !== "height" || event.pointerId !== current.pointerId)
      return;
    const perDesignPx = scale * current.frame.u;
    const raw = current.origin + (event.clientY - current.startY) / perDesignPx;
    const snapped = event.altKey
      ? Math.round(raw)
      : snapValue(raw, [current.contentBottom], SNAP_PX / perDesignPx);
    const height = Math.min(
      DESIGN_LIMITS.canvasHeight,
      Math.max(current.min, snapped),
    );
    current.height = height;
    current.element.style.aspectRatio = `${CANVAS_WIDTH} / ${height}`;
    show({
      kind: "height",
      sectionId: current.sectionId,
      height,
      guides:
        height === current.contentBottom
          ? [{ axis: "y", at: height, from: 0, to: CANVAS_WIDTH }]
          : [],
      gaps: [],
      badge: `Alto ${height}`,
    });
  };

  const endHeight = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (current?.kind !== "height" || event.pointerId !== current.pointerId)
      return;
    gesture.current = null;
    flag(false);
    show(null);
    if (current.height === current.origin) {
      clearInline(current.element);
      return;
    }
    const { sectionId, height } = current;
    change((next) => setCanvasHeight(next, sectionId, height));
    hold([current.element]);
  };

  const cancelPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const current = gesture.current;
    if (
      current &&
      "pointerId" in current &&
      event.pointerId === current.pointerId
    )
      cancel();
  };

  // --- Drawing ------------------------------------------------------------
  const selectedFrame = selectedSectionId
    ? (frames.get(selectedSectionId) ?? null)
    : null;
  const activeSectionId =
    view?.sectionId ??
    selectedSectionId ??
    (selection?.kind === "section" && findCanvasSection(design, selection.id)
      ? selection.id
      : null);
  const activeFrame = activeSectionId ? frames.get(activeSectionId) : null;
  const viewFrame = view ? frames.get(view.sectionId) : null;
  const moving = view?.kind === "move" || view?.kind === "rotate";

  // Handles follow a resize; moving blocks only show their outlines.
  const single = selectedAt;
  const singleBox =
    single && selectedFrame
      ? view?.kind === "resize" && view.blockId === single.block.id && view.box
        ? view.box
        : (selectedFrame.items.get(single.block.id) ?? null)
      : null;
  const singleRotation =
    view?.kind === "rotate" && single && view.blockId === single.block.id
      ? (view.angle ?? 0)
      : (single?.item.r ?? 0);
  const locked = Boolean(single?.item.locked);
  const handles =
    readOnly || !single || locked
      ? []
      : fillsItem(single.block.kind)
        ? allHandles
        : widthHandles;
  const showFrames = onCanvas || view !== null || selection?.kind === "section";
  const frameHeight = (frame: CanvasFrame) =>
    view?.kind === "height" && view.sectionId === frame.sectionId && view.height
      ? view.height * frame.u
      : frame.height;

  // A selected block the page does not draw (hidden): its place, dashed.
  const ghost =
    single?.item.hidden && selectedFrame
      ? {
          x: single.item.x,
          y: single.item.y,
          w: single.item.w,
          h: itemHeight(single.item),
        }
      : null;

  return (
    <div
      aria-hidden="true"
      className="es-cv"
      data-gesture={view?.kind}
      ref={rootRef}
    >
      {showFrames
        ? [...frames.values()].map((frame) => (
            <div
              className="es-cv-frame"
              data-active={frame.sectionId === activeSectionId || undefined}
              key={frame.sectionId}
              style={{
                left: frame.left * scale,
                top: frame.top * scale,
                width: frame.width * scale,
                height: frameHeight(frame) * scale,
              }}
            />
          ))
        : null}

      {activeFrame && margin > 0 && (onCanvas || view?.kind === "move")
        ? marginGuides(
            canvasBox(activeFrame.height / activeFrame.u),
            margin,
          ).map((guide) => (
            <GuideLine
              faint
              frame={activeFrame}
              guide={guide}
              key={`m:${guide.at}`}
              scale={scale}
            />
          ))
        : null}

      {/* Several selected: each outline and the group's box. */}
      {selectedFrame && selectedIds.length > 1 && !moving
        ? selectedIds.map((id) => {
            const box = selectedFrame.items.get(id);
            return box ? (
              <div
                className="es-cv-member"
                key={id}
                style={screenBox(selectedFrame, box, scale)}
              />
            ) : null;
          })
        : null}
      {selectedFrame && selectedIds.length > 1 && !moving
        ? (() => {
            const boxes = selectedIds
              .map((id) => selectedFrame.items.get(id))
              .filter((box): box is CanvasBox => Boolean(box));
            return boxes.length ? (
              <div
                className="es-cv-bounds"
                style={screenBox(selectedFrame, boundsOfBoxes(boxes), scale)}
              />
            ) : null;
          })()
        : null}

      {view?.kind === "move" && viewFrame && view.box ? (
        <div
          className="es-cv-selection"
          data-moving=""
          style={screenBox(viewFrame, view.box, scale)}
        />
      ) : null}

      {view?.kind === "marquee" && view.rect ? (
        <div
          className="es-cv-marquee"
          style={{
            left: view.rect.left * scale,
            top: view.rect.top * scale,
            width: view.rect.width * scale,
            height: view.rect.height * scale,
          }}
        />
      ) : null}

      {ghost && selectedFrame ? (
        <div
          className="es-cv-ghost"
          style={screenBox(selectedFrame, ghost, scale)}
        >
          <span>
            <Icon name="eye-off" size={12} /> Oculto
          </span>
        </div>
      ) : null}

      {selectedFrame && singleBox && view?.kind !== "move" && !ghost ? (
        <div
          className="es-cv-selection"
          data-locked={locked || undefined}
          style={{
            ...screenBox(selectedFrame, singleBox, scale),
            transform: singleRotation
              ? `rotate(${singleRotation}deg)`
              : undefined,
          }}
        >
          {handles.map((handle) => (
            <div
              className="es-cv-handle"
              data-handle={handle}
              key={handle}
              onLostPointerCapture={cancelPointer}
              onPointerCancel={cancelPointer}
              onPointerDown={startResize(handle)}
              onPointerMove={moveResize}
              onPointerUp={endResize}
              title={
                handles === widthHandles
                  ? "Arrastra para cambiar el ancho"
                  : "Arrastra para cambiar el tamaño. Mayús conserva la proporción."
              }
            />
          ))}
          {handles.length && view?.kind !== "resize" ? (
            <div
              className="es-cv-rotate"
              data-active={view?.kind === "rotate" || undefined}
              onLostPointerCapture={cancelPointer}
              onPointerCancel={cancelPointer}
              onPointerDown={startRotate}
              onPointerMove={moveRotate}
              onPointerUp={endRotate}
              style={{ top: -ROTATE_OFFSET }}
              title="Arrastra para girar. Mayús gira de 15° en 15°."
            />
          ) : null}
          {locked ? (
            <span className="es-cv-lock" title="Posición bloqueada">
              <Icon name="lock" size={12} />
            </span>
          ) : null}
        </div>
      ) : null}

      {!readOnly &&
      activeFrame &&
      view?.kind !== "move" &&
      view?.kind !== "resize" &&
      view?.kind !== "rotate" &&
      view?.kind !== "marquee" ? (
        <div
          className="es-cv-height"
          data-active={view?.kind === "height" || undefined}
          onLostPointerCapture={cancelPointer}
          onPointerCancel={cancelPointer}
          onPointerDown={startHeight(activeFrame.sectionId)}
          onPointerMove={moveHeight}
          onPointerUp={endHeight}
          style={{
            left: (activeFrame.left + activeFrame.width / 2) * scale,
            top: (activeFrame.top + frameHeight(activeFrame)) * scale,
          }}
          title="Arrastra para cambiar el alto del espacio libre"
        />
      ) : null}

      {viewFrame
        ? view?.guides.map((guide) => (
            <GuideLine
              frame={viewFrame}
              guide={guide}
              key={`${guide.axis}:${guide.at}`}
              scale={scale}
            />
          ))
        : null}
      {viewFrame
        ? view?.gaps.map((gap) => (
            <GapMark
              frame={viewFrame}
              gap={gap}
              key={`${gap.axis}:${gap.from}:${gap.to}`}
              scale={scale}
            />
          ))
        : null}
      {viewFrame && view?.badge ? (
        <Badge
          frame={viewFrame}
          rotateBox={
            view.kind === "rotate" && single && selectedFrame
              ? (selectedFrame.items.get(single.block.id) ?? null)
              : null
          }
          scale={scale}
          view={view}
        />
      ) : null}

      <CanvasDropZones design={design} frames={frames} scale={scale} />
    </div>
  );
}

function GuideLine({
  frame,
  guide,
  scale,
  faint,
}: {
  frame: CanvasFrame;
  guide: Guide;
  scale: number;
  faint?: boolean;
}) {
  const k = frame.u * scale;
  const style: CSSProperties =
    guide.axis === "x"
      ? {
          left: (frame.left + guide.at * frame.u) * scale,
          top: (frame.top + guide.from * frame.u) * scale,
          height: (guide.to - guide.from) * k,
        }
      : {
          top: (frame.top + guide.at * frame.u) * scale,
          left: (frame.left + guide.from * frame.u) * scale,
          width: (guide.to - guide.from) * k,
        };
  return (
    <div
      className="es-cv-guide"
      data-axis={guide.axis}
      data-faint={faint || undefined}
      style={style}
    />
  );
}

function GapMark({
  frame,
  gap,
  scale,
}: {
  frame: CanvasFrame;
  gap: SpacingGap;
  scale: number;
}) {
  const k = frame.u * scale;
  const style: CSSProperties =
    gap.axis === "x"
      ? {
          left: (frame.left + gap.from * frame.u) * scale,
          top: (frame.top + gap.at * frame.u) * scale,
          width: (gap.to - gap.from) * k,
        }
      : {
          top: (frame.top + gap.from * frame.u) * scale,
          left: (frame.left + gap.at * frame.u) * scale,
          height: (gap.to - gap.from) * k,
        };
  return <div className="es-cv-gap" data-axis={gap.axis} style={style} />;
}

/** "X 24 · Y 40", "200 × 120", "15°" or "Alto 640", under what changes. */
function Badge({
  frame,
  view,
  scale,
  rotateBox,
}: {
  frame: CanvasFrame;
  view: GestureView;
  scale: number;
  rotateBox: CanvasBox | null;
}) {
  const box = view.box ?? rotateBox;
  const anchor =
    view.kind === "height" && view.height !== undefined
      ? {
          left: (frame.left + frame.width / 2) * scale,
          top: (frame.top + view.height * frame.u) * scale + 18,
        }
      : box
        ? {
            left: (frame.left + (box.x + box.w / 2) * frame.u) * scale,
            top: (frame.top + (box.y + box.h) * frame.u) * scale + 10,
          }
        : null;
  if (!anchor) return null;
  return (
    <div className="es-cv-badge" style={anchor}>
      {view.badge}
    </div>
  );
}

/** While a block or a palette item is dragged, each canvas takes drops. */
function CanvasDropZones({
  design,
  frames,
  scale,
}: {
  design: PageDesign;
  frames: ReadonlyMap<string, CanvasFrame>;
  scale: number;
}) {
  const { active } = useDndContext();
  const drag = active?.data.current as DragData | undefined;
  if (!drag || drag.type === "section") return null;
  const kind =
    drag.type === "palette"
      ? drag.kind
      : locateBlock(design, drag.blockId)?.block.kind;
  const accepts = kind !== undefined && canPlaceOnCanvas(kind);
  return (
    <>
      {[...frames.values()].map((frame) => (
        <CanvasDropZone
          disabled={!accepts}
          frame={frame}
          key={frame.sectionId}
          label={`el espacio libre de la sección ${sectionIndexOf(design, frame.sectionId) + 1}`}
          scale={scale}
        />
      ))}
    </>
  );
}

function CanvasDropZone({
  frame,
  label,
  scale,
  disabled,
}: {
  frame: CanvasFrame;
  label: string;
  scale: number;
  disabled: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: stageCanvasId(frame.sectionId),
    data: { type: "canvas", sectionId: frame.sectionId, label },
    disabled,
  });
  return (
    <div
      className="es-cv-drop"
      data-disabled={disabled || undefined}
      data-over={isOver || undefined}
      ref={setNodeRef}
      style={{
        left: frame.left * scale,
        top: frame.top * scale,
        width: frame.width * scale,
        height: frame.height * scale,
      }}
    />
  );
}
