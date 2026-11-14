import {
  type StaffAccessFilter,
  type StaffBillingSubscription,
  subscriptionStatuses,
} from "@kardo/contracts";
import { useEffect, useState } from "react";
import {
  type BillingSubscriptionQuery,
  billingApi,
  cfdiApi,
} from "../../api/billing.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader, SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { StatusCard } from "../../components/StatusCard.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import { formatDate, formatNumber } from "../../lib/format.js";
import { appendPage, hasMore } from "../../lib/pagination.js";
import { Link } from "../../lib/router.js";
import { useDebouncedValue } from "../../lib/use-debounced-value.js";
import { useResource } from "../../lib/use-resource.js";
import { AccessList } from "./AccessList.js";
import {
  deletionModeNote,
  formatMoney,
  formatPrice,
  intervalLabel,
  livemodeView,
  nextDateOf,
  subscriptionStatusLabels,
  subscriptionStatusView,
} from "./format.js";
import { MrrByPlanChart } from "./MrrByPlanChart.js";

export function BillingPage() {
  const overview = useResource("billing-overview", (signal) =>
    billingApi.overview(signal),
  );
  // The counter is a convenience: if it fails the link still works.
  const pendingCfdi = useResource("cfdi-pending-count", (signal) =>
    cfdiApi.list("pending", signal),
  );
  const [accessFilter, setAccessFilter] = useState<StaffAccessFilter>("trial");

  return (
    <div className="page">
      <PageHeader
        actions={
          <>
            <Link
              className="button button-secondary"
              to={{ name: "billing-invoices" }}
            >
              {pendingCfdi.data
                ? `Facturas por emitir (${pendingCfdi.data.length})`
                : "Facturas por emitir"}
            </Link>
            <Link
              className="button button-secondary"
              to={{ name: "billing-events" }}
            >
              Eventos del webhook
            </Link>
          </>
        }
        description="Estado del cobro de todas las organizaciones. Stripe cobra; Kardo aplica los límites. Los montos están en pesos mexicanos con IVA incluido."
        eyebrow="Kardo Operations"
        title="Suscripciones"
      />

      {overview.error ? (
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void overview.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="error"
        >
          {overview.error}
        </Notice>
      ) : overview.isLoading || !overview.data ? (
        <Skeleton lines={4} />
      ) : (
        <>
          <section
            aria-label="Indicadores de suscripciones"
            className="status-grid kd-kpi-grid"
          >
            <StatusCard
              detail="Al mes, planes anuales entre 12"
              label="MRR"
              value={formatMoney(overview.data.mrr, overview.data.currency, {
                withCode: true,
              })}
            />
            <StatusCard
              label="Activas"
              value={formatNumber(overview.data.active)}
            />
            <StatusCard
              label="En prueba"
              value={formatNumber(overview.data.trialing)}
            />
            <StatusCard
              detail={
                overview.data.pastDue > 0 ? "Cobro fallido, en reintento" : null
              }
              label="En mora"
              value={formatNumber(overview.data.pastDue)}
            />
            <StatusCard
              label="Canceladas · 30 días"
              value={formatNumber(overview.data.canceledLast30Days)}
            />
            <StatusCard
              detail="Convierten o se cancelan pronto"
              label="Pruebas que terminan en 7 días"
              value={formatNumber(overview.data.trialsEndingNext7Days)}
            />
            <StatusCard
              detail={
                <Link className="text-action" to={{ name: "billing-events" }}>
                  Ver eventos
                </Link>
              }
              label="Eventos de webhook fallidos"
              value={formatNumber(overview.data.failedWebhookEvents)}
            />
          </section>
          <section
            aria-label="Acceso de las organizaciones"
            className="status-grid status-grid-6"
          >
            {(
              [
                [
                  "En prueba",
                  "kardoTrials",
                  "trial",
                  "Prueba de Kardo, sin tarjeta",
                ],
                ["Limitadas", "limited", "limited", null],
                ["En pausa", "paused", "paused", null],
                [
                  "Por borrar",
                  "pendingDeletion",
                  "deletion",
                  deletionModeNote(overview.data.access.deletionMode),
                ],
                [
                  "Eliminadas",
                  "deleted",
                  "deleted",
                  "Se conservan facturas y CFDI",
                ],
                ["Internas", "internal", "internal", "No cuentan en MRR"],
              ] as const
            ).map(([label, key, filter, note]) => (
              <StatusCard
                detail={
                  <>
                    {note ? (
                      <>
                        <span>{note}</span>
                        <br />
                      </>
                    ) : null}
                    <button
                      className="text-action"
                      onClick={() => setAccessFilter(filter)}
                      type="button"
                    >
                      Ver lista
                    </button>
                  </>
                }
                key={key}
                label={label}
                value={formatNumber(overview.data?.access[key] ?? 0)}
              />
            ))}
          </section>
          <MrrByPlanChart
            byPlan={overview.data.byPlan}
            currency={overview.data.currency}
          />
        </>
      )}

      <AccessList
        deletionMode={overview.data?.access.deletionMode ?? "off"}
        filter={accessFilter}
        onFilterChange={setAccessFilter}
      />

      <SubscriptionList
        planOptions={(overview.data?.byPlan ?? []).flatMap((row) =>
          row.planCode ? [{ code: row.planCode, name: row.planName }] : [],
        )}
      />
    </div>
  );
}

