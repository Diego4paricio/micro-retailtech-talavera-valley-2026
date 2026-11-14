import {
  EmbeddedCheckout,
  EmbeddedCheckoutProvider,
} from "@stripe/react-stripe-js";
import { useEffect } from "react";
import { loadStripeOnce } from "./stripe-loader.js";

/**
 * Stripe Checkout inside Configuración → Plan (relevo 20, T1). Loaded lazily:
 * this chunk and Stripe.js only arrive when the customer goes to pay. After a
 * successful payment Stripe sends the page to the session's `return_url`
 * (`?checkout=return&session_id=`), where BillingSection confirms it.
 */
export default function EmbeddedCheckoutPanel({
  clientSecret,
  onUnavailable,
}: {
  clientSecret: string;
  /** Stripe.js could not load (blocked or offline). */
  onUnavailable: () => void;
}) {
  useEffect(() => {
    let active = true;
    loadStripeOnce()
      .then((stripe) => {
        if (active && !stripe) onUnavailable();
      })
      .catch(() => {
        if (active) onUnavailable();
      });
    return () => {
      active = false;
    };
  }, [onUnavailable]);

  return (
    <div className="plan-checkout-frame">
      <EmbeddedCheckoutProvider
        options={{ clientSecret }}
        stripe={loadStripeOnce()}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
