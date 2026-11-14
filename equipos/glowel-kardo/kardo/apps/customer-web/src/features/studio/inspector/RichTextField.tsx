import { DESIGN_LIMITS, type TextRun } from "@kardo/contracts";
import { normalizePublicHttpsUrl } from "@kardo/domain";
import {
  type KeyboardEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Icon } from "../../../components/Icon.js";
import { FieldIssue } from "./controls.js";

/**
 * Text with bold, italics and links, stored as structured runs (never as
 * HTML). The editable area is built with DOM APIs from the runs and read
 * back into runs on every input; pasting always inserts plain text.
 */

type Marks = { bold?: boolean; italic?: boolean; href?: string };

function sameMarks(a: Marks, b: Marks): boolean {
  return a.bold === b.bold && a.italic === b.italic && a.href === b.href;
}

/** Reads the editable area back into runs (merged, without empty ones). */
export function readRuns(root: HTMLElement): TextRun[] {
  const runs: TextRun[] = [];
  const push = (text: string, marks: Marks) => {
    if (!text) return;
    const last = runs.at(-1);
    if (last && sameMarks(last, marks)) {
      last.text += text;
      return;
    }
    runs.push({ text, ...marks });
  };
  const walk = (node: Node, marks: Marks, first: boolean) => {
    if (node.nodeType === Node.TEXT_NODE) {
      push(node.textContent ?? "", marks);
      return;
    }
    if (!(node instanceof HTMLElement)) return;
    const tag = node.tagName;
    if (tag === "BR") {
      push("\n", marks);
      return;
    }
    // Chrome wraps new lines in <div> when Enter slips through.
    if ((tag === "DIV" || tag === "P") && !first) push("\n", marks);
    const next: Marks = { ...marks };
    if (tag === "B" || tag === "STRONG") next.bold = true;
    if (tag === "I" || tag === "EM") next.italic = true;
    if (tag === "A") {
      const href = node.getAttribute("href");
      if (href) next.href = href;
    }
    node.childNodes.forEach((child, index) => {
      walk(child, next, index === 0);
    });
  };
  root.childNodes.forEach((child, index) => {
    walk(child, {}, index === 0);
  });
  return runs;
}

function renderRuns(root: HTMLElement, runs: readonly TextRun[]) {
  const document = root.ownerDocument;
  root.replaceChildren(
    ...runs.map((run) => {
      let node: Node = document.createTextNode(run.text);
      if (run.bold) {
        const element = document.createElement("strong");
        element.append(node);
        node = element;
      }
      if (run.italic) {
        const element = document.createElement("em");
        element.append(node);
        node = element;
      }
      if (run.href) {
        const element = document.createElement("a");
        element.setAttribute("href", run.href);
        element.append(node);
        node = element;
      }
      return node;
    }),
  );
}

function command(name: string, value?: string) {
  // execCommand is the only cross-browser way to toggle marks inside a
  // contenteditable without building an editor framework.
  document.execCommand(name, false, value);
}

