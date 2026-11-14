import { useCallback, useEffect, useRef, useState } from "react";

export type FrameTarget = { kind: "block" | "section"; id: string } | null;

/** Modifier keys of a click in the preview (Shift adds to a selection). */
export type PickModifiers = { shiftKey: boolean; metaKey: boolean };

/**
 * Editor-only touches inside the preview: pointer cursors, no text
 * selection (except while writing on the page), and no scrollbar taking
 * width from the page (it scrolls inside its real viewport, like a phone).
 * Nothing here changes how the page looks.
 */
export const editorCss =
  "html{scrollbar-width:none}html::-webkit-scrollbar{display:none}body{user-select:none;-webkit-user-select:none}[data-block-id],[data-section-id]{cursor:pointer}a,img{-webkit-user-drag:none}[data-es-editing]{user-select:text;-webkit-user-select:text;cursor:text;outline:none;caret-color:currentColor}[data-es-editing] *{cursor:text}";

function isElement(value: unknown): value is Element {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as Node).nodeType === 1 &&
    typeof (value as Element).closest === "function"
  );
}

/** The block (or else the section) under an element of the preview. */
export function targetOf(node: unknown): FrameTarget {
  if (!isElement(node)) return null;
  const block = node.closest("[data-block-id]");
  const blockId = block?.getAttribute("data-block-id");
  if (blockId) return { kind: "block", id: blockId };
  const section = node.closest("[data-section-id]");
  const sectionId = section?.getAttribute("data-section-id");
  return sectionId ? { kind: "section", id: sectionId } : null;
}

/** Whether a node sits inside the text being written on the page. */
export function insideEditing(node: unknown): boolean {
  return isElement(node) && node.closest("[data-es-editing]") !== null;
}

function injectEditorStyle(doc: Document) {
  const style = doc.createElement("style");
  style.setAttribute("data-studio", "");
  style.textContent = editorCss;
  doc.head.append(style);
}

/**
 * The real page in a sandboxed iframe: `srcdoc` without `allow-scripts`, so
 * nothing in it can run. `allow-same-origin` only lets the Estudio (the
 * parent) read its layout, listen to clicks to select blocks, and switch a
 * text to `contenteditable` to write on the page (a browser feature, not a
 * script of the page).
 *
 * The iframe is exactly the visible area of the device (390 × 764 for a
 * phone, the chosen desktop size otherwise) and the page scrolls inside it,
 * so `100vh`, `100dvh` and `@media` rules see a real screen. Later renders
 * patch the document in place (no reload, no flicker, same scroll); while
 * `frozen` (someone is writing on the page) patches wait.
 */
