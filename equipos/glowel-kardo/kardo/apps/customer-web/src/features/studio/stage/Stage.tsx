import { useDroppable } from "@dnd-kit/core";
import {
  type DesignSection,
  isCanvasSection,
  type PageDesign,
} from "@kardo/contracts";
import {
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { type DragData, stageColumnId } from "../dnd.js";
import { blockKindLabel } from "../model/blocks.js";
import { canvasItemOf } from "../model/canvas.js";
import { locateBlock, sectionIndexOf } from "../model/operations.js";
import {
  type Selection,
  selectedBlockIds,
  useStudio,
} from "../StudioContext.js";
import { ROTATE_HIT_MARGIN, ROTATE_OFFSET } from "./CanvasOverlay.js";
import { DesktopFrame, PhoneFrame, type ScreenTone } from "./DeviceFrame.js";
import { type FrameTarget, PreviewFrame } from "./PreviewFrame.js";
import { photoSpaceOf, usePhotoSpaces } from "./photo-spaces.js";
import { SelectionToolbar } from "./SelectionToolbar.js";
import { toggleInSelection } from "./selection.js";
import {
  bothScales,
  type DesktopWidth,
  type Device,
  desktopViewport,
  fitScale,
  phoneViewport,
  type Viewport,
} from "./viewports.js";

export type { DesktopWidth, Device } from "./viewports.js";

export type Zoom = "fit" | number;

type Box = { x: number; y: number; w: number; h: number };
export type DropLine = { x: number; y: number; w: number };

/** What the drag handlers ask the stage (it owns the iframe and the scale). */
export type StageApi = {
  /** Where a block dropped at a pointer position lands in one column. */
  columnTarget: (
    sectionId: string,
    columnIndex: number,
    blockIds: readonly string[],
    clientX: number,
    clientY: number,
  ) => { index: number; line: DropLine } | null;
};

/** Extra layers drawn over a device's page (the canvas editor). Boxes line
 * up with `element.getBoundingClientRect() * scale` inside `doc`. */
export type StageOverlay = (view: {
  doc: Document | null;
  scale: number;
  version: number;
  primary: boolean;
}) => ReactNode;

/**
 * The center of the Estudio: the live page in a phone, a computer window
 * or both side by side (computer first, phone on the right). Each one is
 * rendered at its real screen size and scaled to fit the room, with hover
 * and selection outlines, the quick actions over the selection, writing on
 * the page (double click) and, while dragging, drop zones on every column
 * of the primary view. The stage always fills its column; the page scrolls
 * inside its screen.
 */
export function Stage({
  html,
  frozen,
  device,
  desktopWidth,
  zoom,
  onFitChange,
  title,
  tone,
  dragging,
  dropLine,
  apiRef,
  focusRef,
  alert,
  overlay,
  onEdit,
  onInspect,
}: {
  html: string;
  /** Someone is writing on the page: renders wait. */
  frozen: boolean;
  device: Device;
  desktopWidth: DesktopWidth;
  zoom: Zoom;
  /** The scale that fits the room (shown next to the zoom controls). */
  onFitChange: (fit: number) => void;
  title: string;
  tone: ScreenTone;
  dragging: DragData | null;
  dropLine: DropLine | null;
  apiRef: MutableRefObject<StageApi | null>;
  /** Receives focus after a click in the preview (keeps shortcuts working). */
  focusRef: MutableRefObject<HTMLDivElement | null>;
  alert?: ReactNode | undefined;
  overlay?: StageOverlay | undefined;
  /** A double click on the page (or "Escribir" in the quick actions). */
  onEdit: (
    doc: Document | null,
    blockId: string,
    clicked?: Element | null,
    point?: { x: number; y: number } | null,
  ) => void;
  /** Opens the inspector (narrow screens, where it is not a column). */
  onInspect?: (() => void) | undefined;
}) {
  const { readOnly, select } = useStudio();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState({ width: 0, height: 0 });

  useLayoutEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setAvailable({
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
      });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const desktop = desktopViewport(desktopWidth);
  // `available` already excludes the viewport padding.
  const room = {
    width: Math.max(0, available.width - 4),
    height: Math.max(0, available.height - 4),
  };
  const both = device === "both";
  const single = both ? null : device;
  const fit = !available.width
    ? 0.5
    : single === "phone"
      ? fitScale("phone", phoneViewport, room)
      : fitScale("desktop", desktop, room);
  useEffect(() => {
    if (available.width) onFitChange(fit);
  }, [fit, available.width, onFitChange]);
  const scale = zoom === "fit" ? fit : zoom;
  const scales =
    both && available.width
      ? bothScales(desktop, room)
      : { phone: scale, desktop: scale };

  const acceptsDrops =
    !readOnly && (dragging?.type === "palette" || dragging?.type === "block");

  const views: {
    kind: "phone" | "desktop";
    viewport: Viewport;
    scale: number;
    primary: boolean;
  }[] = both
    ? [
        {
          kind: "desktop",
          viewport: desktop,
          scale: scales.desktop,
          primary: false,
        },
        {
          kind: "phone",
          viewport: phoneViewport,
          scale: scales.phone,
          primary: true,
        },
      ]
    : [
        {
          kind: single ?? "phone",
          viewport: single === "desktop" ? desktop : phoneViewport,
          scale,
          primary: true,
        },
      ];

  return (
    <section aria-label="Vista previa de la página" className="es-stage-main">
      <div
        aria-describedby="es-stage-keys"
        aria-label="Tu página"
        className="es-stage"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null))
            event.currentTarget.removeAttribute("data-pointer");
        }}
        onPointerDown={(event) => {
          // A click on the bench (outside the page) clears the selection.
          if (event.target === event.currentTarget) select(null);
        }}
        ref={(element) => {
          focusRef.current = element;
        }}
        role="application"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: the stage is the Estudio's keyboard surface (Tab walks the blocks, arrows move them)
        tabIndex={0}
      >
        <p className="visually-hidden" id="es-stage-keys">
          Tab recorre los bloques, Enter escribe en el texto seleccionado, las
          flechas lo mueven en un espacio libre (Mayús: 10 px) y Supr lo
          elimina.
        </p>
        <div
          className="es-stage-viewport"
          onPointerDown={(event) => {
            if (event.target === event.currentTarget) select(null);
          }}
          ref={viewportRef}
        >
          <div className="es-device-row" data-views={views.length}>
            {views.map((view) => (
              <DeviceView
                acceptsDrops={acceptsDrops}
                apiRef={view.primary ? apiRef : null}
                dropLine={view.primary ? dropLine : null}
                focusRef={focusRef}
                frozen={frozen}
                html={html}
                key={view.kind}
                kind={view.kind}
                onEdit={onEdit}
                onInspect={onInspect}
                overlay={overlay}
                primary={view.primary}
                scale={view.scale}
                title={title}
                tone={tone}
                viewport={view.viewport}
              />
            ))}
          </div>
        </div>
        {alert ? <div className="es-stage-alert">{alert}</div> : null}
      </div>
    </section>
  );
}

