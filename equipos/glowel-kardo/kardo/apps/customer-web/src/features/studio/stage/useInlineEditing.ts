import type {
  DesignableExperienceType,
  PageDesign,
  TextRun,
} from "@kardo/contracts";
import { useCallback, useEffect, useRef, useState } from "react";
import { locateBlock, updateBlock } from "../model/operations.js";
import type {
  ContentChange,
  DesignChange,
  Selection,
} from "../StudioContext.js";
import {
  beginInlineEdit,
  fieldRules,
  type InlineField,
  type InlineResult,
  type InlineSession,
  inlineFieldFor,
  limitRuns,
  withContentText,
} from "./inline-edit.js";

type Notify = (message: string, tone?: "info" | "error" | "success") => void;

/** One line of text: line breaks become spaces, ends trimmed. */
function oneLine(text: string): string {
  return text.replace(/\s*\n\s*/g, " ").trim();
}

/**
 * The Estudio's side of writing on the page: which text is being written
 * (the preview waits to re-render meanwhile), where it starts (a double
 * click, Enter, the toolbar) and what the confirmed text changes (the
 * design or the content), as one undo step.
 */
export function useInlineEditing({
  design,
  type,
  readOnly,
  change,
  changeContent,
  select,
  notify,
  save,
}: {
  design: PageDesign;
  type: DesignableExperienceType;
  readOnly: boolean;
  change: DesignChange;
  changeContent: ContentChange;
  select: (selection: Selection) => void;
  notify: Notify;
  save: () => void;
}) {
  const [editing, setEditing] = useState<{ blockId: string } | null>(null);
  const session = useRef<InlineSession | null>(null);
  const latest = useRef({ design, type, readOnly, change, changeContent });
  latest.current = { design, type, readOnly, change, changeContent };

  // ⌘S while writing confirms first; the save runs once that is drawn.
  const [saveTick, setSaveTick] = useState(0);
  const saveRef = useRef(save);
  saveRef.current = save;
  useEffect(() => {
    if (saveTick) saveRef.current();
  }, [saveTick]);

  const apply = useCallback(
    (field: InlineField, result: InlineResult): boolean => {
      const rules = fieldRules(field);
      const { change, changeContent } = latest.current;
      if (field.on === "block" && field.kind === "text") {
        const runs: TextRun[] = limitRuns(result.runs, rules.max);
        if (!runs.some((run) => run.text.trim())) {
          notify(`${rules.label} no puede quedar vacío.`, "info");
          return false;
        }
        change((current) =>
          updateBlock(current, field.blockId, (block) =>
            block.kind === "text" ? { ...block, runs } : block,
          ),
        );
        return true;
      }
      let value = rules.multiline ? result.text.trim() : oneLine(result.text);
      if (value.length > rules.max) {
        value = value.slice(0, rules.max).trim();
        notify(`Se recortó a ${rules.max} caracteres.`, "info");
      }
      if (!value && rules.required) {
        notify(`${rules.label} no puede quedar vacío.`, "info");
        return false;
      }
      if (field.on === "content") {
        const key = field.key;
        changeContent((current) => withContentText(current, key, value));
        return true;
      }
      change((current) =>
        updateBlock(current, field.blockId, (block) => {
          if (block.kind === "heading") return { ...block, text: value };
          if (block.kind === "button" || block.kind === "brandButton")
            return { ...block, label: value };
          return block;
        }),
      );
      return true;
    },
    [notify],
  );

  /** Starts writing on `blockId` in the preview `doc`. `clicked` picks the
   * text of a bound block (title or description, name or bio); `point`
   * puts the caret where a double click happened. */
  const begin = useCallback(
    (
      doc: Document | null,
      blockId: string,
      clicked?: Element | null,
      point?: { x: number; y: number } | null,
    ): boolean => {
      const { design, type, readOnly } = latest.current;
      if (readOnly || !doc) return false;
      const at = locateBlock(design, blockId);
      if (!at) return false;
      if (at.on === "canvas" && at.item.locked) {
        notify("Está bloqueado. Desbloquéalo para editarlo.", "info");
        return false;
      }
      const blockElement = doc.querySelector(
        `[data-block-id="${CSS.escape(blockId)}"]`,
      );
      if (!blockElement) return false;
      const found = inlineFieldFor(at.block, type, blockElement, clicked);
      if (!found) return false;
      session.current?.commit();
      const rules = fieldRules(found.field);
      const element = found.element as HTMLElement;
      select({ kind: "block", id: blockId });
      setEditing({ blockId });
      const field = found.field;
      session.current = beginInlineEdit({
        element,
        rich: rules.rich,
        multiline: rules.multiline,
        point: point ?? null,
        selectAll: !point,
        onCommit: (result) => apply(field, result),
        onEnd: () => {
          session.current = null;
          setEditing(null);
        },
        onSave: () => setSaveTick((tick) => tick + 1),
      });
      return true;
    },
    [apply, notify, select],
  );

  /** Confirms what is being written (before saving, switching modes…). */
  const commit = useCallback(() => session.current?.commit(), []);

  // Leaving the Estudio (or the blocks mode) confirms the text.
  useEffect(() => () => session.current?.commit(), []);

  return { editing, begin, commit };
}
