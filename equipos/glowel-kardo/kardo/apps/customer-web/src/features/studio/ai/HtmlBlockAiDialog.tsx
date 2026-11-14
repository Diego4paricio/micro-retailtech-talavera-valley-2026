import { CUSTOM_HTML_LIMITS, supportsCustomHtml } from "@kardo/contracts";
import { useEffect, useId, useState } from "react";
import { Dialog } from "../../../components/Dialog.js";
import { Icon } from "../../../components/Icon.js";
import { useStudio } from "../StudioContext.js";
import { AiProgress } from "./AiProgress.js";
import { AiUsageNote } from "./AiUsageNote.js";
import { useKardoHtmlBlockAi } from "./kardo-html-block-ai.js";
import { AiStatusNotice } from "./StatusNotice.js";
import { hourLeft, useAiUsage } from "./use-ai-usage.js";
import "./ai-panel.css";

/**
 * "Pedir a la IA" for one `html` design block (the inspector's
 * `HtmlFields`, ADR 018 addendum 3): a small box, one question ("¿Qué
 * quieres en este bloque?"), the real stream stages, then it replaces the
 * block's `html`/`css` in the one step the Estudio's own undo already
 * covers (the caller does the replace; this only asks and shows progress).
 */
export function HtmlBlockAiDialog({
  open,
  onClose,
  html,
  css,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  /** The block's current source, sent as `current` so the AI improves it
   * instead of starting over, when there is anything to improve. */
  html: string;
  css: string;
  onApply: (result: { html: string; css: string; notes: string }) => void;
}) {
  const { workspaceId, experienceId, type } = useStudio();
  const htmlMode = supportsCustomHtml(type);
  const { usage, reload: reloadUsage } = useAiUsage(workspaceId);
  const id = useId();
  const [text, setText] = useState("");
  const ai = useKardoHtmlBlockAi({
    workspaceId,
    experienceId,
    htmlMode,
    onResult: (result) => {
      void reloadUsage();
      onApply(result);
      setText("");
      onClose();
    },
  });
  // A refusal (too many requests, no quota) changes the counter too.
  const status = ai.state.status;
  useEffect(() => {
    if (status !== "idle" && status !== "running" && status !== "done")
      void reloadUsage();
  }, [status, reloadUsage]);
  const trimmed = text.trim();
  const running = ai.state.status === "running";

  function generate() {
    if (!trimmed || running) return;
    void ai.generate(
      {
        description: trimmed.slice(0, CUSTOM_HTML_LIMITS.briefDescription),
        colors: [],
        imageRefs: [],
        fonts: [],
      },
      trimmed.slice(0, 500),
      html.trim() || css.trim() ? { html, css } : null,
    );
  }

  return (
    <Dialog
      description="Describe qué quieres en este bloque. La IA de Kardo escribe su HTML y su CSS; revísalo antes de usarlo."
      onClose={() => {
        if (running) ai.cancel();
        onClose();
      }}
      open={open}
      title="Pedir a la IA"
    >
      <div className="es-ai-block-dialog">
        <label htmlFor={`${id}-ask`}>¿Qué quieres en este bloque?</label>
        <textarea
          disabled={running}
          id={`${id}-ask`}
          maxLength={500}
          onChange={(event) => setText(event.target.value)}
          placeholder="Ej.: Una franja con 3 íconos y un texto corto cada uno, sobre fondo crema."
          rows={4}
          value={text}
        />
        {running && ai.state.status === "running" ? (
          <AiProgress
            maxTurns={ai.state.maxTurns}
            onCancel={ai.cancel}
            stage={ai.state.stage}
            startedAt={ai.state.startedAt}
            turn={ai.state.turn}
          />
        ) : (
          <button
            className="button button-primary"
            disabled={!trimmed || hourLeft(usage) === 0}
            onClick={generate}
            type="button"
          >
            <Icon name="sparkles" size={15} /> Diseñar este bloque
          </button>
        )}
        <AiUsageNote usage={usage} />
        <AiStatusNotice
          htmlMode={htmlMode}
          message={ai.state.status === "error" ? ai.state.message : undefined}
          status={ai.state.status}
        />
      </div>
    </Dialog>
  );
}
