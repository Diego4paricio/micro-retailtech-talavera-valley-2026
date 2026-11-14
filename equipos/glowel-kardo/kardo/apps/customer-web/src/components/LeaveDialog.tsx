import { Dialog } from "./Dialog.js";
import { Notice } from "./Notice.js";

/**
 * Kardo's own "unsaved changes" question for in-app navigation (sidebar,
 * back arrows, the browser's back button inside the panel), instead of the
 * browser's `confirm()`. Closing or reloading the tab still shows the
 * browser's own dialog: no page can replace that one.
 */
export function LeaveDialog({
  open,
  message,
  canSave,
  isSaving,
  saveError,
  onStay,
  onLeave,
  onSave,
}: {
  open: boolean;
  message: string;
  /** Offers "Guardar y salir" when the screen can save in one step. */
  canSave: boolean;
  isSaving: boolean;
  /** The last "Guardar y salir" failed (relevo 37, B3f): the dialog stays
   * open with this instead of closing as if it had worked, and the button
   * becomes "Reintentar". */
  saveError?: string | null | undefined;
  onStay: () => void;
  onLeave: () => void;
  onSave: () => void;
}) {
  return (
    <Dialog
      description={message}
      footer={
        <>
          <button
            className="button button-secondary"
            disabled={isSaving}
            onClick={onStay}
            type="button"
          >
            Seguir editando
          </button>
          <button
            className={
              canSave ? "button button-secondary" : "button button-danger"
            }
            disabled={isSaving}
            onClick={onLeave}
            type="button"
          >
            Salir sin guardar
          </button>
          {canSave ? (
            <button
              aria-busy={isSaving || undefined}
              className="button button-primary"
              disabled={isSaving}
              onClick={onSave}
              type="button"
            >
              {isSaving ? (
                <span aria-hidden="true" className="button-spinner" />
              ) : null}
              {isSaving
                ? "Guardando…"
                : saveError
                  ? "Reintentar"
                  : "Guardar y salir"}
            </button>
          ) : null}
        </>
      }
      onClose={() => {
        if (!isSaving) onStay();
      }}
      open={open}
      title="Tienes cambios sin guardar"
      tone="danger"
    >
      {saveError ? <Notice tone="danger">{saveError}</Notice> : null}
    </Dialog>
  );
}
