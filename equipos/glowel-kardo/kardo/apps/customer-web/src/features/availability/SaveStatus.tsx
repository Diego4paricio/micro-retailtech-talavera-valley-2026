import { Icon } from "../../components/Icon.js";
import type { SavePhase } from "./save-queue.js";

const labels: Record<SavePhase, string> = {
  idle: "Se guarda solo",
  saving: "Guardando…",
  saved: "Guardado",
  error: "No se guardó",
};

/** Always in view (it lives in the sticky bar) and announced politely. */
export function SaveStatus({
  phase,
  onRetry,
}: {
  phase: SavePhase;
  onRetry: () => void;
}) {
  return (
    <div className="av-save-wrap">
      <p
        aria-live="polite"
        className="av-save"
        data-phase={phase}
        role="status"
      >
        {phase === "saving" ? (
          <span aria-hidden="true" className="av-save-spinner" />
        ) : (
          <Icon
            name={
              phase === "error"
                ? "circle-alert"
                : phase === "saved"
                  ? "circle-check"
                  : "check"
            }
            size={15}
          />
        )}
        <span className="av-save-label">{labels[phase]}</span>
      </p>
      {phase === "error" ? (
        <button className="av-save-retry" onClick={onRetry} type="button">
          <Icon name="refresh" size={14} />
          Reintentar
        </button>
      ) : null}
    </div>
  );
}