function SubscriptionList({
  planOptions,
}: {
  planOptions: { code: string; name: string | null }[];
}) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [plan, setPlan] = useState("");
  const debouncedQuery = useDebouncedValue(query.trim(), 300);

  const [items, setItems] = useState<StaffBillingSubscription[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function params(cursor?: string): BillingSubscriptionQuery {
    const result: BillingSubscriptionQuery = {};
    if (status) result.status = status as (typeof subscriptionStatuses)[number];
    if (plan) result.plan = plan;
    if (debouncedQuery) result.q = debouncedQuery;
    if (cursor) result.cursor = cursor;
    return result;
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: `params` reads exactly these three filters.
  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setError(null);
    billingApi
      .subscriptions(params(), controller.signal)
      .then((page) => {
        setItems(page.items);
        setNextCursor(page.nextCursor);
        setIsLoading(false);
      })
      .catch((requestError: unknown) => {
        if (isAbortError(requestError)) return;
        setError(errorMessage(requestError));
        setIsLoading(false);
      });
    return () => controller.abort();
  }, [debouncedQuery, status, plan]);

  async function loadMore() {
    if (!nextCursor) return;
    setIsLoadingMore(true);
    try {
      const page = await billingApi.subscriptions(params(nextCursor));
      setItems((current) => appendPage(current, page));
      setNextCursor(page.nextCursor);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setIsLoadingMore(false);
    }
  }

  return (
    <section aria-labelledby="subscriptions-heading" className="panel">
      <SectionHeading id="subscriptions-heading" title="Suscripciones" />
      <div className="toolbar">
        <label className="search-field">
          <span className="visually-hidden">Buscar suscripciones</span>
          <input
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar por organización o correo…"
            type="search"
            value={query}
          />
        </label>
        <label>
          <span className="visually-hidden">Filtrar por estado</span>
          <select
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            <option value="">Todos los estados</option>
            {subscriptionStatuses.map((value) => (
              <option key={value} value={value}>
                {subscriptionStatusLabels[value]}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="visually-hidden">Filtrar por plan</span>
          <select
            onChange={(event) => setPlan(event.target.value)}
            value={plan}
          >
            <option value="">Todos los planes</option>
            {planOptions.map((option) => (
              <option key={option.code} value={option.code}>
                {option.name ?? option.code}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <Notice tone="error">{error}</Notice>
      ) : isLoading ? (
        <Skeleton lines={5} />
      ) : items.length === 0 ? (
        <EmptyState icon="billing" title="Sin suscripciones">
          Ninguna suscripción coincide con estos filtros.
        </EmptyState>
      ) : (
        <>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Organización</th>
                  <th scope="col">Plan</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Intervalo</th>
                  <th className="numeric" scope="col">
                    Monto
                  </th>
                  <th scope="col">Fecha clave</th>
                  <th scope="col">Modo</th>
                </tr>
              </thead>
              <tbody>
                {items.map((subscription) => (
                  <SubscriptionRow
                    key={subscription.id}
                    subscription={subscription}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {hasMore({ items, nextCursor }) ? (
            <div className="form-actions">
              <button
                className="button button-secondary"
                disabled={isLoadingMore}
                onClick={() => void loadMore()}
                type="button"
              >
                {isLoadingMore ? "Cargando…" : "Cargar más"}
              </button>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function SubscriptionRow({
  subscription,
}: {
  subscription: StaffBillingSubscription;
}) {
  const status = subscriptionStatusView(subscription.status);
  const mode = livemodeView(subscription.livemode);
  const next = nextDateOf(subscription);
  return (
    <tr>
      <td>
        <Link to={{ name: "billing-workspace", id: subscription.workspaceId }}>
          <strong>{subscription.workspaceName}</strong>
        </Link>
        <div className="row-meta">
          {subscription.ownerEmail ?? "Sin correo"}
        </div>
      </td>
      <td>{subscription.planName ?? subscription.planCode ?? "—"}</td>
      <td>
        <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
        {subscription.cancelAtPeriodEnd &&
        subscription.status !== "canceled" ? (
          <div className="row-meta billing-flag">
            Cancela al final del periodo
          </div>
        ) : null}
      </td>
      <td>{intervalLabel(subscription.interval)}</td>
      <td className="numeric">
        {formatPrice(
          subscription.unitAmount,
          subscription.currency,
          subscription.interval,
        )}
      </td>
      <td>
        {next.date ? (
          <>
            {formatDate(next.date)}
            <div className="row-meta">{next.label}</div>
          </>
        ) : (
          "—"
        )}
      </td>
      <td>
        <StatusBadge tone={mode.tone}>{mode.label}</StatusBadge>
      </td>
    </tr>
  );
}
