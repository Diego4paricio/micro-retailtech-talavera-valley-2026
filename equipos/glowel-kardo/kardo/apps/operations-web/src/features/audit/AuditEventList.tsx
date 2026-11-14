import type { StaffAuditEvent } from "@kardo/contracts";
import { useState } from "react";
import { Icon } from "../../components/Icon.js";
import { formatDateTime } from "../../lib/format.js";

const actorTypeLabels: Record<string, string> = {
  customer: "Cliente",
  staff: "Staff",
  service: "Servicio",
};

/** Renders audit metadata as plain text — never as HTML — to keep it inert. */
function metadataText(metadata: Record<string, unknown>): string {
  try {
    return JSON.stringify(metadata, null, 2);
  } catch {
    return String(metadata);
  }
}

export function AuditEventList({
  events,
  emptyLabel,
}: {
  events: readonly StaffAuditEvent[];
  emptyLabel: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (events.length === 0) return <p className="muted">{emptyLabel}</p>;

  return (
    <ul className="row-list">
      {events.map((event) => {
        const expanded = expandedId === event.id;
        return (
          <li key={event.id}>
            <div className="row">
              <span className="row-icon" aria-hidden="true">
                <Icon name="audit" size={16} />
              </span>
              <div className="row-main">
                <strong>{event.action}</strong>
                <small>
                  {actorTypeLabels[event.actorType] ?? event.actorType}
                  {event.actorEmail ? ` · ${event.actorEmail}` : ""} ·{" "}
                  {formatDateTime(event.occurredAt)}
                  {event.workspaceName ? ` · ${event.workspaceName}` : ""}
                </small>
              </div>
              <button
                aria-expanded={expanded}
                className="button button-secondary button-small"
                onClick={() => setExpandedId(expanded ? null : event.id)}
                type="button"
              >
                {expanded ? "Ocultar" : "Detalle"}
              </button>
            </div>
            {expanded ? (
              <pre className="kd-code-block">
                {`Resultado: ${event.result}\nObjetivo: ${event.targetType ?? "—"} ${event.targetId ?? ""}\n\n${metadataText(event.metadata)}`}
              </pre>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
