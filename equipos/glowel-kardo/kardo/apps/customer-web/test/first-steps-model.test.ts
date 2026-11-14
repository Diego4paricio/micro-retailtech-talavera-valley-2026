import type {
  ExperienceContent,
  ExperienceSummary,
  WorkspaceProfile,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  contentFromRows,
  firstStepsExperience,
  firstStepsPlan,
  firstStepsState,
  isFirstStepsPending,
  isStepOpenable,
  mergeSections,
  pageChoices,
  pageHasContent,
  pageNameFor,
  parsePastedList,
  parsePrice,
  realItems,
  rowPriceError,
  rowsFromContent,
  titleFromFileName,
} from "../src/features/onboarding/first-steps-model.js";
import {
  linkPageFromQuick,
  linksFromQuick,
  quickFromLinkPage,
  quickFromLinks,
  quickLinkProblem,
  quickLinkUrl,
} from "../src/features/onboarding/page-links.js";

const seedMenu = {
  title: "Menú",
  currency: "MXN",
  sections: [
    { id: "s1", name: "Sección 1", items: [{ id: "i1", name: "Platillo 1" }] },
  ],
} as unknown as ExperienceContent;

const experience = (
  patch: Partial<ExperienceSummary> & { content?: unknown },
): ExperienceSummary => ({
  id: "e1",
  touchpointId: null,
  name: "Menú",
  type: "menu",
  content: seedMenu as unknown as Record<string, unknown>,
  publicationStatus: "draft",
  ...patch,
});

describe("firstStepsPlan", () => {
  it("gives food a Menú and everything else a Catálogo, in the owner's words", () => {
    expect(firstStepsPlan("restaurante")).toMatchObject({
      type: "menu",
      pageName: "Menú",
      noun: { many: "platillos" },
    });
    expect(firstStepsPlan("belleza")).toMatchObject({
      type: "catalog",
      pageName: "Servicios",
      noun: { one: "servicio" },
    });
    expect(firstStepsPlan(undefined).type).toBe("catalog");
  });
});

describe("the giro is the organization's own (A2-55)", () => {
  it("plans with the organization's giro, and the generic page without one", () => {
    expect(
      firstStepsState({
        profile: { industry: "bar" },
        experiences: [],
        tried: false,
      }).plan.type,
    ).toBe("menu");
    // No giro saved: another organization's (or the sign-up's) is not used.
    const state = firstStepsState({
      profile: {},
      experiences: [],
      tried: false,
    });
    expect(state.plan.type).toBe("catalog");
    expect(state.done.business).toBe(false);
  });

  it("does not hold up someone who cannot edit the business (A2-7)", () => {
    const editor = firstStepsState({
      profile: {},
      experiences: [],
      tried: false,
      canManageBusiness: false,
    });
    expect(editor.done.business).toBe(true);
    expect(editor.next).toBe("content");
    const admin = firstStepsState({
      profile: {},
      experiences: [],
      tried: false,
      canManageBusiness: true,
    });
    expect(admin.done.business).toBe(false);
    expect(admin.next).toBe("business");
  });
});

describe("firstStepsState (relevo 31: 0 of 6 owners ended with a usable page)", () => {
  const profile: WorkspaceProfile = {
    industry: "restaurante",
    phone: "222 123 4567",
  };

  it("starts at the first step without a profile", () => {
    const state = firstStepsState({
      profile: null,
      experiences: [],
      tried: false,
    });
    expect(state.next).toBe("business");
    expect(state.completed).toBe(0);
  });

  it("does not count the seed «Platillo 1» as content", () => {
    const state = firstStepsState({
      profile,
      experiences: [experience({})],
      tried: false,
    });
    expect(state.done.business).toBe(true);
    expect(state.done.content).toBe(false);
    expect(state.next).toBe("content");
  });

  it("walks to the end: content, design, live, tried", () => {
    const content = {
      ...seedMenu,
      sections: [
        {
          id: "s1",
          name: "Desayunos",
          items: [{ id: "i1", name: "Chilaquiles", price: 75 }],
        },
      ],
      design: { schema: 1, style: {}, sections: [] },
    };
    const live = experience({
      content: content as unknown as Record<string, unknown>,
      liveTouchpointCount: 1,
      publicationStatus: "published",
    });
    expect(
      firstStepsState({ profile, experiences: [live], tried: false }).next,
    ).toBe("try");
    const all = firstStepsState({ profile, experiences: [live], tried: true });
    expect(all.next).toBeNull();
    expect(all.completed).toBe(5);
  });

  it("works on the live page first", () => {
    const draft = experience({
      id: "draft",
      updatedAt: "2026-10-03T12:00:00Z",
    });
    const live = experience({
      id: "live",
      liveTouchpointCount: 1,
      updatedAt: "2026-10-01T12:00:00Z",
    });
    expect(
      firstStepsState({ profile, experiences: [draft, live], tried: false })
        .experience?.id,
    ).toBe("live");
  });
});

