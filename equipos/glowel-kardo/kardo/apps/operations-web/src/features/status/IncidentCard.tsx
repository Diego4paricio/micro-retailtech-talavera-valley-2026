import {
  type StaffStatusIncident,
  statusComponentLabels,
} from "@kardo/contracts";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTimeMx } from "../../lib/format.js";
import {
  impactLabels,
  kindLabels,
  levelTones,
  updateLabels,
} from "./format.js";

export function IncidentCard({
  incident,
  onAddUpdate,
}: {
  incident: StaffStatusIncident;
  /** Present only for open incidents and staff who can write. */
  onAddUpdate?: (() => void) | undefined;
}) {
  const isMaintenance = incident.kind === "maintenance";
  const timeline = [...incident.updates].reverse();
  return (
    <article className="panel st-incident">
      <header className="st-incident-head">
        <div>
          <p className="eyebrow">{kindLabels[incident.kind]}</p>
          <h3>{incident.title}</h3>
        </div>
        <StatusBadge tone={levelTones[incident.impact]}>
          {impactLabels[incident.impact]}
        </StatusBadge>
      </header>
      <p className="st-incident-meta">
        {incident.components.map((id) => statusComponentLabels[id]).join(", ")}
      </p>
      <p className="st-incident-meta">
        {isMaintenance
          ? `Ventana: ${formatDateTimeMx(incident.startsAt)} a ${formatDateTimeMx(incident.endsAt)}`
          : `Desde ${formatDateTimeMx(incident.startsAt)}`}
        {incident.resolvedAt
          ? ` · Cerrado ${formatDateTimeMx(incident.resolvedAt)}`
          : ""}
      </p>
      <ol className="st-timeline">
        {timeline.map((update) => (
          <li key={`${update.at}-${update.status}`}>
            <div className="st-timeline-head">
              <strong>{updateLabels[update.status]}</strong>
              <time dateTime={update.at}>{formatDateTimeMx(update.at)}</time>
            </div>
            <p>{update.message}</p>
          </li>
        ))}
      </ol>
      {onAddUpdate ? (
        <div className="form-actions">
          <button
            className="button button-secondary button-small"
            onClick={onAddUpdate}
            type="button"
          >
            Agregar actualización
          </button>
        </div>
      ) : null}
    </article>
  );
}
