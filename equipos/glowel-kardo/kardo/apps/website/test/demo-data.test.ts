import { describe, expect, it } from "vitest";
import {
  arrivalCaption,
  buildLinkPage,
  buildShopPage,
  cafe,
  describeChanges,
  floreria,
  type ShopBusiness,
  type Shows,
  shopItems,
  shopTargets,
} from "@/components/demo/demo-data";
import {
  buildStudioPage,
  csvField,
  describeStudioChanges,
  type FieldSetting,
  formControls,
  isHttpsUrl,
  leadsCsv,
  limits,
  type Opens,
  studio,
  studioErrors,
} from "@/components/demo/studio-data";
import { delta, samples } from "@/components/insights/sample";
import { presetThemes } from "@/components/kardo-page/theme";
import {
  defaultDemoBusiness,
  demoBusinesses,
  getDemoBusiness,
  setDemoBusiness,
  subscribeDemoBusiness,
} from "@/lib/demo-business";

// The live demo only shows what the panel really does (checked with the
// panel session on 2026-09-28): the eight Touchpoint page types, "Página de
// Link" only for the Links product, https-only buttons, a form that always
// asks for the email, and the panel's preset themes.

const shops: ShopBusiness[] = [cafe, floreria];

/** The Experience types a QR, NFC or "Otro" point can open. */
const touchpointTypes = [
  "menu",
  "catalog",
  "profile",
  "links",
  "image",
  "document",
  "form",
  "redirect",
];

const settings: FieldSetting[] = ["required", "optional", "hidden"];

describe("demo businesses", () => {
  it("are the three of the selector, in the same order as the Resumen", () => {
    expect(demoBusinesses.map((business) => business.id)).toEqual([
      "cafe",
      "floreria",
      "estudio",
    ]);
    expect(Object.keys(samples).sort()).toEqual(
      demoBusinesses.map((business) => business.id).sort(),
    );
    expect([cafe.name, floreria.name, studio.name]).toEqual(
      demoBusinesses.map((business) => business.name),
    );
  });

  it("open only valid page types on their Touchpoints", () => {
    for (const shop of shops) {
      const options: Shows[] = shop.menu ? ["menu", "catalog"] : ["catalog"];
      for (const version of shop.versions)
        for (const shows of options) {
          const page = buildShopPage(
            shop,
            { ...version.state, shows },
            shop.availability,
          );
          expect(touchpointTypes, shop.id).toContain(page.type);
        }
    }
    for (const version of studio.versions)
      for (const opens of ["links", "form"] as Opens[]) {
        const page = buildStudioPage({ ...version.state, opens });
        expect(["links", "form"]).toContain(page.type);
      }
  });

  it("keeps the Página de Link for the Links product only", () => {
    expect(floreria.links).toBeDefined();
    if (floreria.links)
      expect(buildLinkPage(floreria.links).type).toBe("linkpage");
    expect(cafe.links).toBeUndefined();
    expect(touchpointTypes).not.toContain("linkpage");
  });

  it("uses only the panel's preset themes", () => {
    const presets = Object.keys(presetThemes);
    const used = [
      ...shops.flatMap((shop) => [
        ...shop.themeChoices,
        ...shop.versions.map((version) => version.state.themeName),
        ...(shop.links ? [shop.links.theme] : []),
      ]),
      ...studio.themeChoices,
      ...studio.versions.map((version) => version.state.themeName),
    ];
    for (const theme of used) expect(presets).toContain(theme);
  });

  it("keeps versions newest first, each one changing something", () => {
    for (const shop of shops) {
      const numbers = shop.versions.map((version) => version.number);
      expect(numbers).toEqual([...numbers].sort((a, b) => b - a));
      shop.versions.slice(0, -1).forEach((version, index) => {
        const older = shop.versions[index + 1];
        if (older)
          expect(
            describeChanges(shop, older.state, version.state).length,
          ).toBeGreaterThan(0);
      });
    }
    studio.versions.slice(0, -1).forEach((version, index) => {
      const older = studio.versions[index + 1];
      if (older)
        expect(
          describeStudioChanges(older.state, version.state).length,
        ).toBeGreaterThan(0);
    });
  });

  it("start each business from its own visit counters", () => {
    const counters = [cafe.visits, floreria.visits, studio.visits].map(
      (visits) => JSON.stringify(visits),
    );
    expect(new Set(counters).size).toBe(3);
  });
});

