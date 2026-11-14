import type { WorkspaceAccess } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  accessDate,
  askOwnerText,
  bannerFor,
  pricingUrl,
  selectionBannerHidden,
} from "../src/features/billing/access-model.js";
import { exportFilename } from "../src/features/organization/use-export.js";
import { setDatePreferences } from "../src/lib/date-preferences.js";

const plain = (text: string) => text.replace(/\s/g, " ");

function access(overrides: Partial<WorkspaceAccess>): WorkspaceAccess {
  return {
    state: "active",
    source: "subscription",
    planCode: "profesional",
    planName: "Profesional",
    endsAt: null,
    daysLeft: null,
    lapsedAt: null,
    graceEndsAt: null,
    deleteAt: null,
    deletionSoon: false,
    canManage: true,
    offer: null,
    ...overrides,
  };
}

const banner = (overrides: Partial<WorkspaceAccess>, canExport = true) =>
  bannerFor(access(overrides), { canExport });

describe("access strip copy", () => {
  it("shows nothing while loading or when the read failed", () => {
    expect(bannerFor(null, { canExport: true })).toBeNull();
  });

  it("shows nothing for active, legacy and internal organizations", () => {
    expect(banner({ state: "active" })).toBeNull();
    expect(banner({ state: "legacy", source: "legacy" })).toBeNull();
    expect(banner({ state: "internal", source: "internal" })).toBeNull();
  });

  it("counts the trial days", () => {
    const state = { state: "trial", source: "trial" } as const;
    expect(banner({ ...state, daysLeft: 11 })?.text).toBe(
      "Te quedan 11 días de prueba de Profesional. Al terminar no se cobra nada si no eliges un plan.",
    );
    expect(banner({ ...state, daysLeft: 1 })?.text).toBe(
      "Te queda 1 día de prueba de Profesional. Al terminar no se cobra nada si no eliges un plan.",
    );
    expect(banner({ ...state, daysLeft: 0 })?.text).toBe(
      "Tu prueba de Profesional termina hoy. Al terminar no se cobra nada si no eliges un plan.",
    );
  });

  it("explains a finished trial with the pause date and the offer", () => {
    const limited = {
      state: "limited",
      source: "trial",
      graceEndsAt: "2026-10-07T18:00:00.000Z",
    } as const;
    expect(plain(banner(limited)?.text ?? "")).toBe(
      "Tu prueba terminó. Elige un plan para seguir editando; tus páginas se pausan el 7 de octubre de 2026.",
    );
    const withOffer = banner({
      ...limited,
      offer: {
        percentOff: 20,
        months: 3,
        interval: "month",
        validUntil: "2026-10-14T18:00:00.000Z",
      },
    });
    expect(plain(withOffer?.text ?? "")).toBe(
      "Tu prueba terminó. Elige un plan para seguir editando; tus páginas se pausan el 7 de octubre de 2026. 20 % en tus 3 primeros meses si contratas antes del 14 de octubre de 2026.",
    );
    expect(withOffer?.tone).toBe("warning");
  });

  it("explains a finished plan and an organization without plan", () => {
    const graceEndsAt = "2026-10-07T18:00:00.000Z";
    for (const source of ["subscription", "manual"] as const)
      expect(
        plain(banner({ state: "limited", source, graceEndsAt })?.text ?? ""),
      ).toBe(
        "Tu plan terminó. Elige un plan para seguir editando; tus páginas se pausan el 7 de octubre de 2026.",
      );
    expect(banner({ state: "limited", source: "none" })?.text).toBe(
      "Esta organización no tiene plan. Elige uno para empezar a crear",
    );
  });

  it("says the pages are paused", () => {
    expect(banner({ state: "paused", source: "trial" })?.text).toBe(
      "Tus páginas están en pausa. Elige un plan y vuelven al instante",
    );
  });

  it("warns about the deletion and offers the download", () => {
    const soon = {
      state: "paused",
      source: "trial",
      deletionSoon: true,
      deleteAt: "2026-12-30T18:00:00.000Z",
    } as const;
    const owner = banner(soon);
    expect(plain(owner?.text ?? "")).toBe(
      "Borraremos esta organización el 30 de diciembre de 2026. Descarga tu información o contrata",
    );
    expect(owner?.download).toBe(true);
    expect(banner(soon, false)?.download).toBe(false);
  });

  it("announces a courtesy plan that ends within a week", () => {
    const courtesy = { state: "active", source: "manual" } as const;
    expect(
      plain(
        banner({
          ...courtesy,
          daysLeft: 7,
          endsAt: "2026-10-06T18:00:00.000Z",
        })?.text ?? "",
      ),
    ).toBe("Tu plan Profesional de cortesía termina el 6 de octubre de 2026");
    expect(
      banner({ ...courtesy, daysLeft: 8, endsAt: "2026-10-07T18:00:00.000Z" }),
    ).toBeNull();
    expect(
      banner({ state: "active", source: "subscription", daysLeft: 3 }),
    ).toBeNull();
  });

  it("uses no long dash and no decorative capitals", () => {
    const all = [
      banner({ state: "trial", source: "trial", daysLeft: 3 }),
      banner({ state: "limited", source: "none" }),
      banner({ state: "paused", source: "trial" }),
    ];
    for (const item of all) {
      expect(item?.text).not.toMatch(/—/);
      expect(item?.text).not.toMatch(/\bIA\b/);
    }
    expect(askOwnerText).toBe("Pídele al propietario que elija un plan");
  });
});

