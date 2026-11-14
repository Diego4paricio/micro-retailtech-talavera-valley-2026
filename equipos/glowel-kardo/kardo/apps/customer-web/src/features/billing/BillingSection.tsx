import type { WorkspaceBilling } from "@kardo/contracts";
import { type ReactNode, useEffect, useState } from "react";
import { billingApi } from "../../api/billing.js";
import { Notice } from "../../components/Notice.js";
import {
  SettingsGroup,
  SettingsIntro,
  SettingsRow,
} from "../../components/SettingsBlocks.js";
import { Skeleton } from "../../components/Skeleton.js";
import { isAbortError } from "../../lib/api.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useAccess } from "./access-context.js";
import { pricingUrl } from "./access-model.js";
import { ExtrasSection } from "./ExtrasSection.js";
import { BILLING_CHANGED_EVENT, isAccountHolder } from "./extras-model.js";
import { FiscalSection } from "./FiscalSection.js";
import { canManageFiscal } from "./fiscal-model.js";
import { formatLongDate, isOpenSubscription } from "./format.js";
import { InvoiceList } from "./InvoiceList.js";
import { PlanChoice } from "./PlanChoice.js";
import { PlanSelectionGroup } from "./PlanSelectionGroup.js";
import { PlanSummary } from "./PlanSummary.js";
import { UsageMeters } from "./UsageMeters.js";
import { useBilling } from "./use-billing.js";
import type { FiscalController } from "./use-fiscal.js";
import { useFiscal } from "./use-fiscal.js";
import { useRedirectAction } from "./use-redirect-action.js";
import "./billing.css";

type CheckoutReturn = {
  /** `return`: the embedded Checkout came back; its session says how. */
  result: "success" | "canceled" | "return" | null;
  workspace: string | null;
  sessionId: string | null;
};

/** What the screen says after Checkout; `unpaid` is an embedded session
 * that came back open (failed or abandoned redirect). */
export type CheckoutOutcome = "success" | "canceled" | "checking" | "unpaid";

/** Stripe sends the customer back with `?checkout=` and `?workspace=`. */
export function readCheckoutReturn(
  search = window.location.search,
): CheckoutReturn {
  const query = new URLSearchParams(search);
  const result = query.get("checkout");
  const sessionId = query.get("session_id");
  return {
    result:
      result === "success" || result === "canceled" || result === "return"
        ? result
        : null,
    workspace: query.get("workspace"),
    sessionId:
      sessionId && /^cs_(test|live)_[A-Za-z0-9]{10,200}$/.test(sessionId)
        ? sessionId
        : null,
  };
}

/**
 * Return page of the embedded Checkout: asks the API how the session ended.
 * A completed one is mirrored right away, so the plan and the access banner
 * refresh at once instead of waiting for the webhook.
 */
function useCheckoutOutcome(
  workspaceId: string,
  returned: CheckoutReturn,
  foreign: boolean,
  onComplete: () => void,
): CheckoutOutcome | null {
  const embedded = returned.result === "return" && !foreign;
  const [outcome, setOutcome] = useState<CheckoutOutcome | null>(
    embedded ? (returned.sessionId ? "checking" : "unpaid") : null,
  );
  // biome-ignore lint/correctness/useExhaustiveDependencies: read once, when the screen opens
  useEffect(() => {
    if (!embedded || !returned.sessionId) return;
    const controller = new AbortController();
    billingApi
      .checkoutStatus(workspaceId, returned.sessionId, controller.signal)
      .then((status) => {
        if (status.status === "complete") {
          setOutcome("success");
          onComplete();
        } else setOutcome("unpaid");
      })
      .catch((error) => {
        if (isAbortError(error)) return;
        // Unknown: the webhook still confirms it; say what is certain.
        setOutcome("success");
      });
    return () => controller.abort();
  }, []);
  if (!embedded)
    return returned.result === "success" || returned.result === "canceled"
      ? returned.result
      : null;
  return outcome;
}

/**
 * Configuración → Plan: plan, consumption, payment method and invoices. The
 * catalog lives on the Website; `?elegir=` arrives from its pricing page
 * (ADR 019, ADR 020).
 */
export function BillingSection() {
  return (
    <>
      <PlanChoice />
      <BillingBody />
    </>
  );
}

