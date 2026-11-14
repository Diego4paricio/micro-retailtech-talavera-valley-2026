import { type ReactNode, useEffect, useId, useRef } from "react";
import { Icon } from "./Icon.js";

/** Native modal dialog: the browser provides focus trapping and Escape. */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "medium",
}: {
  open: boolean;
  title: string;
  description?: ReactNode | undefined;
  onClose: () => void;
  children?: ReactNode | undefined;
  footer?: ReactNode | undefined;
  size?: "medium" | "large";
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    // Escape is handled natively through `onCancel`; the click only covers the backdrop.
    // biome-ignore lint/a11y/useKeyWithClickEvents: keyboard dismissal is native to <dialog>
    <dialog
      aria-labelledby={titleId}
      className={`dialog dialog-${size}`}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        // A click on the backdrop targets the dialog element itself.
        if (event.target === ref.current) onClose();
      }}
      ref={ref}
    >
      {open ? (
        <div className="dialog-panel">
          <header className="dialog-header">
            <div>
              <h2 id={titleId}>{title}</h2>
              {description ? <p>{description}</p> : null}
            </div>
            <button
              aria-label="Cerrar"
              className="icon-button"
              onClick={onClose}
              type="button"
            >
              <Icon name="close" />
            </button>
          </header>
          {children ? <div className="dialog-body">{children}</div> : null}
          {footer ? <footer className="dialog-footer">{footer}</footer> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "primary",
  isBusy,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  isBusy?: boolean | undefined;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      description={description}
      footer={
        <>
          <button
            className="button button-secondary"
            onClick={onClose}
            type="button"
          >
            Cancelar
          </button>
          <button
            className={
              tone === "danger"
                ? "button button-danger"
                : "button button-primary"
            }
            disabled={isBusy}
            onClick={onConfirm}
            type="button"
          >
            {isBusy ? "Procesando…" : confirmLabel}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={title}
    />
  );
}
