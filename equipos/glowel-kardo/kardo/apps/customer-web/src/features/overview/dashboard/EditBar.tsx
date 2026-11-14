import { Icon } from "../../../components/Icon.js";
import type { SaveStatus } from "./layout-store.js";

/**
 * Floating bar while the board is in edit mode: what is happening to the
 * changes (they save themselves) and the board-level actions.
 */
export function EditBar({
  status,
  canDrag,
  canAdd,
  onAdd,
  onReset,
  onRetry,
  onDone,
}: {
  status: SaveStatus;
  /** False on narrow boards, where the ⋯ menus replace dragging. */
  canDrag: boolean;
  canAdd: boolean;
  onAdd: () => void;
  onReset: () => void;
  onRetry: () => void;
  onDone: () => void;
}) {
  return (
    <section aria-label="Edición del tablero" className="db-editbar">
      <div className="db-editbar-state">
        <p className="db-editbar-mode">
          <span aria-hidden="true" className="db-editbar-dot" />
          Editando el tablero
        </p>
        <SaveState onRetry={onRetry} status={status} />
      </div>
      {canDrag ? null : (
        <p className="db-editbar-hint">
          Usa <Icon name="more" size={14} /> en cada widget para moverlo o
          cambiar su tamaño.
        </p>
      )}
      <div className="db-editbar-actions">
        <button
          className="db-editbar-button"
          disabled={!canAdd}
          onClick={onAdd}
          title={canAdd ? undefined : "Llegaste al máximo de widgets"}
          type="button"
        >
          <Icon name="plus" size={16} />
          <span>Agregar widget</span>
        </button>
        <button className="db-editbar-button" onClick={onReset} type="button">
          <Icon name="reset" size={16} />
          <span>Restablecer</span>
        </button>
        <button className="db-editbar-done" onClick={onDone} type="button">
          <Icon name="check" size={16} />
          Listo
        </button>
      </div>
    </section>
  );
}

/** "Guardando…" / "Guardado" / an error with a retry. */
export function SaveState({
  status,
  onRetry,
}: {
  status: SaveStatus;
  onRetry: () => void;
}) {
  return (
    <p className={`db-save db-save-${status}`}>
      <span aria-live="polite" className="db-save-text">
        {status === "saving" ? (
          <>
            <Icon className="db-save-spin" name="loader" size={14} />
            Guardando…
          </>
        ) : status === "saved" ? (
          <>
            <Icon name="check" size={14} />
            Guardado
          </>
        ) : status === "error" ? (
          <>
            <Icon name="circle-alert" size={14} />
            No se guardó
          </>
        ) : (
          "Los cambios se guardan solos"
        )}
      </span>
      {status === "error" ? (
        <button className="db-save-retry" onClick={onRetry} type="button">
          Reintentar
        </button>
      ) : null}
    </p>
  );
}