describe("buttons and links", () => {
  it("send the Página de enlaces buttons to https only", () => {
    for (const version of studio.versions) {
      expect(version.state.links.length).toBeLessThanOrEqual(limits.links);
      for (const link of version.state.links) {
        expect(link.url.startsWith("https://"), link.url).toBe(true);
        expect(isHttpsUrl(link.url), link.url).toBe(true);
      }
      expect(studioErrors(version.state)).toEqual({});
    }
  });

  it("send the Catálogo's Ver más to https only", () => {
    for (const shop of shops) {
      expect(shop.catalog.items.length).toBeLessThanOrEqual(48);
      for (const item of shopItems(shop))
        if (item.link) expect(isHttpsUrl(item.link), item.link).toBe(true);
    }
    expect(floreria.catalog.items.every((item) => item.link)).toBe(true);
  });

  it.each([
    "http://wa.me/522220000000",
    "javascript:alert(1)",
    "mailto:hola@example.com",
    "tel:+522220000000",
    "https://usuario:clave@example.com",
    "https://",
    "wa.me/522220000000",
  ])("rejects %s as a button address", (value) => {
    expect(isHttpsUrl(value)).toBe(false);
  });

  it("blocks publishing a button without https or without text", () => {
    const first = studio.versions[0];
    if (!first) throw new Error("sin versiones");
    const [link] = first.state.links;
    if (!link) throw new Error("sin botones");
    const broken = {
      ...first.state,
      links: [{ ...link, label: " ", url: "http://example.com" }],
    };
    expect(Object.keys(studioErrors(broken)).sort()).toEqual(
      [`label-${link.id}`, `url-${link.id}`].sort(),
    );
  });
});

describe("contact form", () => {
  it("always asks for the email first, and requires it", () => {
    for (const name of settings)
      for (const phone of settings)
        for (const message of settings) {
          const controls = formControls({ name, phone, message });
          expect(controls[0]).toMatchObject({
            name: "email",
            type: "email",
            required: true,
          });
          expect(controls.map((control) => control.name)).toEqual(
            [
              "email",
              name === "hidden" ? null : "name",
              phone === "hidden" ? null : "phone",
              message === "hidden" ? null : "message",
            ].filter(Boolean),
          );
          for (const control of controls.slice(1)) {
            const setting = { name, phone, message }[
              control.name as "name" | "phone" | "message"
            ];
            expect(control.required).toBe(setting === "required");
          }
        }
  });

  it("keeps the editable texts within the contracts' limits", () => {
    for (const version of studio.versions) {
      const form = version.state.form;
      expect(form.submitLabel.length).toBeLessThanOrEqual(limits.submitLabel);
      expect(form.successMessage.length).toBeLessThanOrEqual(
        limits.successMessage,
      );
      expect(form.consentText.length).toBeLessThanOrEqual(limits.consentText);
      expect(form.consentText.trim().length).toBeGreaterThan(0);
    }
  });
});

describe("the ad is its own Otro point", () => {
  const all = [
    { name: cafe.name, ad: cafe.ad, phone: cafe.phone },
    { name: floreria.name, ad: floreria.ad, phone: floreria.phone },
    { name: studio.name, ad: studio.ad, phone: studio.phone },
  ];

  it.each(all)("$name targets an Otro Touchpoint apart", ({ ad }) => {
    expect(ad.kind).toBe("other");
    expect(ad.name).toBe("Anuncio en redes");
  });

  it("is reached by every publication, next to the group", () => {
    expect(shopTargets(cafe)).toEqual({
      count: 21,
      label: "Publicar en 20 mesas y 1 anuncio",
    });
    expect(shopTargets(floreria)).toEqual({
      count: 3,
      label: "Publicar en 2 puntos y 1 anuncio",
    });
    for (const shop of shops)
      expect(shop.group.everywhere.endsWith("y el anuncio")).toBe(true);
  });

  it.each(all)(
    "$name never puts the tables' address in the ad",
    ({ phone }) => {
      const copy = [
        phone.idle,
        arrivalCaption(phone, "nfc"),
        arrivalCaption(phone, "qr"),
        arrivalCaption(phone, "link"),
      ];
      for (const line of copy) {
        expect(line).not.toMatch(/(su|la|misma) direcci[oó]n tambi[eé]n/i);
        expect(line).not.toMatch(/por los tres caminos/i);
      }
      expect(phone.idle).toContain("El anuncio es otro punto");
      expect(arrivalCaption(phone, "link")).toContain(
        "desde el anuncio: un punto propio, con sus visitas por separado",
      );
    },
  );

  it("files a lead under the point its form was sent from", () => {
    for (const lead of studio.leads)
      expect([studio.touchpoint.name, studio.ad.name]).toContain(
        lead.touchpoint,
      );
  });
});

