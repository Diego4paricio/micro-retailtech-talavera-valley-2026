import {
  DESIGN_LIMITS,
  type DesignableExperienceType,
  type DesignBlock,
  type ExperienceContent,
  type TextRun,
} from "@kardo/contracts";

/**
 * Writing on the page itself ("edición directa"): a double click (or Enter)
 * turns a text of the live preview into `contenteditable` in place, so the
 * person types with the page's own font, size and wrapping. Nothing is
 * written to the design while typing; the text is read back once, when the
 * person confirms (Enter on one-line texts, a click outside, Tab), as one
 * undo step. Escape puts the text back as it was.
 *
 * The preview is a sandboxed iframe without scripts: editing a text there
 * is a browser feature, and every listener here runs in the Estudio.
 */

/** A text of the Experience's content shown by a bound block. */
export type ContentTextKey =
  | "title"
  | "description"
  | "displayName"
  | "headline"
  | "biography"
  | "bio";

export type InlineField =
  | {
      on: "block";
      blockId: string;
      kind: "heading" | "text" | "button" | "brandButton";
    }
  | { on: "content"; blockId: string; key: ContentTextKey };

/** Limits and behavior of each field (the contract's and the content's). */
export function fieldRules(field: InlineField): {
  max: number;
  required: boolean;
  multiline: boolean;
  rich: boolean;
  label: string;
} {
  if (field.on === "block")
    switch (field.kind) {
      case "heading":
        return {
          max: 160,
          required: true,
          multiline: false,
          rich: false,
          label: "El título",
        };
      case "text":
        return {
          max: DESIGN_LIMITS.textChars,
          required: true,
          multiline: true,
          rich: true,
          label: "El texto",
        };
      default:
        return {
          max: 60,
          required: true,
          multiline: false,
          rich: false,
          label: "El texto del botón",
        };
    }
  switch (field.key) {
    case "title":
      return {
        max: 120,
        required: true,
        multiline: false,
        rich: false,
        label: "El título",
      };
    case "displayName":
      return {
        max: 120,
        required: true,
        multiline: false,
        rich: false,
        label: "El nombre",
      };
    case "description":
      return {
        max: 500,
        required: false,
        multiline: false,
        rich: false,
        label: "La descripción",
      };
    case "headline":
      return {
        max: 160,
        required: false,
        multiline: false,
        rich: false,
        label: "La frase",
      };
    case "biography":
      return {
        max: 1_000,
        required: false,
        multiline: true,
        rich: false,
        label: "La biografía",
      };
    case "bio":
      return {
        max: 300,
        required: false,
        multiline: true,
        rich: false,
        label: "La descripción",
      };
  }
}

type ElementLike = {
  closest: (selector: string) => ElementLike | null;
  querySelector: (selector: string) => ElementLike | null;
};

/**
 * What writing on `block` edits, and where on the page: the block's own
 * text, or the content text of a bound block under `clicked` (the title or
 * the description of the page, the name, the phrase or the bio). `null`
 * when the block has nothing to write on the page.
 */
export function inlineFieldFor<E extends ElementLike>(
  block: DesignBlock,
  type: DesignableExperienceType,
  blockElement: E,
  clicked?: E | null,
): { field: InlineField; element: E } | null {
  const within = (selector: string): E | null => {
    const hit = clicked?.closest(selector) as E | null | undefined;
    return hit && hit.closest("[data-block-id]") === blockElement ? hit : null;
  };
  switch (block.kind) {
    case "heading":
    case "text":
    case "button":
      return {
        field: { on: "block", blockId: block.id, kind: block.kind },
        element: blockElement,
      };
    case "brandButton": {
      const label = blockElement.querySelector(".kd-brand-label") as E | null;
      return label
        ? {
            field: { on: "block", blockId: block.id, kind: "brandButton" },
            element: label,
          }
        : null;
    }
    case "contentTitle": {
      const description = within(".kd-content-title-description");
      if (description)
        return {
          field: { on: "content", blockId: block.id, key: "description" },
          element: description,
        };
      const title = blockElement.querySelector(".kd-heading") as E | null;
      return title
        ? {
            field: { on: "content", blockId: block.id, key: "title" },
            element: title,
          }
        : null;
    }
    case "profileHeader": {
      const headline = within(".kd-profile-headline");
      if (headline && type === "profile")
        return {
          field: { on: "content", blockId: block.id, key: "headline" },
          element: headline,
        };
      const bio = within(".kd-profile-bio");
      if (bio)
        return {
          field: {
            on: "content",
            blockId: block.id,
            key: type === "linkpage" ? "bio" : "biography",
          },
          element: bio,
        };
      const name = blockElement.querySelector(
        ".kd-profile-text .kd-heading",
      ) as E | null;
      return name
        ? {
            field: { on: "content", blockId: block.id, key: "displayName" },
            element: name,
          }
        : null;
    }
    default:
      return null;
  }
}

