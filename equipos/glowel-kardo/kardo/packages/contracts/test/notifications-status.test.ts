import { describe, expect, it } from "vitest";
import {
  checkNotificationAudience,
  closingStatusUpdate,
  isBroadcastAudience,
  isPanelActionUrl,
  normalizeNotificationActionUrl,
  statusComponentIds,
  statusComponentLabels,
  statusUpdateKindsFor,
  worstStatusLevel,
} from "../src/index.js";

const uuid = "7b9e2c1a-4d3f-4a5b-8c6d-1e2f3a4b5c6d";

describe("checkNotificationAudience", () => {
  it("accepts the four shapes", () => {
    expect(checkNotificationAudience({ kind: "all" })).toBeNull();
    expect(
      checkNotificationAudience({ kind: "all", roles: ["owner"] }),
    ).toBeNull();
    expect(
      checkNotificationAudience({
        kind: "segment",
        billingStates: ["trial"],
        roles: ["owner", "admin"],
      }),
    ).toBeNull();
    expect(
      checkNotificationAudience({ kind: "workspace", workspaceId: uuid }),
    ).toBeNull();
    expect(
      checkNotificationAudience({ kind: "profile", profileId: uuid }),
    ).toBeNull();
  });

  it("rejects mixed or empty shapes", () => {
    expect(checkNotificationAudience({ kind: "all", workspaceId: uuid })).toBe(
      "AUDIENCE_INVALID",
    );
    expect(checkNotificationAudience({ kind: "segment" })).toBe(
      "AUDIENCE_INVALID",
    );
    expect(
      checkNotificationAudience({ kind: "segment", roles: ["owner"] }),
    ).toBe("AUDIENCE_INVALID");
    expect(checkNotificationAudience({ kind: "workspace" })).toBe(
      "AUDIENCE_INVALID",
    );
    expect(
      checkNotificationAudience({
        kind: "workspace",
        workspaceId: uuid,
        planCodes: ["negocio"],
      }),
    ).toBe("AUDIENCE_INVALID");
    expect(
      checkNotificationAudience({
        kind: "profile",
        profileId: uuid,
        roles: ["owner"],
      }),
    ).toBe("AUDIENCE_INVALID");
  });

  it("knows which audiences are broadcasts", () => {
    expect(isBroadcastAudience({ kind: "all" })).toBe(true);
    expect(
      isBroadcastAudience({ kind: "segment", accountTypes: ["personal"] }),
    ).toBe(true);
    expect(isBroadcastAudience({ kind: "workspace", workspaceId: uuid })).toBe(
      false,
    );
    expect(isBroadcastAudience({ kind: "profile", profileId: uuid })).toBe(
      false,
    );
  });
});

describe("normalizeNotificationActionUrl", () => {
  it("keeps panel paths and https addresses", () => {
    expect(normalizeNotificationActionUrl("/billing")).toBe("/billing");
    expect(normalizeNotificationActionUrl(" /touchpoints?tab=qr ")).toBe(
      "/touchpoints?tab=qr",
    );
    expect(normalizeNotificationActionUrl("https://kardo.mx/novedades")).toBe(
      "https://kardo.mx/novedades",
    );
    expect(normalizeNotificationActionUrl("https://kardo.mx")).toBe(
      "https://kardo.mx/",
    );
  });

  it("rejects anything that could run or leave quietly", () => {
    for (const bad of [
      "javascript:alert(1)",
      "http://kardo.mx",
      "//evil.example",
      "https://user:pass@kardo.mx",
      "data:text/html,hi",
      "/path with space",
      "/a<b",
      "https://localhost/x",
      "",
      `/${"a".repeat(600)}`,
    ]) {
      expect(normalizeNotificationActionUrl(bad)).toBeNull();
    }
  });

  it("tells panel paths from external links", () => {
    expect(isPanelActionUrl("/billing")).toBe(true);
    expect(isPanelActionUrl("https://kardo.mx/")).toBe(false);
    expect(isPanelActionUrl("//evil.example")).toBe(false);
  });
});

describe("status helpers", () => {
  it("takes the worst level", () => {
    expect(worstStatusLevel([])).toBe("operational");
    expect(worstStatusLevel(["operational", "maintenance"])).toBe(
      "maintenance",
    );
    expect(
      worstStatusLevel(["degraded", "major_outage", "partial_outage"]),
    ).toBe("major_outage");
  });

  it("names every area in plain words", () => {
    for (const id of statusComponentIds) {
      expect(statusComponentLabels[id].length).toBeGreaterThan(3);
    }
  });

  it("has a flow per kind and the update that closes it", () => {
    expect(statusUpdateKindsFor("incident")).toContain("investigating");
    expect(statusUpdateKindsFor("incident")).not.toContain("scheduled");
    expect(statusUpdateKindsFor("maintenance")).toContain("in_progress");
    expect(closingStatusUpdate("incident")).toBe("resolved");
    expect(closingStatusUpdate("maintenance")).toBe("completed");
  });
});
