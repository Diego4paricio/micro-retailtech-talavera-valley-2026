import { describe, expect, it } from "vitest";
import { handleSettingsDemo } from "../src/lib/demo/settings.js";

describe("handleSettingsDemo", () => {
  it("returns undefined for paths outside its area", () => {
    expect(handleSettingsDemo("/v1/me/profile", "GET", {})).toBeUndefined();
  });

  it("returns an empty profile before any change", () => {
    expect(
      handleSettingsDemo("/v1/workspaces/demo-1/profile", "GET", {}),
    ).toEqual({});
  });

  it("merges a PATCH into the stored profile, scoped by workspace id", () => {
    expect(
      handleSettingsDemo("/v1/workspaces/demo-2/profile", "PATCH", {
        legalName: "Café Nube",
        country: "MX",
      }),
    ).toEqual({ legalName: "Café Nube", country: "MX" });
    // Fields left out stay; null removes one (domain audit A2-1).
    expect(
      handleSettingsDemo("/v1/workspaces/demo-2/profile", "PATCH", {
        phone: "55 1234 5678",
        legalName: null,
      }),
    ).toEqual({ country: "MX", phone: "55 1234 5678" });
    expect(
      handleSettingsDemo("/v1/workspaces/demo-2/profile", "GET", {}),
    ).toEqual({ country: "MX", phone: "55 1234 5678" });
    // A different workspace id is unaffected.
    expect(
      handleSettingsDemo("/v1/workspaces/demo-3/profile", "GET", {}),
    ).toEqual({});
  });

  it("creates a new demo organization with an owner role", () => {
    const result = handleSettingsDemo("/v1/organizations", "POST", {
      name: "Nueva Org",
    }) as { name: string; kind: string; role: string } | undefined;
    expect(result?.name).toBe("Nueva Org");
    expect(result?.kind).toBe("organization");
    expect(result?.role).toBe("owner");
  });
});
