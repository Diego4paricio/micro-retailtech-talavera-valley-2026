import type { StaffNotification } from "@kardo/contracts";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTimeMx } from "../../lib/format.js";
import { Link } from "../../lib/router.js";
import {
  audienceDescription,
  categoryLabels,
  readsText,
  stateView,
} from "./format.js";

export function NotificationRow({
  notification,
}: {
  notification: StaffNotification;
}) {
  const state = stateView(notification.state);
  const isScheduled = notification.state === "scheduled";
  return (
    <li className="ntf-row">
      <div className="ntf-row-head">
        <span className="ntf-category">
          {categoryLabels[notification.category]}
        </span>
        <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
        {notification.pinned ? (
          <span className="ntf-flag">Fijada arriba</span>
        ) : null}
        {notification.editedAt ? (
          <span className="ntf-flag">Editada</span>
        ) : null}
      </div>
      <h3 className="ntf-row-title">
        <Link to={{ name: "notification", id: notification.id }}>
          {notification.title}
        </Link>
      </h3>
      <p className="ntf-row-audience">{audienceDescription(notification)}</p>
      <dl className="ntf-row-meta">
        <div>
          <dt>{isScheduled ? "Se publica" : "Publicada"}</dt>
          <dd>{formatDateTimeMx(notification.publishAt)}</dd>
        </div>
        <div>
          <dt>Caduca</dt>
          <dd>
            {notification.expiresAt
              ? formatDateTimeMx(notification.expiresAt)
              : "No caduca"}
          </dd>
        </div>
        {isScheduled ? null : (
          <div>
            <dt>Lecturas</dt>
            <dd>{readsText(notification.reads)}</dd>
          </div>
        )}
        <div>
          <dt>Autor</dt>
          <dd>{notification.createdBy ?? "Sistema"}</dd>
        </div>
      </dl>
    </li>
  );
}
