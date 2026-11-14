import type { BillingPortalFlow, WorkspaceBilling } from "@kardo/contracts";
import { useEffect, useState } from "react";
import { billingApi } from "../../api/billing.js";
import { Dialog } from "../../components/Dialog.js";
import {
  SettingsGroup,
  SettingsRow,
  StatusText,
} from "../../components/SettingsBlocks.js";
import { useAccess } from "./access-context.js";
import {
  coveredNames,
  currentExtraQuantities,
  extrasCount,
  extrasTotal,
  foreignPlanText,
  isAccountHolder,
  nextChargeNote,
} from "./extras-model.js";
import {
  type BillingTone,
  formatLongDate,
  formatMoney,
  formatPriceLine,
  isOpenSubscription,
  paymentMethodLabel,
  planSourceLabel,
  subscriptionStatusView,
  trialSummary,
} from "./format.js";

type Props = {
  billing: WorkspaceBilling;
  busy: string | null;
  onPortal: (flow: BillingPortalFlow) => void;
  /** To ask the server for the exact next charge when there are extras. */
  workspaceId?: string;
};

/**
 * The exact next charge of a subscription with extras, from the server (a
 * preview with today's quantities, `confirm: false`): the panel adds no
 * prices of its own (A2-66). Null while it loads or if it is not available.
 */
function useServerNextAmount(
  billing: WorkspaceBilling,
  workspaceId: string | undefined,
): number | null {
  const [amount, setAmount] = useState<number | null>(null);
  const extras = billing.account?.extras ?? [];
  const wanted =
    !!workspaceId &&
    isAccountHolder(billing) &&
    isOpenSubscription(billing.subscription) &&
    extrasCount(extras) > 0;
  const signature = JSON.stringify(currentExtraQuantities(extras));
  useEffect(() => {
    if (!wanted || !workspaceId) {
      setAmount(null);
      return;
    }
    let live = true;
    billingApi
      .changeExtras(workspaceId, {
        quantities: JSON.parse(signature),
        confirm: false,
      })
      .then((result) => {
        if (live) setAmount(result.nextAmount);
      })
      .catch(() => {
        if (live) setAmount(null);
      });
    return () => {
      live = false;
    };
  }, [wanted, workspaceId, signature]);
  return amount;
}

function Spinner() {
  return <span aria-hidden="true" className="button-spinner" />;
}

/** Billing tone to the plain dot of `StatusText` (no pills). */
export function dotTone(tone: BillingTone): "on" | "off" | "warning" {
  if (tone === "success" || tone === "info") return "on";
  if (tone === "warning" || tone === "danger") return "warning";
  return "off";
}

