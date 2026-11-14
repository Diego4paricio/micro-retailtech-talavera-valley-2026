import {
  type ConceptBrief,
  type DesignAiUsage,
  industryCatalog,
  type WorkspaceProfile,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  hourLeft,
  hourNote,
  usageLine,
} from "../src/features/studio/ai/use-ai-usage.js";
import {
  decideEnterSync,
  type GeneratedBaseline,
  initialGeneratedBaseline,
} from "../src/features/studio/html/blocks-sync.js";
import { designToCustomCode } from "../src/features/studio/html/from-design.js";
import { togglePhrase } from "../src/features/studio/html/objectives.js";
import { promptInputFrom } from "../src/features/studio/html/prompt.js";
import {
  buildWhatsAppLink,
  normalizeWhatsAppPhone,
} from "../src/features/studio/model/brand-links.js";
import { brandLookTemplates } from "../src/features/studio/model/brand-looks.js";
import { contentItemIds } from "../src/features/studio/model/content.js";
import { designFromContent } from "../src/features/studio/model/from-content.js";
import { validateDesign } from "../src/features/studio/model/validate.js";
import {
  changedElsewhereMessage,
  isChangedElsewhere,
  studioUpdateBody,
} from "../src/features/studio/pages/save.js";
import {
  familyFor,
  looks,
  looksFor,
} from "../src/features/studio/templates/first-impression/index.js";
import { templateGiroFor } from "../src/features/studio/use-organization-brand.js";
import { ApiRequestError } from "../src/lib/api.js";
import { contrastRatio, relativeLuminance } from "../src/lib/color.js";
import { stableKey } from "../src/lib/history.js";

const usage = (over: Partial<DesignAiUsage> = {}): DesignAiUsage => ({
  enabled: true,
  day: { used: 2, limit: 20, remaining: 18 },
  month: { used: 3, limit: 18, remaining: 15 },
  spendCapReached: false,
  ...over,
});

describe("one AI counter, with the hour (A2-37)", () => {
  it("says nothing about the hour when the API does not send it", () => {
    expect(hourLeft(usage())).toBeNull();
    expect(hourNote(usage())).toBeNull();
    expect(hourLeft(null)).toBeNull();
  });

  it("is quiet while there are plenty left and speaks when few remain", () => {
    const hour = (remaining: number) =>
      usage({ hour: { used: 5 - remaining, limit: 5, remaining } });
    expect(hourNote(hour(4))).toBeNull();
    expect(hourNote(hour(2))).toBe("En esta hora te quedan 2 solicitudes.");
    expect(hourNote(hour(1))).toBe("En esta hora te queda 1 solicitud.");
    expect(hourNote(hour(0))).toMatch(/Ya hiciste tus 5 solicitudes/);
    expect(hourLeft(hour(0))).toBe(0);
  });

  it("puts the hour in the same line as the day and the month", () => {
    const line = usageLine(
      usage({ hour: { used: 4, limit: 5, remaining: 1 } }),
    );
    expect(line.main).toBe("Te quedan 15 de 18 diseños este mes");
    expect(line.detail).toBe("En esta hora te queda 1 solicitud.");
    const daily = usageLine(
      usage({
        month: { used: 0, limit: null, remaining: null },
        hour: { used: 3, limit: 5, remaining: 2 },
      }),
    );
    expect(daily.detail).toBe("En esta hora te quedan 2 solicitudes.");
  });
});

