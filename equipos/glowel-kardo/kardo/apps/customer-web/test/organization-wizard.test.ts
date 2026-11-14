import type { BillingMyAccount, BillingPlanList } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  accountPhase,
  atOrganizationCap,
  buildProfile,
  extraChargeLine,
  extraOrganizationPrice,
  industryIcons,
  industryTiles,
  initialWizardState,
  needsPlanForOrganization,
  newOrganizationPlanNote,
  nextPlanUp,
  organizationCapLine,
  organizationPlanLine,
  organizationsFooter,
  paletteChoices,
  zoneForCity,
} from "../src/features/organization/new-organization-model.js";

describe("buildProfile («Crear organización», relevo 36)", () => {
  it("keeps only the country and the zone when nothing else was filled in", () => {
    expect(buildProfile(initialWizardState)).toEqual({
      country: "MX",
      timezone: "America/Mexico_City",
    });
  });

  it("saves the trimmed fields, the WhatsApp as the profile writes it and the zone of the city", () => {
    const profile = buildProfile({
      ...initialWizardState,
      industry: "belleza",
      about: "  Cortes, color y uñas.  ",
      city: "Cancún, Quintana Roo",
      address: "  Av. Tulum 220, Supermanzana 4 ",
      hours: "Lunes a sábado, de 10:00 a 19:00",
      whatsapp: "998 123 4567",
      email: " hola@brillo.test ",
    });
    expect(profile).toEqual({
      country: "MX",
      timezone: "America/Cancun",
      industry: "belleza",
      about: "Cortes, color y uñas.",
      city: "Cancún, Quintana Roo",
      address: "Av. Tulum 220, Supermanzana 4",
      hours: "Lunes a sábado, de 10:00 a 19:00",
      phone: "998 123 4567",
      email: "hola@brillo.test",
    });
  });

  it("keeps a zone the person chose over the city's", () => {
    expect(
      buildProfile({
        ...initialWizardState,
        city: "Tijuana, Baja California",
        timezone: "America/Mexico_City",
      }).timezone,
    ).toBe("America/Mexico_City");
  });

  it("saves colors only when chosen or with a logo, and the logo once uploaded", () => {
    expect(buildProfile(initialWizardState).brand).toBeUndefined();
    expect(
      buildProfile(
        { ...initialWizardState, primary: "#8e3b4e", accent: "#f1dfe4" },
        "6b1f3a2c-1111-4111-8111-111111111111",
      ),
    ).toMatchObject({
      brand: { primary: "#8e3b4e", accent: "#f1dfe4" },
      logoAssetId: "6b1f3a2c-1111-4111-8111-111111111111",
    });
    expect(
      buildProfile({
        ...initialWizardState,
        customColors: true,
        primary: "#111111",
        accent: "#222222",
      }).brand,
    ).toEqual({ primary: "#111111", accent: "#222222" });
  });
});

describe("zoneForCity", () => {
  it("follows the state, with Ciudad Juárez apart and Central time otherwise", () => {
    expect(zoneForCity("Cancún, Quintana Roo", "MX").zone).toBe(
      "America/Cancun",
    );
    expect(zoneForCity("Tijuana, Baja California", "MX").zone).toBe(
      "America/Tijuana",
    );
    expect(zoneForCity("Mazatlán, Sinaloa", "MX").zone).toBe(
      "America/Mazatlan",
    );
    expect(zoneForCity("Hermosillo, Sonora", "MX").zone).toBe(
      "America/Hermosillo",
    );
    expect(zoneForCity("Ciudad Juárez, Chihuahua", "MX").zone).toBe(
      "America/Ciudad_Juarez",
    );
    expect(zoneForCity("Puebla", "MX")).toEqual({
      zone: "America/Mexico_City",
      label: "Centro de México",
    });
    expect(zoneForCity("Mi pueblito", "MX").zone).toBe("America/Mexico_City");
  });
});

describe("paletteChoices", () => {
  it("offers Kardo's colors without a logo, and the logo's first with one", () => {
    expect(paletteChoices(null)).toEqual([
      { primary: "#0a6c78", accent: "#4ec3ce", label: "Kardo" },
    ]);
    const withLogo = paletteChoices("#8e3b4e");
    expect(withLogo.map((item) => item.label)).toEqual([
      "De tu logo",
      "Más oscuro",
      "Kardo",
    ]);
    expect(withLogo[0]?.primary).toBe("#8e3b4e");
    expect(withLogo[1]?.accent).toBe("#8e3b4e");
  });
});

const account = (
  overrides: Partial<BillingMyAccount> = {},
): BillingMyAccount => ({
  plan: { code: "profesional", name: "Profesional", source: "subscription" },
  organizationsUsed: 2,
  organizationsLimit: 3,
  canAddExtras: true,
  homeWorkspaceId: "e6abf26a-3263-4149-9d75-9b7441165d29",
  extras: [
    {
      code: "organization",
      name: "Organización extra",
      unitsPerQuantity: 1,
      entitlementKey: "organizations.max",
      quantity: 0,
      prices: [
        {
          id: "price_org_month",
          interval: "month",
          unitAmount: 9900,
          currency: "mxn",
          taxInclusive: true,
        },
      ],
    },
  ],
  ...overrides,
});

const plan = (
  code: string,
  name: string,
  orgs: number,
  qr: number,
  links: number,
  month: number,
) => ({
  code,
  name,
  description: null,
  isDefault: false,
  trialDays: null,
  entitlements: {
    "organizations.max": orgs,
    "touchpoints.max": qr,
    "links.max": links,
  },
  prices: [
    {
      id: `price_${code}_month`,
      interval: "month" as const,
      unitAmount: month,
      currency: "mxn",
      taxInclusive: true,
    },
  ],
});