describe("leads come only from a Formulario de contacto", () => {
  it.each(["cafe", "floreria"] as const)(
    "%s has no form, so its Resumen shows 0 leads everywhere",
    (id) => {
      const sample = samples[id];
      expect(sample.leads).toBe(0);
      expect(sample.previousLeads).toBe(0);
      expect(sample.leadSeries.every((value) => value === 0)).toBe(true);
      expect(sample.conversionSeries.every((value) => value === 0)).toBe(true);
    },
  );

  it("keeps the salon's leads: its plate opens a Formulario", () => {
    expect(samples.estudio.leads).toBeGreaterThan(0);
    expect(studio.versions[0]?.state.opens).toBe("form");
  });

  it("shows no trend with nothing to compare, like the panel", () => {
    expect(delta(0, 0)).toBeNull();
    expect(delta(12, 10)).toEqual({ direction: "up", text: "▲ 20 %" });
  });

  it("counts URL directa as the ad's (and the Link's) own points", () => {
    for (const sample of Object.values(samples)) {
      const direct =
        sample.channelShares.find((channel) => channel.id === "link")?.share ??
        0;
      const own = sample.ranking
        .filter(
          (row) => row.name === "Anuncio en redes" || row.name.startsWith("@"),
        )
        .reduce((total, row) => total + row.value, 0);
      expect(own).toBeGreaterThan(0);
      expect(own).toBeLessThanOrEqual(Math.round(direct * sample.taps) + 1);
    }
  });
});

describe("leads CSV", () => {
  const now = new Date("2026-09-28T18:00:00.000Z");

  it("uses the panel's columns, a BOM and CRLF", () => {
    const csv = leadsCsv(studio.leads, now);
    expect(
      csv.startsWith(
        `${String.fromCharCode(0xfeff)}fecha,touchpoint,nombre,email,telefono,mensaje\r\n`,
      ),
    ).toBe(true);
    expect(csv.endsWith("\r\n")).toBe(true);
    expect(csv.split("\r\n").length).toBe(studio.leads.length + 2);
    expect(csv).toContain("2026-09-27T22:00:00.000Z,Recepción,Mariana López");
  });

  it.each([
    ["=HYPERLINK(1)", "'=HYPERLINK(1)"],
    ["+52 222", "'+52 222"],
    ["-1", "'-1"],
    ["@suma", "'@suma"],
    ['Dijo "hola", gracias', '"Dijo ""hola"", gracias"'],
    ["Hola", "Hola"],
  ])("guards %s against formulas and quotes it", (value, expected) => {
    expect(csvField(value)).toBe(expected);
  });
});

describe("shared business store", () => {
  it("starts on the café and notifies the Resumen on a change", () => {
    expect(defaultDemoBusiness).toBe("cafe");
    expect(getDemoBusiness()).toBe("cafe");
    const seen: string[] = [];
    const stop = subscribeDemoBusiness(() => seen.push(getDemoBusiness()));
    setDemoBusiness("floreria");
    setDemoBusiness("floreria");
    setDemoBusiness("estudio");
    stop();
    setDemoBusiness("cafe");
    expect(seen).toEqual(["floreria", "estudio"]);
    expect(getDemoBusiness()).toBe("cafe");
  });
});

describe("Resumen samples", () => {
  it.each(demoBusinesses.map((business) => [business.id, business.name]))(
    "%s has 30 days, the three channels, a ranking and a week of hours",
    (id, name) => {
      const sample = samples[id as keyof typeof samples];
      expect(sample.business).toBe(name);
      expect(sample.daily).toHaveLength(30);
      expect(sample.previousDaily).toHaveLength(30);
      expect(Math.max(...sample.daily)).toBeLessThanOrEqual(sample.yMax);
      expect(sample.channelShares.map((channel) => channel.id)).toEqual([
        "nfc",
        "qr",
        "link",
      ]);
      const total = sample.channelShares.reduce(
        (sum, channel) => sum + channel.share,
        0,
      );
      expect(total).toBeCloseTo(1, 5);
      const values = sample.ranking.map((row) => row.value);
      expect(values).toEqual([...values].sort((a, b) => b - a));
      expect(sample.heat).toHaveLength(7);
      for (const row of sample.heat) expect(row).toHaveLength(24);
      for (const series of [
        sample.clickSeries,
        sample.leadSeries,
        sample.conversionSeries,
      ])
        expect(series).toHaveLength(14);
    },
  );

  it("differs from one business to another", () => {
    const totals = Object.values(samples).map((sample) => sample.taps);
    expect(new Set(totals).size).toBe(totals.length);
  });
});
