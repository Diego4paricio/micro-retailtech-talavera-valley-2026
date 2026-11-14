import {
  autocompletion,
  closeBrackets,
  closeBracketsKeymap,
  completionKeymap,
} from "@codemirror/autocomplete";
import { defaultKeymap, indentWithTab } from "@codemirror/commands";
import { css } from "@codemirror/lang-css";
import { html } from "@codemirror/lang-html";
import {
  bracketMatching,
  HighlightStyle,
  indentOnInput,
  syntaxHighlighting,
} from "@codemirror/language";
import { Annotation, Compartment, EditorState, Prec } from "@codemirror/state";
import {
  drawSelection,
  EditorView,
  highlightActiveLine,
  highlightActiveLineGutter,
  keymap,
  lineNumbers,
  placeholder,
} from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { type Ref, useEffect, useImperativeHandle, useRef } from "react";

/**
 * The code editor of the modo HTML (CodeMirror 6, loaded only when HTML
 * mode opens). Controlled: the Estudio's history owns the text, so ⌘Z in
 * the editor is the Estudio's undo (paste, AI results and inserts included),
 * and outside changes are applied as a minimal diff (the cursor stays put).
 */

export type CodeEditorHandle = {
  /** Replaces the selection with `text` and focuses the editor. */
  insert: (text: string) => void;
  focus: () => void;
  /** Re-measures after being shown (tabs keep both editors mounted). */
  refresh: () => void;
};

/** Marks transactions that come from the Estudio, not from typing. */
const external = Annotation.define<boolean>();

const theme = EditorView.theme({
  "&": {
    backgroundColor: "var(--surface)",
    color: "var(--ink)",
    fontSize: "13px",
    height: "100%",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily: "var(--font-mono)",
    lineHeight: "1.6",
    overscrollBehavior: "contain",
  },
  ".cm-content": { padding: "10px 0 40px", caretColor: "var(--teal)" },
  ".cm-line": { padding: "0 14px 0 10px" },
  ".cm-gutters": {
    backgroundColor: "var(--paper)",
    borderRight: "1px solid var(--line-warm)",
    color: "var(--text-faint)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    minWidth: "2.6em",
    padding: "0 8px 0 10px",
  },
  ".cm-activeLine": {
    backgroundColor: "color-mix(in srgb, var(--tint) 55%, transparent)",
  },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--tint)",
    color: "var(--teal-deep)",
  },
  "&.cm-focused .cm-cursor": { borderLeftColor: "var(--teal)" },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
    {
      backgroundColor:
        "color-mix(in srgb, var(--aqua) 30%, transparent) !important",
    },
  ".cm-matchingBracket": {
    backgroundColor: "color-mix(in srgb, var(--aqua) 24%, transparent)",
    outline: "1px solid color-mix(in srgb, var(--teal) 40%, transparent)",
  },
  ".cm-placeholder": { color: "var(--text-faint)" },
  ".cm-tooltip": {
    backgroundColor: "var(--surface)",
    border: "1px solid var(--line-cool)",
    borderRadius: "8px",
    boxShadow: "var(--shadow-md)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul > li": {
    fontFamily: "var(--font-mono)",
    padding: "3px 10px !important",
  },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--tint)",
    color: "var(--teal-deep)",
  },
});

const highlight = HighlightStyle.define([
  { tag: [t.tagName, t.angleBracket], color: "var(--teal-deep)" },
  { tag: t.attributeName, color: "var(--tone-warning-text)" },
  { tag: [t.attributeValue, t.string], color: "var(--tone-success-text)" },
  {
    tag: [t.propertyName, t.definition(t.propertyName)],
    color: "var(--tone-info-text)",
  },
  {
    tag: [t.number, t.unit, t.color, t.atom, t.keyword],
    color: "var(--tone-danger-text)",
  },
  {
    tag: [t.className, t.labelName, t.constant(t.className)],
    color: "var(--teal)",
  },
  { tag: [t.comment, t.meta], color: "var(--text-faint)", fontStyle: "italic" },
  { tag: [t.punctuation, t.separator, t.bracket], color: "var(--text-muted)" },
  { tag: t.invalid, color: "var(--tone-danger-accent)" },
]);

