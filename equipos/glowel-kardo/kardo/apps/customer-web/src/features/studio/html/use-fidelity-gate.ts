import type { DesignableExperienceType, PageDesign } from "@kardo/contracts";
import { useEffect, useRef, useState } from "react";
import { loadHtmlBlockRenderer } from "../preview/html-blocks.js";
import {
  type ElementSize,
  type FidelityIssue,
  type FidelityMeasurement,
  type FidelityModule,
  fidelityIssues,
  fidelityModulesOf,
} from "./fidelity.js";
import type { SyncPlan } from "./to-design.js";

/**
 * The DOM side of "no llevar a bloques lo que no se interpreta bien": for
 * every module `fidelityModulesOf` finds, renders it isolated — exactly as
 * `@kardo/page-render`'s `htmlBlockRenderer` would, inside a hidden iframe at
 * the same width as the live HTML preview — and compares its size against
 * the same `data-block-id` element in that live preview (`liveHtml`, the
 * full custom-html document string). Browser-only; a `null` result (not
 * "ready") outside one.
 */

/** A flow column's usual width (the phone minus its default page padding),
 * used for both the live and the isolated render so only the rendering
 * context — not the viewport — can explain a size difference. */
const CHECK_WIDTH = 342;
const CHECK_HEIGHT = 1400;

export type FidelityGateStatus = "idle" | "checking" | "ready";
export type FidelityGateResult = {
  status: FidelityGateStatus;
  issues: readonly FidelityIssue[];
};

function escapeAttr(value: string): string {
  return value.replace(/"/g, "&quot;");
}

/** `querySelector`, but it also looks inside every declarative shadow root
 * it finds along the way: the full custom-html document wraps its body in
 * `.kd-custom-host`'s shadow root, and an isolated `html` block in
 * `.kd-html-host`'s — both from `@kardo/page-render`'s own markup. */
function deepQuerySelector(root: ParentNode, selector: string): Element | null {
  const direct = root.querySelector(selector);
  if (direct) return direct;
  for (const host of root.querySelectorAll("*")) {
    const shadowRoot = (host as Element & { shadowRoot?: ShadowRoot | null })
      .shadowRoot;
    if (!shadowRoot) continue;
    const found = deepQuerySelector(shadowRoot, selector);
    if (found) return found;
  }
  return null;
}

function measureIn(doc: Document, blockId: string): ElementSize | null {
  const selector = `[data-block-id="${escapeAttr(blockId)}"]`;
  const element = deepQuerySelector(doc, selector);
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  return { width: rect.width, height: rect.height };
}

function mountHidden(
  html: string,
): Promise<{ doc: Document; cleanup: () => void } | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve(null);
      return;
    }
    const iframe = document.createElement("iframe");
    iframe.setAttribute("aria-hidden", "true");
    iframe.setAttribute("tabindex", "-1");
    iframe.style.cssText = `position:fixed;left:-9999px;top:0;width:${CHECK_WIDTH}px;height:${CHECK_HEIGHT}px;border:0;visibility:hidden;pointer-events:none;`;
    try {
      iframe.sandbox.add("allow-same-origin");
    } catch {
      // Older browsers without DOMTokenList#add on `sandbox` just get no
      // sandbox for this throwaway, off-screen document.
    }
    iframe.addEventListener(
      "load",
      () => {
        const idoc = iframe.contentDocument;
        if (!idoc) {
          iframe.remove();
          resolve(null);
          return;
        }
        resolve({ doc: idoc, cleanup: () => iframe.remove() });
      },
      { once: true },
    );
    // `srcdoc` must be set before the iframe joins the document: appending
    // it first starts an initial `about:blank` navigation whose own `load`
    // can fire before the real document is ready, resolving this with an
    // empty body.
    iframe.srcdoc = html;
    document.body.append(iframe);
  });
}

async function measureModules(
  modules: readonly FidelityModule[],
  liveHtml: string,
  resolveImage: (ref: string) => string | null,
): Promise<FidelityIssue[]> {
  if (!modules.length) return [];
  const factory = await loadHtmlBlockRenderer();
  if (!factory) return [];
  const render = factory(resolveImage);

  const live = await mountHidden(liveHtml);
  if (!live) return [];
  try {
    const measurements: FidelityMeasurement[] = [];
    for (const module of modules) {
      const hostHtml = render(module.html, module.css) ?? "";
      const isolatedDoc = `<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0}</style></head><body>${hostHtml}</body></html>`;
      const isolated = await mountHidden(isolatedDoc);
      if (!isolated) continue;
      try {
        const liveBox = measureIn(live.doc, module.blockId);
        const isolatedBox = measureIn(isolated.doc, module.blockId);
        if (liveBox && isolatedBox)
          measurements.push({
            ...module,
            live: liveBox,
            isolated: isolatedBox,
          });
      } finally {
        isolated.cleanup();
      }
    }
    return fidelityIssues(measurements);
  } finally {
    live.cleanup();
  }
}

/**
 * Runs the check whenever `plan` changes (set right when the person tries to
 * switch from HTML to Bloques with unsynced edits); `null` keeps it idle —
 * nothing is measured until there is something to measure.
 */
export function useFidelityGate(
  plan: SyncPlan | null,
  oldDesign: PageDesign,
  type: DesignableExperienceType,
  liveHtml: string,
  resolveImage: (ref: string) => string | null,
): FidelityGateResult {
  const [result, setResult] = useState<FidelityGateResult>({
    status: "idle",
    issues: [],
  });
  const token = useRef(0);

  useEffect(() => {
    if (!plan) {
      setResult({ status: "idle", issues: [] });
      return;
    }
    const modules = fidelityModulesOf(oldDesign, plan, type);
    if (!modules.length || typeof document === "undefined") {
      setResult({ status: "ready", issues: [] });
      return;
    }
    token.current += 1;
    const mine = token.current;
    setResult({ status: "checking", issues: [] });
    void measureModules(modules, liveHtml, resolveImage).then((issues) => {
      if (token.current === mine) setResult({ status: "ready", issues });
    });
  }, [plan, oldDesign, type, liveHtml, resolveImage]);

  return result;
}