/** «Tu plan»: origin, state, price, next charge and payment method as rows. */
export function PlanSummary({ billing, busy, onPortal, workspaceId }: Props) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const { access } = useAccess();
  const { plan, subscription, checkoutAvailable } = billing;
  const account = billing.account ?? null;
  const serverNextAmount = useServerNextAmount(billing, workspaceId);
  // ADR 024: only the person whose plan covers the organization changes it.
  const canManage = billing.canManage && isAccountHolder(billing);
  // ADR 020: without a plan the organization is read-only (limited or
  // paused); only organizations from before it are "sin límites".
  const withoutPlan = access?.state === "limited" || access?.state === "paused";
  const trial = subscription ? null : trialSummary(billing.trial);
  const status = subscription ? subscriptionStatusView(subscription) : null;
  const open = isOpenSubscription(subscription);
  const paymentMethod = paymentMethodLabel(subscription?.paymentMethod ?? null);
  const endDate = formatLongDate(
    subscription?.cancelAt ?? subscription?.currentPeriodEnd,
  );

  const price =
    subscription?.unitAmount != null && subscription.interval
      ? formatPriceLine({
          unitAmount: subscription.unitAmount,
          currency: subscription.currency ?? "mxn",
          interval: subscription.interval,
          taxInclusive: true,
        })
      : null;
  const nextCharge =
    open && !subscription.cancelAtPeriodEnd
      ? formatLongDate(subscription.currentPeriodEnd)
      : "";

  const cancelBusy = busy === "subscription_cancel";
  const canUsePortal = canManage && checkoutAvailable && !!subscription;
  const planName = plan
    ? plan.name
    : withoutPlan
      ? "Sin plan"
      : "Beta sin límites";

  if (account && !account.isHolder)
    return (
      <SettingsGroup id="billing-plan-heading" title="Tu plan">
        <SettingsRow
          label="Plan"
          value={foreignPlanText(planName, account.holderName)}
        />
      </SettingsGroup>
    );

  // The server's amount; until it answers (or if it cannot) the list prices
  // added here, marked «aprox.».
  const approximate = serverNextAmount === null;
  const nextTotal =
    open && subscription.interval && subscription.unitAmount != null
      ? (serverNextAmount ??
        subscription.unitAmount +
          extrasTotal(account?.extras ?? [], subscription.interval))
      : null;
  const extrasNote = nextChargeNote(account?.extras ?? [], { approximate });

  return (
    <>
      <SettingsGroup
        actions={
          canUsePortal ? (
            <>
              <button
                aria-busy={busy === "default"}
                className="button button-primary button-small"
                disabled={busy !== null}
                onClick={() => onPortal("default")}
                type="button"
              >
                {busy === "default" ? <Spinner /> : null}
                Administrar suscripción
              </button>
              {open ? (
                <button
                  aria-busy={busy === "subscription_update"}
                  className="button button-secondary button-small"
                  disabled={busy !== null}
                  onClick={() => onPortal("subscription_update")}
                  type="button"
                >
                  {busy === "subscription_update" ? <Spinner /> : null}
                  Cambiar de plan
                </button>
              ) : null}
            </>
          ) : undefined
        }
        id="billing-plan-heading"
        title="Tu plan"
      >
        <SettingsRow
          label="Plan"
          value={
            <>
              <strong>{planName}</strong>
              <span className="muted">
                {" · "}
                {withoutPlan
                  ? "Solo lectura"
                  : planSourceLabel(plan, subscription)}
              </span>
            </>
          }
        />
        {account && account.organizations.length > 0 ? (
          <SettingsRow
            label="Cubre"
            value={
              <>
                Tus organizaciones donde eres Owner
                <p className="billing-row-note">{coveredNames(account)}</p>
              </>
            }
          />
        ) : null}
        {status ? (
          <SettingsRow
            label="Estado"
            value={
              <StatusText tone={dotTone(status.tone)}>
                {status.label}
              </StatusText>
            }
          />
        ) : null}
        {trial ? (
          <SettingsRow
            label="Prueba gratuita"
            value={
              <>
                <StatusText
                  tone={billing.trial?.status === "ended" ? "warning" : "on"}
                >
                  {trial.title}
                </StatusText>
                <p className="billing-row-note">{trial.text}</p>
              </>
            }
          />
        ) : null}
        {!plan && !trial ? (
          <SettingsRow
            label="Sin plan"
            value={
              <span className="billing-row-note">
                {withoutPlan
                  ? "Tu organización no tiene un plan. Puedes ver tu información y descargarla en Configuración, General; para crear o editar, elige un plan."
                  : "Tu organización no tiene un plan asignado, así que hoy no tiene límites de uso."}
              </span>
            }
          />
        ) : null}
        {price ? <SettingsRow label="Precio" value={price} /> : null}
        {nextCharge ? (
          <SettingsRow
            label={
              subscription?.status === "trialing"
                ? "Primer cobro"
                : "Próximo cobro"
            }
            value={
              extrasNote && nextTotal !== null ? (
                <>
                  <strong>
                    {formatMoney(nextTotal, subscription?.currency ?? "mxn")}
                  </strong>
                  {` el ${nextCharge}`}
                  <p className="billing-row-note">{extrasNote}</p>
                </>
              ) : (
                nextCharge
              )
            }
          />
        ) : null}
        {paymentMethod ? (
          <SettingsRow
            action={
              canUsePortal && open ? (
                <button
                  aria-busy={busy === "payment_method_update"}
                  className="button button-secondary button-small"
                  disabled={busy !== null}
                  onClick={() => onPortal("payment_method_update")}
                  type="button"
                >
                  {busy === "payment_method_update" ? <Spinner /> : null}
                  Cambiar tarjeta
                </button>
              ) : undefined
            }
            label="Forma de pago"
            value={paymentMethod}
          />
        ) : null}
        {canUsePortal && open && !subscription.cancelAtPeriodEnd ? (
          <SettingsRow
            action={
              <button
                className="button button-danger-quiet button-small"
                disabled={busy !== null}
                onClick={() => setConfirmCancel(true)}
                type="button"
              >
                Cancelar plan
              </button>
            }
            description="Sigues con tu plan hasta el final del periodo pagado."
            label="Cancelar plan"
            tone="danger"
          />
        ) : null}
        {canManage ? (
          !subscription ? (
            <SettingsRow
              label="Contratar"
              value={
                <span className="billing-row-note">
                  Elige un plan en la página de precios para contratar.
                </span>
              }
            />
          ) : null
        ) : (
          <SettingsRow
            label="Cambios"
            value={
              <span className="billing-row-note">
                Solo la persona propietaria puede cambiar el plan o la forma de
                pago.
              </span>
            }
          />
        )}
      </SettingsGroup>

      <Dialog
        description={
          endDate
            ? `Tu plan sigue activo hasta el final del periodo pagado, el ${endDate}. No se hará otro cobro y tu contenido se conserva.`
            : "Tu plan sigue activo hasta el final del periodo pagado. No se hará otro cobro y tu contenido se conserva."
        }
        footer={
          <>
            <button
              className="button button-ghost"
              onClick={() => setConfirmCancel(false)}
              type="button"
            >
              Mantener mi plan
            </button>
            <button
              aria-busy={cancelBusy}
              className="button button-danger"
              disabled={busy !== null}
              onClick={() => onPortal("subscription_cancel")}
              type="button"
            >
              {cancelBusy ? <Spinner /> : null}
              Continuar para cancelar
            </button>
          </>
        }
        onClose={() => setConfirmCancel(false)}
        open={confirmCancel}
        title="Cancelar plan"
        tone="danger"
      >
        <p className="billing-muted">
          Te llevaremos a la página segura de Stripe para confirmar la
          cancelación. Puedes volver a contratar cuando quieras.
        </p>
      </Dialog>
    </>
  );
}
