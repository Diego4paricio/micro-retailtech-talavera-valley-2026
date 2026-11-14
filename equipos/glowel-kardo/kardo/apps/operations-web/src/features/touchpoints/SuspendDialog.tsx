import { type FormEvent, useState } from "react";
import { Dialog } from "../../components/Dialog.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";

export function SuspendDialog({
  open,
  onClose,
  onConfirm,
  isBusy,
}: {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void;
  isBusy: boolean;
}) {
  const [reason, setReason] = useState("");
  const tooShort = reason.trim().length > 0 && reason.trim().length < 5;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reason.trim().length < 5) return;
    onConfirm(reason.trim());
  }

  return (
    <Dialog
      description="El enlace público del Touchpoint deja de servir la Experience mientras esté suspendido. La acción queda en auditoría."
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
            className="button button-danger"
            disabled={isBusy || reason.trim().length < 5}
            form="suspend-dialog-form"
            type="submit"
          >
            {isBusy ? "Suspendiendo…" : "Suspender Touchpoint"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      title="Suspender Touchpoint"
    >
      <form id="suspend-dialog-form" onSubmit={submit}>
        {tooShort ? (
          <Notice tone="warning">Escribe al menos 5 caracteres.</Notice>
        ) : null}
        <Field
          hint="Mínimo 5 caracteres. Es visible en auditoría."
          id="suspend-reason"
          label="Motivo"
        >
          <textarea
            id="suspend-reason"
            minLength={5}
            onChange={(event) => setReason(event.target.value)}
            required
            value={reason}
          />
        </Field>
      </form>
    </Dialog>
  );
}