const catalog: BillingPlanList = {
  checkoutAvailable: true,
  plans: [
    plan("negocio", "Negocio", 5, 150, 25, 69900),
    plan("esencial", "Esencial", 1, 20, 3, 19900),
    plan("profesional", "Profesional", 3, 60, 10, 37900),
  ],
};

describe("the plan line", () => {
  it("keeps today's line when there is no plan or no account", () => {
    expect(newOrganizationPlanNote).toBe(
      "Empieza sin plan. Para publicar, elige uno en Plan y facturación.",
    );
    expect(organizationPlanLine(null)).toBe(newOrganizationPlanNote);
    expect(organizationPlanLine(account({ plan: null }))).toBe(
      newOrganizationPlanNote,
    );
  });

  it("says what the plan includes and which one this will be", () => {
    expect(organizationPlanLine(account())).toBe(
      "Tu plan Profesional incluye 3: usas 2. Esta será la 3.",
    );
  });

  it("speaks of the trial without «Esta será»", () => {
    expect(
      organizationPlanLine(
        account({
          organizationsUsed: 1,
          plan: { code: "profesional", name: "Profesional", source: "trial" },
        }),
      ),
    ).toBe("Tu prueba de Profesional incluye 3: usas 1.");
  });

  it("has no number when the plan has no cap", () => {
    expect(organizationPlanLine(account({ organizationsLimit: null }))).toBe(
      "Tu plan Profesional incluye las organizaciones que necesites.",
    );
  });
});

describe("the cap", () => {
  it("is reached only with a plan, a limit and all of it used", () => {
    expect(atOrganizationCap(account())).toBe(false);
    expect(atOrganizationCap(account({ organizationsUsed: 3 }))).toBe(true);
    expect(atOrganizationCap(account({ organizationsLimit: null }))).toBe(
      false,
    );
    expect(
      atOrganizationCap(account({ plan: null, organizationsUsed: 1 })),
    ).toBe(false);
    expect(atOrganizationCap(null)).toBe(false);
  });

  it("counts the limit without a plan too, and then asks to pick one (A2-13)", () => {
    const noPlan = account({
      plan: null,
      organizationsLimit: 1,
      organizationsUsed: 1,
    });
    expect(atOrganizationCap(noPlan)).toBe(true);
    expect(needsPlanForOrganization(noPlan)).toBe(true);
    expect(needsPlanForOrganization(account({ organizationsUsed: 3 }))).toBe(
      false,
    );
    expect(
      atOrganizationCap(
        account({ plan: null, organizationsLimit: 1, organizationsUsed: 0 }),
      ),
    ).toBe(false);
  });

  it("says it in singular and plural", () => {
    const one = account({
      plan: { code: "esencial", name: "Esencial", source: "subscription" },
      organizationsLimit: 1,
      organizationsUsed: 1,
    });
    expect(organizationCapLine(one)).toBe(
      "Tu plan Esencial incluye 1 organización y ya la usas.",
    );
    expect(organizationCapLine(account({ organizationsUsed: 3 }))).toBe(
      "Tu plan Profesional incluye 3 organizaciones y ya las usas.",
    );
    expect(
      organizationCapLine(
        account({
          organizationsUsed: 3,
          plan: { code: "profesional", name: "Profesional", source: "trial" },
        }),
      ),
    ).toBe("Tu prueba de Profesional incluye 3 organizaciones y ya las usas.");
  });

  it("offers the next plan up by organizations, built from the catalog", () => {
    const one = account({
      plan: { code: "esencial", name: "Esencial", source: "subscription" },
      organizationsLimit: 1,
      organizationsUsed: 1,
    });
    expect(nextPlanUp(one, catalog)).toEqual({
      code: "profesional",
      name: "Profesional",
      line: "3 organizaciones, 60 QR y etiquetas y 10 links. $379 al mes.",
    });
    expect(nextPlanUp(account({ organizationsLimit: 5 }), catalog)).toBeNull();
    expect(nextPlanUp(one, null)).toBeNull();
  });

  it("prices the extra organization on the plan's interval", () => {
    expect(extraOrganizationPrice(account())).toBe("$99 al mes");
    expect(extraChargeLine(6600, "month")).toBe(
      "Hoy pagas $66 por lo que falta del mes.",
    );
    expect(extraChargeLine(81200, "year")).toBe(
      "Hoy pagas $812 por lo que falta del año.",
    );
  });

  it("shows the numbers in Tus organizaciones only when known", () => {
    expect(organizationsFooter(account())).toBe("Tu plan incluye 3: usas 2.");
    expect(organizationsFooter(null)).toBeNull();
    expect(organizationsFooter(account({ plan: null }))).toBeNull();
  });
});

describe("the giro tiles (A2-5)", () => {
  it("come from the one catalog, each with an icon", async () => {
    const { industryCatalog } = await import("@kardo/contracts");
    expect(industryTiles.map((tile) => tile.value)).toEqual(
      industryCatalog.map((industry) => industry.value),
    );
    for (const tile of industryTiles) {
      expect(tile.icon).toBe(industryIcons[tile.value]);
      expect(tile.label).not.toBe("");
    }
  });
});

describe("reading the account (A2-8)", () => {
  it("tells loading from failed, so the dialog never waits forever", () => {
    expect(accountPhase(null, false)).toBe("loading");
    expect(accountPhase(null, true)).toBe("failed");
    expect(accountPhase(account(), false)).toBe("ready");
    expect(accountPhase(account(), true)).toBe("ready");
  });
});