export function RichTextField({
  label,
  runs,
  onChange,
  readOnly,
  error,
}: {
  label: string;
  runs: readonly TextRun[];
  onChange: (runs: TextRun[]) => void;
  readOnly: boolean;
  error?: string | undefined;
}) {
  const id = useId();
  const ref = useRef<HTMLDivElement>(null);
  const shown = useRef("");
  const savedRange = useRef<Range | null>(null);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const chars = runs.reduce((sum, run) => sum + run.text.length, 0);

  // Rebuild the DOM only when the runs changed from outside (undo, another
  // block), never while the person types: the caret stays where it is.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const key = JSON.stringify(runs);
    if (key === shown.current) return;
    shown.current = key;
    renderRuns(element, runs);
  }, [runs]);

  useEffect(() => {
    document.execCommand("styleWithCSS", false, "false");
  }, []);

  function emit() {
    const element = ref.current;
    if (!element) return;
    const next = readRuns(element);
    shown.current = JSON.stringify(next);
    onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      command("insertLineBreak");
      emit();
      return;
    }
    if ((event.metaKey || event.ctrlKey) && !event.altKey) {
      const key = event.key.toLowerCase();
      if (key === "b" || key === "i") {
        event.preventDefault();
        command(key === "b" ? "bold" : "italic");
        emit();
      }
    }
  }

  function rememberSelection() {
    const selection = window.getSelection();
    const range = selection?.rangeCount ? selection.getRangeAt(0) : null;
    savedRange.current =
      range && ref.current?.contains(range.commonAncestorContainer)
        ? range.cloneRange()
        : null;
  }

  function restoreSelection() {
    const range = savedRange.current;
    const selection = window.getSelection();
    if (!range || !selection) return false;
    ref.current?.focus();
    selection.removeAllRanges();
    selection.addRange(range);
    return true;
  }

  function applyLink() {
    const url = normalizePublicHttpsUrl((linkDraft ?? "").trim());
    if (!url) {
      setLinkError("Usa un enlace completo que empiece con https://.");
      return;
    }
    if (!restoreSelection() || savedRange.current?.collapsed) {
      setLinkError("Selecciona primero las palabras que llevan al enlace.");
      return;
    }
    command("createLink", url);
    setLinkDraft(null);
    setLinkError(null);
    emit();
  }

  const tool = (
    icon: "bold" | "italic" | "link" | "link-off",
    text: string,
    onClick: () => void,
  ) => (
    <button
      aria-label={text}
      className="es-rt-tool"
      disabled={readOnly}
      onClick={onClick}
      // Keep the selection inside the text while pressing a tool.
      onMouseDown={(event) => event.preventDefault()}
      title={text}
      type="button"
    >
      <Icon name={icon} size={15} />
    </button>
  );

  return (
    <div className="qrs-control es-richtext-field">
      <div className="qrs-control-head">
        <span className="qrs-control-label" id={`${id}-label`}>
          {label}
        </span>
        <span
          className={
            chars > DESIGN_LIMITS.textChars
              ? "qrs-counter qrs-counter-full"
              : "qrs-counter"
          }
        >
          {chars.toLocaleString("es-MX")} /{" "}
          {DESIGN_LIMITS.textChars.toLocaleString("es-MX")}
        </span>
      </div>
      <div className="es-rt">
        <div
          aria-label="Formato del texto"
          className="es-rt-tools"
          role="toolbar"
        >
          {tool("bold", "Negritas (⌘B)", () => {
            command("bold");
            emit();
          })}
          {tool("italic", "Cursivas (⌘I)", () => {
            command("italic");
            emit();
          })}
          {tool("link", "Agregar enlace", () => {
            rememberSelection();
            setLinkError(null);
            setLinkDraft("https://");
          })}
          {tool("link-off", "Quitar enlace", () => {
            command("unlink");
            emit();
          })}
        </div>
        {/* biome-ignore lint/a11y/useSemanticElements: a rich text box has no native element */}
        <div
          aria-describedby={error ? `${id}-error` : undefined}
          aria-invalid={Boolean(error) || undefined}
          aria-labelledby={`${id}-label`}
          aria-multiline="true"
          className="es-rt-area"
          contentEditable={!readOnly}
          onBlur={emit}
          onInput={emit}
          onKeyDown={onKeyDown}
          onPaste={(event) => {
            event.preventDefault();
            command(
              "insertText",
              event.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n"),
            );
            emit();
          }}
          ref={ref}
          role="textbox"
          suppressContentEditableWarning
          tabIndex={0}
        />
      </div>
      {linkDraft !== null ? (
        <div className="es-rt-link">
          <input
            aria-label="Dirección del enlace"
            autoComplete="off"
            className="input"
            inputMode="url"
            onChange={(event) => setLinkDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                applyLink();
              }
              if (event.key === "Escape") setLinkDraft(null);
            }}
            spellCheck={false}
            value={linkDraft}
          />
          <button
            className="button button-secondary button-small"
            onClick={applyLink}
            type="button"
          >
            Aplicar
          </button>
          <button
            aria-label="Cancelar enlace"
            className="icon-button"
            onClick={() => setLinkDraft(null)}
            type="button"
          >
            <Icon name="close" size={15} />
          </button>
        </div>
      ) : null}
      {linkError ? <FieldIssue message={linkError} /> : null}
      <div id={`${id}-error`}>
        <FieldIssue message={error} />
      </div>
      <p className="qrs-hint">
        Selecciona palabras y usa los botones para negritas, cursivas o un
        enlace. Enter hace un salto de línea.
      </p>
    </div>
  );
}
