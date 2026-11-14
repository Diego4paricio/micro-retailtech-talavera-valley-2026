import { describe, expect, it } from "vitest";
import {
  lockWhatsAppLinks,
  repairCommonDesignMistakes,
} from "../src/design-ai/design-repair.js";

function draft() {
  return {
    schema: 2,
    style: {
      palette: {
        background: "#fbf7f4",
        surface: "#ffffff",
        text: "#1f2a27",
        muted: "#5b6b66",
        accent: "#2f5d50",
      },
      background: { kind: "solid", color: "background" },
    },
    sections: [
      {
        id: "portada",
        kind: "canvas",
        height: 300,
        background: {
          kind: "image",
          imageRef: "x",
          overlay: "rgba(0,0,0,0.25)",
        },
        items: [
          {
            block: {
              id: "t",
              kind: "text",
              runs: [{ text: "Hola" }],
              style: { weight: 400, textAlign: "center", fontSize: 14 },
            },
            x: 0,
            y: 0,
            w: 300,
          },
        ],
      },
      {
        id: "s1",
        layout: "1",
        background: { kind: "solid", color: "accent" },
        columns: [
          [
            {
              id: "logo",
              kind: "image",
              style: { maxWidth: "80px", margin: "0 auto", radius: 12 },
            },
          ],
        ],
      },
    ],
  };
}

describe("repairCommonDesignMistakes", () => {
  it("fixes what the bench saw, in place, and lists it", () => {
    const design = draft();
    const repairs = repairCommonDesignMistakes(design);
    expect(design.style.background.color).toBe("#fbf7f4");
    expect(design.sections[0]?.background?.overlay).toBe(25);
    expect(design.sections[1]?.background?.color).toBe("#2f5d50");
    const textStyle = (
      design.sections[0] as { items: { block: { style: object } }[] }
    ).items[0]?.block.style;
    expect(textStyle).toEqual({
      fontWeight: 400,
      align: "center",
      fontSize: 14,
    });
    const imageStyle = (
      design.sections[1] as { columns: { style: object }[][] }
    ).columns[0]?.[0]?.style;
    expect(imageStyle).toEqual({ radius: 12 });
    // The 8th: a pale page (#fbf7f4) gets no blurred backdrop (IA2).
    expect(repairs.length).toBe(8);
  });

  it("turns the blurred backdrop off on a pale page only (relevo 37, IA2)", () => {
    const pale = draft();
    repairCommonDesignMistakes(pale);
    expect((pale.style as { ambient?: unknown }).ambient).toEqual({
      kind: "none",
    });
    const dark = draft();
    dark.style.palette.background = "#1c1410";
    repairCommonDesignMistakes(dark);
    expect((dark.style as { ambient?: unknown }).ambient).toBeUndefined();
    const custom = draft() as ReturnType<typeof draft> & {
      style: { ambient?: unknown };
    };
    custom.style.ambient = { kind: "custom", color: "#f2c6d4" };
    repairCommonDesignMistakes(custom);
    expect(custom.style.ambient).toEqual({ kind: "custom", color: "#f2c6d4" });
  });

  it("caps a fraction or a percent overlay at 80 and leaves good values alone", () => {
    const design = draft();
    design.sections[0].background = {
      kind: "image",
      imageRef: "x",
      overlay: 0.95,
    } as never;
    repairCommonDesignMistakes(design);
    expect(design.sections[0]?.background?.overlay).toBe(80);
    const good = draft();
    good.style.background.color = "#ffffff";
    good.sections[0].background = {
      kind: "image",
      imageRef: "x",
      overlay: 40,
    } as never;
    const repairs = repairCommonDesignMistakes(good);
    expect(good.sections[0]?.background?.overlay).toBe(40);
    expect(repairs.some((repair) => repair.what === "overlay")).toBe(false);
  });

  it("reads the alpha of an 8 digit hex overlay", () => {
    const design = draft();
    design.sections[0].background = {
      kind: "image",
      imageRef: "x",
      overlay: "#3A214266",
    } as never;
    repairCommonDesignMistakes(design);
    expect(design.sections[0]?.background?.overlay).toBe(40);
  });

  it("never invents a color for an unknown name", () => {
    const design = draft();
    design.style.background.color = "rosa";
    repairCommonDesignMistakes(design);
    expect(design.style.background.color).toBe("rosa");
  });
});

/** A cover with the AI example's WhatsApp on its canvas, and a closing
 * section with a plain button to a made-up number and one to a website. */
function whatsappDraft() {
  return {
    schema: 2,
    sections: [
      {
        id: "portada",
        kind: "canvas",
        height: 300,
        items: [
          {
            block: {
              id: "pedir",
              kind: "brandButton",
              brand: "whatsapp",
              label: "Pedir por WhatsApp",
              href: "https://wa.me/525523456789?text=Hola",
              look: "brand",
            },
            x: 24,
            y: 200,
            w: 240,
          },
        ],
      },
      {
        id: "cierre",
        layout: "1",
        columns: [
          [
            { id: "t", kind: "heading", level: 2, text: "Agenda tu cita" },
            {
              id: "wa",
              kind: "button",
              label: "Agendar",
              href: "https://api.whatsapp.com/send?phone=5215511112222",
            },
            {
              id: "web",
              kind: "button",
              label: "Nuestro sitio",
              href: "https://kardo.test",
            },
          ],
        ],
      },
    ],
  } as {
    sections: [
      { items: { block: { href: string } }[] },
      { columns: { id: string; href?: string }[][] },
    ];
  };
}

describe("lockWhatsAppLinks (2026-10-03, finding 5)", () => {
  it("puts the business's own WhatsApp on every made-up one, keeping its message", () => {
    const design = whatsappDraft();
    const repairs = lockWhatsAppLinks(design, "https://wa.me/523312345678");
    expect(design.sections[0].items[0]?.block.href).toBe(
      "https://wa.me/523312345678?text=Hola",
    );
    const [column] = design.sections[1].columns;
    expect(column?.find((block) => block.id === "wa")?.href).toBe(
      "https://wa.me/523312345678",
    );
    expect(column?.find((block) => block.id === "web")?.href).toBe(
      "https://kardo.test",
    );
    expect(repairs).toHaveLength(2);
  });

  it("leaves the business's own number alone, written either way", () => {
    const design = whatsappDraft();
    design.sections[0].items[0].block.href =
      "https://api.whatsapp.com/send?phone=523312345678";
    const repairs = lockWhatsAppLinks(design, "https://wa.me/523312345678");
    expect(design.sections[0].items[0]?.block.href).toBe(
      "https://api.whatsapp.com/send?phone=523312345678",
    );
    expect(repairs).toHaveLength(1);
  });

  it("takes WhatsApp buttons out when the business has no phone", () => {
    const design = whatsappDraft();
    const repairs = lockWhatsAppLinks(design, undefined);
    expect(design.sections[0].items).toHaveLength(0);
    expect(design.sections[1].columns[0]?.map((block) => block.id)).toEqual([
      "t",
      "web",
    ]);
    expect(repairs.map((repair) => repair.what)).toEqual([
      "removed a made-up WhatsApp button",
      "removed a made-up WhatsApp button",
    ]);
  });
});
