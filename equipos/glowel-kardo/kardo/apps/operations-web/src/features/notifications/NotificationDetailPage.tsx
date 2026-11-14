import { useState } from "react";
import { notificationsApi } from "../../api/notifications.js";
import { ConfirmDialog } from "../../components/Dialog.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { useToast } from "../../components/Toast.js";
import { errorMessage } from "../../lib/api.js";
import { formatDateTimeMx } from "../../lib/format.js";
import { staffPermissions } from "../../lib/permissions.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useStaff } from "../../shell/StaffContext.js";
import { EditNotificationDialog } from "./EditNotificationDialog.js";
import {
  audienceDescription,
  canManageAudience,
  categoryLabels,
  readsText,
  stateView,
} from "./format.js";
import { NotificationPreview } from "./NotificationPreview.js";

export function NotificationDetailPage({
  notificationId,
}: {
  notificationId: string;
}) {
  const { can } = useStaff();
  const { notify } = useToast();
  const resource = useResource(`notification:${notificationId}`, (signal) =>
    notificationsApi.get(notificationId, signal),
  );
  const [editing, setEditing] = useState(false);
  const [retiring, setRetiring] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  const back = (
    <Link className="text-action" to={{ name: "notifications" }}>
      <Icon name="arrow-left" size={16} />
      Notificaciones
    </Link>
  );

  if (resource.error)
    return (
      <div className="page">
        <PageHeader back={back} title="Notificación" />
        <Notice tone="error">{resource.error}</Notice>
      </div>
    );
  const notification = resource.data;
  if (!notification)
    return (
      <div className="page">
        <PageHeader back={back} title="Notificación" />
        <Skeleton lines={6} />
      </div>
    );

  const state = stateView(notification.state);
  const mayManage = canManageAudience(notification.audience, {
    send: can(staffPermissions.notificationsSend),
    broadcast: can(staffPermissions.notificationsBroadcast),
  });
  const isRetired = notification.state === "retired";
  const canRetire =
    mayManage &&
    (notification.state === "active" || notification.state === "scheduled");

  async function retire() {
    setIsBusy(true);
    try {
      resource.setData(await notificationsApi.retire(notificationId));
      notify("Notificación retirada");
      setRetiring(false);
    } catch (requestError) {
      notify(errorMessage(requestError), "error");
      setRetiring(false);
    } finally {
      setIsBusy(false);
    }
  }

  const rows: [string, string][] = [
    ["Categoría", categoryLabels[notification.category]],
    ["Audiencia", audienceDescription(notification)],
    [
      notification.state === "scheduled" ? "Se publica" : "Publicada",
      formatDateTimeMx(notification.publishAt),
    ],
    [
      "Caduca",
      notification.expiresAt
        ? formatDateTimeMx(notification.expiresAt)
        : "No caduca",
    ],
    ["Lecturas", readsText(notification.reads)],
    ["Autor", notification.createdBy ?? "Sistema"],
    ["Creada", formatDateTimeMx(notification.createdAt)],
  ];
  if (notification.editedAt)
    rows.push(["Editada", formatDateTimeMx(notification.editedAt)]);
  if (notification.retiredAt)
    rows.push(["Retirada", formatDateTimeMx(notification.retiredAt)]);

  return (
    <div className="page">
      <PageHeader
        actions={
          mayManage && !isRetired ? (
            <>
              <button
                className="button button-secondary"
                onClick={() => setEditing(true)}
                type="button"
              >
                Editar texto
              </button>
              {canRetire ? (
                <button
                  className="button button-danger"
                  onClick={() => setRetiring(true)}
                  type="button"
                >
                  Retirar
                </button>
              ) : null}
            </>
          ) : undefined
        }
        back={back}
        description={<StatusBadge tone={state.tone}>{state.label}</StatusBadge>}
        eyebrow="Notificación"
        title={notification.title}
      />

      {isRetired ? (
        <Notice tone="info">
          Esta notificación está retirada. Ya no se ve para nadie y no se puede
          editar.
        </Notice>
      ) : null}

      <div className="ntf-layout">
        <div className="ntf-main">
          <section className="panel">
            <p className="ntf-body">{notification.body}</p>
            {notification.action ? (
              <p className="ntf-action-line">
                Botón: <strong>{notification.action.label}</strong> lleva a{" "}
                <code>{notification.action.url}</code>
              </p>
            ) : null}
            {notification.pinned ? (
              <p className="ntf-action-line">Fijada arriba en la campana.</p>
            ) : null}
          </section>
          <section className="panel">
            <dl className="ntf-facts">
              {rows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
        <div className="ntf-side">
          <NotificationPreview
            actionLabel={notification.action?.label ?? ""}
            body={notification.body}
            category={notification.category}
            pinned={notification.pinned}
            title={notification.title}
          />
        </div>
      </div>

      <EditNotificationDialog
        notification={notification}
        onClose={() => setEditing(false)}
        onSaved={(saved) => {
          resource.setData(saved);
          notify("Cambios guardados");
        }}
        open={editing}
      />
      <ConfirmDialog
        confirmLabel="Retirar"
        description="Deja de verse para todos. No se puede deshacer."
        isBusy={isBusy}
        onClose={() => setRetiring(false)}
        onConfirm={() => void retire()}
        open={retiring}
        title="Retirar notificación"
        tone="danger"
      />
    </div>
  );
}