describe("access helpers", () => {
  it("formats dates in the zone of the person's preferences", () => {
    // 03:00 UTC is still the previous evening in Mexico City.
    setDatePreferences({
      timeZone: "America/Mexico_City",
      hourCycle: undefined,
    });
    expect(accessDate("2026-10-08T03:00:00.000Z")).toBe("7 de octubre de 2026");
    setDatePreferences({ timeZone: "Asia/Tokyo", hourCycle: undefined });
    expect(accessDate("2026-10-08T03:00:00.000Z")).toBe("8 de octubre de 2026");
    setDatePreferences({ timeZone: undefined, hourCycle: undefined });
    expect(accessDate(null)).toBe("");
    expect(accessDate("nope")).toBe("");
  });

  it("builds the pricing address for one organization", () => {
    expect(
      pricingUrl("0d4a8c73-0a52-4a0e-8b7a-0c2f0e4b1a02", {
        configured: "https://kardo.mx/",
        location: new URL("https://app.kardo.mx/settings/plan"),
      }),
    ).toBe(
      "https://kardo.mx/precios/?desde=panel&organizacion=0d4a8c73-0a52-4a0e-8b7a-0c2f0e4b1a02",
    );
    expect(
      pricingUrl("abc", {
        location: new URL("https://app.kardo.mx/"),
      }),
    ).toBe("https://kardo.mx/precios/?desde=panel&organizacion=abc");
  });

  it("shows one strip, not the access one and the selection one together", () => {
    const warning = bannerFor(access({ state: "paused" }), {
      canExport: false,
    });
    expect(selectionBannerHidden(warning)).toBe(true);
    const info = bannerFor(access({ state: "trial", daysLeft: 5 }), {
      canExport: false,
    });
    expect(selectionBannerHidden(info)).toBe(false);
    expect(selectionBannerHidden(null)).toBe(false);
  });

  it("names the export file after the organization", () => {
    expect(exportFilename("Café Ñandú", new Date("2026-09-30T12:00:00Z"))).toBe(
      "kardo-cafe-nandu-2026-09-30.json",
    );
    expect(exportFilename("???", new Date("2026-09-30T12:00:00Z"))).toBe(
      "kardo-organizacion-2026-09-30.json",
    );
  });
});
