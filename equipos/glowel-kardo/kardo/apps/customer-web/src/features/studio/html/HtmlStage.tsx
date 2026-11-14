import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  DesktopFrame,
  PhoneFrame,
  type ScreenTone,
  toneFromBackground,
} from "../stage/DeviceFrame.js";
import type { Zoom } from "../stage/Stage.js";
import {
  bothScales,
  type DesktopWidth,
  type Device,
  desktopViewport,
  fitScale,
  phoneViewport,
  type Viewport,
} from "../stage/viewports.js";

/** Preview-only touches: no text selection, links never look draggable,
 * and no scrollbar taking width from the page (it scrolls inside its real
 * viewport, like on a phone). */
const frameCss =
  "html{scrollbar-width:none}html::-webkit-scrollbar{display:none}body{user-select:none;-webkit-user-select:none}a,img{-webkit-user-drag:none}";

/**
 * Best-effort status bar tone for modo HTML: there is no `PageDesign` here
 * (only raw html/css), so the color comes straight off the rendered page's
 * own `--kd-background` custom property (`@kardo/page-render`'s `pageCss`,
 * always present), falling back to white when it cannot be found (e.g. the
 * page failed to render).
 */
function toneFromHtml(html: string): ScreenTone {
  const match = /--kd-background:\s*(#[0-9a-fA-F]{6})/.exec(html);
  return toneFromBackground(match?.[1] ?? "#ffffff");
}

/**
 * The live page of the modo HTML, in the exact same device frame as Bloques
 * (`stage/DeviceFrame.tsx`): a phone with its status bar, island and home
 * indicator, or a computer window with its browser bar at the real width,
 * scaled to fit — same device, desktop-width and zoom controls too (the
 * Estudio's header, `StudioBar`'s `ViewTools`, drives all three; this
 * component only draws what they choose). The page renders at the device's
 * real screen size (so `100vh` and `@media` rules behave as on that screen)
 * and is scaled to fit its column, centered. The document is a sandboxed
 * `srcdoc` without scripts; later renders are patched in place (the body
 * through `setHTMLUnsafe`, so the page's declarative shadow root is kept) so
 * the preview never flickers or loses its scroll.
 */
export function HtmlStage({
  html,
  title,
  device,
  desktopWidth,
  zoom,
  onFitChange,
}: {
  html: string;
  title: string;
  device: Device;
  desktopWidth: DesktopWidth;
  zoom: Zoom;
  /** The scale that fits the stage, shown next to the zoom controls. */
  onFitChange: (fit: number) => void;
}) {
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

  const tone = toneFromHtml(html);

  const views: {
    kind: "phone" | "desktop";
    viewport: Viewport;
    scale: number;
  }[] = both
    ? [
        { kind: "desktop", viewport: desktop, scale: scales.desktop },
        { kind: "phone", viewport: phoneViewport, scale: scales.phone },
      ]
    : [
        {
          kind: single ?? "phone",
          viewport: single === "desktop" ? desktop : phoneViewport,
          scale,
        },
      ];

  return (
    <section
      aria-label="Vista previa de tu HTML"
      className="es-stage-main esh-stage"
    >
      <div className="es-stage">
        <div className="es-stage-viewport" ref={viewportRef}>
          <div className="es-device-row" data-views={views.length}>
            {views.map((view) =>
              view.kind === "phone" ? (
                <PhoneFrame key="phone" primary scale={view.scale} tone={tone}>
                  <HtmlFrame
                    height={view.viewport.height}
                    html={html}
                    title={`Vista previa de ${title} en celular`}
                    width={view.viewport.width}
                  />
                </PhoneFrame>
              ) : (
                <DesktopFrame
                  key="desktop"
                  primary={!both}
                  scale={view.scale}
                  title={title}
                  viewport={view.viewport}
                >
                  <HtmlFrame
                    height={view.viewport.height}
                    html={html}
                    title={`Vista previa de ${title} en computadora`}
                    width={view.viewport.width}
                  />
                </DesktopFrame>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function parts(html: string): { head: string; body: string } | null {
  const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html);
  const body = /<body[^>]*>([\s\S]*)<\/body>/i.exec(html);
  return head && body ? { head: head[1] ?? "", body: body[1] ?? "" } : null;
}

function HtmlFrame({
  html,
  width,
  height,
  title,
}: {
  html: string;
  width: number;
  height: number;
  title: string;
}): ReactNode {
  const ref = useRef<HTMLIFrameElement>(null);
  // The first document (and the rare full reload) goes through `srcdoc`.
  const [srcDoc, setSrcDoc] = useState(html);
  const latest = useRef(html);
  latest.current = html;
  const applied = useRef<string | null>(null);
  const headKey = useRef<string | null>(null);

  const patch = useCallback((next: string) => {
    const doc = ref.current?.contentDocument;
    if (!doc?.body || applied.current === next) return;
    const body = doc.body as HTMLElement & {
      setHTMLUnsafe?: (value: string) => void;
    };
    const split = parts(next);
    if (!split || typeof body.setHTMLUnsafe !== "function") {
      // No in-place patching here: reload the whole document.
      applied.current = next;
      setSrcDoc(next);
      return;
    }
    if (split.head !== headKey.current) {
      doc.head.innerHTML = split.head;
      const style = doc.createElement("style");
      style.textContent = frameCss;
      doc.head.append(style);
      headKey.current = split.head;
    }
    body.setHTMLUnsafe(split.body);
    applied.current = next;
  }, []);

  useEffect(() => {
    if (applied.current !== null) patch(html);
  }, [html, patch]);

  function onLoad() {
    const doc = ref.current?.contentDocument;
    if (!doc) return;
    applied.current = srcDoc;
    headKey.current = parts(srcDoc)?.head ?? null;
    const style = doc.createElement("style");
    style.textContent = frameCss;
    doc.head.append(style);
    for (const type of ["click", "auxclick", "submit", "dragstart"])
      doc.addEventListener(type, (event) => event.preventDefault(), true);
    // Shortcuts pressed while the preview has focus reach the Estudio.
    doc.addEventListener("keydown", (event) => {
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
    if (latest.current !== srcDoc) patch(latest.current);
  }

  return (
    <iframe
      className="es-frame"
      onLoad={onLoad}
      ref={ref}
      // Same origin so the Estudio can patch it; never scripts.
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      style={{ width, height }}
      tabIndex={-1}
      title={title}
    />
  );
}