describe("quick capture", () => {
  it("parses prices the way people type them", () => {
    expect(parsePrice("$75")).toBe(75);
    expect(parsePrice("75,50")).toBe(75.5);
    expect(parsePrice("1,250")).toBe(1250);
    expect(parsePrice("95 pesos")).toBe(95);
    expect(parsePrice("")).toBeUndefined();
    expect(parsePrice("gratis")).toBeUndefined();
    expect(rowPriceError({ id: "a", name: "x", price: "abc" })).toBe(true);
  });

  it("leaves placeholders out and adds an empty row to type in", () => {
    const sections = rowsFromContent("menu", seedMenu, "Menú");
    expect(sections).toHaveLength(1);
    expect(sections[0]?.name).toBe("Menú");
    expect(sections[0]?.rows).toEqual([
      expect.objectContaining({ name: "", price: "" }),
    ]);
  });

  it("saves sections with their items and keeps an item's photo", () => {
    const base = {
      title: "Fonda",
      currency: "MXN",
      sections: [
        {
          id: "s1",
          name: "Desayunos",
          items: [{ id: "i1", name: "Chilaquiles", imageAssetId: "img" }],
        },
      ],
    } as unknown as ExperienceContent;
    const content = contentFromRows({
      type: "menu",
      base,
      title: "Menú",
      defaultSection: "Menú",
      sections: [
        {
          id: "s1",
          name: "Desayunos",
          rows: [
            // The row carries its photo (D3), the way `rowsFromContent`
            // reads it from the base and the quick editor keeps it while
            // only name or price change.
            {
              id: "i1",
              name: "Chilaquiles verdes",
              price: "75",
              imageAssetId: "img",
            },
            { id: "new", name: "", price: "" },
          ],
        },
        {
          id: "s2",
          name: "",
          rows: [{ id: "i2", name: "Comida corrida", price: "$95" }],
        },
      ],
    }) as unknown as {
      title: string;
      sections: { name: string; items: Record<string, unknown>[] }[];
    };
    expect(content.title).toBe("Fonda");
    expect(content.sections.map((section) => section.name)).toEqual([
      "Desayunos",
      "Menú",
    ]);
    expect(content.sections[0]?.items).toEqual([
      { id: "i1", name: "Chilaquiles verdes", imageAssetId: "img", price: 75 },
    ]);
    expect(content.sections[1]?.items).toEqual([
      { id: "i2", name: "Comida corrida", price: 95 },
    ]);
    expect(
      realItems("menu", content as unknown as ExperienceContent),
    ).toHaveLength(2);
  });

  it("makes one list on a Catálogo", () => {
    const content = contentFromRows({
      type: "catalog",
      base: null,
      title: "Servicios",
      defaultSection: "",
      sections: [
        {
          id: "items",
          name: "",
          rows: [{ id: "a", name: "Uñas acrílicas", price: "450" }],
        },
      ],
    }) as unknown as { items: unknown[]; currency: string };
    expect(content.items).toEqual([
      { id: "a", name: "Uñas acrílicas", price: 450 },
    ]);
    expect(content.currency).toBe("MXN");
  });
});

