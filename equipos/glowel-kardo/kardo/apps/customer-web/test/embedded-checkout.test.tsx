import type { BillingSubscription, WorkspaceBilling } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  BillingReady,
  type CheckoutOutcome,
  readCheckoutReturn,
} from "../src/features/billing/BillingSection.js";
import { EmbeddedCheckoutSection } from "../src/features/billing/PlanChoice.js";
import { paymentRoute } from "../src/features/billing/plan-choice.js";
import { embeddedCheckoutAvailable } from "../src/features/billing/stripe-loader.js";
import { handleBillingDemo } from "../src/lib/demo/billing.js";

const key = "pk_test_51AbCdEfGhIjKlMnOpQrStUv";
const sessionId = "cs_test_a1B2c3D4e5F6g7H8";

describe("Checkout inside the panel (relevo 20, T1)", () => {
  it("needs a publishable key and is never used in demo mode", () => {
    expect(embeddedCheckoutAvailable(key, false)).toBe(true);
    expect(embeddedCheckoutAvailable("pk_live_51AbCdEfGhIjKlMnOp", false)).toBe(
      true,
    );
    expect(embeddedCheckoutAvailable("", false)).toBe(false);
    expect(embeddedCheckoutAvailable("sk_test_51AbCdEfGhIjKlMnOp", false)).toBe(
      false,
    );
    expect(embeddedCheckoutAvailable(key, true)).toBe(false);
  });

  it("falls back to Stripe's hosted page without the key", () => {
    expect(paymentRoute(null, false)).toBe("hosted");
    expect(paymentRoute(null, true)).toBe("embedded");
    const canceled = { status: "canceled" } as BillingSubscription;
    expect(paymentRoute(canceled, true)).toBe("embedded");
  });

  it("a live subscription still changes plan in the portal", () => {
    for (const status of ["trialing", "active", "past_due"]) {
      const subscription = { status } as BillingSubscription;
      expect(paymentRoute(subscription, true)).toBe("portal");
      expect(paymentRoute(subscription, false)).toBe("portal");
    }
  });

  it("shows the payment inside Plan, with a way back", () => {
    const html = renderToStaticMarkup(
      <EmbeddedCheckoutSection
        clientSecret={`${sessionId}_secret_x9Y8z7`}
        onCancel={() => {}}
        onUnavailable={() => {}}
        summary="Vas a contratar Negocio mensual: $1,199.00 IVA incluido"
      />,
    );
    expect(html).toContain("Pago seguro");
    expect(html).toContain("Negocio mensual");
    expect(html).toContain("Kardo nunca ve el número de tu tarjeta");
    expect(html).toContain("Cancelar");
    // Stripe.js arrives lazily: first the placeholder.
    expect(html).toContain("Abriendo el pago");
  });
});

describe("return page of the embedded Checkout", () => {
  it("reads the session from the return URL", () => {
    expect(
      readCheckoutReturn(
        `?workspace=abc&checkout=return&session_id=${sessionId}`,
      ),
    ).toEqual({ result: "return", workspace: "abc", sessionId });
  });

  it("ignores anything that is not a Checkout Session id", () => {
    expect(
      readCheckoutReturn("?checkout=return&session_id=<script>").sessionId,
    ).toBeNull();
    expect(readCheckoutReturn("?checkout=paid").result).toBeNull();
    expect(readCheckoutReturn("?checkout=success").result).toBe("success");
  });

  const billing = handleBillingDemo(
    "/v1/workspaces/x/billing",
    "GET",
    {},
  ) as WorkspaceBilling;
  const render = (result: CheckoutOutcome) =>
    renderToStaticMarkup(
      <BillingReady
        billing={{ ...billing, subscription: null }}
        busy={null}
        canExport
        clearError={() => {}}
        error={null}
        exporting={false}
        foreign={false}
        onExport={() => {}}
        onPortal={() => {}}
        pricingHref="https://kardo.mx/precios/"
        result={result}
        waiting
      />,
    );

  it("says it is confirming, then that the payment arrived", () => {
    expect(render("checking")).toContain("Confirmando tu pago");
    expect(render("success")).toContain("Recibimos tu pago");
  });

  it("a subscription already in the mirror ends the waiting", () => {
    const html = renderToStaticMarkup(
      <BillingReady
        billing={{
          ...billing,
          subscription: {
            ...billing.subscription,
            status: "trialing",
          } as never,
        }}
        busy={null}
        canExport
        clearError={() => {}}
        error={null}
        exporting={false}
        foreign={false}
        onExport={() => {}}
        onPortal={() => {}}
        pricingHref="https://kardo.mx/precios/"
        result="checking"
        waiting
      />,
    );
    expect(html).toContain("Listo, tu suscripción quedó activa");
    expect(html).not.toContain("Confirmando tu pago");
  });

  it("an unpaid session says nothing was charged", () => {
    const html = render("unpaid");
    expect(html).toContain("El pago no se completó");
    expect(html).toContain("no se hizo ningún cargo");
  });
});
