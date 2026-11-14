import { planEntitlementKeys } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  displayEntitlement,
  fromEntitlementForm,
  parseSortOrder,
  parseTrialDays,
  toEntitlementForm,
} from "../src/features/plans/plan-form.js";

describe("entitlement form", () => {
  it("covers every key of the contract and never the removed organizations.max", () => {
    const form = toEntitlementForm({ "organizations.max": 3 });
    expect(Object.keys(form)).toEqual([...planEntitlementKeys]);
    expect("organizations.max" in form).toBe(false);
  });

  it("maps null and missing limits to unlimited, and features to switches", () => {
    const form = toEntitlementForm({
      "touchpoints.max": 5,
      "links.max": null,
      "leads.export": true,
    });
    expect(form["touchpoints.max"]).toEqual({
      kind: "limit",
      unlimited: false,
      value: "5",
    });
    expect(form["links.max"]).toMatchObject({ unlimited: true });
    expect(form["members.max"]).toMatchObject({ unlimited: true });
    expect(form["leads.export"]).toEqual({ kind: "feature", enabled: true });
    expect(form["leads.webhook"]).toEqual({ kind: "feature", enabled: false });
  });

  it("round-trips to the API shape (null = sin límite)", () => {
    const result = fromEntitlementForm(
      toEntitlementForm({
        "touchpoints.max": 25,
        "links.max": null,
        "custom_html.enabled": true,
      }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entitlements["touchpoints.max"]).toBe(25);
    expect(result.entitlements["links.max"]).toBeNull();
    expect(result.entitlements["custom_html.enabled"]).toBe(true);
    expect(result.entitlements["leads.export"]).toBe(false);
    expect(Object.keys(result.entitlements)).toHaveLength(
      planEntitlementKeys.length,
    );
  });

  it("flags a limit that is neither a whole number nor unlimited", () => {
    const form = toEntitlementForm({});
    form["touchpoints.max"] = { kind: "limit", unlimited: false, value: "2.5" };
    expect(fromEntitlementForm(form)).toEqual({
      ok: false,
      key: "touchpoints.max",
    });
    form["touchpoints.max"] = { kind: "limit", unlimited: false, value: "" };
    expect(fromEntitlementForm(form).ok).toBe(false);
  });

  it("displays entitlements for the plan card", () => {
    expect(displayEntitlement("links.max", null)).toBe("Ilimitado");
    expect(displayEntitlement("links.max", 1500)).toBe("1,500");
    expect(displayEntitlement("leads.export", true)).toBe("Sí");
    expect(displayEntitlement("leads.export", undefined)).toBe("No");
  });
});

describe("plan numeric fields", () => {
  it("trial days: empty is no trial, otherwise 1..90", () => {
    expect(parseTrialDays("")).toEqual({ ok: true, value: null });
    expect(parseTrialDays("14")).toEqual({ ok: true, value: 14 });
    expect(parseTrialDays("0").ok).toBe(false);
    expect(parseTrialDays("91").ok).toBe(false);
    expect(parseTrialDays("1.5").ok).toBe(false);
  });

  it("sort order: empty is 0, otherwise 0..1000", () => {
    expect(parseSortOrder("")).toEqual({ ok: true, value: 0 });
    expect(parseSortOrder("30")).toEqual({ ok: true, value: 30 });
    expect(parseSortOrder("1001").ok).toBe(false);
    expect(parseSortOrder("-1").ok).toBe(false);
  });
});