describe("D1 «Menú del día» and D3 photos, in the quick editor", () => {
  const dishWithChoices = {
    title: "Fonda",
    currency: "MXN",
    sections: [
      {
        id: "s1",
        name: "Comida corrida",
        items: [
          {
            id: "comida-corrida",
            name: "Comida corrida",
            price: 85,
            imageAssetId: "foto-comida",
            choices: [
              { id: "g1", name: "Mole con pollo" },
              { id: "g2", name: "Chicharrón en salsa verde" },
            ],
            choicesLabel: "Elige tu guisado",
          },
        ],
      },
    ],
  } as unknown as ExperienceContent;

  it("surfaces an existing dish's choices, label and photo into its row", () => {
    const sections = rowsFromContent("menu", dishWithChoices, "Menú");
    const row = sections[0]?.rows[0];
    expect(row?.choices).toEqual([
      { id: "g1", name: "Mole con pollo" },
      { id: "g2", name: "Chicharrón en salsa verde" },
    ]);
    expect(row?.choicesLabel).toBe("Elige tu guisado");
    expect(row?.imageAssetId).toBe("foto-comida");
  });

  it("saves added and removed choices, the label and the photo, by id", () => {
    const sections = rowsFromContent("menu", dishWithChoices, "Menú");
    const dishRow = sections[0]?.rows[0];
    if (!dishRow) throw new Error("fixture row missing");
    const content = contentFromRows({
      type: "menu",
      base: dishWithChoices,
      title: "Menú",
      defaultSection: "Menú",
      sections: [
        {
          id: "s1",
          name: "Comida corrida",
          rows: [
            {
              ...dishRow,
              // Doña Rosa removes "Chicharrón" and adds "Bistec".
              choices: [
                { id: "g1", name: "Mole con pollo" },
                { id: "g3", name: "Bistec a la mexicana" },
              ],
            },
          ],
        },
      ],
    }) as unknown as {
      sections: { items: Record<string, unknown>[] }[];
    };
    expect(content.sections[0]?.items).toEqual([
      {
        id: "comida-corrida",
        name: "Comida corrida",
        price: 85,
        imageAssetId: "foto-comida",
        choicesLabel: "Elige tu guisado",
        choices: [
          { id: "g1", name: "Mole con pollo" },
          { id: "g3", name: "Bistec a la mexicana" },
        ],
      },
    ]);
  });

  it("drops the choices and the label once every guisado is removed", () => {
    const sections = rowsFromContent("menu", dishWithChoices, "Menú");
    const dishRow = sections[0]?.rows[0];
    if (!dishRow) throw new Error("fixture row missing");
    const content = contentFromRows({
      type: "menu",
      base: dishWithChoices,
      title: "Menú",
      defaultSection: "Menú",
      sections: [
        {
          id: "s1",
          name: "Comida corrida",
          rows: [{ ...dishRow, choices: [] }],
        },
      ],
    }) as unknown as { sections: { items: Record<string, unknown>[] }[] };
    const saved = content.sections[0]?.items[0];
    expect(saved).not.toHaveProperty("choices");
    expect(saved).not.toHaveProperty("choicesLabel");
    expect(saved?.imageAssetId).toBe("foto-comida");
  });

  it("never saves more than MENU_ITEM_CHOICES_MAX choices", () => {
    const sections = rowsFromContent("menu", dishWithChoices, "Menú");
    const dishRow = sections[0]?.rows[0];
    if (!dishRow) throw new Error("fixture row missing");
    const many = Array.from({ length: 20 }, (_, index) => ({
      id: `g${index}`,
      name: `Guisado ${index}`,
    }));
    const content = contentFromRows({
      type: "menu",
      base: dishWithChoices,
      title: "Menú",
      defaultSection: "Menú",
      sections: [
        {
          id: "s1",
          name: "Comida corrida",
          rows: [{ ...dishRow, choices: many }],
        },
      ],
    }) as unknown as {
      sections: { items: { choices: unknown[] }[] }[];
    };
    expect(content.sections[0]?.items[0]?.choices).toHaveLength(12);
  });

  it("a Catálogo product keeps its photo but never gets choices", () => {
    const content = contentFromRows({
      type: "catalog",
      base: null,
      title: "Panadería",
      defaultSection: "",
      sections: [
        {
          id: "items",
          name: "",
          rows: [
            {
              id: "a",
              name: "Concha",
              price: "18",
              imageAssetId: "foto-concha",
              // A row should never carry choices on a Catálogo, but the
              // model must still never save them if it somehow did.
              choices: [{ id: "g1", name: "No aplica" }],
            },
          ],
        },
      ],
    }) as unknown as { items: Record<string, unknown>[] };
    expect(content.items[0]).toEqual({
      id: "a",
      name: "Concha",
      price: 18,
      imageAssetId: "foto-concha",
    });
  });
});