function selectorOf(target: FrameTarget): string | null {
  return target
    ? target.kind === "block"
      ? `[data-block-id="${CSS.escape(target.id)}"]`
      : `[data-section-id="${CSS.escape(target.id)}"]`
    : null;
}

/** The one block or section outlined by the stage (several canvas blocks
 * are outlined by the canvas editor). */
function frameTargetOf(selection: Selection): FrameTarget {
  if (selection?.kind === "block" || selection?.kind === "section")
    return selection;
  return null;
}

function labelOf(design: PageDesign, target: FrameTarget): string | null {
  if (target?.kind === "block") {
    const at = locateBlock(design, target.id);
    return at ? blockKindLabel(at.block.kind) : null;
  }
  if (target?.kind === "section")
    return `Sección ${sectionIndexOf(design, target.id) + 1}`;
  return null;
}

function boxStyle(box: Box) {
  return { left: box.x, top: box.y, width: box.w, height: box.h };
}

function columnElement(
  doc: Document,
  sectionId: string,
  columnIndex: number,
): Element | null {
  const section = doc.querySelector(
    `[data-section-id="${CSS.escape(sectionId)}"]`,
  );
  const columns = section?.querySelectorAll(".kd-col");
  return columns?.[columnIndex] ?? null;
}

/** One device: its frame, the page at the real screen size and the
 * outlines, quick actions and drop zones over it. */
