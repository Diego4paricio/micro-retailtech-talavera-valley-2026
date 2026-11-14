import type {
  BillingChangeResult,
  BillingCheckout,
  BillingCheckoutMode,
  BillingCheckoutStatus,
  BillingMyAccount,
  BillingPlanList,
  BillingPortalFlow,
  BillingRedirect,
  ChangeBillingExtras,
  WorkspaceBilling,
} from "@kardo/contracts";
import { apiRequest } from "../lib/api.js";
import { handleBillingDemo } from "../lib/demo/billing.js";
import { isDemoMode } from "../lib/demo.js";

const base = (workspaceId: string) => `/v1/workspaces/${workspaceId}/billing`;

const demo = <T>(
  path: string,
  method: string,
  body?: Record<string, unknown>,
): Promise<T> =>
  new Promise((resolve) =>
    setTimeout(
      () => resolve(handleBillingDemo(path, method, body ?? {}) as T),
      120,
    ),
  );

/**
 * Subscriptions (ADR 019). The portal answers with a Stripe-hosted URL: the
 * caller redirects with `window.location.assign`. Checkout answers with that
 * URL (`hosted`) or with the client secret of the Checkout embedded in the
 * panel (`embedded`). Errors: 403
 * `WORKSPACE_ACCESS_DENIED` (Editor/Viewer), 409 `BILLING_CONFLICT`, 503
 * `BILLING_UNAVAILABLE`.
 */
export const billingApi = {
  plans: (signal?: AbortSignal) =>
    isDemoMode
      ? demo<BillingPlanList>("/v1/billing/plans", "GET")
      : apiRequest<BillingPlanList>("/v1/billing/plans", { signal }),
  get: (workspaceId: string, signal?: AbortSignal) =>
    isDemoMode
      ? demo<WorkspaceBilling>(base(workspaceId), "GET")
      : apiRequest<WorkspaceBilling>(base(workspaceId), { signal }),
  checkout: (
    workspaceId: string,
    priceId: string,
    mode: BillingCheckoutMode = "hosted",
  ): Promise<BillingCheckout> =>
    isDemoMode
      ? demo<BillingRedirect>(`${base(workspaceId)}/checkout`, "POST", {
          priceId,
          workspaceId,
        }).then(({ url }) => ({
          mode: "hosted",
          sessionId: "cs_test_demo000000",
          url,
          clientSecret: null,
        }))
      : apiRequest<BillingCheckout>(`${base(workspaceId)}/checkout`, {
          method: "POST",
          body: mode === "hosted" ? { priceId } : { priceId, mode },
        }),
  /** Return page of the embedded Checkout (`?checkout=return&session_id=`). */
  checkoutStatus: (
    workspaceId: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<BillingCheckoutStatus> =>
    isDemoMode
      ? Promise.resolve({
          status: "complete",
          paymentStatus: "paid",
          subscriptionActive: true,
        })
      : apiRequest<BillingCheckoutStatus>(
          `${base(workspaceId)}/checkout/${encodeURIComponent(sessionId)}`,
          { signal },
        ),
  /** `priceId` is the target price of `subscription_update_confirm`. */
  portal: (
    workspaceId: string,
    flow: BillingPortalFlow = "default",
    priceId?: string,
  ) =>
    isDemoMode
      ? demo<BillingRedirect>(`${base(workspaceId)}/portal`, "POST", {
          flow,
          workspaceId,
          ...(priceId ? { priceId } : {}),
        })
      : apiRequest<BillingRedirect>(`${base(workspaceId)}/portal`, {
          method: "POST",
          body: priceId ? { flow, priceId } : { flow },
        }),
  /** ADR 024: the caller's own account, wherever they are in the panel. */
  myAccount: (signal?: AbortSignal) =>
    isDemoMode
      ? demo<BillingMyAccount>("/v1/billing/account", "GET")
      : apiRequest<BillingMyAccount>("/v1/billing/account", { signal }),
  /** ADR 024: add or remove extras; `confirm: false` only says what it
   * costs today (409 `EXTRAS_NEED_PLAN` without a paid plan, 409
   * `BILLING_PAYMENT_FAILED` when the card is declined). */
  changeExtras: (workspaceId: string, input: ChangeBillingExtras) =>
    isDemoMode
      ? demo<BillingChangeResult>(`${base(workspaceId)}/extras`, "PUT", input)
      : apiRequest<BillingChangeResult>(`${base(workspaceId)}/extras`, {
          method: "PUT",
          body: input,
        }),
  /** ADR 024: change the plan of a subscription with extras, in Kardo. */
  changePlan: (workspaceId: string, priceId: string, confirm: boolean) =>
    isDemoMode
      ? demo<BillingChangeResult>(`${base(workspaceId)}/plan-change`, "POST", {
          priceId,
          confirm,
        })
      : apiRequest<BillingChangeResult>(`${base(workspaceId)}/plan-change`, {
          method: "POST",
          body: { priceId, confirm },
        }),
};