describe("parsePastedList («Pegar mi lista»)", () => {
  it("reads sections and prices from a menu someone already wrote", () => {
    const sections = parsePastedList(
      [
        "Desayunos:",
        "Chilaquiles verdes o rojos $75",
        "Huevos al gusto - 65",
        "• Molletes 55.00",
        "",
        "Bebidas",
        "1. Agua de horchata 25 pesos",
        "3 tacos de pastor $50",
      ].join("\n"),
      "menu",
      "Menú",
    );
    expect(sections.map((section) => section.name)).toEqual([
      "Desayunos",
      "Bebidas",
    ]);
    expect(sections[0]?.rows.map((row) => [row.name, row.price])).toEqual([
      ["Chilaquiles verdes o rojos", "75"],
      ["Huevos al gusto", "65"],
      ["Molletes", "55"],
    ]);
    expect(sections[1]?.rows.map((row) => [row.name, row.price])).toEqual([
      ["Agua de horchata", "25"],
      ["3 tacos de pastor", "50"],
    ]);
  });

  it("puts everything in one list on a Catálogo, priced or not", () => {
    const sections = parsePastedList(
      "Uñas acrílicas $450\nRetiro de acrílico",
      "catalog",
      "",
    );
    expect(sections).toHaveLength(1);
    expect(sections[0]?.rows.map((row) => [row.name, row.price])).toEqual([
      ["Uñas acrílicas", "450"],
      ["Retiro de acrílico", ""],
    ]);
  });

  it("adds pasted sections to the ones on screen", () => {
    const merged = mergeSections(
      [
        {
          id: "s",
          name: "Desayunos",
          rows: [
            { id: "a", name: "Molletes", price: "55" },
            { id: "b", name: "", price: "" },
          ],
        },
      ],
      [
        {
          id: "t",
          name: "desayunos",
          rows: [{ id: "c", name: "Chilaquiles", price: "75" }],
        },
      ],
    );
    expect(merged).toHaveLength(1);
    expect(merged[0]?.rows.map((row) => row.name)).toEqual([
      "Molletes",
      "Chilaquiles",
      "",
    ]);
  });
});

describe("step 2 picks the page (owner, 2026-10-04)", () => {
  it("shows every page in tiles, the giro's first (relevo 33)", () => {
    const food = pageChoices(firstStepsPlan("restaurante"));
    expect(food.slice(0, 3).map((choice) => choice.type)).toEqual([
      "menu",
      "document",
      "image",
    ]);
    expect(food[1]?.title).toBe("Sube tu menú en PDF");
    const salon = pageChoices(firstStepsPlan("belleza"));
    expect(salon.slice(0, 3).map((choice) => choice.type)).toEqual([
      "catalog",
      "document",
      "profile",
    ]);
    expect(salon[0]?.title).toBe("Escribe tus servicios");
    expect(salon).toHaveLength(8);
    expect(new Set(salon.map((choice) => choice.type)).size).toBe(8);
  });

  it("works on the page chosen in step 2, whatever its type", () => {
    const pdf = experience({
      id: "pdf",
      type: "document",
      content: { title: "Menú", display: "viewer", pages: [] },
    });
    const menu = experience({ id: "menu", liveTouchpointCount: 1 });
    expect(firstStepsExperience([menu, pdf], "pdf")?.id).toBe("pdf");
    expect(firstStepsExperience([menu, pdf], null)?.id).toBe("menu");
    // A Página de enlaces is a normal page since Links phase 1.
    expect(
      firstStepsExperience([experience({ type: "linkpage" })], null)?.type,
    ).toBe("linkpage");
  });

  it("counts a PDF with pages, an image, an address and real buttons", () => {
    const content = (value: unknown) => value as ExperienceContent;
    expect(pageHasContent("document", content({ pages: [] }))).toBe(false);
    expect(
      pageHasContent("document", content({ pages: [{ assetId: "a" }] })),
    ).toBe(true);
    expect(pageHasContent("image", content({ assetId: "a", alt: "x" }))).toBe(
      true,
    );
    expect(
      pageHasContent(
        "links",
        content({
          links: [{ label: "Mi enlace", url: "https://ejemplo.com" }],
        }),
      ),
    ).toBe(false);
    expect(
      pageHasContent(
        "links",
        content({ links: [{ label: "WhatsApp", url: "https://wa.me/52" }] }),
      ),
    ).toBe(true);
    expect(pageHasContent("menu", seedMenu)).toBe(false);
  });

  it("skips «Cómo se ve» for a page that only redirects", () => {
    const state = firstStepsState({
      profile: { industry: "otro", phone: "222 123 4567" },
      experiences: [
        experience({
          id: "web",
          type: "redirect",
          content: { destinationUrl: "https://tunegocio.com" },
        }),
      ],
      tried: false,
      experienceId: "web",
    });
    expect(state.done.content).toBe(true);
    expect(state.done.look).toBe(true);
    expect(state.next).toBe("qr");
  });
});