/** Kinds whose text can be written on the page. */
export function writesOnPage(kind: DesignBlock["kind"]): boolean {
  return (
    kind === "heading" ||
    kind === "text" ||
    kind === "button" ||
    kind === "brandButton" ||
    kind === "contentTitle" ||
    kind === "profileHeader"
  );
}

// ---------------------------------------------------------------------------
// Reading an edited text back (runs), without relying on `instanceof`: the
// nodes live in the preview iframe's realm.
// ---------------------------------------------------------------------------

export type NodeLike = {
  nodeType: number;
  nodeName: string;
  textContent: string | null;
  childNodes: ArrayLike<NodeLike>;
  getAttribute?: ((name: string) => string | null) | undefined;
};

type Marks = { bold?: boolean; italic?: boolean; href?: string };

function sameMarks(a: Marks, b: Marks): boolean {
  return (
    Boolean(a.bold) === Boolean(b.bold) &&
    Boolean(a.italic) === Boolean(b.italic) &&
    a.href === b.href
  );
}

function styleMarks(style: string, marks: Marks): Marks {
  const next = { ...marks };
  const weight = /font-weight\s*:\s*([a-z0-9]+)/i.exec(style)?.[1];
  if (weight)
    next.bold =
      weight === "bold" || weight === "bolder" || Number(weight) >= 600;
  const fontStyle = /font-style\s*:\s*([a-z]+)/i.exec(style)?.[1];
  if (fontStyle)
    next.italic = fontStyle === "italic" || fontStyle === "oblique";
  return next;
}

/** The edited text as runs: bold, italics and links kept, `<br>` and new
 * paragraphs as line breaks, adjacent runs with the same marks merged. */
export function readEditableRuns(root: NodeLike): TextRun[] {
  const runs: (Marks & { text: string })[] = [];
  const push = (text: string, marks: Marks) => {
    if (!text) return;
    const last = runs.at(-1);
    if (last && sameMarks(last, marks)) {
      last.text += text;
      return;
    }
    runs.push({ text, ...marks });
  };
  const walk = (node: NodeLike, marks: Marks, first: boolean) => {
    if (node.nodeType === 3) {
      push(node.textContent ?? "", marks);
      return;
    }
    if (node.nodeType !== 1) return;
    const tag = node.nodeName.toUpperCase();
    if (tag === "BR") {
      push("\n", marks);
      return;
    }
    // Chrome wraps new lines in <div> when Enter slips through.
    if ((tag === "DIV" || tag === "P") && !first) push("\n", marks);
    let next: Marks = { ...marks };
    if (tag === "B" || tag === "STRONG") next.bold = true;
    if (tag === "I" || tag === "EM") next.italic = true;
    if (tag === "A") {
      const href = node.getAttribute?.("href");
      if (href) next.href = href;
    }
    const style = node.getAttribute?.("style");
    if (style) next = styleMarks(style, next);
    for (let index = 0; index < node.childNodes.length; index += 1) {
      const child = node.childNodes[index];
      if (child) walk(child, next, index === 0);
    }
  };
  for (let index = 0; index < root.childNodes.length; index += 1) {
    const child = root.childNodes[index];
    if (child) walk(child, {}, index === 0);
  }
  // A trailing line break is how editors keep the caret on an empty last
  // line; it is not part of the text.
  const last = runs.at(-1);
  if (last?.text.endsWith("\n")) {
    last.text = last.text.slice(0, -1);
    if (!last.text) runs.pop();
  }
  return runs.map(({ text, bold, italic, href }) => ({
    text,
    ...(bold ? { bold: true } : {}),
    ...(italic ? { italic: true } : {}),
    ...(href ? { href } : {}),
  }));
}

/** The edited text without marks (line breaks kept). */
export function readEditableText(root: NodeLike): string {
  return readEditableRuns(root)
    .map((run) => run.text)
    .join("");
}

/** Keeps runs inside the contract: at most `DESIGN_LIMITS.textRuns` (the
 * rest merged into the last one) and `max` characters in total. */
export function limitRuns(
  runs: readonly TextRun[],
  max: number = DESIGN_LIMITS.textChars,
): TextRun[] {
  const limited: TextRun[] = [];
  let total = 0;
  for (const run of runs) {
    if (total >= max) break;
    const text = run.text.slice(0, max - total);
    total += text.length;
    if (limited.length >= DESIGN_LIMITS.textRuns) {
      const last = limited.at(-1);
      if (last) last.text += text;
      continue;
    }
    limited.push({ ...run, text });
  }
  return limited.filter((run) => run.text.length > 0);
}

/** The value a content text takes (`undefined` removes an optional one). */
export function withContentText(
  content: ExperienceContent,
  key: ContentTextKey,
  value: string,
): ExperienceContent {
  const next = { ...(content as Record<string, unknown>) };
  if (value) next[key] = value;
  else delete next[key];
  return next as ExperienceContent;
}

