import { Icon } from "./Icon.js";

/**
 * Contextual bar for pending edits (research §4): ink with an ochre accent,
 * "Descartar" + "Guardar". Pair it with a `ConfirmDialog tone="danger"` titled
 * "Descartar cambios" when the person tries to leave.
 */
export function UnsavedChangesBar({
  onSave,
  onDiscard,
  isSaving,
  message = "Tienes cambios sin guardar",
  saveLabel = "Guardar",
  discardLabel = "Descartar",
}: {
  onSave: () => void;
  onDiscard?: (() => void) | undefined;
  isSaving?: boolean | undefined;
  message?: string | undefined;
  saveLabel?: string | undefined;
  discardLabel?: string | undefined;
}) {
  return (
    <section aria-label="Cambios sin guardar" className="unsaved-bar">
      <p className="unsaved-bar-message" role="status">
        <Icon name="alert" size={16} />
        {message}
      </p>
      <div className="unsaved-bar-actions">
        {onDiscard ? (
          <button
            className="button button-ghost button-small"
            disabled={isSaving}
            onClick={onDiscard}
            type="button"
          >
            {discardLabel}
          </button>
        ) : null}
        <button
          aria-busy={isSaving || undefined}
          className="button button-primary button-small"
          disabled={isSaving}
          onClick={onSave}
          type="button"
        >
          {isSaving ? (
            <>
              <span aria-hidden="true" className="button-spinner" />
              Guardando…
            </>
          ) : (
            saveLabel
          )}
        </button>
      </div>
    </section>
  );
}