describe("a PDF page's name comes from the file, or the giro (relevo 37 C9c)", () => {
  it("takes the file's first word, cleaned and capitalized", () => {
    expect(titleFromFileName("paquetes-salon-los-arcos.pdf")).toBe("Paquetes");
    expect(titleFromFileName("portafolio-mateo-rivas.pdf")).toBe("Portafolio");
    expect(titleFromFileName("Presentacion-Garza-y-Asociados.pdf")).toBe(
      "Presentacion",
    );
  });

  it("falls back to the giro on the type's own generic word too", () => {
    // "menu"/"catalogo" name the kind of document, not the business
    // (equivalent to the old fixed «Menú en PDF» / «Catálogo en PDF»).
    expect(titleFromFileName("menu-la-fonda.pdf")).toBeNull();
    expect(titleFromFileName("catalogo-2026.pdf")).toBeNull();
  });

  it("gives up on a name that says nothing of the business", () => {
    expect(titleFromFileName("documento.pdf")).toBeNull();
    expect(titleFromFileName("Scan.pdf")).toBeNull();
    expect(titleFromFileName("001.pdf")).toBeNull();
    expect(titleFromFileName("a.pdf")).toBeNull();
    expect(titleFromFileName(".pdf")).toBeNull();
  });

  it("names the page from the upload, never «Catálogo en PDF»", () => {
    const eventos = firstStepsPlan("eventos");
    expect(
      pageNameFor("document", eventos, "paquetes-salon-los-arcos.pdf"),
    ).toBe("Paquetes");
    // No file yet, or a generic one: the giro's own word, not a fixed
    // "Menú en PDF" / "Catálogo en PDF" (Ana and Mateo, relevo 37 §4 C9).
    expect(pageNameFor("document", eventos, null)).toBe("Paquetes");
    expect(pageNameFor("document", eventos, "documento.pdf")).toBe("Paquetes");
    expect(pageNameFor("document", firstStepsPlan("restaurante"))).toBe("Menú");
    expect(pageNameFor("document", firstStepsPlan("retail"))).toBe("Productos");
  });
});

describe("Tus enlaces from what people know", () => {
  it("turns @usuario into the network's address", () => {
    expect(quickLinkUrl("instagram", "@tacos.beto")).toBe(
      "https://instagram.com/tacos.beto",
    );
    expect(quickLinkUrl("tiktok", "tacosbeto")).toBe(
      "https://www.tiktok.com/@tacosbeto",
    );
    expect(quickLinkUrl("instagram", "instagram.com/tacos")).toBe(
      "https://instagram.com/tacos",
    );
    expect(quickLinkUrl("website", "tacosbeto.mx")).toBe(
      "https://tacosbeto.mx",
    );
    expect(quickLinkUrl("website", "no es web")).toBeNull();
    expect(quickLinkUrl("facebook", "")).toBeNull();
  });

  it("«Cómo llegar» takes a written address and still takes Maps links", () => {
    const url = quickLinkUrl("maps", "Calle 60 #123, Centro, Mérida");
    expect(url).toBe(
      "https://www.google.com/maps/search/?api=1&query=Calle%2060%20%23123%2C%20Centro%2C%20M%C3%A9rida",
    );
    expect(quickLinkUrl("maps", "https://maps.app.goo.gl/abc123")).toBe(
      "https://maps.app.goo.gl/abc123",
    );
    expect(quickLinkUrl("maps", "maps.app.goo.gl/abc123")).toBe(
      "https://maps.app.goo.gl/abc123",
    );
    expect(quickLinkUrl("maps", "12")).toBeNull();
    // Read back as the address, to edit it again.
    const links = linksFromQuick({ maps: "Calle 60 #123, Mérida" }, undefined);
    expect(quickFromLinks(links)).toEqual({ maps: "Calle 60 #123, Mérida" });
  });

  it("says what to fix while typing", () => {
    expect(quickLinkProblem("maps", "Calle 60")).toBeNull();
    expect(quickLinkProblem("maps", "12")).toContain("calle");
    expect(quickLinkProblem("website", "tacos")).toContain("tunegocio.com");
    expect(quickLinkProblem("instagram", "mi negocio")).toContain("@tunegocio");
    expect(quickLinkProblem("website", "")).toBeNull();
  });

  it("puts WhatsApp first and reads the buttons back to edit them", () => {
    const links = linksFromQuick(
      { instagram: "@tacos", website: "tacos.mx" },
      "https://wa.me/522221234567",
    );
    expect(links.map((link) => link.label)).toEqual([
      "WhatsApp",
      "Instagram",
      "Sitio web",
    ]);
    expect(quickFromLinks(links)).toEqual({
      instagram: "@tacos",
      website: "tacos.mx",
    });
    // Saving again keeps each button's id.
    const again = linksFromQuick({ instagram: "@tacos2" }, undefined, links);
    expect(again[0]?.id).toBe(links[1]?.id);
  });
});

