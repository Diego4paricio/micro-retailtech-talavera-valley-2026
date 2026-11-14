import type { StaffAccessFilter, StaffAccessWorkspace } from "@kardo/contracts";
import { staffAccessFilters } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { billingApi } from "../../api/billing.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Notice } from "../../components/Notice.js";
import { SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import { formatDateTimeMx } from "../../lib/format.js";
import { Link } from "../../lib/router.js";
import {
  accessDateRows,
  accessFilterLabels,
  accessSourceLabels,
  accessStateView,
  type DeletionMode,
  deletionModeNote,
} from "./format.js";

/** Table of organizations for one access filter (already loaded). */
export function AccessTable({ items }: { items: StaffAccessWorkspace[] }) {
  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            <th scope="col">Organización</th>
            <th scope="col">Owner</th>
            <th scope="col">Estado</th>
            <th scope="col">Plan</th>
            <th scope="col">Fechas</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => {
            const state = accessStateView(item.state);
            const dates = accessDateRows(item, item.endsAt, formatDateTimeMx);
            return (
              <tr key={item.workspaceId}>
                <td>
                  <Link
                    to={{ name: "billing-workspace", id: item.workspaceId }}
                  >
                    <strong>{item.workspaceName}</strong>
                  </Link>
                </td>
                <td>{item.ownerEmail ?? "Sin correo"}</td>
                <td>
                  <StatusBadge tone={state.tone}>{state.label}</StatusBadge>
                  <div className="row-meta">
                    {accessSourceLabels[item.source]}
                  </div>
                </td>
                <td>{item.planName ?? "Sin plan"}</td>
                <td>
                  {dates.length === 0
                    ? "—"
                    : dates.map((row) => (
                        <div className="row-meta" key={row.label}>
                          {row.label}: {row.value}
                        </div>
                      ))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function AccessList({
  filter,
  deletionMode,
  onFilterChange,
}: {
  filter: StaffAccessFilter;
  deletionMode: DeletionMode;
  onFilterChange: (next: StaffAccessFilter) => void;
}) {
  const [items, setItems] = useState<StaffAccessWorkspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    billingApi
      .accessList(filter, controller.signal)
      .then((list) => {
        setItems(list);
        setIsLoading(false);
      })
      .catch((requestError: unknown) => {
        if (isAbortError(requestError)) return;
        setError(errorMessage(requestError));
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [filter]);

  return (
    <section aria-labelledby="access-list-heading" className="panel">
      <SectionHeading
        description="Organizaciones según lo que pueden hacer hoy, con las fechas que importan para cada caso."
        id="access-list-heading"
        title="Acceso"
      />
      <div className="toolbar">
        <fieldset className="segmented">
          <legend className="visually-hidden">
            Filtrar por estado de acceso
          </legend>
          {staffAccessFilters.map((value) => (
            <button
              aria-pressed={value === filter}
              className={
                value === filter ? "segment segment-current" : "segment"
              }
              key={value}
              onClick={() => onFilterChange(value)}
              type="button"
            >
              {accessFilterLabels[value]}
            </button>
          ))}
        </fieldset>
      </div>
      {filter === "deletion" ? (
        <Notice tone="warning">{deletionModeNote(deletionMode)}</Notice>
      ) : null}
      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : isLoading ? (
        <Skeleton lines={4} />
      ) : items.length === 0 ? (
        <EmptyState icon="billing" title="Sin organizaciones">
          Ninguna organización está en «{accessFilterLabels[filter]}».
        </EmptyState>
      ) : (
        <AccessTable items={items} />
      )}
    </section>
  );
}
