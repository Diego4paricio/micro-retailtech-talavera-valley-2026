import { describe, expect, it } from "vitest";
import { parseSignupPlan } from "../src/lib/signup-plan.js";

describe("parseSignupPlan (ADR 020)", () => {
  it("keeps the plan and period picked on /precios/", () => {
    expect(parseSignupPlan("?plan=profesional&periodo=mensual")).toEqual({
      plan: "profesional",
      billingInterval: "month",
    });
    expect(parseSignupPlan("?plan=Negocio&periodo=anual")).toEqual({
      plan: "negocio",
      billingInterval: "year",
    });
  });

  it("ignores a missing or malformed plan", () => {
    expect(parseSignupPlan("")).toBeNull();
    expect(parseSignupPlan("?plan=<script>")).toBeNull();
    expect(parseSignupPlan("?periodo=anual")).toBeNull();
  });
});
