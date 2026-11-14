import type { CustomHtmlGenerationStage } from "@kardo/contracts";
import { useEffect, useState } from "react";
import {
  formatElapsedSeconds,
  kardoAiProgress,
  kardoAiStageLabel,
} from "../html/kardo-ai.js";

/**
 * A running Kardo AI generation's real stage, a rough progress bar and the
 * elapsed time, with Cancelar. The same look modo HTML's `AiHelp.tsx` uses,
 * factored out here so the AI-in-blocks panel and the html-block dialog
 * (`ai/BlocksAiPanel.tsx`, `ai/HtmlBlockAiDialog.tsx`) share it instead of a
 * copy each.
 */
export function AiProgress({
  startedAt,
  stage,
  turn,
  maxTurns,
  onCancel,
  generatingLabel,
}: {
  /** Replaces "Diseñando tu página…" (e.g. while thinking of ideas). */
  generatingLabel?: string | undefined;
  startedAt: number;
  stage: CustomHtmlGenerationStage;
  turn: number;
  maxTurns: number;
  onCancel: () => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = Math.max(0, Math.round((now - startedAt) / 1_000));
  const percent = kardoAiProgress(stage, turn, maxTurns);
  return (
    <div aria-live="polite" className="es-ai-progress">
      <span aria-hidden="true" className="es-ai-bar">
        <span className="es-ai-fill" style={{ width: `${percent}%` }} />
      </span>
      <p>
        <span>
          {stage === "generating" && generatingLabel
            ? generatingLabel
            : kardoAiStageLabel(stage, turn, maxTurns)}
        </span>
        <span className="es-ai-time">{formatElapsedSeconds(seconds)}</span>
      </p>
      <button className="link-button" onClick={onCancel} type="button">
        Cancelar
      </button>
    </div>
  );
}
