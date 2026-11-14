import type {
  BillingInvoice,
  BillingSubscription,
  StaffWorkspaceBilling,
} from "@kardo/contracts";
import { useEffect, useState } from "react";
import { billingApi } from "../../api/billing.js";
import { Field } from "../../components/Field.js";
import { Notice } from "../../components/Notice.js";
import { useToast } from "../../components/Toast.js";
import { formatDate } from "../../lib/format.js";
import { ActionDialog } from "./ActionDialog.js";
import {
  availableActions,
  formatMoney,
  refundableCents,
  validateRefund,
  validateTrialDays,
} from "./format.js";

type CommonProps = {
  onClose: () => void;
  onUpdated: (next: StaffWorkspaceBilling) => void;
};

type SubscriptionProps = CommonProps & { subscription: BillingSubscription };

function subscriptionLabel(subscription: BillingSubscription): string {
  return subscription.planName ?? subscription.planCode ?? subscription.id;
}

export function CancelDialog({
  subscription,
  onClose,
  onUpdated,
}: SubscriptionProps) {
  const { notify } = useToast();
  const actions = availableActions(subscription);
  const [mode, setMode] = useState<"period_end" | "immediately">(
    actions.cancelPeriodEnd ? "period_end" : "immediately",
  );
  useEffect(() => {
    setMode(actions.cancelPeriodEnd ? "period_end" : "immediately");
  }, [actions.cancelPeriodEnd]);

  return (
    <ActionDialog
      confirmLabel={
        mode === "immediately" ? "Cancelar ahora" : "Programar cancelación"
      }
      description={`Suscripción ${subscriptionLabel(subscription)} de esta organización.`}
      onClose={onClose}
      onSubmit={async (reason) => {
        onUpdated(await billingApi.cancel(subscription.id, { mode, reason }));
        notify(
          mode === "immediately"
            ? "Suscripción cancelada de inmediato."
            : "Cancelación programada al final del periodo.",
        );
      }}
      open
      title="Cancelar suscripción"
      tone="danger"
    >
      <fieldset className="billing-choice">
        <legend>¿Cuándo termina?</legend>
        {actions.cancelPeriodEnd ? (
          <label className="checkbox-row">
            <input
              checked={mode === "period_end"}
              name="cancel-mode"
              onChange={() => setMode("period_end")}
              type="radio"
            />
            <span>
              <strong>Al final del periodo</strong>
              <br />
              Sigue activa
              {subscription.currentPeriodEnd
                ? ` hasta el ${formatDate(subscription.currentPeriodEnd)}`
                : ""}{" "}
              y ya no se vuelve a cobrar. Puedes reanudarla antes de esa fecha.
            </span>
          </label>
        ) : null}
        <label className="checkbox-row">
          <input
            checked={mode === "immediately"}
            name="cancel-mode"
            onChange={() => setMode("immediately")}
            type="radio"
          />
          <span>
            <strong>Inmediata</strong>
            <br />
            Termina hoy y la organización regresa al plan por defecto.
          </span>
        </label>
      </fieldset>
      {mode === "immediately" ? (
        <Notice tone="warning">
          La cancelación inmediata no se puede deshacer. No reembolsa el periodo
          ya cobrado: si corresponde, reembolsa la factura por separado.
        </Notice>
      ) : null}
    </ActionDialog>
  );
}

export function ResumeDialog({
  subscription,
  onClose,
  onUpdated,
}: SubscriptionProps) {
  const { notify } = useToast();
  return (
    <ActionDialog
      confirmLabel="Reanudar suscripción"
      description={`Quita la cancelación programada de ${subscriptionLabel(subscription)}${
        subscription.cancelAt
          ? ` (iba a terminar el ${formatDate(subscription.cancelAt)})`
          : ""
      }. La suscripción seguirá cobrándose con normalidad.`}
      onClose={onClose}
      onSubmit={async (reason) => {
        onUpdated(await billingApi.resume(subscription.id, { reason }));
        notify("Cancelación programada retirada.");
      }}
      open
      title="Reanudar suscripción"
    />
  );
}

export function ExtendTrialDialog({
  subscription,
  onClose,
  onUpdated,
}: SubscriptionProps) {
  const { notify } = useToast();
  const [days, setDays] = useState("7");
  const parsed = validateTrialDays(days);
  return (
    <ActionDialog
      confirmLabel="Extender prueba"
      description={`La prueba de ${subscriptionLabel(subscription)} termina${
        subscription.trialEnd ? ` el ${formatDate(subscription.trialEnd)}` : ""
      }. Los días se suman a esa fecha.`}
      extraValid={parsed.ok}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!parsed.ok) return;
        onUpdated(
          await billingApi.extendTrial(subscription.id, {
            days: parsed.days,
            reason,
          }),
        );
        notify(`Prueba extendida ${parsed.days} días.`);
      }}
      open
      title="Extender prueba"
    >
      <Field
        error={parsed.ok ? null : parsed.error}
        hint="Entre 1 y 60 días."
        id="extend-trial-days"
        label="Días a sumar"
      >
        <input
          id="extend-trial-days"
          inputMode="numeric"
          max={60}
          min={1}
          onChange={(event) => setDays(event.target.value)}
          type="number"
          value={days}
        />
      </Field>
    </ActionDialog>
  );
}