describe("Bloques ↔ HTML sync, out of DesignStudio (A2-43 i)", () => {
  const generated = { html: "<p>A</p>", css: "p{}" };
  const base: GeneratedBaseline = {
    designKey: "d1",
    html: "<p>A</p>",
    css: "p{}",
    derived: true,
  };

  it("fills a blank editor and remembers what it generated", () => {
    const decision = decideEnterSync({
      generated,
      designKey: "d1",
      customHtml: { html: "  ", css: "" },
      baseline: null,
    });
    expect(decision).toEqual({
      fillEditor: true,
      baseline: { ...base },
      blocksChanged: false,
    });
  });

  it("only adopts, without filling, html that already is the generated one", () => {
    const decision = decideEnterSync({
      generated,
      designKey: "d2",
      customHtml: generated,
      baseline: base,
    });
    expect(decision.fillEditor).toBe(false);
    expect(decision.baseline?.designKey).toBe("d2");
    expect(decision.blocksChanged).toBe(false);
  });

  it("silently refreshes html nobody touched when the blocks moved on", () => {
    const decision = decideEnterSync({
      generated: { html: "<p>B</p>", css: "" },
      designKey: "d2",
      customHtml: { html: base.html, css: base.css },
      baseline: base,
    });
    expect(decision.fillEditor).toBe(true);
    expect(decision.baseline).toMatchObject({ designKey: "d2", derived: true });
    expect(decision.blocksChanged).toBe(false);
  });

  it("never overwrites a hand edit: it only flags the blocks changed", () => {
    const edited = { html: "<p>mío</p>", css: "" };
    const moved = decideEnterSync({
      generated: { html: "<p>B</p>", css: "" },
      designKey: "d2",
      customHtml: edited,
      baseline: base,
    });
    expect(moved).toEqual({
      fillEditor: false,
      baseline: null,
      blocksChanged: true,
    });
    const same = decideEnterSync({
      generated: { html: "<p>B</p>", css: "" },
      designKey: "d1",
      customHtml: edited,
      baseline: base,
    });
    expect(same.blocksChanged).toBe(false);
    // "Mantener mi HTML" bookmarks without being safe to replace.
    const kept = decideEnterSync({
      generated: { html: "<p>B</p>", css: "" },
      designKey: "d3",
      customHtml: { html: base.html, css: base.css },
      baseline: { ...base, derived: false },
    });
    expect(kept.fillEditor).toBe(false);
    expect(kept.blocksChanged).toBe(true);
  });

  it("starts with a baseline only for saved html that was never edited", () => {
    const content = { title: "Café", links: [] } as never;
    const design = designFromContent("links", content);
    const code = designToCustomCode("links", content, design);
    const input = {
      htmlMode: true,
      type: "links" as const,
      content,
      design,
    };
    expect(
      initialGeneratedBaseline({
        ...input,
        savedCustomHtml: { schema: 1, active: true, ...code },
      }),
    ).toMatchObject({ derived: true, designKey: stableKey(design) });
    expect(
      initialGeneratedBaseline({
        ...input,
        savedCustomHtml: { schema: 1, active: true, html: "<b>x</b>", css: "" },
      }),
    ).toBeNull();
    expect(
      initialGeneratedBaseline({ ...input, savedCustomHtml: null }),
    ).toBeNull();
    expect(
      initialGeneratedBaseline({
        ...input,
        htmlMode: false,
        savedCustomHtml: { schema: 1, active: true, ...code },
      }),
    ).toBeNull();
  });
});

describe("saving with the draft revision (A2-22)", () => {
  it("sends the revision the screen loaded, only when it has one", () => {
    const content = { title: "Café", links: [] } as never;
    expect(studioUpdateBody("Café", content, 4)).toEqual({
      name: "Café",
      content,
      expectedDraftRevision: 4,
    });
    expect(studioUpdateBody("Café", content, undefined)).toEqual({
      name: "Café",
      content,
    });
  });

  it("recognizes the 409 of someone else's save", () => {
    expect(
      isChangedElsewhere(new ApiRequestError("x", 409, "EXPERIENCE_CHANGED")),
    ).toBe(true);
    expect(isChangedElsewhere(new ApiRequestError("x", 409, "OTHER"))).toBe(
      false,
    );
    expect(isChangedElsewhere(new Error("boom"))).toBe(false);
    expect(changedElsewhereMessage).toBe(
      "Alguien más guardó cambios en esta página. Recarga para ver la versión más reciente.",
    );
  });
});

describe("a giro added to the catalog cannot be forgotten (A2-5)", () => {
  it("maps every giro to a template giro and a look family", () => {
    for (const { value } of industryCatalog) {
      const giro = templateGiroFor(value);
      if (value === "otro") expect(giro).toBeNull();
      else expect(giro, value).toEqual(expect.any(String));
      if (value !== "otro") expect(familyFor(value), value).not.toBe("otro");
    }
    expect(templateGiroFor("floreria")).toBe("florería");
    expect(templateGiroFor("panaderia")).toBe("café");
    expect(templateGiroFor("agencia")).toBe("profesional");
    expect(templateGiroFor("papeleria")).toBe("tienda");
    expect(templateGiroFor("algo raro")).toBeNull();
    expect(templateGiroFor(null)).toBeNull();
  });
});

