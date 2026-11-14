import {
  briefAsksForPrices,
  buildDesignConceptsMessages,
  buildDesignMessages,
  buildHtmlBlockMessages,
  type ConceptBrief,
  type DesignPromptInput,
  type HtmlBlockPromptInput,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";

const brief: ConceptBrief = {
  description: "Cafetería de especialidad con panadería propia.",
  tone: "cálido, artesanal",
  colors: ["#5b3a29", "#f2e5d5"],
  imageRefs: ["0f1e2d3c-4b5a-4968-8172-6f5e4d3c2b1a"],
  fonts: ["geist", "serif"],
};

const linksInput: DesignPromptInput = {
  type: "links",
  businessName: "Café Central",
  brief,
  images: [
    { ref: "0f1e2d3c-4b5a-4968-8172-6f5e4d3c2b1a", label: "fachada.jpg" },
  ],
  content: {
    title: "Café Central",
    links: [{ label: "Ver menú" }, { label: "Reservar mesa" }],
  },
  contentItemIds: ["link-1", "link-2"],
};

describe("buildDesignMessages", () => {
  it("is deterministic for the same input", () => {
    const first = buildDesignMessages(linksInput);
    const second = buildDesignMessages(JSON.parse(JSON.stringify(linksInput)));
    expect(first).toEqual(second);
  });

  it("never contains an em dash or en dash", () => {
    const { system, user } = buildDesignMessages(linksInput);
    expect(system).not.toMatch(/[–—]/);
    expect(user).not.toMatch(/[–—]/);
  });

  it("keeps the system prompt free of customer text (cacheable, injection-hardened)", () => {
    const { system } = buildDesignMessages(linksInput);
    expect(system).not.toContain("Café Central");
    expect(system).not.toContain("Cafetería de especialidad");
    expect(system).not.toContain("Ver menú");
  });

  it("puts the business name, brief and content in a delimited user data block", () => {
    const { user } = buildDesignMessages(linksInput);
    expect(user).toContain("<DATOS_DEL_NEGOCIO>");
    expect(user).toContain("</DATOS_DEL_NEGOCIO>");
    expect(user).toContain("Café Central");
    expect(user).toContain("Cafetería de especialidad con panadería propia.");
    expect(user).toContain("Ver menú");
    expect(user).toContain("link-1, link-2");
  });

  it("names the required bound block for the type and the JSON response contract", () => {
    const { system } = buildDesignMessages(linksInput);
    expect(system).toContain("contentLinks");
    expect(system).toContain('"design"');
    expect(system).toContain('"notes"');
  });

  it("lists the real menu section ids so the AI can reference them", () => {
    const menuInput: DesignPromptInput = {
      type: "menu",
      businessName: "Café Central",
      brief,
      images: [],
      content: {
        menuSections: [
          { id: "sec-1", name: "Entradas", itemCount: 5 },
          { id: "sec-2", name: "Postres", itemCount: 3 },
        ],
      },
      contentItemIds: [],
    };
    const { system, user } = buildDesignMessages(menuInput);
    expect(system).toContain("menu");
    expect(user).toContain('"sec-1"');
    expect(user).toContain('"sec-2"');
  });

  it("lists the real featurable items (menu dishes) so featuredItems can name them", () => {
    const menuInput: DesignPromptInput = {
      type: "menu",
      businessName: "Café Central",
      brief,
      images: [],
      content: {
        menuSections: [{ id: "sec-1", name: "Entradas", itemCount: 2 }],
        featurableItems: [
          {
            id: "d1",
            name: "Sopa de la casa",
            section: "Entradas",
            hasPhoto: true,
          },
          { id: "d2", name: "Ensalada", section: "Entradas", hasPhoto: false },
        ],
      },
      contentItemIds: [],
    };
    const { system, user } = buildDesignMessages(menuInput);
    expect(system).toContain("featuredItems");
    expect(user).toContain('"d1"');
    expect(user).toContain("Sopa de la casa");
    expect(user).toContain('"d2"');
  });

  it("includes how this type of page is put together, and only this one", () => {
    const { system } = buildDesignMessages(linksInput);
    expect(system).toContain("Cómo se arma este tipo de página");
    expect(system).toContain("(Enlaces en el panel de Kardo)");
    expect(system).toContain("contentLinks justo después");
    // The menu's own composition stays out of a Enlaces page.
    expect(system).not.toContain("El menú (bloque menu)");
    expect(system).toContain("Colocación en un lienzo");
  });

  it("says the customer's photo choice after the data, never inside it", () => {
    const without = buildDesignMessages({ ...linksInput, photos: "without" });
    expect(without.user).toContain("diseño SIN fotos");
    expect(without.user.indexOf("diseño SIN fotos")).toBeGreaterThan(
      without.user.indexOf("</DATOS_DEL_NEGOCIO>"),
    );
    expect(buildDesignMessages(linksInput).user).toContain(
      "Fotos: decide tú",
    );
    const ideas = buildDesignConceptsMessages({
      ...linksInput,
      photos: "with",
    });
    expect(ideas.user).toContain("diseño CON fotos");
    // The system prompt stays the same whatever the photo choice (cache).
    expect(without.system).toBe(ideas.system);
  });

  it("includes a current design to refine when given one", () => {
    const current = { schema: 1, style: {}, sections: [] };
    const { user } = buildDesignMessages({ ...linksInput, current });
    expect(user).toContain("Diseño actual, mejóralo");
    expect(user).toContain('"schema":1');
  });

  it("asks for photo spaces, never invented images, when there are no photos", () => {
    const { user } = buildDesignMessages({ ...linksInput, images: [] });
    expect(user).toContain("No inventes ningún imageRef");
    expect(user).toContain("deja un espacio para foto");
  });

  it("asks for ideas with the same system prompt as the design", () => {
    const ideas = buildDesignConceptsMessages(linksInput);
    expect(ideas.system).toBe(buildDesignMessages(linksInput).system);
    expect(ideas.user).toContain("Pedido de ideas");
    expect(ideas.system).not.toMatch(/[–—]/);
    expect(ideas.user).not.toMatch(/[–—]/);
  });

  it("offers itemPhotos only to Menú and Catálogo", () => {
    expect(
      buildDesignMessages({ ...linksInput, type: "menu" }).system,
    ).toContain("itemPhotos");
    expect(buildDesignMessages(linksInput).system).not.toContain("itemPhotos");
  });
});

const blockInput: HtmlBlockPromptInput = {
  businessName: "Café Central",
  brief,
  instructions: "una tarjeta con el horario",
  images: [],
};

describe("buildHtmlBlockMessages", () => {
  it("is deterministic for the same input", () => {
    expect(buildHtmlBlockMessages(blockInput)).toEqual(
      buildHtmlBlockMessages(JSON.parse(JSON.stringify(blockInput))),
    );
  });

  it("never contains an em dash or en dash", () => {
    const { system, user } = buildHtmlBlockMessages(blockInput);
    expect(system).not.toMatch(/[–—]/);
    expect(user).not.toMatch(/[–—]/);
  });

  it("asks for the html/css/notes contract sized to the block limits, not the page limits", () => {
    const { system } = buildHtmlBlockMessages(blockInput);
    expect(system).toContain('"html"');
    expect(system).toContain('"css"');
    expect(system).toContain('"notes"');
    expect(system).toContain("8000");
    expect(system).toContain("4000");
  });

  it("keeps the system prompt free of the instructions and brief text", () => {
    const { system } = buildHtmlBlockMessages(blockInput);
    expect(system).not.toContain("una tarjeta con el horario");
    expect(system).not.toContain("Cafetería de especialidad");
  });

  it("puts the instructions and current code in the user data block", () => {
    const { user } = buildHtmlBlockMessages({
      ...blockInput,
      current: { html: "<div>hola</div>", css: ".x{color:red}" },
    });
    expect(user).toContain("una tarjeta con el horario");
    expect(user).toContain("<div>hola</div>");
    expect(user).toContain(".x{color:red}");
  });

  it("uses the brief design guide (no page recipes)", () => {
    const { system } = buildHtmlBlockMessages(blockInput);
    expect(system).not.toContain("Receta para este tipo de página");
    expect(system).toContain("Qué evitar");
  });
});

describe("briefAsksForPrices (relevo 37, IA4)", () => {
  it("hears dishes, prices, a menu or a catalog in the request", () => {
    expect(briefAsksForPrices("Quiero mis platillos y precios")).toBe(true);
    expect(briefAsksForPrices("que se vea mi menú")).toBe(true);
    expect(briefAsksForPrices("mi CATÁLOGO de paquetes")).toBe(true);
    expect(briefAsksForPrices("Bonita, en tonos verdes, con mi WhatsApp")).toBe(
      false,
    );
    expect(briefAsksForPrices("comprecios")).toBe(false);
  });
});
