import type { PublicStatusIncident, ServiceStatus } from "@kardo/contracts";
import { Popover } from "radix-ui";
import { useState } from "react";
import { formatRelative } from "../../lib/format.js";
import {
  componentLabel,
  componentView,
  type DisplayLevel,
  displayLevel,
  formatWindow,
  headline,
  latestUpdate,
  levelView,
  updateKindLabel,
} from "./status-model.js";
import { useServiceStatus } from "./use-service-status.js";

/**
 * Service status left of the bell (ADR 022 §6): «Status» and a plain dot
 * whose color is the state (the words go to the accessible label). Opening
 * it lists each area in customer words, open incidents and planned
 * maintenance.
 */
export function StatusIndicator() {
  const { configured, status, failed, online, refresh } = useServiceStatus();
  const [open, setOpen] = useState(false);
  if (!configured) return null;
  const level = displayLevel(status, { online, failed });
  const view = levelView[level];

  return (
    <Popover.Root
      onOpenChange={(next) => {
        setOpen(next);
        if (next) refresh();
      }}
      open={open}
    >
      <Popover.Trigger asChild>
        <button
          aria-label={`Estado del servicio: ${view.pill}`}
          className={`status-trigger tone-${view.tone}`}
          data-level={level}
          title={view.pill}
          type="button"
        >
          <span aria-hidden="true" className="status-dot" />
          <span className="status-trigger-text">Status</span>
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          aria-label="Estado del servicio"
          className="status-popover"
          collisionPadding={12}
          sideOffset={8}
        >
          <StatusPanelView level={level} status={status} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}

/** The panel, without state (rendered in tests). */
export function StatusPanelView({
  status,
  level,
}: {
  status: ServiceStatus | null;
  level: DisplayLevel;
}) {
  const view = levelView[level];
  return (
    <div className="status-panel">
      <header className={`status-panel-head tone-${view.tone}`}>
        <span aria-hidden="true" className="status-dot status-dot-large" />
        <div>
          <h2>Estado del servicio</h2>
          <p>
            {status
              ? headline(status, level)
              : headline(
                  {
                    overall: "operational",
                    checkedAt: null,
                    components: [],
                    incidents: [],
                    upcoming: [],
                  },
                  level,
                )}
          </p>
        </div>
      </header>

      {status && status.incidents.length > 0 ? (
        <section aria-label="Avisos activos" className="status-section">
          {status.incidents.map((incident) => (
            <IncidentCard incident={incident} key={incident.id} />
          ))}
        </section>
      ) : null}

      {status && level !== "unknown" && level !== "offline" ? (
        <ul aria-label="Áreas de Kardo" className="status-components">
          {status.components.map((component) => {
            const item = componentView(status, component);
            return (
              <li className={`tone-${item.tone}`} key={component.id}>
                <span className="status-component-name">
                  {componentLabel(component.id)}
                </span>
                <span className="status-component-level">
                  <span aria-hidden="true" className="status-dot" />
                  {item.word}
                </span>
                {component.provider &&
                item.tone !== "neutral" &&
                component.level !== "operational" ? (
                  <span className="status-component-note">
                    Por una falla de un proveedor
                  </span>
                ) : null}
              </li>
            );
          })}
        </ul>
      ) : null}

      {status && status.upcoming.length > 0 ? (
        <section className="status-section">
          <h3>Mantenimiento programado</h3>
          {status.upcoming.map((maintenance) => (
            <IncidentCard incident={maintenance} key={maintenance.id} />
          ))}
        </section>
      ) : null}

      <footer className="status-panel-foot">
        {status?.checkedAt && level !== "unknown" && level !== "offline"
          ? `Revisado ${formatRelative(status.checkedAt)}`
          : "Lo revisamos cada minuto."}
      </footer>
    </div>
  );
}

function IncidentCard({ incident }: { incident: PublicStatusIncident }) {
  const update = latestUpdate(incident);
  const tone = levelView[incident.impact].tone;
  return (
    <article className={`status-incident tone-${tone}`}>
      <p className="status-incident-meta">
        {update ? <span>{updateKindLabel[update.status]}</span> : null}
        {incident.kind === "maintenance" ? (
          <span>{formatWindow(incident.startsAt, incident.endsAt)}</span>
        ) : update ? (
          <time dateTime={update.at}>{formatRelative(update.at)}</time>
        ) : null}
      </p>
      <h4>{incident.title}</h4>
      {update ? <p className="status-incident-text">{update.message}</p> : null}
      <p className="status-incident-areas">
        {incident.components.map(componentLabel).join(" · ")}
      </p>
    </article>
  );
}