export function PreviewFrame({
  html,
  width,
  height,
  title,
  frozen = false,
  onPick,
  onHover,
  onLayout,
  onDocument,
  onInteract,
  onEdit,
  onPhotoSpace,
}: {
  html: string;
  width: number;
  height: number;
  title: string;
  frozen?: boolean | undefined;
  onPick: (target: FrameTarget, modifiers: PickModifiers) => void;
  onHover: (target: FrameTarget) => void;
  /** After every render, relayout, resize or scroll of the page. */
  onLayout: () => void;
  onDocument: (doc: Document | null) => void;
  /** A click happened inside: hand the keyboard back to the Estudio. */
  onInteract: () => void;
  /** A double click on an element: write on the page there (`point` in
   * the preview's client px, for the caret). */
  onEdit?:
    | ((element: Element, point: { x: number; y: number }) => void)
    | undefined;
  /** A click on an element (after `onPick`): a photo space asks for its
   * photo (`photo-spaces.ts`). */
  onPhotoSpace?: ((element: Element) => void) | undefined;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  // The first document comes through `srcdoc`; later ones are patched in.
  const [initialHtml] = useState(html);
  const latest = useRef(html);
  latest.current = html;
  const frozenRef = useRef(frozen);
  frozenRef.current = frozen;
  const applied = useRef<string | null>(null);
  const headKey = useRef("");
  const handlers = useRef({
    onPick,
    onHover,
    onLayout,
    onDocument,
    onInteract,
    onEdit,
    onPhotoSpace,
  });
  handlers.current = {
    onPick,
    onHover,
    onLayout,
    onDocument,
    onInteract,
    onEdit,
    onPhotoSpace,
  };
  const layoutRequest = useRef(0);

  // Coalesces bursts (scroll, image loads) into one relayout per frame.
  const relayout = useCallback(() => {
    const view = ref.current?.contentWindow;
    if (!view) return;
    view.cancelAnimationFrame(layoutRequest.current);
    layoutRequest.current = view.requestAnimationFrame(() =>
      handlers.current.onLayout(),
    );
  }, []);

  const bodyObserver = useRef<ResizeObserver | null>(null);
  const observeBody = useCallback(
    (doc: Document) => {
      bodyObserver.current?.disconnect();
      const View = doc.defaultView as
        | (Window & { ResizeObserver?: typeof ResizeObserver })
        | null;
      if (!View?.ResizeObserver || !doc.body) return;
      bodyObserver.current = new View.ResizeObserver(() => relayout());
      bodyObserver.current.observe(doc.body);
    },
    [relayout],
  );

  const patch = useCallback(
    (next: string) => {
      const doc = ref.current?.contentDocument;
      if (!doc?.body || applied.current === next || frozenRef.current) return;
      const parsed = new DOMParser().parseFromString(next, "text/html");
      const head = parsed.head.innerHTML;
      if (head !== headKey.current) {
        doc.head.replaceWith(doc.importNode(parsed.head, true));
        injectEditorStyle(doc);
        headKey.current = head;
      }
      doc.body.replaceWith(doc.importNode(parsed.body, true));
      applied.current = next;
      observeBody(doc);
      relayout();
    },
    [observeBody, relayout],
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: a thaw applies the render that waited
  useEffect(() => {
    if (applied.current !== null) patch(html);
  }, [html, patch, frozen]);

  // A new viewport size (device or desktop width) moves every box.
  // biome-ignore lint/correctness/useExhaustiveDependencies: relayout when the viewport changes
  useEffect(() => {
    relayout();
  }, [width, height, relayout]);

  useEffect(
    () => () => {
      bodyObserver.current?.disconnect();
      handlers.current.onDocument(null);
    },
    [],
  );

  function onLoad() {
    const frame = ref.current;
    const doc = frame?.contentDocument;
    if (!doc) return;
    headKey.current = new DOMParser().parseFromString(
      initialHtml,
      "text/html",
    ).head.innerHTML;
    applied.current = initialHtml;
    injectEditorStyle(doc);

    let hovered: string | null = null;
    let frameRequest = 0;
    doc.addEventListener(
      "click",
      (event) => {
        // Clicks inside the text being written only move the caret (that
        // happens on pointerdown), but a link being edited, like a button's
        // label, must still never navigate inside the Estudio.
        if (insideEditing(event.target)) {
          if (isElement(event.target) && event.target.closest("a[href]"))
            event.preventDefault();
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        handlers.current.onPick(targetOf(event.target), {
          shiftKey: event.shiftKey,
          metaKey: event.metaKey || event.ctrlKey,
        });
        handlers.current.onInteract();
        // A photo space (2026-10-03): the same click asks for the photo.
        if (isElement(event.target) && !event.shiftKey)
          handlers.current.onPhotoSpace?.(event.target);
      },
      true,
    );
    doc.addEventListener(
      "dblclick",
      (event) => {
        if (insideEditing(event.target) || !isElement(event.target)) return;
        event.preventDefault();
        handlers.current.onEdit?.(event.target, {
          x: event.clientX,
          y: event.clientY,
        });
      },
      true,
    );
    for (const type of ["auxclick", "submit", "dragstart"])
      doc.addEventListener(type, (event) => event.preventDefault(), true);
    doc.addEventListener("pointermove", (event) => {
      const target = targetOf(event.target);
      const key = target ? `${target.kind}:${target.id}` : null;
      if (key === hovered) return;
      hovered = key;
      cancelAnimationFrame(frameRequest);
      frameRequest = requestAnimationFrame(() =>
        handlers.current.onHover(target),
      );
    });
    doc.documentElement.addEventListener("pointerleave", () => {
      hovered = null;
      handlers.current.onHover(null);
    });
    // Shortcuts pressed while the preview has focus reach the Estudio;
    // keys typed on the page itself belong to that text.
    doc.addEventListener("keydown", (event) => {
      if (insideEditing(event.target)) return;
      const forwarded = new KeyboardEvent("keydown", {
        key: event.key,
        code: event.code,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        shiftKey: event.shiftKey,
        altKey: event.altKey,
        bubbles: true,
        cancelable: true,
      });
      if (!document.body.dispatchEvent(forwarded)) event.preventDefault();
    });
    // The page scrolls inside its viewport; boxes follow it. Images and
    // webfonts change the layout once they arrive.
    doc.addEventListener("scroll", relayout, { passive: true });
    doc.addEventListener("load", relayout, true);
    doc.fonts?.addEventListener("loadingdone", relayout);
    observeBody(doc);

    handlers.current.onDocument(doc);
    if (latest.current !== initialHtml) patch(latest.current);
    else relayout();
  }

  return (
    <iframe
      className="es-frame"
      onLoad={onLoad}
      ref={ref}
      // Same origin so the Estudio can read the layout; never scripts.
      sandbox="allow-same-origin"
      srcDoc={initialHtml}
      style={{ width, height }}
      tabIndex={-1}
      title={title}
    />
  );
}
