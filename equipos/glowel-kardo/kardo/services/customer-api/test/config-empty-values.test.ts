import {
  loadCustomerApiConfig,
  loadStaffApiConfig,
  withoutEmptyValues,
} from "@kardo/config";
import { describe, expect, it } from "vitest";

// .env.example lists every variable uncommented; many stay empty.
describe("empty variables mean «not set»", () => {
  it("drops empty and blank values", () => {
    expect(
      withoutEmptyValues({ A: "", B: "  ", C: "x", D: undefined }),
    ).toEqual({ C: "x" });
  });

  it("starts the Customer API with the example's empty values and keeps defaults", () => {
    const config = loadCustomerApiConfig({
      KARDO_ENV: "local",
      STRIPE_SECRET_KEY: "",
      RESEND_API_KEY: "",
      ANTHROPIC_API_KEY: "",
      STATUS_PROBE_KEY: "",
      CUSTOMER_API_HOST: "",
      LOG_LEVEL: "",
      BILLING_TRIAL_DAYS: "",
      SUPABASE_JWT_ISSUER: "",
    });
    expect(config.STRIPE_SECRET_KEY).toBeUndefined();
    expect(config.LOG_LEVEL).toBe("info");
    // An empty value must not silently turn the 15-day trial off (0).
    expect(config.BILLING_TRIAL_DAYS).toBe(15);
    expect(config.CUSTOMER_API_HOST).toBe("127.0.0.1");
  });

  it("starts the Staff API with empty status settings", () => {
    const config = loadStaffApiConfig({
      KARDO_ENV: "local",
      STATUS_URL: "",
      STATUS_COMMAND_KEY: "",
    });
    expect(config.STATUS_URL).toBeUndefined();
  });
});