describe("«Para tu marca»: the first looks in Plantillas (A2-41)", () => {
  const content = {
    title: "Café Nube",
    sections: [
      {
        id: "s1",
        name: "Cafés",
        items: [{ id: "i1", name: "Latte", price: 4500 }],
      },
    ],
  } as never;
  const profile = {
    industry: "cafeteria",
    city: "Puebla",
    brand: { primary: "#2346a0", accent: "#b7791f" },
    hours: "Lun a vie 8 a 18",
  } as unknown as WorkspaceProfile;

  it("makes a valid template per look, with the brand's color", () => {
    const contentIds = contentItemIds(content);
    const templates = brandLookTemplates({
      type: "menu",
      content,
      contentIds,
      businessName: "Café Nube",
      profile,
      brand: {
        name: "Café Nube",
        brand: { primary: "#2346a0", accent: "#b7791f" },
        whatsappUrl: "https://wa.me/525512345678",
        hours: "Lun a vie 8 a 18",
      },
    });
    expect(templates).toHaveLength(looks.length);
    expect(new Set(templates.map((template) => template.id)).size).toBe(
      looks.length,
    );
    for (const template of templates) {
      expect(template.giro).toBe("Para tu marca");
      expect(template.types).toEqual(["menu"]);
      expect(
        validateDesign("menu", template.design, contentIds, ["s1"]),
        template.id,
      ).toEqual([]);
    }
    // The giro's best look goes first.
    expect(templates[0]?.id).toBe(
      `look-${looksFor(familyFor("cafeteria"))[0]?.id}`,
    );
  });

  it("still gives looks while the profile has not loaded", () => {
    const templates = brandLookTemplates({
      type: "links",
      content: { title: "Hola", links: [] } as never,
      contentIds: [],
      businessName: "Hola",
      profile: null,
      brand: null,
    });
    expect(templates).toHaveLength(looks.length);
  });
});

describe("one writing shortcut (A2-43 f)", () => {
  const brief = (description: string): ConceptBrief => ({
    description,
    colors: [],
    imageRefs: [],
    fonts: [],
  });

  it("adds a phrase after the text and removes exactly that phrase", () => {
    const on = togglePhrase(brief("Algo sencillo."), "Con fotos.");
    expect(on.description).toBe("Algo sencillo. Con fotos.");
    expect(togglePhrase(on, "Con fotos.").description).toBe("Algo sencillo.");
    expect(togglePhrase(brief(""), "Con fotos.").description).toBe(
      "Con fotos.",
    );
  });

  it("respects the maximum and keeps line breaks", () => {
    expect(
      togglePhrase(brief("abc"), "defghi", 6).description.length,
    ).toBeLessThanOrEqual(6);
    expect(
      togglePhrase(brief("uno\n\ndos Con fotos."), "Con fotos.").description,
    ).toBe("uno\n\ndos");
  });
});

describe("the panel's one color math (A2-43 g)", () => {
  it("measures luminance and contrast like WCAG", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 5);
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 1);
    expect(contrastRatio("#777777", "#777777")).toBe(1);
  });

  it("reads a bad color as the fallback", () => {
    expect(relativeLuminance("nope")).toBe(0);
    expect(relativeLuminance("nope", 1)).toBe(1);
    expect(relativeLuminance("#fff")).toBe(0);
  });
});

describe("WhatsApp links follow the shared rule (A2-29)", () => {
  it("builds the same link as whatsappUrlFromPhone for complete numbers", () => {
    expect(buildWhatsAppLink({ phone: "55 1234 5678" })).toBe(
      "https://wa.me/525512345678",
    );
    expect(buildWhatsAppLink({ phone: "525512345678" })).toBe(
      "https://wa.me/525512345678",
    );
    // 11 to 15 digits already carry their country code.
    expect(normalizeWhatsAppPhone("13105551234")).toBe("13105551234");
    expect(normalizeWhatsAppPhone("+1 310 555 1234")).toBe("13105551234");
  });

  it("keeps a number being typed from vanishing", () => {
    expect(normalizeWhatsAppPhone("55")).toBe("5255");
    expect(normalizeWhatsAppPhone("")).toBe("");
  });
});

describe("Copiar prompt carries hours, WhatsApp and website (A2-43 a)", () => {
  it("adds them to the organization data, like Kardo's AI", () => {
    const input = promptInputFrom({
      type: "links",
      businessName: "Café Nube",
      brief: { description: "x", colors: [], imageRefs: [], fonts: [] },
      content: { title: "Café", links: [] } as never,
      assets: [],
      profile: {
        industry: "cafeteria",
        hours: "Lun a vie 8 a 18",
        phone: "55 1234 5678",
        country: "MX",
        website: "https://cafe.example",
      } as unknown as WorkspaceProfile,
    });
    expect(input.organization).toMatchObject({
      hours: "Lun a vie 8 a 18",
      whatsappUrl: "https://wa.me/525512345678",
      website: "https://cafe.example",
    });
    const bare = promptInputFrom({
      type: "links",
      businessName: "Café Nube",
      brief: { description: "x", colors: [], imageRefs: [], fonts: [] },
      content: { title: "Café", links: [] } as never,
      assets: [],
      profile: { industry: "cafeteria" } as unknown as WorkspaceProfile,
    });
    expect(bare.organization).not.toHaveProperty("whatsappUrl");
    expect(bare.organization).not.toHaveProperty("hours");
  });
});