/** The current value of a content text. */
export function contentText(
  content: ExperienceContent,
  key: ContentTextKey,
): string {
  const value = (content as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

// ---------------------------------------------------------------------------
// The editing session inside the preview document.
// ---------------------------------------------------------------------------

export type InlineSession = {
  commit: () => void;
  cancel: () => void;
  element: HTMLElement;
};

export type InlineResult = { text: string; runs: TextRun[] };

/**
 * Makes `element` of the preview editable and focuses it. `onCommit`
 * receives what was written when the person confirms (and says whether it
 * was kept); `onEnd` runs after a commit or a cancel, once the element is
 * back to normal.
 */
export function beginInlineEdit({
  element,
  rich,
  multiline,
  point,
  selectAll,
  onCommit,
  onEnd,
  onSave,
}: {
  element: HTMLElement;
  rich: boolean;
  multiline: boolean;
  /** Where a double click happened (preview client px): the caret goes
   * there. */
  point?: { x: number; y: number } | null | undefined;
  selectAll: boolean;
  /** Returns whether the text was kept. */
  onCommit: (result: InlineResult) => boolean;
  onEnd: () => void;
  /** ⌘S while writing: confirm, then save. */
  onSave: () => void;
}): InlineSession {
  const doc = element.ownerDocument;
  const view = doc.defaultView;
  const original = element.innerHTML;
  let done = false;

  element.setAttribute("data-es-editing", "");
  element.setAttribute("contenteditable", rich ? "true" : "plaintext-only");
  // Browsers without plaintext-only fall back to plain `true` (pasting is
  // plain text below anyway, and marks are ignored on reading).
  if (element.contentEditable !== "plaintext-only" && !rich)
    element.setAttribute("contenteditable", "true");
  element.setAttribute("spellcheck", "true");
  if (rich) {
    try {
      doc.execCommand("styleWithCSS", false, "false");
    } catch {
      // Older engines: marks come as tags anyway.
    }
  }

  const finish = (commit: boolean) => {
    if (done) return;
    done = true;
    element.removeEventListener("keydown", onKeyDown);
    element.removeEventListener("paste", onPaste);
    element.removeEventListener("focusout", onFocusOut);
    view?.removeEventListener("blur", onWindowBlur);
    const runs = readEditableRuns(element as unknown as NodeLike);
    const text = runs.map((run) => run.text).join("");
    element.removeAttribute("contenteditable");
    element.removeAttribute("data-es-editing");
    element.removeAttribute("spellcheck");
    view?.getSelection()?.removeAllRanges();
    // A text that cannot be kept (an empty title) goes back as it was.
    const kept = commit && onCommit({ text, runs });
    if (!kept) element.innerHTML = original;
    onEnd();
  };

  const onKeyDown = (event: KeyboardEvent) => {
    event.stopPropagation();
    const mod = event.metaKey || event.ctrlKey;
    if (event.key === "Escape") {
      event.preventDefault();
      finish(false);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      finish(true);
      return;
    }
    if (event.key === "Enter" && !event.isComposing) {
      event.preventDefault();
      if (!multiline || mod) {
        finish(true);
        return;
      }
      doc.execCommand("insertLineBreak");
      return;
    }
    if (mod && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "s") {
        event.preventDefault();
        finish(true);
        onSave();
        return;
      }
      if (key === "b" || key === "i" || key === "u") {
        event.preventDefault();
        if (rich && key !== "u")
          doc.execCommand(key === "b" ? "bold" : "italic");
      }
    }
  };

  const onPaste = (event: ClipboardEvent) => {
    event.preventDefault();
    const text = event.clipboardData?.getData("text/plain") ?? "";
    const clean = multiline ? text : text.replace(/\s*\n\s*/g, " ");
    doc.execCommand("insertText", false, clean);
  };

  // Focus leaving the text (a click elsewhere on the page or in the panel)
  // confirms it. The check waits a tick so Escape wins over the blur.
  const onFocusOut = () => {
    window.setTimeout(() => {
      if (!done && doc.activeElement !== element) finish(true);
    }, 0);
  };
  const onWindowBlur = () => {
    window.setTimeout(() => finish(true), 0);
  };

  element.addEventListener("keydown", onKeyDown);
  element.addEventListener("paste", onPaste);
  element.addEventListener("focusout", onFocusOut);
  view?.addEventListener("blur", onWindowBlur);

  element.focus({ preventScroll: true });
  const selection = view?.getSelection();
  if (selection) {
    const caret =
      !selectAll && point
        ? (
            doc as Document & {
              caretRangeFromPoint?: (x: number, y: number) => Range | null;
            }
          ).caretRangeFromPoint?.(point.x, point.y)
        : null;
    if (caret && element.contains(caret.startContainer)) {
      selection.removeAllRanges();
      selection.addRange(caret);
    } else {
      const range = doc.createRange();
      range.selectNodeContents(element);
      if (!selectAll) range.collapse(false);
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  return {
    element,
    commit: () => finish(true),
    cancel: () => finish(false),
  };
}
