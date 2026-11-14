import type { Stripe } from "@stripe/stripe-js";
import { isDemoMode } from "../../lib/demo.js";

/**
 * Stripe publishable key for Checkout inside the panel (relevo 20, T1). It is
 * public by design. Without it (or in demo mode) the panel keeps sending the
 * customer to Stripe's hosted Checkout.
 */
export const stripePublishableKey =
  import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY?.trim() ?? "";

export function embeddedCheckoutAvailable(
  key: string = stripePublishableKey,
  demo: boolean = isDemoMode,
): boolean {
  return !demo && /^pk_(test|live)_[A-Za-z0-9]{10,}$/.test(key);
}

let stripe: Promise<Stripe | null> | null = null;

/**
 * Loads Stripe.js from js.stripe.com the first time Checkout opens, never
 * bundled (PCI) and never on screens that do not pay: the loader module
 * injects the script when imported, so it is imported only here, on demand.
 */
export function loadStripeOnce(): Promise<Stripe | null> {
  if (!stripe) {
    stripe = import("@stripe/stripe-js").then(({ loadStripe }) =>
      loadStripe(stripePublishableKey),
    );
    // A failed load (offline, blocked) can be retried by opening again.
    stripe.catch(() => {
      stripe = null;
    });
  }
  return stripe;
}