function BillingBody() {
  const { workspace } = useWorkspace();
  const { refresh: refreshAccess } = useAccess();
  const [returned] = useState(() => readCheckoutReturn());
  const foreign =
    returned.result !== null &&
    returned.workspace !== null &&
    returned.workspace !== workspace.id;
  const { state, waiting, reload, refresh } = useBilling(workspace.id, {
    waitForSubscription:
      (returned.result === "success" || returned.result === "return") &&
      !foreign,
  });
  const outcome = useCheckoutOutcome(workspace.id, returned, foreign, () => {
    void reload();
    void refreshAccess();
  });
  const { busy, error, run, clearError } = useRedirectAction();
  // Extras or a plan change made on this page (or by the plan choice): read
  // the billing and the access again.
  useEffect(() => {
    const changed = () => {
      void refresh();
      void refreshAccess();
    };
    window.addEventListener(BILLING_CHANGED_EVENT, changed);
    return () => window.removeEventListener(BILLING_CHANGED_EVENT, changed);
  }, [refresh, refreshAccess]);
  const fiscal = useFiscal(
    workspace.id,
    canManageFiscal(state.status === "ready" ? state.billing : null),
  );

  // Drop the return parameters so a refresh does not repeat the message.
  useEffect(() => {
    if (returned.result === null) return;
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete("checkout");
      url.searchParams.delete("workspace");
      url.searchParams.delete("session_id");
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // Keeping the parameters is harmless.
    }
  }, [returned.result]);

  if (state.status === "loading")
    return (
      <>
        <SettingsIntro title="Plan y facturación" />
        <div className="billing-state">
          <Skeleton label="Cargando tu plan…" lines={5} />
        </div>
      </>
    );

  if (state.status === "forbidden")
    return (
      <>
        <SettingsIntro title="Plan y facturación" />
        <div className="billing-state">
          <Notice tone="info">
            Tu rol no tiene acceso a la facturación. Pide a la persona
            propietaria o a una administradora que revise el plan.
          </Notice>
        </div>
      </>
    );

  if (state.status === "error")
    return (
      <>
        <SettingsIntro title="Plan y facturación" />
        <div className="billing-state">
          <Notice tone="danger">{state.message}</Notice>
        </div>
      </>
    );

  const { billing } = state;
  const openPortal = (flow: Parameters<typeof billingApi.portal>[1]) =>
    run(flow ?? "default", () => billingApi.portal(workspace.id, flow));

  return (
    <BillingReady
      billing={billing}
      busy={busy}
      clearError={clearError}
      error={error}
      fiscal={fiscal}
      foreign={foreign}
      onExtrasChanged={() => {
        void refresh();
        void refreshAccess();
      }}
      onPortal={openPortal}
      planSelection={
        <PlanSelectionGroup
          holder={isAccountHolder(billing)}
          onSaved={() => void refresh()}
        />
      }
      pricingHref={pricingUrl(workspace.id)}
      result={outcome}
      waiting={waiting}
      workspaceId={workspace.id}
    />
  );
}

