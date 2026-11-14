import type { QrDesign } from "@kardo/contracts";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import {
  buildQr,
  type LegibilityReport,
  type LogoRaster,
  type QrBuild,
  type Scene,
  sceneToSvg,
  verifyLegibility,
} from "../engine/index.js";

export { useMediaQuery } from "../../../../lib/use-media-query.js";

export type BuildResult =
  | { ok: true; build: QrBuild; svg: string }
  | { ok: false; error: string };

/** Builds the scene and its SVG; a failing engine never breaks the page. */
export function buildDesign(input: {
  url: string;
  design: QrDesign;
  logo: LogoRaster | null;
  nombre: string;
  title?: string | undefined;
}): BuildResult {
  try {
    const build = buildQr({
      url: input.url,
      design: input.design,
      logo: input.logo,
      variables: { nombre: input.nombre },
    });
    const svg = sceneToSvg(
      build.scene,
      input.title ? { title: input.title } : undefined,
    );
    return { ok: true, build, svg };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error && error.message
          ? error.message
          : "No pudimos generar el código.",
    };
  }
}

/**
 * The live build of the design being edited. It follows a deferred copy of
 * the design so dragging a slider never blocks the control itself.
 */
export function useQrBuild(input: {
  url: string;
  design: QrDesign;
  logo: LogoRaster | null;
  nombre: string;
}): BuildResult {
  const design = useDeferredValue(input.design);
  const { url, logo, nombre } = input;
  return useMemo(
    () => buildDesign({ url, design, logo, nombre }),
    [url, design, logo, nombre],
  );
}

export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export type LegibilityState = {
  status: "idle" | "checking" | "done" | "error";
  /** The last finished report, kept while a new check runs (no flicker). */
  report: LegibilityReport | null;
  /** The scene `report` belongs to. */
  scene: Scene | null;
};

/** Decodes the scene the way a camera would, ~200 ms after the last change. */
export function useLegibility(
  scene: Scene | null,
  url: string,
): LegibilityState {
  const [state, setState] = useState<LegibilityState>({
    status: "idle",
    report: null,
    scene: null,
  });

  useEffect(() => {
    if (!scene) {
      setState({ status: "idle", report: null, scene: null });
      return;
    }
    setState((current) => ({ ...current, status: "checking" }));
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      verifyLegibility(scene, url, { signal: controller.signal })
        .then((report) => {
          if (!controller.signal.aborted)
            setState({ status: "done", report, scene });
        })
        .catch(() => {
          if (!controller.signal.aborted)
            setState({ status: "error", report: null, scene });
        });
    }, 200);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [scene, url]);

  return state;
}

/**
 * Computes a value after the browser is idle (thumbnails): the section opens
 * at once and its previews fill in right after.
 */
export function useIdleValue<T>(compute: () => T, key: string): T | null {
  const [value, setValue] = useState<T | null>(null);
  const computeRef = useRef(compute);
  computeRef.current = compute;
  useEffect(() => {
    void key; // Recompute whenever the inputs described by `key` change.
    let cancelled = false;
    const run = () => {
      if (!cancelled) setValue(() => computeRef.current());
    };
    if (typeof window.requestIdleCallback === "function") {
      const handle = window.requestIdleCallback(run, { timeout: 400 });
      return () => {
        cancelled = true;
        window.cancelIdleCallback(handle);
      };
    }
    const timer = window.setTimeout(run, 16);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);
  // The previous value stays on screen while the new one is computed.
  return value;
}
