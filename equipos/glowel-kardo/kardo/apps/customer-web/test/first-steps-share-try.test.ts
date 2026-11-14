import type { Touchpoint, WorkspaceProfile } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { logoBrandToSave } from "../src/features/onboarding/logo-color.js";
import {
  rememberedPendingShare,
  shareTouchpointName,
} from "../src/features/onboarding/share-model.js";
import {
  nextStepsFor,
  pickTryTouchpoint,
  tryMissingMessage,
} from "../src/features/onboarding/try-model.js";

const touchpoint = (id: string, patch: Partial<Touchpoint> = {}): Touchpoint =>
  ({
    id,
    publicId: `public-${id}-xxxxxxxxxxxx`,
    operationalName: `QR ${id}`,
    physicalType: "qr",
    kind: "qr",
    status: "active",
    ...patch,
  }) as Touchpoint;

const live = (experienceId: string): Touchpoint["live"] => ({
  experienceId,
  experienceName: "Menú",
  experienceType: "menu",
  revision: 1,
  publishedAt: "2026-10-01T00:00:00.000Z",
});

describe("rememberedPendingShare (A2-54: reload and retry reuses the QR)", () => {
  const all = [touchpoint("a"), touchpoint("b")];

  it("finds the QR created for this page", () => {
    expect(
      rememberedPendingShare(
        { touchpointId: "b", experienceId: "e1" },
        "e1",
        all,
      )?.id,
    ).toBe("b");
  });

  it("ignores one made for another page, a deleted one and nothing", () => {
    expect(
      rememberedPendingShare(
        { touchpointId: "b", experienceId: "e2" },
        "e1",
        all,
      ),
    ).toBeNull();
    expect(
      rememberedPendingShare(
        { touchpointId: "z", experienceId: "e1" },
        "e1",
        all,
      ),
    ).toBeNull();
    expect(rememberedPendingShare(null, "e1", all)).toBeNull();
    expect(
      rememberedPendingShare(
        { touchpointId: "b", experienceId: "e1" },
        "e1",
        null,
      ),
    ).toBeNull();
  });
});

describe("shareTouchpointName (A2-54)", () => {
  const base = {
    experienceType: "menu" as const,
    planType: "menu" as const,
    industry: "restaurante",
    businessName: "Cafe Nube",
    existingNames: [] as string[],
  };

  it("uses the business and the names already taken", () => {
    expect(shareTouchpointName({ ...base, kind: "qr" })).toBe("Mesas");
    expect(
      shareTouchpointName({
        ...base,
        kind: "qr",
        businessName: "Tacos El Camión",
      }),
    ).toBe("Camión");
    expect(
      shareTouchpointName({ ...base, kind: "qr", existingNames: ["Mesas"] }),
    ).not.toBe("Mesas");
  });

  it("gives a tag a tag's name, not a QR's", () => {
    const name = shareTouchpointName({ ...base, kind: "nfc" });
    expect(name).not.toBe("Mesas");
    expect(name.length).toBeGreaterThan(0);
  });
});

describe("pickTryTouchpoint (A2-57)", () => {
  it("prefers where it was published here", () => {
    const all = [
      touchpoint("a", { live: live("e1") }),
      touchpoint("b", { live: live("e1") }),
    ];
    expect(pickTryTouchpoint(all, "b", "e1")?.id).toBe("b");
  });

  it("without memory takes one that shows THIS page, not any live one", () => {
    const all = [
      touchpoint("other", { live: live("e2") }),
      touchpoint("mine", { live: live("e1") }),
    ];
    expect(pickTryTouchpoint(all, null, "e1")?.id).toBe("mine");
    expect(pickTryTouchpoint([all[0] as Touchpoint], null, "e1")).toBeNull();
  });

  it("skips a remembered place that now shows another page", () => {
    const all = [
      touchpoint("a", { live: live("e2") }),
      touchpoint("b", { live: live("e1") }),
    ];
    expect(pickTryTouchpoint(all, "a", "e1")?.id).toBe("b");
  });

  it("keeps a remembered place still being published", () => {
    expect(
      pickTryTouchpoint([touchpoint("a", { publishing: true })], "a", "e1")?.id,
    ).toBe("a");
  });

  it("explains what is missing", () => {
    expect(
      tryMissingMessage([touchpoint("a", { publishing: true })], "e1"),
    ).toMatch(/se está publicando/);
    expect(tryMissingMessage([], "e1")).toMatch(/paso 4/);
    expect(tryMissingMessage([], null)).toMatch(/Primero/);
  });
});

describe("nextStepsFor (A2-57)", () => {
  const labels = (type: Parameters<typeof nextStepsFor>[0]) =>
    nextStepsFor(type).map((item) => item.label);

  it("sends a form to Solicitudes, and not to Disponibilidad", () => {
    expect(labels("form")).toContain("Solicitudes y avisos por correo");
    expect(labels("form")).not.toContain("Disponibilidad");
  });

  it("offers Disponibilidad only to a menu or a catalog", () => {
    expect(labels("menu")).toContain("Disponibilidad");
    expect(labels("catalog")).toContain("Disponibilidad");
    for (const type of [
      "document",
      "image",
      "profile",
      "linkpage",
      "redirect",
    ] as const)
      expect(labels(type)).not.toContain("Disponibilidad");
  });
});

describe("logoBrandToSave (A2-6: the logo's color is kept once)", () => {
  const profile: WorkspaceProfile = { industry: "bar" };

  it("saves it when the organization has no brand", () => {
    expect(
      logoBrandToSave({ profile, logoColor: "#B42318", canManage: true }),
    ).toEqual({ primary: "#b42318", accent: "#b42318" });
  });

  it("never over an existing brand, without a color, or without permission", () => {
    const brand = { primary: "#111111", accent: "#222222" };
    expect(
      logoBrandToSave({
        profile: { ...profile, brand },
        logoColor: "#b42318",
        canManage: true,
      }),
    ).toBeNull();
    expect(
      logoBrandToSave({ profile, logoColor: null, canManage: true }),
    ).toBeNull();
    expect(
      logoBrandToSave({ profile, logoColor: undefined, canManage: true }),
    ).toBeNull();
    expect(
      logoBrandToSave({ profile, logoColor: "#b42318", canManage: false }),
    ).toBeNull();
    expect(
      logoBrandToSave({ profile: null, logoColor: "#b42318", canManage: true }),
    ).toBeNull();
  });
});