function DeviceView({
  kind,
  viewport,
  scale,
  primary,
  html,
  frozen,
  title,
  tone,
  acceptsDrops,
  dropLine,
  apiRef,
  focusRef,
  overlay,
  onEdit,
  onInspect,
}: {
  kind: "phone" | "desktop";
  viewport: Viewport;
  scale: number;
  primary: boolean;
  html: string;
  frozen: boolean;
  title: string;
  tone: ScreenTone;
  acceptsDrops: boolean;
  dropLine: DropLine | null;
  apiRef: MutableRefObject<StageApi | null> | null;
  focusRef: MutableRefObject<HTMLDivElement | null>;
  overlay?: StageOverlay | undefined;
  onEdit: (
    doc: Document | null,
    blockId: string,
    clicked?: Element | null,
    point?: { x: number; y: number } | null,
  ) => void;
  onInspect?: (() => void) | undefined;
}) {
  const { design, selection, select, readOnly } = useStudio();
  const photoSpaces = usePhotoSpaces();
  const docRef = useRef<Document | null>(null);
  const screenRef = useRef<HTMLDivElement>(null);
  const [layoutVersion, setLayoutVersion] = useState(0);
  const [hover, setHover] = useState<FrameTarget>(null);
  const latestSelection = useRef(selection);
  latestSelection.current = selection;
  const latestDesign = useRef(design);
  latestDesign.current = design;

  const rect = useCallback(
    (selector: string): Box | null => {
      const element = docRef.current?.querySelector(selector);
      if (!element) return null;
      const bounds = element.getBoundingClientRect();
      return {
        x: bounds.left * scale,
        y: bounds.top * scale,
        w: bounds.width * scale,
        h: bounds.height * scale,
      };
    },
    [scale],
  );

  const outlined = frameTargetOf(selection);
  const blockIds = selectedBlockIds(selection);

  // A single, unlocked canvas block shows a rotate handle above it (the
  // Estudio, model/canvas.ts); the floating toolbar must clear it, or it
  // sits over the one handle the quick actions don't offer.
  const soloId = blockIds.length === 1 ? blockIds[0] : null;
  const soloCanvasItem = soloId ? canvasItemOf(design, soloId) : null;
  const hasRotateHandle = Boolean(
    !readOnly && soloCanvasItem && !soloCanvasItem.item.locked,
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: boxes follow every relayout and scroll of the page
  const boxes = useMemo(() => {
    const selectedSelector = selectorOf(outlined);
    const hoverSelector =
      hover &&
      !(outlined && hover.id === outlined.id) &&
      !(hover.kind === "block" && blockIds.includes(hover.id))
        ? selectorOf(hover)
        : null;
    // The quick actions sit over the whole selection.
    let anchor: Box | null = selectedSelector ? rect(selectedSelector) : null;
    if (blockIds.length > 1) {
      const parts = blockIds
        .map((id) => rect(`[data-block-id="${CSS.escape(id)}"]`))
        .filter((box): box is Box => Boolean(box));
      if (parts.length) {
        const left = Math.min(...parts.map((box) => box.x));
        const top = Math.min(...parts.map((box) => box.y));
        anchor = {
          x: left,
          y: top,
          w: Math.max(...parts.map((box) => box.x + box.w)) - left,
          h: Math.max(...parts.map((box) => box.y + box.h)) - top,
        };
      }
    }
    return {
      selected: selectedSelector ? rect(selectedSelector) : null,
      hover: hoverSelector ? rect(hoverSelector) : null,
      anchor,
    };
  }, [outlined, blockIds.join(","), hover, rect, layoutVersion, html]);

  // Scroll a newly selected block into view inside the page (e.g. picked
  // in Capas), like scrolling the real screen.
  const focusId =
    selection?.kind === "blocks"
      ? (selection.ids.at(-1) ?? null)
      : (selection?.id ?? null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: only when the selection changes
  useEffect(() => {
    const target: FrameTarget =
      selection?.kind === "section"
        ? selection
        : focusId
          ? { kind: "block", id: focusId }
          : null;
    const selector = selectorOf(target);
    const doc = docRef.current;
    const element = selector ? doc?.querySelector(selector) : null;
    const view = doc?.defaultView;
    if (!element || !view) return;
    const bounds = element.getBoundingClientRect();
    if (
      bounds.top >= 24 &&
      Math.min(bounds.bottom, bounds.top + 200) <= view.innerHeight - 24
    )
      return;
    const reduced = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    view.scrollTo({
      top: Math.max(0, view.scrollY + bounds.top - view.innerHeight / 3),
      behavior: reduced ? "auto" : "smooth",
    });
  }, [focusId]);

  if (apiRef)
    apiRef.current = {
      columnTarget(sectionId, columnIndex, blockIds, _clientX, clientY) {
        const doc = docRef.current;
        const iframe = screenRef.current?.querySelector("iframe");
        if (!doc || !iframe) return null;
        const origin = iframe.getBoundingClientRect();
        const y = (clientY - origin.top) / scale;
        const column = columnElement(doc, sectionId, columnIndex);
        const columnRect = column?.getBoundingClientRect();
        const rects = blockIds
          .map((id) =>
            doc
              .querySelector(`[data-block-id="${CSS.escape(id)}"]`)
              ?.getBoundingClientRect(),
          )
          .filter((item): item is DOMRect => Boolean(item));
        let index = rects.findIndex((item) => item.top + item.height / 2 > y);
        if (index < 0) index = rects.length;
        const before = rects[index - 1];
        const after = rects[index];
        const lineY = after
          ? before
            ? (before.bottom + after.top) / 2
            : after.top - 4
          : before
            ? before.bottom + 4
            : (columnRect?.top ?? 0) + 4;
        const left = columnRect?.left ?? after?.left ?? before?.left ?? 0;
        const width = columnRect?.width ?? after?.width ?? before?.width ?? 0;
        return {
          index,
          line: { x: left * scale, y: lineY * scale, w: width * scale },
        };
      },
    };

  const selectedLabel = labelOf(design, outlined);
  const hoverLabel = labelOf(design, hover);

  const page = (
    <div className="es-canvas" data-dragging={acceptsDrops || undefined}>
      <div
        className="es-scale"
        ref={screenRef}
        style={{
          width: viewport.width,
          height: viewport.height,
          transform: `scale(${scale})`,
        }}
      >
        <PreviewFrame
          frozen={frozen}
          height={viewport.height}
          html={html}
          onDocument={(doc) => {
            docRef.current = doc;
            setLayoutVersion((value) => value + 1);
          }}
          onEdit={(element, point) => {
            const target = element.closest("[data-block-id]");
            const blockId = target?.getAttribute("data-block-id");
            if (blockId) onEdit(docRef.current, blockId, element, point);
          }}
          onHover={setHover}
          onPhotoSpace={(element) => {
            if (!primary || !photoSpaces.canFill) return;
            const space = photoSpaceOf(element, design);
            if (space) photoSpaces.open(space);
          }}
          onInteract={() => {
            // Focus follows a click on the page (so shortcuts keep working)
            // without the keyboard ring.
            const stage = focusRef.current;
            if (!stage) return;
            stage.setAttribute("data-pointer", "");
            stage.focus({ preventScroll: true });
          }}
          onLayout={() => setLayoutVersion((value) => value + 1)}
          onPick={(target, modifiers) => {
            if (modifiers.shiftKey && target?.kind === "block" && !readOnly)
              select(
                toggleInSelection(
                  latestDesign.current,
                  latestSelection.current,
                  target.id,
                ),
              );
            else select(target);
          }}
          title={`Vista previa de ${title} en ${kind === "phone" ? "celular" : "computadora"}`}
          width={viewport.width}
        />
        {primary ? (
          <input
            accept="image/png,image/jpeg,image/webp"
            aria-hidden="true"
            className="visually-hidden"
            onChange={(event) => photoSpaces.onFile(event.target.files?.[0])}
            ref={photoSpaces.input}
            tabIndex={-1}
            type="file"
          />
        ) : null}
      </div>
      <div className="es-overlay">
        {boxes.hover && !acceptsDrops ? (
          <div className="es-box es-box-hover" style={boxStyle(boxes.hover)}>
            {hoverLabel ? (
              <span className="es-box-tag">{hoverLabel}</span>
            ) : null}
          </div>
        ) : null}
        {boxes.selected ? (
          <div
            className="es-box es-box-selected"
            data-kind={outlined?.kind}
            style={boxStyle(boxes.selected)}
          >
            {!primary && selectedLabel ? (
              <span className="es-box-tag">{selectedLabel}</span>
            ) : null}
          </div>
        ) : null}
        {acceptsDrops && primary ? (
          <StageDropZones
            design={design}
            doc={docRef.current}
            scale={scale}
            version={layoutVersion}
          />
        ) : null}
        {acceptsDrops && dropLine ? (
          <div
            className="es-drop-line"
            style={{
              left: dropLine.x,
              top: dropLine.y,
              width: dropLine.w,
            }}
          />
        ) : null}
        {overlay?.({
          doc: docRef.current,
          scale,
          version: layoutVersion,
          primary,
        })}
      </div>
    </div>
  );

  const float =
    primary && !acceptsDrops && !frozen && boxes.anchor && selection ? (
      <FloatingBar anchor={boxes.anchor} clearRotateHandle={hasRotateHandle}>
        <SelectionToolbar
          fontSizeOf={(blockId) => fontSizeOf(docRef.current, blockId)}
          onEditText={(blockId) => onEdit(docRef.current, blockId)}
          onMore={onInspect}
        />
      </FloatingBar>
    ) : null;

  return kind === "phone" ? (
    <PhoneFrame float={float} primary={primary} scale={scale} tone={tone}>
      {page}
    </PhoneFrame>
  ) : (
    <DesktopFrame
      float={float}
      primary={primary}
      scale={scale}
      title={title}
      viewport={viewport}
    >
      {page}
    </DesktopFrame>
  );
}

/** The text size of a block as drawn, in design px (canvas blocks scale
 * with their canvas). */
function fontSizeOf(doc: Document | null, blockId: string): number | null {
  const element = doc?.querySelector(
    `[data-block-id="${CSS.escape(blockId)}"]`,
  );
  const view = doc?.defaultView;
  if (!element || !view) return null;
  const target =
    element.querySelector(".kd-heading, .kd-brand-label, .kd-link") ?? element;
  const size = Number.parseFloat(view.getComputedStyle(target).fontSize);
  if (!Number.isFinite(size)) return null;
  const frame = element.closest(".kd-canvas-frame");
  const u = frame ? frame.getBoundingClientRect().width / 390 : 1;
  return size / (u || 1);
}

/**
 * Places the quick actions above the selection, or under it when there is
 * no room, or at the top of the screen for a block taller than it; always
 * inside the stage, never over the selected block when it can be avoided.
 */
function FloatingBar({
  anchor,
  clearRotateHandle,
  children,
}: {
  anchor: Box;
  /** The selection shows a canvas rotate handle above it: placing the bar
   * above must clear the handle and its hit area, or the one action the
   * quick actions don't offer becomes unreachable. */
  clearRotateHandle?: boolean;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(
    null,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-placed whenever the anchor moves
  useLayoutEffect(() => {
    const element = ref.current;
    const layer = element?.parentElement;
    const stage = element?.closest(".es-stage");
    if (!element || !layer || !stage) return;
    const origin = layer.getBoundingClientRect();
    const room = stage.getBoundingClientRect();
    // A narrow stage wraps the actions on two rows instead of cutting them.
    element.style.maxWidth = `${Math.max(160, room.width - 16)}px`;
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    const gap = clearRotateHandle ? ROTATE_OFFSET + ROTATE_HIT_MARGIN + 6 : 10;
    const minTop = room.top - origin.top + 8;
    const maxTop = room.bottom - origin.top - height - 8;
    const minLeft = room.left - origin.left + 8;
    const maxLeft = room.right - origin.left - width - 8;
    const above = anchor.y - height - gap;
    const below = anchor.y + anchor.h + gap;
    const top =
      above >= Math.max(minTop, -height - gap * 4)
        ? above
        : below <= maxTop
          ? below
          : Math.max(minTop, Math.min(maxTop, 8));
    const left = Math.max(
      minLeft,
      Math.min(maxLeft, anchor.x + anchor.w / 2 - width / 2),
    );
    setPlace((current) =>
      current && current.left === left && current.top === top
        ? current
        : { left, top },
    );
  }, [anchor.x, anchor.y, anchor.w, anchor.h, clearRotateHandle, children]);
  return (
    <div
      className="es-float-bar"
      ref={ref}
      style={
        place
          ? { left: place.left, top: place.top }
          : { left: anchor.x, top: anchor.y, visibility: "hidden" }
      }
    >
      {children}
    </div>
  );
}

/** One drop zone per column of the preview while a block is dragged. */
function StageDropZones({
  design,
  doc,
  scale,
  version,
}: {
  design: PageDesign;
  doc: Document | null;
  scale: number;
  version: number;
}) {
  if (!doc) return null;
  void version;
  return (
    <>
      {design.sections.flatMap((section, sectionIndex) =>
        // Canvas sections take drops through CanvasOverlay, not columns.
        isCanvasSection(section)
          ? []
          : section.columns.map((_column, columnIndex) => (
              <StageColumnZone
                columnIndex={columnIndex}
                doc={doc}
                // biome-ignore lint/suspicious/noArrayIndexKey: columns are positional
                key={`${section.id}:${columnIndex}`}
                scale={scale}
                section={section}
                sectionNumber={sectionIndex + 1}
              />
            )),
      )}
    </>
  );
}

function StageColumnZone({
  section,
  sectionNumber,
  columnIndex,
  doc,
  scale,
}: {
  section: DesignSection;
  sectionNumber: number;
  columnIndex: number;
  doc: Document;
  scale: number;
}) {
  const label =
    section.columns.length > 1
      ? `la columna ${columnIndex + 1} de la sección ${sectionNumber}`
      : `la sección ${sectionNumber}`;
  const { setNodeRef, isOver } = useDroppable({
    id: stageColumnId(section.id, columnIndex),
    data: {
      type: "column",
      origin: "stage",
      sectionId: section.id,
      columnIndex,
      label,
    },
  });
  const rect = columnElement(
    doc,
    section.id,
    columnIndex,
  )?.getBoundingClientRect();
  if (!rect) return null;
  const minHeight = 36;
  const height = Math.max(rect.height, minHeight);
  const top = rect.top - (height - rect.height) / 2;
  return (
    <div
      className="es-drop-zone"
      data-over={isOver || undefined}
      ref={setNodeRef}
      style={{
        left: rect.left * scale,
        top: top * scale,
        width: rect.width * scale,
        height: height * scale,
      }}
    />
  );
}
