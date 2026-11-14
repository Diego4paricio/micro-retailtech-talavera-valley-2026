import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import { errorMessage } from "../../lib/api.js";
import { isValidReason, maxReasonLength, minReasonLength } from "./format.js";

/**
 * Confirmation dialog for every billing mutation: a mandatory reason
 * (min. 3 characters, recorded in audit) plus optional extra fields. It never
 * closes on failure so the staff member can read the error and retry.
 */
export function ActionDialog({
  open,
  title,
  description,
  confirmLabel,
  tone = "primary",
  extraValid = true,
  reasonHint,
  children,
  onSubmit,
  onClose,
}: {
  open: boolean;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  tone?: "primary" | "danger";
  /** False while the extra fields (days, amount, mode) are invalid. */
  extraValid?: boolean;
  reasonHint?: string;
  children?: ReactNode;
  onSubmit: (reason: string) => Promise<void>;
  onClose: () => void;
}) {
  const formId = useId();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setError(null);
    setIsBusy(false);
  }, [open]);

  const reasonOk = isValidReason(reason);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!reasonOk || !extraValid || isBusy) return;
    setIsBusy(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsBusy(false);
    }
  }

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
            disabled={isBusy || !reasonOk || !extraValid}
            form={formId}
            type="submit"
          >
            {isBusy ? "Procesando…" : confirmLabel}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title={title}
    >
      <form className="form-grid" id={formId} onSubmit={submit}>
        {error ? <Notice tone="error">{error}</Notice> : null}
        {children}
        <Field
          counter={{ value: reason.length, max: maxReasonLength }}
          hint={
            reasonHint ??
            `Queda en auditoría (mínimo ${minReasonLength} caracteres).`
          }
          id={`${formId}-reason`}
          label="Motivo"
        >
          <textarea
            id={`${formId}-reason`}
            maxLength={maxReasonLength}
            onChange={(event) => setReason(event.target.value)}
            required
            rows={3}
            value={reason}
          />
        </Field>
      </form>
    </Dialog>
  );
}
