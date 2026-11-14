import { type ReactNode, useId, useRef } from "react";
import { Icon } from "./Icon.js";
import { exitDurations } from "./motion.js";
import { NativeDialog } from "./NativeDialog.js";

type DialogContent = {
  title: string;
  description: ReactNode;
  children: ReactNode;
  footer: ReactNode;
};

/**
 * Native modal dialog: the browser provides focus trapping, Escape and the
 * inert background. It animates in, and stays mounted briefly to animate out
 * (showing the last open content, so callers may clear their state on close).
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = "medium",
  tone = "default",
}: {
  open: boolean;
  title: string;
  description?: ReactNode | undefined;
  onClose: () => void;
  children?: ReactNode | undefined;
  footer?: ReactNode | undefined;
  size?: "medium" | "large";
  /** `danger` adds the terracotta icon used for destructive confirmations. */
  tone?: "default" | "danger" | undefined;
}) {
  const titleId = useId();
  const descriptionId = useId();
  const snapshot = useRef<DialogContent | null>(null);
  if (open) snapshot.current = { title, description, children, footer };
  const content = snapshot.current;

  return (
    <NativeDialog
      aria-describedby={content?.description ? descriptionId : undefined}
      aria-labelledby={titleId}
      className={`dialog dialog-${size}`}
      exitMs={exitDurations.base}
      onClose={onClose}
      open={open}
    >
      {content ? (
        <div className="dialog-panel">
          <header className="dialog-header">
            <div className="dialog-heading">
              {tone === "danger" ? (
                <span aria-hidden="true" className="dialog-tone-icon">
                  <Icon name="alert" size={18} />
                </span>
              ) : null}
              <div>
                <h2 id={titleId}>{content.title}</h2>
                {content.description ? (
                  <p id={descriptionId}>{content.description}</p>
                ) : null}
              </div>
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
          {content.children ? (
            <div className="dialog-body">{content.children}</div>
          ) : null}
          {content.footer ? (
            <footer className="dialog-footer">{content.footer}</footer>
          ) : null}
        </div>
      ) : null}
    </NativeDialog>
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
  children,
  cancelLabel = "Cancelar",
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  isBusy?: boolean | undefined;
  onConfirm: () => void;
  onClose: () => void;
  /** Optional body, e.g. a list of consequences or a type-to-confirm field. */
  children?: ReactNode | undefined;
  cancelLabel?: string | undefined;
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
            {cancelLabel}
          </button>
          <button
            aria-busy={isBusy || undefined}
            className={
              tone === "danger"
                ? "button button-danger"
                : "button button-primary"
            }
            disabled={isBusy}
            onClick={onConfirm}
            type="button"
          >
            {isBusy ? (
              <>
                <span aria-hidden="true" className="button-spinner" />
                Procesando…
              </>
            ) : (
              confirmLabel
            )}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={title}
      tone={tone === "danger" ? "danger" : "default"}
    >
      {children}
    </Dialog>
  );
}
