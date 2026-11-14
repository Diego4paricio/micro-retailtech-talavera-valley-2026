import type {
  CustomHtml,
  DesignableExperienceType,
  ExperienceContent,
  PageDesign,
} from "@kardo/contracts";
import { useCallback, useState } from "react";
import { stableKey } from "../../../lib/history.js";
import type { DesignHistory } from "../../../lib/use-design-history.js";
import { designToCustomCode } from "./from-design.js";

/**
 * Bloques ↔ HTML sync of the Estudio, out of `DesignStudio` (domain audit
 * A2-43 i), behavior unchanged.
 *
 * `GeneratedBaseline` remembers the last html/css the Estudio knows came
 * straight from the blocks design (`derived: true`), and at what design
 * state, so entering modo HTML can tell "never touched" (safe to silently
 * refresh) from "hand-edited" (never overwritten without asking) apart.
 * `derived: false` marks a baseline the person explicitly chose to keep
 * ("Mantener mi HTML"): a bookmark for "has the design moved since", not a
 * value safe to silently replace.
 */
export type GeneratedBaseline = {
  designKey: string;
  html: string;
  css: string;
  derived: boolean;
};

const isBlank = (code: { html: string; css: string }) =>
  !code.html.trim() && !code.css.trim();

/** The baseline a saved HTML starts with: only when what is saved is exactly
 * what the saved blocks generate (so it was never hand-edited). */
export function initialGeneratedBaseline(input: {
  htmlMode: boolean;
  type: DesignableExperienceType;
  content: ExperienceContent;
  design: PageDesign;
  savedCustomHtml: CustomHtml | null;
}): GeneratedBaseline | null {
  if (!input.htmlMode) return null;
  const saved = input.savedCustomHtml;
  if (!saved || isBlank(saved)) return null;
  const generated = designToCustomCode(input.type, input.content, input.design);
  if (saved.html !== generated.html || saved.css !== generated.css) return null;
  return {
    designKey: stableKey(input.design),
    html: generated.html,
    css: generated.css,
    derived: true,
  };
}

export type EnterSync = {
  /** Put the generated code in the editor (as one undo step). */
  fillEditor: boolean;
  /** The new baseline, when entering changes it. */
  baseline: GeneratedBaseline | null;
  /** The blocks moved on since a hand-edited HTML (shows the banner). */
  blocksChanged: boolean;
};

/**
 * What entering modo HTML does: fills a blank editor from the blocks (never
 * starts clean), silently refreshes html nobody touched when the blocks
 * moved on since, and otherwise flags a stale, hand-edited html for the
 * banner — it never overwrites a hand edit itself.
 */
export function decideEnterSync(input: {
  generated: { html: string; css: string };
  designKey: string;
  customHtml: { html: string; css: string };
  baseline: GeneratedBaseline | null;
}): EnterSync {
  const { generated, designKey, customHtml, baseline } = input;
  const fresh: GeneratedBaseline = {
    designKey,
    html: generated.html,
    css: generated.css,
    derived: true,
  };
  const blank = isBlank(customHtml);
  const sameAsGenerated =
    customHtml.html === generated.html && customHtml.css === generated.css;
  if (blank || sameAsGenerated)
    return { fillEditor: blank, baseline: fresh, blocksChanged: false };
  if (
    baseline?.derived &&
    customHtml.html === baseline.html &&
    customHtml.css === baseline.css &&
    baseline.designKey !== designKey
  )
    return { fillEditor: true, baseline: fresh, blocksChanged: false };
  return {
    fillEditor: false,
    baseline: null,
    blocksChanged: baseline ? baseline.designKey !== designKey : false,
  };
}

/** The sync state and its three actions: on entering modo HTML, "Generar
 * desde bloques" / "Traer los cambios de bloques", and "Mantener mi HTML". */
export function useBlocksHtmlSync({
  type,
  content,
  design,
  customHtml,
  htmlHistory,
  initial,
  notify,
}: {
  type: DesignableExperienceType;
  content: ExperienceContent;
  design: PageDesign;
  customHtml: CustomHtml;
  htmlHistory: Pick<DesignHistory<CustomHtml>, "update" | "undo">;
  /** Computed once, when the Estudio opens. */
  initial: () => GeneratedBaseline | null;
  notify: (
    message: string,
    tone: "success",
    options: {
      action: { label: string; onClick: () => void };
      duration: number;
    },
  ) => void;
}) {
  const [baseline, setBaseline] = useState<GeneratedBaseline | null>(initial);
  const [blocksChangedSinceEdit, setBlocksChangedSinceEdit] = useState(false);
  const { update, undo } = htmlHistory;

  /** Runs whenever the Estudio shows modo HTML (switching to it, or opening
   * straight into it). */
  const syncHtmlOnEnter = useCallback(() => {
    const generated = designToCustomCode(type, content, design);
    const decision = decideEnterSync({
      generated,
      designKey: stableKey(design),
      customHtml,
      baseline,
    });
    if (decision.fillEditor)
      update(
        (current) => ({ ...current, html: generated.html, css: generated.css }),
        "html:autofill",
      );
    if (decision.baseline) setBaseline(decision.baseline);
    setBlocksChangedSinceEdit(decision.blocksChanged);
  }, [type, content, design, customHtml, baseline, update]);

  /** Forces the editor back in sync with the current blocks, as one undoable
   * step. */
  const generateHtmlFromBlocks = useCallback(() => {
    const generated = designToCustomCode(type, content, design);
    update(
      (current) => ({ ...current, html: generated.html, css: generated.css }),
      "html:from-blocks",
    );
    setBaseline({
      designKey: stableKey(design),
      html: generated.html,
      css: generated.css,
      derived: true,
    });
    setBlocksChangedSinceEdit(false);
    notify("Listo: generamos tu HTML desde tus bloques.", "success", {
      action: { label: "Deshacer", onClick: undo },
      duration: 8_000,
    });
  }, [type, content, design, update, undo, notify]);

  /** Dismisses the stale-blocks banner without touching the editor; the
   * design is bookmarked so the banner only comes back once the blocks move
   * again. */
  const keepCurrentHtml = useCallback(() => {
    setBaseline({
      designKey: stableKey(design),
      html: customHtml.html,
      css: customHtml.css,
      derived: false,
    });
    setBlocksChangedSinceEdit(false);
  }, [design, customHtml]);

  return {
    syncHtmlOnEnter,
    generateHtmlFromBlocks,
    keepCurrentHtml,
    blocksChangedSinceEdit,
  };
}
