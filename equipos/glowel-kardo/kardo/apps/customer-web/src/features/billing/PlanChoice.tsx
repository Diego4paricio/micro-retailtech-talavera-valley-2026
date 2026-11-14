import type {
  FiscalProfile,
  WorkspaceBilling,
  WorkspaceFiscal,
} from "@kardo/contracts";
import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { billingApi } from "../../api/billing.js";
import { fiscalApi } from "../../api/fiscal.js";
import { Notice } from "../../components/Notice.js";
import { SectionHeading } from "../../components/PageHeader.js";
import { Skeleton } from "../../components/Skeleton.js";
import { errorMessage, isAbortError } from "../../lib/api.js";
import { useWorkspace } from "../../workspace/WorkspaceContext.js";
import { useAccess } from "./access-context.js";
import { BILLING_CHANGED_EVENT, hasExtras } from "./extras-model.js";
import { FiscalFormView } from "./FiscalSection.js";
import {
  emptyFiscalForm,
  type FiscalForm,
  formFromProfile,
  toUpsert,
} from "./fiscal-model.js";
import { PlanChangeDialog } from "./PlanChangeDialog.js";
import {
  type PlanChoice as Choice,
  choiceOfferText,
  choiceSummary,
  paymentRoute,
  readPlanChoice,
  resolvePlanChoice,
  withoutPlanChoice,
} from "./plan-choice.js";
import { downgradePreview, overForPlan } from "./plan-overage-model.js";
import { embeddedCheckoutAvailable } from "./stripe-loader.js";
import { useRedirectAction } from "./use-redirect-action.js";

const EmbeddedCheckoutPanel = lazy(() => import("./EmbeddedCheckoutPanel.js"));

/** Checkout inside the panel, open over the confirmation card. */
type EmbeddedSession = { clientSecret: string; sessionId: string };

export type ChoiceState =
  | { status: "none" }
  | { status: "loading" }
  | { status: "not-owner" }
  | { status: "invalid" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      choice: Choice;
      billing: WorkspaceBilling;
      /** Null when the fiscal data could not be read: the box still works. */
      fiscal: WorkspaceFiscal | null;
    };

/**
 * "Necesito factura (CFDI)" while contracting (ADR 020 §6). Ticked, the
 * plan is contracted with "factura de cada pago" on, so every payment asks
 * for its CFDI by itself (the billing sync does it). The fiscal data is
 * asked here only if it does not exist yet; never the Constancia.
 */
export type InvoiceChoice = {
  wanted: boolean;
  profile: FiscalProfile | null;
  editing: boolean;
  busy: boolean;
  onToggle: (wanted: boolean) => void;
  onEdit: () => void;
  onCancelEdit: () => void;
  onSaveAndContinue: (form: FiscalForm) => void;
};

function InvoiceChoiceView({
  invoice,
  defaultEmail,
}: {
  invoice: InvoiceChoice;
  defaultEmail: string;
}) {
  const showForm = invoice.wanted && (!invoice.profile || invoice.editing);
  return (
    <div className="plan-choice-invoice">
      <label className="billing-fiscal-check" htmlFor="plan-choice-cfdi">
        <input
          checked={invoice.wanted}
          disabled={invoice.busy}
          id="plan-choice-cfdi"
          onChange={(event) => invoice.onToggle(event.target.checked)}
          type="checkbox"
        />
        <span>
          <strong>Necesito factura (CFDI)</strong>
          <span className="billing-muted">
            Te la emitimos con tus datos fiscales después de cada pago. Si no la
            necesitas, tu pago entra en la factura global del mes.
          </span>
        </span>
      </label>
      {invoice.wanted && invoice.profile && !invoice.editing ? (
        <p className="billing-muted">
          Facturaremos a <strong>{invoice.profile.rfc}</strong> ·{" "}
          {invoice.profile.legalName}, al correo {invoice.profile.email}.{" "}
          <button
            className="text-action"
            disabled={invoice.busy}
            onClick={invoice.onEdit}
            type="button"
          >
            Cambiar datos
          </button>
        </p>
      ) : null}
      {showForm ? (
        <FiscalFormView
          busy={invoice.busy}
          hideEachPayment
          initial={
            invoice.profile
              ? formFromProfile(invoice.profile)
              : emptyFiscalForm(defaultEmail)
          }
          onCancel={invoice.onCancelEdit}
          onSave={invoice.onSaveAndContinue}
          submitLabel="Guardar y continuar a pago"
        />
      ) : null}
    </div>
  );
}

