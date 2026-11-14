import { useEffect, useMemo, useState } from "react";
import type { HtmlBlockRender } from "./renderer.js";

type Factory = (
  resolveImage: (ref: string) => string | null,
) => HtmlBlockRender;

let factory: Factory | null = null;
let loading: Promise<Factory | null> | null = null;

/** Loads the `html` block renderer once (a separate chunk). */
export function loadHtmlBlockRenderer(): Promise<Factory | null> {
  loading ??= import("./html-block-engine.js")
    .then((module) => {
      factory = module.htmlBlockRenderer;
      return factory;
    })
    .catch(() => {
      loading = null;
      return null;
    });
  return loading;
}

/**
 * The `ctx.renderHtmlBlock` of the preview: loaded only when the design has
 * `html` blocks; until it arrives those blocks draw a placeholder and the
 * preview renders again when it does.
 */
export function useHtmlBlockRenderer(
  needed: boolean,
  resolveImage: (ref: string) => string | null,
): HtmlBlockRender | undefined {
  const [ready, setReady] = useState<Factory | null>(() => factory);
  useEffect(() => {
    if (!needed || ready) return;
    let cancelled = false;
    void loadHtmlBlockRenderer().then((loaded) => {
      if (loaded && !cancelled) setReady(() => loaded);
    });
    return () => {
      cancelled = true;
    };
  }, [needed, ready]);
  return useMemo(
    () => (needed && ready ? ready(resolveImage) : undefined),
    [needed, ready, resolveImage],
  );
}
