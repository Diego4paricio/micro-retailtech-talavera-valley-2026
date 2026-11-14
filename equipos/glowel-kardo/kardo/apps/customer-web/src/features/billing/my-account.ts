import type { BillingMyAccount } from "@kardo/contracts";
import { billingApi } from "../../api/billing.js";
import { BILLING_CHANGED_EVENT } from "./extras-model.js";

/**
 * The person's own billing account (ADR 024), read once and shared (domain
 * audit 2026-10-13, A2-12): the side menu, «Crear organización», the list
 * of organizations and the plan-limit notice each asked for it on their
 * own. A copy younger than `FRESH_MS` is reused; any billing change (plan,
 * extras, a new organization) drops it so the next reader asks again.
 */
const FRESH_MS = 30_000;
let cached: { value: BillingMyAccount; at: number } | null = null;
let inflight: Promise<BillingMyAccount> | null = null;

export function loadMyBillingAccount(
  options: { force?: boolean } = {},
): Promise<BillingMyAccount> {
  if (!options.force && cached && Date.now() - cached.at < FRESH_MS)
    return Promise.resolve(cached.value);
  if (inflight) return inflight;
  const request = billingApi
    .myAccount()
    .then((value) => {
      cached = { value, at: Date.now() };
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  inflight = request;
  return request;
}

/** Forgets the shared copy (after creating an organization, for example). */
export function forgetMyBillingAccount() {
  cached = null;
}

if (typeof window !== "undefined")
  window.addEventListener(BILLING_CHANGED_EVENT, forgetMyBillingAccount);