/** Presentational confirmation card, also used by the tests. */
export function PlanChoiceView({
  state,
  offerText,
  busy,
  onContinue,
  onCancel,
  invoice = null,
  defaultEmail = "",
  downgradeText = null,
}: {
  state: ChoiceState;
  offerText: string | null;
  /** A smaller plan: what would stay out (ADR 023, option B). */
  downgradeText?: string | null;
  busy: boolean;
  onContinue: () => void;
  onCancel: () => void;
  invoice?: InvoiceChoice | null;
  defaultEmail?: string;
}) {
  if (state.status === "none" || state.status === "loading") return null;
  if (state.status === "not-owner")
    return (
      <div className="plan-choice">
        <Notice tone="info">Solo el propietario puede elegir el plan</Notice>
      </div>
    );
  if (state.status === "invalid")
    return (
      <div className="plan-choice">
        <Notice tone="info">
          No encontramos ese plan o periodo. Puedes elegir uno en la página de
          precios.
        </Notice>
      </div>
    );
  if (state.status === "error")
    return (
      <div className="plan-choice">
        <Notice tone="danger">{state.message}</Notice>
      </div>
    );
  return (
    <section
      aria-labelledby="plan-choice-heading"
      className="panel plan-choice"
    >
      <SectionHeading id="plan-choice-heading" title="Confirma tu plan" />
      <p className="plan-choice-summary">{choiceSummary(state.choice)}</p>
      {offerText ? <p className="plan-choice-offer">{offerText}</p> : null}
      {downgradeText ? <Notice tone="warning">{downgradeText}</Notice> : null}
      {invoice ? (
        <InvoiceChoiceView defaultEmail={defaultEmail} invoice={invoice} />
      ) : null}
      {invoice?.wanted && (!invoice.profile || invoice.editing) ? null : (
        <div className="plan-choice-actions">
          <button
            aria-busy={busy || undefined}
            className="button button-primary"
            disabled={busy}
            onClick={onContinue}
            type="button"
          >
            {busy ? (
              <span aria-hidden="true" className="button-spinner" />
            ) : null}
            Continuar a pago
          </button>
          <button
            className="button button-ghost"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
        </div>
      )}
    </section>
  );
}

/** Stripe Checkout embedded in Configuración → Plan (relevo 20, T1). */
export function EmbeddedCheckoutSection({
  summary,
  clientSecret,
  onCancel,
  onUnavailable,
}: {
  summary: string;
  clientSecret: string;
  onCancel: () => void;
  onUnavailable: () => void;
}) {
  return (
    <section
      aria-labelledby="plan-checkout-heading"
      className="panel plan-checkout"
    >
      <SectionHeading
        actions={
          <button
            className="button button-ghost button-small"
            onClick={onCancel}
            type="button"
          >
            Cancelar
          </button>
        }
        id="plan-checkout-heading"
        title="Pago seguro"
      />
      <p className="plan-choice-summary">{summary}</p>
      <p className="billing-muted">
        Tus datos de pago van directo a Stripe, nuestro procesador de pagos;
        Kardo nunca ve el número de tu tarjeta.
      </p>
      <Suspense fallback={<Skeleton label="Abriendo el pago…" lines={6} />}>
        <EmbeddedCheckoutPanel
          clientSecret={clientSecret}
          onUnavailable={onUnavailable}
        />
      </Suspense>
    </section>
  );
}

/**
 * Opened from the Website pricing page with
 * `?workspace=&elegir=<code>&periodo=<mensual|anual>`: asks the Owner to
 * confirm the plan, then sends them to Checkout (no subscription) or to the
 * portal's confirmation of the change (live subscription).
 */
