import { describe, expect, it } from "vitest";
import {
  type CheckoutInput,
  checkoutSessionParams,
  KARDO_CHECKOUT_BRANDING,
} from "../src/gateway.js";

const workspaceId = "11111111-1111-4111-8111-111111111111";
const returnUrl = `https://app.kardo.mx/settings/plan?workspace=${workspaceId}&checkout=return&session_id={CHECKOUT_SESSION_ID}`;

function input(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    customerId: "cus_TEST123456",
    priceId: "price_TEST123456",
    workspaceId,
    profileId: "22222222-2222-4222-8222-222222222222",
    trialDays: null,
    trialRequiresCard: false,
    taxRateId: "txr_TEST123456",
    successUrl: "https://app.kardo.mx/settings/plan?checkout=success",
    cancelUrl: "https://app.kardo.mx/settings/plan?checkout=canceled",
    requireTermsConsent: true,
    termsUrl: "https://kardo.mx/terminos/",
    interval: "month",
    branding: {
      ...KARDO_CHECKOUT_BRANDING,
      logoFileId: "file_LOGO",
      iconFileId: "file_ICON",
    },
    ...overrides,
  };
}

describe("Checkout Session parameters", () => {
  it("hosted: Stripe's page with success and cancel URLs and the logo", () => {
    const params = checkoutSessionParams(input());
    expect(params.ui_mode).toBeUndefined();
    expect(params.success_url).toContain("checkout=success");
    expect(params.cancel_url).toContain("checkout=canceled");
    expect(params.return_url).toBeUndefined();
    expect(params.branding_settings?.logo).toEqual({
      type: "file",
      file: "file_LOGO",
    });
    expect(params.branding_settings?.icon).toBeUndefined();
  });

  it("embedded: one return URL with the session id and no success or cancel URL", () => {
    const params = checkoutSessionParams(
      input({ uiMode: "embedded", returnUrl }),
    );
    expect(params.ui_mode).toBe("embedded_page");
    expect(params.return_url).toBe(returnUrl);
    expect(params.success_url).toBeUndefined();
    expect(params.cancel_url).toBeUndefined();
  });

  it("embedded keeps the Kardo colors but drops logo and icon (Stripe refuses them)", () => {
    const params = checkoutSessionParams(
      input({ uiMode: "embedded", returnUrl }),
    );
    expect(params.branding_settings).toEqual({
      display_name: "Kardo",
      background_color: "#f7f5f0",
      button_color: "#0a6c78",
      border_style: "rounded",
      font_family: "inter",
    });
  });

  it("embedded keeps coupon, consent, texts, tax and metadata", () => {
    const params = checkoutSessionParams(
      input({
        uiMode: "embedded",
        returnUrl,
        couponId: "kardo_conversion_20x3",
      }),
    );
    expect(params.discounts).toEqual([{ coupon: "kardo_conversion_20x3" }]);
    expect(params.allow_promotion_codes).toBeUndefined();
    expect(params.consent_collection).toEqual({ terms_of_service: "required" });
    expect(params.custom_text?.submit?.message).toContain("con tu descuento");
    expect(params.custom_text?.terms_of_service_acceptance?.message).toContain(
      "https://kardo.mx/terminos/",
    );
    expect(params.line_items?.[0]?.tax_rates).toEqual(["txr_TEST123456"]);
    expect(params.subscription_data?.default_tax_rates).toEqual([
      "txr_TEST123456",
    ]);
    expect(params.metadata).toEqual({ kardo_workspace_id: workspaceId });
    expect(params.client_reference_id).toBe(workspaceId);
    expect(params.locale).toBe("es-419");
  });

  it("embedded keeps the rest of the Kardo trial as trial_end", () => {
    const trialEnd = new Date("2026-10-15T05:00:00.000Z");
    const params = checkoutSessionParams(
      input({ uiMode: "embedded", returnUrl, trialEnd }),
    );
    expect(params.subscription_data?.trial_end).toBe(
      Math.floor(trialEnd.getTime() / 1000),
    );
    expect(params.payment_method_collection).toBe("always");
    expect(params.allow_promotion_codes).toBe(true);
    expect(params.custom_text?.submit?.message).toContain(
      "Hoy no se cobra nada",
    );
  });

  it("embedded without the session id placeholder is refused", () => {
    expect(() =>
      checkoutSessionParams(
        input({
          uiMode: "embedded",
          returnUrl: "https://app.kardo.mx/settings/plan",
        }),
      ),
    ).toThrow(/session id/);
  });
});
