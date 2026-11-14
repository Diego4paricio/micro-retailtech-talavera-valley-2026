import type { StaffNotification } from "@kardo/contracts";
import { type FormEvent, useEffect, useState } from "react";
import { notificationsApi } from "../../api/notifications.js";
import { Dialog } from "../../components/Dialog.js";
import { Notice } from "../../components/Notice.js";
import { errorMessage } from "../../lib/api.js";
import {
  type FormErrors,
  formFromNotification,
  hasErrors,
  type NotificationForm,
  toUpdateBody,
  validateForm,
} from "./form.js";
import { NotificationFields } from "./NotificationFields.js";

export function EditNotificationDialog({
  open,
  notification,
  onClose,
  onSaved,
}: {
  open: boolean;
  notification: StaffNotification;
  onClose: () => void;
  onSaved: (notification: StaffNotification) => void;
}) {
  const [form, setForm] = useState<NotificationForm>(() =>
    formFromNotification(notification),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(formFromNotification(notification));
    setErrors({});
    setError(null);
  }, [open, notification]);

  const isScheduled = notification.state === "scheduled";
  const body = toUpdateBody(form, notification);
  const hasChanges = Object.keys(body).length > 0;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateForm(
      { ...form, publishMode: isScheduled ? "later" : "now" },
      new Date(),
      { withAudience: false, withPublish: isScheduled },
    );
    setErrors(found);
    if (hasErrors(found) || !hasChanges) return;
    setIsSaving(true);
    setError(null);
    try {
      onSaved(await notificationsApi.update(notification.id, body));
      onClose();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog
      description={
        isScheduled
          ? "Aún no se publica, así que puedes cambiar también la fecha."
          : "Si ya se publicó, se marca como Editada y no vuelve a avisar."
      }
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
            className="button button-primary"
            disabled={isSaving || !hasChanges}
            form="notification-edit-form"
            type="submit"
          >
            {isSaving ? "Guardando…" : "Guardar cambios"}
          </button>
        </>
      }
      onClose={onClose}
      open={open}
      size="large"
      title="Editar texto"
    >
      <form
        className="form-grid"
        id="notification-edit-form"
        noValidate
        onSubmit={submit}
      >
        {error ? <Notice tone="error">{error}</Notice> : null}
        <NotificationFields
          errors={errors}
          form={form}
          onChange={(patch) => setForm((current) => ({ ...current, ...patch }))}
          publish={isScheduled ? "date" : "none"}
        />
      </form>
    </Dialog>
  );
}