describe("who is guided (the demo account, 2026-10-04)", () => {
  const empty = firstStepsState({
    profile: null,
    experiences: [],
    tried: false,
  });

  it("guides a new organization", () => {
    expect(
      isFirstStepsPending({
        state: empty,
        experiences: [],
        publishedHere: false,
      }),
    ).toBe(true);
  });

  it("does not guide one that was live before, even with steps missing", () => {
    const live = [experience({ type: "catalog", liveTouchpointCount: 12 })];
    expect(
      isFirstStepsPending({
        state: empty,
        experiences: live,
        publishedHere: false,
      }),
    ).toBe(false);
  });

  it("keeps guiding one that went live here, until «Pruébalo»", () => {
    const live = [experience({ liveTouchpointCount: 1 })];
    const state = { ...empty, next: "try" as const };
    expect(
      isFirstStepsPending({ state, experiences: live, publishedHere: true }),
    ).toBe(true);
    expect(
      isFirstStepsPending({ state, experiences: live, publishedHere: false }),
    ).toBe(false);
  });
});

describe("the steps close once published (owner, 2026-10-04)", () => {
  const base = firstStepsState({
    profile: null,
    experiences: [],
    tried: false,
  });
  const done = (patch: Partial<typeof base.done>) => ({
    ...base,
    done: { ...base.done, ...patch },
  });

  it("opens any step up to the next one before publishing", () => {
    const state = {
      ...done({ business: true, content: true }),
      next: "look" as const,
    };
    expect(isStepOpenable("business", state)).toBe(true);
    expect(isStepOpenable("content", state)).toBe(true);
    expect(isStepOpenable("look", state)).toBe(true);
    expect(isStepOpenable("qr", state)).toBe(false);
    expect(isStepOpenable("try", state)).toBe(false);
  });

  it("opens only «Pruébalo» after publishing: never a second QR or link", () => {
    const state = {
      ...done({ business: true, content: true, look: true, qr: true }),
      next: "try" as const,
    };
    for (const id of ["business", "content", "look", "qr"] as const)
      expect(isStepOpenable(id, state)).toBe(false);
    expect(isStepOpenable("try", state)).toBe(true);
  });

  it("stops guiding once tried", () => {
    const content = {
      title: "Menú",
      currency: "MXN",
      sections: [
        { id: "s1", name: "Tacos", items: [{ id: "i1", name: "Pastor" }] },
      ],
      design: { schema: 2 },
    };
    const live = [experience({ liveTouchpointCount: 1, content })];
    const state = firstStepsState({
      profile: {
        industry: "restaurante",
        phone: "+522221234567",
      } as WorkspaceProfile,
      experiences: live,
      tried: true,
      experienceId: "e1",
    });
    expect(
      isFirstStepsPending({ state, experiences: live, publishedHere: true }),
    ).toBe(false);
  });
});

describe("Tus enlaces as a Página de enlaces", () => {
  it("shows the networks as icons and WhatsApp as the main button", () => {
    const page = linkPageFromQuick(
      { instagram: "@tacos", tiktok: "tacos", maps: "maps.app.goo.gl/abc" },
      "https://wa.me/522221234567",
    );
    expect(page.socials.map((item) => [item.network, item.value])).toEqual([
      ["instagram", "https://instagram.com/tacos"],
      ["tiktok", "https://www.tiktok.com/@tacos"],
    ]);
    expect(page.links.map((item) => [item.label, item.highlight])).toEqual([
      ["Escríbenos por WhatsApp", true],
      ["Cómo llegar", undefined],
    ]);
    expect(quickFromLinkPage(page)).toEqual({
      instagram: "@tacos",
      tiktok: "@tacos",
      maps: "maps.app.goo.gl/abc",
    });
  });
});

describe("a consultorio gets the appointment form first (relevo 37, round 3)", () => {
  it("puts «Formulario para citas» as «Para ti» for salud", () => {
    const choices = pageChoices(firstStepsPlan("salud"));
    expect(choices[0]).toEqual({
      type: "form",
      title: "Formulario para citas",
    });
    expect(pageChoices(firstStepsPlan("belleza"))[0]?.type).toBe("catalog");
  });
});
