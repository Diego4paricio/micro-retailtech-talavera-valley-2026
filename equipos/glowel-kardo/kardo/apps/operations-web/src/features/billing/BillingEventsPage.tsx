import { useState } from "react";
import { billingApi } from "../../api/billing.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { formatDateTime, formatNumber } from "../../lib/format.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { eventStatusView } from "./format.js";

export function BillingEventsPage() {
  const [filter, setFilter] = useState<"failed" | "all">("failed");
  const events = useResource(`billing-events:${filter}`, (signal) =>
    billingApi.events(filter, signal),
  );

  return (
    <div className="page">
      <PageHeader
        back={
          <Link
            ariaLabel="Volver a suscripciones"
            className="text-action"
            to={{ name: "billing" }}
          >
            <Icon name="arrow-left" size={16} /> Suscripciones
          </Link>
        }
        description="Eventos que Stripe envía a Kardo. Un evento fallido no se aplicó todavía: la organización afectada puede ver datos desactualizados hasta que se reintente."
        eyebrow="Kardo Operations"
        title="Eventos del webhook"
      />

      <div className="toolbar">
        <div className="segmented">
          {(
            [
              ["failed", "Fallidos"],
              ["all", "Todos"],
            ] as const
          ).map(([value, label]) => (
            <button
              aria-pressed={filter === value}
              className={
                filter === value ? "segment segment-current" : "segment"
              }
              key={value}
              onClick={() => setFilter(value)}
              type="button"
            >
              {label}
            </button>
          ))}
        </div>
        <button
          className="button button-secondary button-small"
          disabled={events.isLoading}
          onClick={() => void events.reload()}
          type="button"
        >
          <Icon name="refresh" size={14} /> Actualizar
        </button>
      </div>

      {events.error ? (
        <Notice tone="error">{events.error}</Notice>
      ) : events.isLoading && !events.data ? (
        <Skeleton lines={6} />
      ) : (events.data ?? []).length === 0 ? (
        <EmptyState
          icon="check"
          title={
            filter === "failed" ? "Sin eventos fallidos" : "Sin eventos todavía"
          }
        >
          {filter === "failed"
            ? "Todos los eventos recibidos se procesaron correctamente."
            : "Cuando Stripe envíe eventos aparecerán aquí."}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Tipo</th>
                <th scope="col">Estado</th>
                <th className="numeric" scope="col">
                  Intentos
                </th>
                <th scope="col">Último error</th>
                <th scope="col">Organización</th>
                <th scope="col">Recibido</th>
              </tr>
            </thead>
            <tbody>
              {(events.data ?? []).map((event) => {
                const status = eventStatusView(event.status);
                return (
                  <tr key={event.id}>
                    <td>
                      <code>{event.type}</code>
                      <div className="row-meta">{event.id}</div>
                    </td>
                    <td>
                      <StatusBadge tone={status.tone}>
                        {status.label}
                      </StatusBadge>
                    </td>
                    <td className="numeric">{formatNumber(event.attempts)}</td>
                    <td className="billing-error-cell">
                      {event.lastError ?? "—"}
                    </td>
                    <td>
                      {event.workspaceId ? (
                        <Link
                          to={{
                            name: "billing-workspace",
                            id: event.workspaceId,
                          }}
                        >
                          Ver facturación
                        </Link>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td>{formatDateTime(event.receivedAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