export function InternalDialog({
  workspaceId,
  workspaceName,
  enable,
  onClose,
  onUpdated,
}: CommonProps & {
  workspaceId: string;
  workspaceName: string;
  /** True marks the organization as internal; false removes the mark. */
  enable: boolean;
}) {
  const { notify } = useToast();
  return (
    <ActionDialog
      confirmLabel={enable ? "Marcar como interna" : "Quitar marca interna"}
      description={
        enable
          ? `${workspaceName} pasa a ser una cuenta interna (demo). Nunca se cobra, limita, pausa ni borra; no cuenta en MRR.`
          : `${workspaceName} deja de ser una cuenta interna y vuelve a regirse por su plan, su prueba o su falta de plan.`
      }
      onClose={onClose}
      onSubmit={async (reason) => {
        onUpdated(
          await billingApi.setInternal(workspaceId, {
            internal: enable,
            reason,
          }),
        );
        notify(
          enable
            ? "Organización marcada como interna."
            : "Marca interna retirada.",
        );
      }}
      open
      reasonHint="Queda en auditoría y se muestra junto a la etiqueta (3 a 500 caracteres)."
      title={enable ? "Cuenta interna (demo)" : "Quitar cuenta interna"}
    >
      {enable ? (
        <Notice tone="info">
          Nunca se cobra, limita, pausa ni borra; no cuenta en MRR.
        </Notice>
      ) : (
        <Notice tone="warning">
          Si no tiene plan ni prueba, quedará limitada y empezará a correr el
          plazo de pausa y borrado.
        </Notice>
      )}
    </ActionDialog>
  );
}

export function ExtendKardoTrialDialog({
  workspaceId,
  trial,
  onClose,
  onUpdated,
}: CommonProps & {
  workspaceId: string;
  trial: NonNullable<StaffWorkspaceBilling["trial"]>;
}) {
  const { notify } = useToast();
  const [days, setDays] = useState("7");
  const parsed = validateTrialDays(days);
  return (
    <ActionDialog
      confirmLabel="Extender prueba"
      description={`La prueba de Kardo (${trial.planName}) ${
        trial.status === "active" ? "termina" : "terminó"
      } el ${formatDate(trial.endsAt)}. Los días se cuentan desde hoy o desde ese fin, lo que sea más tarde; en una prueba terminada, la reabre.`}
      extraValid={parsed.ok}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!parsed.ok) return;
        onUpdated(
          await billingApi.extendKardoTrial(workspaceId, {
            days: parsed.days,
            reason,
          }),
        );
        notify(`Prueba de Kardo extendida ${parsed.days} días.`);
      }}
      open
      title="Extender prueba de Kardo"
    >
      <Field
        error={parsed.ok ? null : parsed.error}
        hint="Entre 1 y 60 días."
        id="extend-kardo-trial-days"
        label="Días a sumar"
      >
        <input
          id="extend-kardo-trial-days"
          inputMode="numeric"
          max={60}
          min={1}
          onChange={(event) => setDays(event.target.value)}
          type="number"
          value={days}
        />
      </Field>
    </ActionDialog>
  );
}

export function ResyncDialog({
  subscription,
  onClose,
  onUpdated,
}: SubscriptionProps) {
  const { notify } = useToast();
  return (
    <ActionDialog
      confirmLabel="Resincronizar"
      description="Vuelve a leer la suscripción en Stripe y actualiza estado, plan y límites en Kardo. Úsalo si un evento del webhook falló o llegó tarde."
      onClose={onClose}
      onSubmit={async (reason) => {
        onUpdated(await billingApi.resync(subscription.id, { reason }));
        notify("Suscripción resincronizada con Stripe.");
      }}
      open
      title="Resincronizar con Stripe"
    />
  );
}

export function RefundDialog({
  invoice,
  onClose,
  onUpdated,
}: CommonProps & { invoice: BillingInvoice }) {
  const { notify } = useToast();
  const [amount, setAmount] = useState("");
  const check = validateRefund(amount, invoice);
  const refundable = refundableCents(invoice);
  return (
    <ActionDialog
      confirmLabel="Reembolsar"
      description={`Factura ${invoice.number ?? invoice.id}. Pagado ${formatMoney(invoice.amountPaid, invoice.currency)}, reembolsado ${formatMoney(invoice.amountRefunded, invoice.currency)}.`}
      extraValid={check.ok}
      onClose={onClose}
      onSubmit={async (reason) => {
        if (!check.ok) return;
        onUpdated(
          await billingApi.refund(invoice.id, {
            amount: check.amount,
            reason,
          }),
        );
        notify(
          `Reembolso de ${formatMoney(check.amount, invoice.currency)} enviado a Stripe.`,
        );
      }}
      open
      title="Reembolsar factura"
      tone="danger"
    >
      <Field
        error={amount.trim() !== "" && !check.ok ? check.error : null}
        hint={`Déjalo vacío para reembolsar todo lo que resta (${formatMoney(refundable, invoice.currency)}). Máximo ${formatMoney(refundable, invoice.currency)}.`}
        id="refund-amount"
        label="Monto a reembolsar (MXN)"
        optional
      >
        <input
          id="refund-amount"
          inputMode="decimal"
          onChange={(event) => setAmount(event.target.value)}
          placeholder={formatMoney(refundable, invoice.currency)}
          value={amount}
        />
      </Field>
      <Notice tone="warning">
        Stripe devuelve el dinero al método de pago original y el reembolso no
        se puede revertir.
      </Notice>
    </ActionDialog>
  );
}