/** The loaded screen, separate from loading so it can be rendered on its own. */
export function BillingReady({
  billing,
  busy,
  clearError,
  error,
  fiscal = null,
  foreign,
  onExtrasChanged = () => {},
  onPortal: openPortal,
  planSelection = null,
  pricingHref,
  result,
  waiting,
  workspaceId = "",
}: {
  billing: WorkspaceBilling;
  /** The organization the extras are added from. */
  workspaceId?: string;
  onExtrasChanged?: () => void;
  /** «Qué sigue activo» (ADR 023), filled by the container. */
  planSelection?: ReactNode;
  busy: string | null;
  clearError: () => void;
  error: string | null;
  /** The account holder only; nobody else gets the fiscal section. */
  fiscal?: FiscalController | null;
  foreign: boolean;
  onPortal: (flow: Parameters<typeof billingApi.portal>[1]) => void;
  pricingHref: string;
  result: CheckoutOutcome | null;
  waiting: boolean;
}) {
  const { subscription } = billing;
  // Invoices belong to the person who pays: not shown for someone else's plan.
  const holder = billing.account?.isHolder !== false;
  const cancelDate = formatLongDate(
    subscription?.cancelAt ?? subscription?.currentPeriodEnd,
  );
  const trialEnd = formatLongDate(subscription?.trialEnd);
  // The subscription can show up (webhook or polling) before the return
  // page hears back about its Checkout: then it is already done.
  const shown =
    result === "checking" && isOpenSubscription(subscription)
      ? "success"
      : result;

  return (
    <div className="billing">
      <SettingsIntro
        description="Tu plan, lo que usas, tus facturas y tus datos de facturación."
        title="Plan y facturación"
      />
      <div className="billing-notices">
        {foreign ? (
          <Notice tone="warning">
            Esa compra fue para otra organización. Cambia a esa organización
            desde el selector de espacios para ver su plan.
          </Notice>
        ) : shown === "success" ? (
          subscription ? (
            <Notice tone="success">
              Listo, tu suscripción quedó activa. Gracias por confiar en Kardo.
            </Notice>
          ) : (
            <Notice tone="success">
              Recibimos tu pago. Estamos confirmando tu suscripción
              {waiting
                ? "; esta pantalla se actualiza sola"
                : ", puede tardar un momento. Actualiza la página en unos minutos"}
              .
            </Notice>
          )
        ) : shown === "canceled" ? (
          <Notice tone="info">
            Cancelaste el proceso de pago. No se hizo ningún cargo.
          </Notice>
        ) : shown === "checking" ? (
          <Notice tone="info">Confirmando tu pago…</Notice>
        ) : shown === "unpaid" ? (
          <Notice tone="warning">
            El pago no se completó y no se hizo ningún cargo. Puedes intentarlo
            de nuevo desde la página de precios.
          </Notice>
        ) : null}
        {subscription?.status === "past_due" ? (
          <Notice
            action={
              billing.canManage ? (
                <button
                  className="button button-secondary button-small"
                  disabled={busy !== null}
                  onClick={() => openPortal("payment_method_update")}
                  type="button"
                >
                  Actualizar tarjeta
                </button>
              ) : undefined
            }
            title="No pudimos cobrar tu suscripción"
            tone="warning"
          >
            Sigues con todas las funciones mientras reintentamos el cobro.
            {billing.canManage
              ? " Actualiza tu tarjeta para evitar que se cancele."
              : " Pide a la persona propietaria que actualice la tarjeta."}
          </Notice>
        ) : null}
        {isOpenSubscription(subscription) && subscription.cancelAtPeriodEnd ? (
          <Notice tone="info" title="Cancelación programada">
            {cancelDate
              ? `Tu plan sigue activo hasta el ${cancelDate}. Después dejará de renovarse.`
              : "Tu plan sigue activo hasta el final del periodo pagado."}{" "}
            Lo que ya publicaste se conserva.
          </Notice>
        ) : null}
        {subscription?.status === "trialing" &&
        !subscription.cancelAtPeriodEnd &&
        trialEnd ? (
          <Notice tone="info">
            Estás en periodo de prueba hasta el {trialEnd}.
          </Notice>
        ) : null}
        {error ? (
          <Notice onDismiss={clearError} tone="danger">
            {error}
          </Notice>
        ) : null}
      </div>

      <PlanSummary
        billing={billing}
        busy={busy}
        onPortal={openPortal}
        workspaceId={workspaceId}
      />
      {planSelection}
      <UsageMeters billing={billing} />
      <ExtrasSection
        billing={billing}
        onChanged={onExtrasChanged}
        pricingHref={pricingHref}
        workspaceId={workspaceId}
      />
      <SettingsGroup id="billing-info-heading" title="Planes e información">
        <SettingsRow
          action={
            <a
              className="button button-secondary button-small"
              href={pricingHref}
            >
              Ver planes y precios
            </a>
          }
          label="Planes y precios"
          value={
            <span className="billing-row-note">
              Los planes y sus precios están en la página de precios de Kardo.
            </span>
          }
        />
      </SettingsGroup>
      {holder ? (
        <>
          <InvoiceList fiscal={fiscal} invoices={billing.invoices} />
          {fiscal ? <FiscalSection fiscal={fiscal} /> : null}
        </>
      ) : null}
    </div>
  );
}