export function PlanChoice() {
  const { workspace, workspaces, selectWorkspace, session } = useWorkspace();
  const { access } = useAccess();
  const [request] = useState(() => readPlanChoice(window.location.search));
  const [state, setState] = useState<ChoiceState>(
    request ? { status: "loading" } : { status: "none" },
  );
  const { busy, error, run } = useRedirectAction();
  const [wantsInvoice, setWantsInvoice] = useState(false);
  const [editingFiscal, setEditingFiscal] = useState(false);
  const [savingFiscal, setSavingFiscal] = useState(false);
  const [fiscalError, setFiscalError] = useState<string | null>(null);
  const [embedded, setEmbedded] = useState<EmbeddedSession | null>(null);
  const [opening, setOpening] = useState(false);
  const [embeddedError, setEmbeddedError] = useState<string | null>(null);
  const [changing, setChanging] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: the request is read once, when the screen opens
  useEffect(() => {
    if (!request) return;
    // The link names an organization: open that one first, keeping the address.
    if (
      request.workspaceId &&
      request.workspaceId !== workspace.id &&
      workspaces.some((item) => item.id === request.workspaceId)
    ) {
      selectWorkspace(request.workspaceId);
      return;
    }
    try {
      const url = withoutPlanChoice(window.location.href);
      window.history.replaceState(window.history.state, "", url);
    } catch {
      // Keeping the parameters is harmless.
    }
    if (workspace.role !== "owner") {
      setState({ status: "not-owner" });
      return;
    }
    const controller = new AbortController();
    void Promise.all([
      billingApi.plans(controller.signal),
      billingApi.get(workspace.id, controller.signal),
      // Optional: without it the box asks for the data again.
      fiscalApi.get(workspace.id, controller.signal).catch(() => null),
    ])
      .then(([catalog, billing, fiscal]) => {
        const choice = resolvePlanChoice(catalog, request.code, request.period);
        setWantsInvoice(fiscal?.profile?.invoiceEachPayment ?? false);
        setState(
          choice
            ? { status: "ready", choice, billing, fiscal }
            : { status: "invalid" },
        );
      })
      .catch((requestError) => {
        if (isAbortError(requestError)) return;
        setState({ status: "error", message: errorMessage(requestError) });
      });
    return () => controller.abort();
  }, []);

  const goToStripe = () => {
    if (state.status !== "ready") return;
    const { choice, billing } = state;
    const priceId = choice.price.id;
    const route = paymentRoute(
      billing.subscription,
      embeddedCheckoutAvailable(),
    );
    // The portal cannot change a subscription with extras: Kardo does it.
    if (route === "portal" && hasExtras(billing)) setChanging(true);
    else if (route === "portal")
      void run("choice", () =>
        billingApi.portal(workspace.id, "subscription_update_confirm", priceId),
      );
    else if (route === "embedded") void openEmbedded(priceId);
    else void run("choice", () => billingApi.checkout(workspace.id, priceId));
  };

  /** Creates the session first, so a conflict shows here as a message. */
  const openEmbedded = async (priceId: string) => {
    setOpening(true);
    setEmbeddedError(null);
    try {
      const session = await billingApi.checkout(
        workspace.id,
        priceId,
        "embedded",
      );
      if (!session.clientSecret) throw new Error("No client secret.");
      setEmbedded({
        clientSecret: session.clientSecret,
        sessionId: session.sessionId,
      });
    } catch (failure) {
      setEmbeddedError(errorMessage(failure));
    } finally {
      setOpening(false);
    }
  };

  /** Stripe.js did not load: the hosted page still works. */
  const fallBackToHosted = useCallback(() => {
    if (state.status !== "ready") return;
    const priceId = state.choice.price.id;
    setEmbedded(null);
    void run("choice", () => billingApi.checkout(workspace.id, priceId));
  }, [state, run, workspace.id]);

  /** Saves the fiscal data with "factura de cada pago" on, then pays. */
  const saveFiscalAndPay = async (form: FiscalForm) => {
    setSavingFiscal(true);
    setFiscalError(null);
    try {
      await fiscalApi.save(
        workspace.id,
        toUpsert({ ...form, invoiceEachPayment: true }),
      );
      goToStripe();
    } catch (failure) {
      setFiscalError(errorMessage(failure));
    } finally {
      setSavingFiscal(false);
    }
  };

  const proceed = () => {
    if (state.status !== "ready") return;
    const profile = state.fiscal?.profile ?? null;
    // Ticked with saved data that still has "factura de cada pago" off:
    // turn it on so this first payment also asks for its CFDI.
    if (wantsInvoice && profile && !profile.invoiceEachPayment) {
      void saveFiscalAndPay(formFromProfile(profile));
      return;
    }
    goToStripe();
  };

  const invoice: InvoiceChoice | null =
    state.status === "ready"
      ? {
          wanted: wantsInvoice,
          profile: state.fiscal?.profile ?? null,
          editing: editingFiscal,
          busy: savingFiscal || busy !== null || opening,
          onToggle: (wanted) => {
            setWantsInvoice(wanted);
            setFiscalError(null);
            if (!wanted) setEditingFiscal(false);
          },
          onEdit: () => setEditingFiscal(true),
          onCancelEdit: () => {
            setEditingFiscal(false);
            if (!state.fiscal?.profile) setWantsInvoice(false);
          },
          onSaveAndContinue: (form) => void saveFiscalAndPay(form),
        }
      : null;

  if (embedded && state.status === "ready")
    return (
      <EmbeddedCheckoutSection
        clientSecret={embedded.clientSecret}
        onCancel={() => setEmbedded(null)}
        onUnavailable={fallBackToHosted}
        summary={choiceSummary(state.choice)}
      />
    );

  return (
    <>
      <PlanChoiceView
        busy={busy !== null || opening}
        offerText={
          state.status === "ready"
            ? choiceOfferText(state.choice, access?.offer)
            : null
        }
        defaultEmail={session.user.email ?? ""}
        downgradeText={
          state.status === "ready"
            ? downgradePreview(
                overForPlan(
                  state.billing.usage,
                  state.choice.plan.entitlements,
                  state.billing.account?.extras ?? [],
                ),
                state.choice.plan.name,
              )
            : null
        }
        invoice={invoice}
        onCancel={() => setState({ status: "none" })}
        onContinue={proceed}
        state={state}
      />
      {state.status === "ready" ? (
        <PlanChangeDialog
          interval={state.choice.interval}
          onClose={() => setChanging(false)}
          onDone={() => {
            setChanging(false);
            setState({ status: "none" });
            window.dispatchEvent(new Event(BILLING_CHANGED_EVENT));
          }}
          open={changing}
          planName={state.choice.plan.name}
          priceId={state.choice.price.id}
          workspaceId={workspace.id}
        />
      ) : null}
      {fiscalError ? (
        <div className="plan-choice">
          <Notice tone="danger">{fiscalError}</Notice>
        </div>
      ) : null}
      {error || embeddedError ? (
        <div className="plan-choice">
          <Notice tone="danger">{error ?? embeddedError}</Notice>
        </div>
      ) : null}
    </>
  );
}
