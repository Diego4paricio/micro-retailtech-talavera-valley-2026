import { DESIGN_LIMITS, type DesignBlock } from "@kardo/contracts";
import { useId, useState } from "react";
import { Icon } from "../../../components/Icon.js";
import { Notice } from "../../../components/Notice.js";
import { useToast } from "../../../components/Toast.js";
import { HtmlBlockAiDialog } from "../ai/HtmlBlockAiDialog.js";
import { useStudio } from "../StudioContext.js";
import { FieldIssue, TextField } from "./controls.js";

type HtmlBlock = Extract<DesignBlock, { kind: "html" }>;

type HtmlPatch = {
  label?: string | undefined;
  html?: string;
  css?: string;
};

/**
 * Fields for an `html` block (addendum 3): a name (for Capas), a compact
 * code editor for HTML and CSS, and "Pedir a la IA". Only shown when
 * `canEditHtml` (Owner/Admin, same permission as the modo HTML); the caller
 * (Inspector.tsx) already checks it before rendering, this just repeats the
 * guard for anyone using the component directly.
 *
 * Uses a plain monospaced textarea instead of `html/CodeEditor.tsx`
 * (CodeMirror): that component's Mod-Z/Mod-Shift-Z are wired to the full
 * modo HTML screen's own undo/redo, which this compact panel does not have
 * access to (StudioContext exposes `change`, not raw undo/redo), so reusing
 * it as-is would silently break undo inside the editor. A textarea is the
 * documented fallback and keeps ⌘Z working (the browser's own, inside the
 * field, same as any other text input in the Estudio).
 */
export function HtmlFields({
  block,
  issueOf,
  onChange,
}: {
  block: HtmlBlock;
  issueOf: (field: string) => string | undefined;
  onChange: (patch: HtmlPatch) => void;
}) {
  const { canEditHtml } = useStudio();
  const { notify } = useToast();
  const [aiOpen, setAiOpen] = useState(false);
  const htmlId = useId();
  const cssId = useId();

  if (!canEditHtml)
    return (
      <Notice tone="info">
        Solo el dueño o un administrador puede crear o cambiar bloques de
        código.
      </Notice>
    );

  return (
    <div className="es-fields">
      <TextField
        hint="Se ve en Capas, para encontrarlo entre tus bloques."
        id={`es-${block.id}-label`}
        label="Nombre del bloque"
        max={60}
        onChange={(label) => onChange({ label: label || undefined })}
        optional
        value={block.label ?? ""}
      />
      <div className="qrs-control">
        <div className="qrs-control-head">
          <label className="qrs-control-label" htmlFor={htmlId}>
            HTML
          </label>
          <span className="qrs-counter">
            {block.html.length.toLocaleString("es-MX")} /{" "}
            {DESIGN_LIMITS.htmlBlockHtml.toLocaleString("es-MX")}
          </span>
        </div>
        <textarea
          aria-describedby={issueOf("html") ? `${htmlId}-error` : undefined}
          aria-invalid={Boolean(issueOf("html")) || undefined}
          className="es-code-textarea"
          id={htmlId}
          maxLength={DESIGN_LIMITS.htmlBlockHtml}
          onChange={(event) => onChange({ html: event.target.value })}
          rows={10}
          spellCheck={false}
          value={block.html}
        />
        <div id={`${htmlId}-error`}>
          <FieldIssue message={issueOf("html")} />
        </div>
      </div>
      <div className="qrs-control">
        <div className="qrs-control-head">
          <label className="qrs-control-label" htmlFor={cssId}>
            CSS
          </label>
          <span className="qrs-counter">
            {block.css.length.toLocaleString("es-MX")} /{" "}
            {DESIGN_LIMITS.htmlBlockCss.toLocaleString("es-MX")}
          </span>
        </div>
        <textarea
          aria-describedby={issueOf("css") ? `${cssId}-error` : undefined}
          aria-invalid={Boolean(issueOf("css")) || undefined}
          className="es-code-textarea"
          id={cssId}
          maxLength={DESIGN_LIMITS.htmlBlockCss}
          onChange={(event) => onChange({ css: event.target.value })}
          rows={6}
          spellCheck={false}
          value={block.css}
        />
        <div id={`${cssId}-error`}>
          <FieldIssue message={issueOf("css")} />
        </div>
      </div>
      <p className="qrs-hint">
        <Icon name="shield-check" size={14} /> Tu código se guarda tal cual lo
        escribes, pero siempre se limpia antes de verse en la vista previa,
        publicarse o mostrarse en tu página: se quitan scripts, formularios y
        otros riesgos.
      </p>
      <button
        className="button button-secondary"
        onClick={() => setAiOpen(true)}
        type="button"
      >
        <Icon name="sparkles" size={16} /> Pedir a la IA
      </button>
      <HtmlBlockAiDialog
        css={block.css}
        html={block.html}
        onApply={(result) => {
          onChange({ html: result.html, css: result.css });
          notify(
            result.notes || "La IA de Kardo diseñó este bloque.",
            "success",
          );
        }}
        onClose={() => setAiOpen(false)}
        open={aiOpen}
      />
    </div>
  );
}
