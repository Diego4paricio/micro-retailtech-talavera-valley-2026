import { isBroadcastAudience } from "@kardo/contracts";
import { type FormEvent, useMemo, useState } from "react";
import { notificationsApi } from "../../api/notifications.js";
import { ConfirmDialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { staffPermissions } from "../../lib/permissions.js";
import { Link, useRouter } from "../../lib/router.js";
import { useStaff } from "../../shell/StaffContext.js";
import { AudienceBuilder } from "./AudienceBuilder.js";
import {
  buildAudience,
  emptyForm,
  type FormErrors,
  hasErrors,
  type NotificationForm,
  toCreateBody,
  validateForm,
} from "./form.js";
import { estimateText } from "./format.js";
import { NotificationFields } from "./NotificationFields.js";
import { NotificationPreview } from "./NotificationPreview.js";
import { useAudienceEstimate } from "./use-audience-estimate.js";

export function NotificationFormPage() {
  const { can } = useStaff();
  const { navigate } = useRouter();
  const { notify } = useToast();
  const canBroadcast = can(staffPermissions.notificationsBroadcast);
  const canSend = can(staffPermissions.notificationsSend);

  const [form, setForm] = useState<NotificationForm>(() =>
    emptyForm(canSend ? "workspace" : "segment"),
  );
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const audience = useMemo(() => buildAudience(form), [form]);
  const estimate = useAudienceEstimate(audience);

  function change(patch: Partial<NotificationForm>) {
    setForm((current) => ({ ...current, ...patch }));
    setErrors({});
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const found = validateForm(form);
    setErrors(found);
    setSubmitError(null);
    if (hasErrors(found)) return;
    if (isBroadcastAudience(audience)) setConfirming(true);
    else void publish();
  }

  async function publish() {
    setIsSaving(true);
    setSubmitError(null);
    try {
      const created = await notificationsApi.create(toCreateBody(form));
      notify("Notificación publicada");
      navigate({ name: "notification", id: created.id });
    } catch (requestError) {
      setConfirming(false);
      setSubmitError(errorMessage(requestError));
    } finally {
      setIsSaving(false);
    }
  }

  const back = (
    <Link className="text-action" to={{ name: "notifications" }}>
      <Icon name="arrow-left" size={16} />
      Notificaciones
    </Link>
  );

  if (!canBroadcast && !canSend) {
    return (
      <div className="page">
        <PageHeader back={back} title="Nueva notificación" />
        <Notice tone="warning">
          Tu rol no incluye permiso para enviar notificaciones.
        </Notice>
      </div>
    );
  }

  return (
    <div className="page">
      <PageHeader
        back={back}
        description="Se publica en la campana de los clientes que elijas. No se manda por correo."
        eyebrow="Kardo Operations"
        title="Nueva notificación"
      />
      <form className="ntf-layout" noValidate onSubmit={onSubmit}>
        <div className="ntf-main form-grid">
          {submitError ? <Notice tone="error">{submitError}</Notice> : null}
          <NotificationFields
            errors={errors}
            form={form}
            onChange={change}
            publish="full"
          />
          <AudienceBuilder
            canBroadcast={canBroadcast}
            canSend={canSend}
            error={errors.audience}
            form={form}
            onChange={change}
          />
        </div>
        <div className="ntf-side">
          <NotificationPreview
            actionLabel={form.actionLabel}
            body={form.body}
            category={form.category}
            pinned={form.pinned}
            title={form.title}
          />
          <p aria-live="polite" className="ntf-estimate" role="status">
            {estimate.error
              ? estimate.error
              : estimate.estimate
                ? estimateText(estimate.estimate)
                : estimate.isLoading
                  ? "Calculando a cuántas personas llega…"
                  : "Elige la audiencia para ver a cuántas personas llega."}
          </p>
          <button
            className="button button-primary"
            disabled={isSaving}
            type="submit"
          >
            {isSaving
              ? "Publicando…"
              : form.publishMode === "later"
                ? "Programar notificación"
                : "Publicar notificación"}
          </button>
        </div>
      </form>

      <ConfirmDialog
        confirmLabel="Publicar"
        description={
          estimate.estimate
            ? `Se enviará a ${estimate.estimate.profiles} ${estimate.estimate.profiles === 1 ? "persona" : "personas"} de ${estimate.estimate.workspaces} ${estimate.estimate.workspaces === 1 ? "organización" : "organizaciones"}. ¿Publicar?`
            : "Se enviará a toda la audiencia elegida. ¿Publicar?"
        }
        isBusy={isSaving}
        onClose={() => setConfirming(false)}
        onConfirm={() => void publish()}
        open={confirming}
        title="Confirmar envío"
      />
    </div>
  );
}