export function CodeEditor({
  value,
  language,
  onChange,
  onUndo,
  onRedo,
  readOnly,
  label,
  placeholderText,
  handleRef,
}: {
  value: string;
  language: "html" | "css";
  /** `insert` for Estudio inserts (their own undo step); `typing` otherwise. */
  onChange: (value: string, kind: "typing" | "insert") => void;
  onUndo: () => void;
  onRedo: () => void;
  readOnly: boolean;
  label: string;
  placeholderText: string;
  handleRef?: Ref<CodeEditorHandle> | undefined;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editable = useRef(new Compartment());
  const inserting = useRef(false);
  const callbacks = useRef({ onChange, onUndo, onRedo });
  callbacks.current = { onChange, onUndo, onRedo };
  const initial = useRef(value);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the view is created once; later values arrive through the diff effect
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: initial.current,
        extensions: [
          Prec.highest(
            keymap.of([
              {
                key: "Mod-z",
                run: () => {
                  callbacks.current.onUndo();
                  return true;
                },
              },
              {
                key: "Mod-Shift-z",
                run: () => {
                  callbacks.current.onRedo();
                  return true;
                },
              },
              {
                key: "Mod-y",
                run: () => {
                  callbacks.current.onRedo();
                  return true;
                },
              },
            ]),
          ),
          lineNumbers(),
          highlightActiveLineGutter(),
          highlightActiveLine(),
          drawSelection(),
          indentOnInput(),
          bracketMatching(),
          closeBrackets(),
          autocompletion({ icons: false }),
          syntaxHighlighting(highlight),
          language === "html" ? html({ autoCloseTags: true }) : css(),
          keymap.of([
            ...closeBracketsKeymap,
            ...completionKeymap,
            ...defaultKeymap,
            indentWithTab,
          ]),
          EditorView.lineWrapping,
          placeholder(placeholderText),
          theme,
          editable.current.of([
            EditorState.readOnly.of(readOnly),
            EditorView.editable.of(!readOnly),
          ]),
          EditorView.contentAttributes.of({
            "aria-label": label,
            spellcheck: "false",
            autocapitalize: "off",
            autocorrect: "off",
          }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return;
            if (update.transactions.some((tr) => tr.annotation(external)))
              return;
            const kind = inserting.current ? "insert" : "typing";
            inserting.current = false;
            callbacks.current.onChange(update.state.doc.toString(), kind);
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, []);

  // Outside changes (undo, paste, AI, the other pane) as a minimal diff.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    let start = 0;
    const shorter = Math.min(current.length, value.length);
    while (
      start < shorter &&
      current.charCodeAt(start) === value.charCodeAt(start)
    )
      start += 1;
    let endCurrent = current.length;
    let endValue = value.length;
    while (
      endCurrent > start &&
      endValue > start &&
      current.charCodeAt(endCurrent - 1) === value.charCodeAt(endValue - 1)
    ) {
      endCurrent -= 1;
      endValue -= 1;
    }
    view.dispatch({
      changes: {
        from: start,
        to: endCurrent,
        insert: value.slice(start, endValue),
      },
      annotations: external.of(true),
    });
  }, [value]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    });
  }, [readOnly]);

  useImperativeHandle(
    handleRef,
    () => ({
      insert(text: string) {
        const view = viewRef.current;
        if (!view || readOnly) return;
        inserting.current = true;
        view.dispatch(view.state.replaceSelection(text), {
          scrollIntoView: true,
        });
        view.focus();
      },
      focus() {
        viewRef.current?.focus();
      },
      refresh() {
        viewRef.current?.requestMeasure();
      },
    }),
    [readOnly],
  );

  return <div className="esh-code" ref={hostRef} />;
}
