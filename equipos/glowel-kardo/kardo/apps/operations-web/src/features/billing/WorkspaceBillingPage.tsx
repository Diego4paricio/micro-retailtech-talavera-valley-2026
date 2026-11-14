import type {
  BillingInvoice,
  BillingSubscription,
  StaffBillingAccount,
  StaffWorkspaceBilling,
} from "@kardo/contracts";
import { useState } from "react";
import { billingApi } from "../../api/billing.js";
import { EmptyState } from "../../components/EmptyState.js";
import { Icon } from "../../components/Icon.js";
import { Notice } from "../../components/Notice.js";
import { PageHeader, SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { StatusBadge } from "../../components/StatusBadge.js";
import { StatusCard } from "../../components/StatusCard.js";
import {
  formatDate,
  formatDateTime,
  formatDateTimeMx,
  formatNumber,
} from "../../lib/format.js";
import { staffPermissions } from "../../lib/permissions.js";
import { Link } from "../../lib/router.js";
import { useResource } from "../../lib/use-resource.js";
import { useStaff } from "../../shell/StaffContext.js";
import { AccessSection, InternalTag } from "./AccessSection.js";
import {
  CancelDialog,
  ExtendTrialDialog,
  RefundDialog,
  ResumeDialog,
  ResyncDialog,
} from "./BillingActionDialogs.js";
import {
  accountTypeLabel,
  availableActions,
  canRefundInvoice,
  entitlementLabel,
  eventStatusView,
  extrasLine,
  formatMoney,
  formatPrice,
  holderLine,
  intervalLabel,
  invoiceStatusView,
  meterView,
  monthlyChargeLine,
  nextDateOf,
  noticeKindLabel,
  noticeStatusView,
  organizationsLine,
  paymentMethodSummary,
  planSourceLabels,
  refundableCents,
  subscriptionStatusView,
} from "./format.js";

type Pending =
  | {
      kind: "cancel" | "resume" | "extend" | "resync";
      subscription: BillingSubscription;
    }
  | { kind: "refund"; invoice: BillingInvoice }
  | null;

/** Plan and dates of the Kardo trial (ADR 020), for the summary card. */
function trialDetail(trial: StaffWorkspaceBilling["trial"]): string {
  if (!trial) return "Sin prueba de Kardo en esta organización";
  if (trial.status === "active")
    return `${trial.planName}, termina el ${formatDate(trial.endsAt)}`;
  if (trial.status === "converted")
    return `${trial.planName}, empezó el ${formatDate(trial.startedAt)}`;
  return `${trial.planName}, terminó el ${formatDate(trial.endsAt)}`;
}

export function WorkspaceBillingPage({ workspaceId }: { workspaceId: string }) {
  const { can } = useStaff();
  const billing = useResource(`billing:${workspaceId}`, (signal) =>
    billingApi.workspace(workspaceId, signal),
  );
  const [pending, setPending] = useState<Pending>(null);
  const canWrite = can(staffPermissions.billingWrite);
  const canRefund = can(staffPermissions.billingRefund);

  const back = (
    <Link
      ariaLabel="Volver a suscripciones"
      className="text-action"
      to={{ name: "billing" }}
    >
      <Icon name="arrow-left" size={16} /> Suscripciones
    </Link>
  );

  if (billing.isLoading && !billing.data) {
    return (
      <div className="page">
        <Skeleton lines={8} />
      </div>
    );
  }
  if (billing.error || !billing.data) {
    return (
      <div className="page">
        <PageHeader back={back} eyebrow="Facturación" title="Facturación" />
        <Notice
          action={
            <button
              className="text-action"
              onClick={() => void billing.reload()}
              type="button"
            >
              Reintentar
            </button>
          }
          tone="error"
        >
          {billing.error ?? "No pudimos cargar la facturación."}
        </Notice>
      </div>
    );
  }

  const data = billing.data;
  const close = () => setPending(null);
  const onUpdated = (next: StaffWorkspaceBilling) => billing.setData(next);

  return (
    <div className="page">
      <PageHeader
        actions={
          <>
            <Link
              className="button button-secondary"
              to={{ name: "customer", id: data.workspaceId }}
            >
              Ver cliente
            </Link>
            {data.stripeDashboardUrl ? (
              <a
                className="button button-secondary"
                href={data.stripeDashboardUrl}
                rel="noopener noreferrer"
                target="_blank"
              >
                Abrir en Stripe <Icon name="external" size={15} />
              </a>
            ) : null}
          </>
        }
        back={back}
        description={[
          accountTypeLabel(data.accountType),
          data.stripeCustomerId
            ? `Cliente de Stripe ${data.stripeCustomerId}`
            : "Esta organización todavía no tiene cliente en Stripe.",
        ]
          .filter(Boolean)
          .join(" · ")}
        eyebrow="Facturación"
        title={
          data.access.internal ? (
            <>
              {data.workspaceName} <InternalTag billing={data} />
            </>
          ) : (
            data.workspaceName
          )
        }
      />

      <AccessSection billing={data} canWrite={canWrite} onUpdated={onUpdated} />

      {data.account ? (
        <AccountSection account={data.account} planName={data.plan?.name} />
      ) : null}

      <section
        aria-label="Resumen de facturación"
        className="status-grid status-grid-4"
      >
        <StatusCard
          detail={data.plan ? planSourceLabels[data.plan.source] : null}
          label="Plan efectivo"
          value={data.plan?.name ?? "Sin plan"}
        />
        <StatusCard
          detail={
            data.manualPlanUntil
              ? "Después rige la suscripción o el plan por defecto"
              : "Sin fecha de vencimiento"
          }
          label="Vencimiento de cortesía"
          value={data.manualPlanUntil ? formatDate(data.manualPlanUntil) : "—"}
        />
        <StatusCard
          detail={trialDetail(data.trial)}
          label="Prueba de Kardo"
          value={
            data.trial
              ? data.trial.status === "active"
                ? `${formatNumber(data.trial.daysLeft)} ${data.trial.daysLeft === 1 ? "día" : "días"}`
                : data.trial.status === "converted"
                  ? "Contrató"
                  : "Terminó"
              : "Sin prueba"
          }
        />
        <StatusCard
          label="Suscripciones"
          value={formatNumber(data.subscriptions.length)}
        />
      </section>

      <UsagePanel billing={data} />

      <section aria-labelledby="subs-heading" className="panel">
        <SectionHeading id="subs-heading" title="Suscripciones" />
        {data.subscriptions.length === 0 ? (
          <EmptyState icon="billing" title="Sin suscripciones">
            Esta organización no ha contratado un plan de pago.
          </EmptyState>
        ) : (
          <ul className="billing-sub-list">
            {data.subscriptions.map((subscription) => (
              <SubscriptionCard
                canWrite={canWrite}
                key={subscription.id}
                onAction={(kind) => setPending({ kind, subscription })}
                subscription={subscription}
              />
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="invoices-heading" className="panel">
        <SectionHeading id="invoices-heading" title="Facturas" />
        {data.invoices.length === 0 ? (
          <p className="muted">Todavía no hay facturas.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Factura</th>
                  <th scope="col">Estado</th>
                  <th className="numeric" scope="col">
                    Total
                  </th>
                  <th className="numeric" scope="col">
                    Pagado
                  </th>
                  <th className="numeric" scope="col">
                    Reembolsado
                  </th>
                  <th scope="col">Periodo</th>
                  <th scope="col">Documentos</th>
                  {canRefund ? <th scope="col">Acción</th> : null}
                </tr>
              </thead>
              <tbody>
                {data.invoices.map((invoice) => {
                  const status = invoiceStatusView(invoice.status);
                  return (
                    <tr key={invoice.id}>
                      <td>
                        <strong>{invoice.number ?? "Sin número"}</strong>
                        <div className="row-meta">
                          {formatDate(invoice.paidAt ?? invoice.createdAt)}
                        </div>
                      </td>
                      <td>
                        <StatusBadge tone={status.tone}>
                          {status.label}
                        </StatusBadge>
                      </td>
                      <td className="numeric">
                        {formatMoney(invoice.total, invoice.currency)}
                      </td>
                      <td className="numeric">
                        {formatMoney(invoice.amountPaid, invoice.currency)}
                      </td>
                      <td className="numeric">
                        {formatMoney(invoice.amountRefunded, invoice.currency)}
                      </td>
                      <td>
                        {invoice.periodStart && invoice.periodEnd
                          ? `${formatDate(invoice.periodStart)} a ${formatDate(invoice.periodEnd)}`
                          : "—"}
                      </td>
                      <td>
                        <span className="billing-links">
                          {invoice.hostedInvoiceUrl ? (
                            <a
                              href={invoice.hostedInvoiceUrl}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              Ver factura
                            </a>
                          ) : null}
                          {invoice.invoicePdf ? (
                            <a
                              href={invoice.invoicePdf}
                              rel="noopener noreferrer"
                              target="_blank"
                            >
                              PDF
                            </a>
                          ) : null}
                          {!invoice.hostedInvoiceUrl && !invoice.invoicePdf
                            ? "—"
                            : null}
                        </span>
                      </td>
                      {canRefund ? (
                        <td>
                          {canRefundInvoice(invoice) ? (
                            <button
                              className="button button-secondary button-small"
                              onClick={() =>
                                setPending({ kind: "refund", invoice })
                              }
                              type="button"
                            >
                              Reembolsar
                            </button>
                          ) : (
                            <span className="muted">
                              {refundableCents(invoice) === 0 &&
                              invoice.status === "paid"
                                ? "Reembolsada"
                                : "—"}
                            </span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="refunds-heading" className="panel">
        <SectionHeading id="refunds-heading" title="Reembolsos" />
        {data.refunds.length === 0 ? (
          <p className="muted">No se han hecho reembolsos.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Fecha</th>
                  <th className="numeric" scope="col">
                    Monto
                  </th>
                  <th scope="col">Estado</th>
                  <th scope="col">Factura</th>
                  <th scope="col">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {data.refunds.map((refund) => (
                  <tr key={refund.id}>
                    <td>{formatDateTime(refund.createdAt)}</td>
                    <td className="numeric">
                      {formatMoney(refund.amount, refund.currency)}
                    </td>
                    <td>{refund.status}</td>
                    <td>{refund.invoiceId ?? "—"}</td>
                    <td>{refund.reason ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="notices-heading" className="panel">
        <SectionHeading
          description="Correos al cliente: contratación, renovación, prueba, fin del plan, pausa, borrado y cancelación con folio. Sirven como constancia. Las horas son de la Ciudad de México."
          id="notices-heading"
          title="Avisos al cliente"
        />
        {data.notices.length === 0 ? (
          <p className="muted">Todavía no se han enviado avisos.</p>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">Aviso</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Folio</th>
                  <th scope="col">Enviado a</th>
                  <th scope="col">Creado</th>
                  <th scope="col">Enviado</th>
                </tr>
              </thead>
              <tbody>
                {data.notices.map((notice) => {
                  const status = noticeStatusView(notice.status);
                  return (
                    <tr key={notice.id}>
                      <td>{noticeKindLabel(notice.kind)}</td>
                      <td>
                        <StatusBadge tone={status.tone}>
                          {status.label}
                        </StatusBadge>
                      </td>
                      <td>{notice.folio ?? "—"}</td>
                      <td>{notice.sentTo ?? "—"}</td>
                      <td>{formatDateTimeMx(notice.createdAt)}</td>
                      <td>{formatDateTimeMx(notice.sentAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="events-heading" className="panel">
        <SectionHeading
          description="Eventos de Stripe que afectaron a esta organización."
          id="events-heading"
          title="Eventos del webhook"
        />
        {data.events.length === 0 ? (
          <p className="muted">Sin eventos registrados.</p>
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
                  <th scope="col">Recibido</th>
                </tr>
              </thead>
              <tbody>
                {data.events.map((event) => {
                  const status = eventStatusView(event.status);
                  return (
                    <tr key={event.id}>
                      <td>
                        <code>{event.type}</code>
                      </td>
                      <td>
                        <StatusBadge tone={status.tone}>
                          {status.label}
                        </StatusBadge>
                      </td>
                      <td className="numeric">
                        {formatNumber(event.attempts)}
                      </td>
                      <td className="billing-error-cell">
                        {event.lastError ?? "—"}
                      </td>
                      <td>{formatDateTime(event.receivedAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {pending?.kind === "cancel" ? (
        <CancelDialog
          onClose={close}
          onUpdated={onUpdated}
          subscription={pending.subscription}
        />
      ) : null}
      {pending?.kind === "resume" ? (
        <ResumeDialog
          onClose={close}
          onUpdated={onUpdated}
          subscription={pending.subscription}
        />
      ) : null}
      {pending?.kind === "extend" ? (
        <ExtendTrialDialog
          onClose={close}
          onUpdated={onUpdated}
          subscription={pending.subscription}
        />
      ) : null}
      {pending?.kind === "resync" ? (
        <ResyncDialog
          onClose={close}
          onUpdated={onUpdated}
          subscription={pending.subscription}
        />
      ) : null}
      {pending?.kind === "refund" ? (
        <RefundDialog
          invoice={pending.invoice}
          onClose={close}
          onUpdated={onUpdated}
        />
      ) : null}
    </div>
  );
}

/** ADR 024: the person's billing account that covers this organization. */
function AccountSection({
  account,
  planName,
}: {
  account: StaffBillingAccount;
  planName: string | undefined;
}) {
  return (
    <section aria-labelledby="account-heading" className="panel">
      <SectionHeading
        description="El plan es de la persona y cubre sus organizaciones."
        id="account-heading"
        title="Cuenta de cobro"
      />
      <dl className="account-rows">
        <div>
          <dt>Persona</dt>
          <dd>{holderLine(account)}</dd>
        </div>
        <div>
          <dt>Plan</dt>
          <dd>{planName ?? "Sin plan"}</dd>
        </div>
        <div>
          <dt>Extras</dt>
          <dd>{extrasLine(account.extras)}</dd>
        </div>
        <div>
          <dt>Cobro mensual</dt>
          <dd>{monthlyChargeLine(account.monthlyAmount)}</dd>
        </div>
        <div>
          <dt>Organizaciones</dt>
          <dd>
            {organizationsLine(account)}
            {account.organizations.length > 0 ? (
              <ul className="account-orgs">
                {account.organizations.map((organization) => (
                  <li key={organization.id}>
                    <Link
                      to={{ name: "billing-workspace", id: organization.id }}
                    >
                      {organization.name}
                    </Link>
                    {organization.excluded ? (
                      <span className="account-org-state">
                        <span aria-hidden="true" className="account-dot" />
                        Fuera del plan
                      </span>
                    ) : null}
                    {organization.internal ? (
                      <span className="account-org-state">Interna</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : null}
          </dd>
        </div>
      </dl>
    </section>
  );
}

function UsagePanel({ billing }: { billing: StaffWorkspaceBilling }) {
  const keys = Object.keys(billing.entitlements);
  return (
    <section aria-labelledby="usage-heading" className="panel">
      <SectionHeading
        description={
          billing.plan
            ? `Consumo actual contra los límites del plan ${billing.plan.name}.`
            : "Sin plan asignado: no hay límites."
        }
        id="usage-heading"
        title="Consumo y límites"
      />
      {keys.length === 0 ? (
        <p className="muted">El plan no define límites.</p>
      ) : (
        <ul className="billing-meters">
          {keys.map((key) => {
            const view = meterView(
              key,
              billing.entitlements[key],
              billing.usage[key],
            );
            if (view.kind === "feature") {
              return (
                <li className="billing-meter" key={key}>
                  <div className="billing-meter-head">
                    <span>{entitlementLabel(key)}</span>
                    <StatusBadge tone={view.enabled ? "success" : "neutral"}>
                      {view.enabled ? "Incluido" : "No incluido"}
                    </StatusBadge>
                  </div>
                </li>
              );
            }
            const percent =
              view.ratio === null
                ? 0
                : Math.min(100, Math.round(view.ratio * 100));
            return (
              <li className="billing-meter" key={key}>
                <div className="billing-meter-head">
                  <span>{entitlementLabel(key)}</span>
                  <strong>
                    {view.usage === null ? "—" : formatNumber(view.usage)} de{" "}
                    {view.limit === null
                      ? "sin límite"
                      : formatNumber(view.limit)}
                  </strong>
                </div>
                {view.limit !== null && view.usage !== null ? (
                  <div
                    aria-hidden="true"
                    className={`billing-meter-track billing-meter-${view.tone}`}
                  >
                    <span style={{ width: `${percent}%` }} />
                  </div>
                ) : null}
                {view.usage === null && view.limit !== null ? (
                  <small className="muted">
                    El consumo no se mide para este límite.
                  </small>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SubscriptionCard({
  subscription,
  canWrite,
  onAction,
}: {
  subscription: BillingSubscription;
  canWrite: boolean;
  onAction: (kind: "cancel" | "resume" | "extend" | "resync") => void;
}) {
  const status = subscriptionStatusView(subscription.status);
  const actions = availableActions(subscription);
  const next = nextDateOf(subscription);
  return (
    <li className="billing-sub">
      <div className="billing-sub-head">
        <div>
          <strong>
            {subscription.planName ?? subscription.planCode ?? "Sin plan"}
          </strong>
          <div className="row-meta">{subscription.id}</div>
        </div>
        <div className="billing-sub-badges">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {subscription.cancelAtPeriodEnd && actions.cancel ? (
            <StatusBadge tone="warning">
              Cancela al final del periodo
            </StatusBadge>
          ) : null}
        </div>
      </div>
      <dl className="billing-facts">
        <div>
          <dt>Monto</dt>
          <dd>
            {formatPrice(
              subscription.unitAmount,
              subscription.currency,
              subscription.interval,
            )}
          </dd>
        </div>
        <div>
          <dt>Intervalo</dt>
          <dd>{intervalLabel(subscription.interval)}</dd>
        </div>
        <div>
          <dt>{next.label}</dt>
          <dd>{next.date ? formatDate(next.date) : "—"}</dd>
        </div>
        <div>
          <dt>Método de pago</dt>
          <dd>{paymentMethodSummary(subscription.paymentMethod)}</dd>
        </div>
        <div>
          <dt>Contratada</dt>
          <dd>{formatDate(subscription.createdAt)}</dd>
        </div>
      </dl>
      {canWrite ? (
        <div className="row-actions billing-sub-actions">
          {actions.extendTrial ? (
            <button
              className="button button-secondary button-small"
              onClick={() => onAction("extend")}
              type="button"
            >
              Extender prueba
            </button>
          ) : null}
          {actions.resume ? (
            <button
              className="button button-secondary button-small"
              onClick={() => onAction("resume")}
              type="button"
            >
              Reanudar
            </button>
          ) : null}
          <button
            className="button button-secondary button-small"
            onClick={() => onAction("resync")}
            type="button"
          >
            <Icon name="refresh" size={14} /> Resincronizar
          </button>
          {actions.cancel ? (
            <button
              className="button button-danger button-small"
              onClick={() => onAction("cancel")}
              type="button"
            >
              Cancelar
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}
