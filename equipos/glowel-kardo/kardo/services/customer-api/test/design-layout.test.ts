import {
  type CanvasSection,
  checkDesign,
  type DesignSection,
  type PageDesign,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { reviewLayout } from "../src/design-ai/design-layout.js";

// ---------------------------------------------------------------------------
// Layout review (relevo 29, 2026-10-03): the placement rules the prompt
// states in numbers, applied after the design validates.
// ---------------------------------------------------------------------------

const logo = "3f9d2a10-1b2c-4d3e-8f40-5a6b7c8d9e01";
const photo = "4a8e3b21-2c3d-4e4f-9a51-6b7c8d9e0f12";

const style = {
  palette: {
    background: "#fbf8f2",
    surface: "#ffffff",
    text: "#1d1a16",
    muted: "#5b544b",
    accent: "#9c2f1f",
  },
  fonts: { heading: "bricolage", body: "dm-sans" },
  radius: 16,
  buttonStyle: "solid",
  buttonShape: "pill",
  shadow: "soft",
  background: { kind: "solid", color: "#fbf8f2" },
  maxWidth: 480,
} as PageDesign["style"];

function canvas(
  items: CanvasSection["items"],
  extra: Partial<CanvasSection> = {},
): CanvasSection {
  return { id: "portada", kind: "canvas", height: 520, items, ...extra };
}

function flow(columns: DesignSection["columns"]): DesignSection {
  return {
    id: "menu-sec",
    layout: "1",
    columns,
    paddingTop: 32,
    paddingBottom: 32,
    gap: 16,
    align: "start",
  };
}

function design(sections: PageDesign["sections"]): PageDesign {
  return { schema: 2, style, sections };
}

const menuBlock = {
  id: "carta",
  kind: "menu" as const,
  layout: "cards" as const,
  photos: "large" as const,
};

const canvasOf = (value: PageDesign, index = 0) =>
  value.sections[index] as CanvasSection;

describe("reviewLayout: the customer's photo choice", () => {
  const withEverything = design([
    canvas(
      [
        {
          block: {
            id: "logo",
            kind: "image",
            imageRef: logo,
            alt: "Logo",
            aspect: "1:1",
            fit: "contain",
          },
          x: 24,
          y: 24,
          w: 72,
          h: 72,
        },
        {
          block: {
            id: "plato",
            kind: "image",
            alt: "Foto de tu platillo",
            aspect: "4:3",
            fit: "cover",
          },
          x: 24,
          y: 120,
          w: 342,
          h: 256,
        },
      ],
      { background: { kind: "image", imageRef: photo, overlay: 50 } },
    ),
    flow([
      [
        {
          id: "galeria",
          kind: "gallery",
          images: [{ alt: "Uno" }, { alt: "Dos" }],
          layout: "grid",
          aspect: "1:1",
        },
        menuBlock,
      ],
    ]),
  ]);

  it("without photos: keeps the logo, drops the rest, menu without photos", () => {
    const { design: next, fixes } = reviewLayout(withEverything, {
      type: "menu",
      photos: "without",
      logoRef: logo,
    });
    const cover = canvasOf(next);
    expect(cover.items.map((item) => item.block.id)).toEqual(["logo"]);
    expect(cover.background?.kind).toBe("solid");
    const blocks = (next.sections[1] as DesignSection).columns[0] ?? [];
    expect(blocks.map((block) => block.kind)).toEqual(["menu"]);
    expect(blocks[0]).toMatchObject({ photos: "none", layout: "list" });
    expect(fixes.length).toBeGreaterThan(0);
    expect(checkDesign("menu", next, [])).toEqual([]);
  });

  it("with photos: a menu without photos gets them", () => {
    const { design: next } = reviewLayout(
      design([flow([[{ ...menuBlock, photos: "none" }]])]),
      { type: "menu", photos: "with" },
    );
    expect((next.sections[0] as DesignSection).columns[0]?.[0]).toMatchObject({
      photos: "large",
    });
  });
});

describe("reviewLayout: placement", () => {
  it("drops a cover heading that repeats the bound title", () => {
    const { design: next } = reviewLayout(
      design([
        canvas([
          {
            block: {
              id: "h",
              kind: "heading",
              level: 2,
              text: "Florería  Lila",
            },
            x: 24,
            y: 300,
            w: 342,
          },
        ]),
        flow([[{ id: "t", kind: "contentTitle" }]]),
      ]),
      { type: "links", title: "Floreria Lila" },
    );
    expect(canvasOf(next).items).toHaveLength(0);
  });

  it("brings texts back inside the margins and onto one left edge", () => {
    const { design: next } = reviewLayout(
      design([
        canvas([
          {
            block: { id: "a", kind: "heading", level: 1, text: "Hola" },
            x: 24,
            y: 200,
            w: 342,
          },
          {
            block: { id: "b", kind: "text", runs: [{ text: "Frase" }] },
            x: 30,
            y: 260,
            w: 300,
          },
          {
            block: {
              id: "c",
              kind: "button",
              label: "Pedir",
              href: "https://example.com",
              variant: "primary",
            },
            x: 2,
            y: 320,
            w: 200,
          },
        ]),
      ]),
      { type: "links" },
    );
    const xs = canvasOf(next).items.map((item) => item.x);
    expect(xs).toEqual([24, 24, 24]);
  });

  it("centers a photo on the shape that frames it", () => {
    const { design: next } = reviewLayout(
      design([
        canvas([
          {
            block: {
              id: "disco",
              kind: "shape",
              shape: "ellipse",
              fill: "#ffffff",
            },
            x: 24,
            y: 24,
            w: 96,
            h: 96,
          },
          {
            block: {
              id: "logo",
              kind: "image",
              imageRef: logo,
              alt: "Logo",
              aspect: "1:1",
              fit: "contain",
            },
            x: 26,
            y: 30,
            w: 72,
            h: 72,
            z: 1,
          },
        ]),
      ]),
      { type: "links" },
    );
    const image = canvasOf(next).items[1];
    expect(image).toMatchObject({ x: 36, y: 36 });
  });

  it("makes white text on a light canvas readable", () => {
    const { design: next } = reviewLayout(
      design([
        canvas([
          {
            block: {
              id: "frase",
              kind: "text",
              runs: [{ text: "Consultas y vacunas" }],
              style: { color: "#ffffff" },
            },
            x: 24,
            y: 300,
            w: 342,
          },
        ]),
      ]),
      { type: "links" },
    );
    const color = (
      canvasOf(next).items[0]?.block.style as { color?: string } | undefined
    )?.color;
    expect(color).toBe(style.palette.text);
  });

  it("gives a photo enough overlay for the light text on it", () => {
    const { design: next } = reviewLayout(
      design([
        canvas(
          [
            {
              block: {
                id: "titulo",
                kind: "heading",
                level: 1,
                text: "Casa Jacaranda",
                style: { color: "#ffffff" },
              },
              x: 24,
              y: 380,
              w: 342,
            },
          ],
          { background: { kind: "image", imageRef: photo, overlay: 20 } },
        ),
      ]),
      { type: "document" },
    );
    expect(canvasOf(next).background?.overlay).toBe(45);
  });

  it("shrinks a title whose longest word does not fit, and moves what it covers", () => {
    const { design: next } = reviewLayout(
      design([
        canvas([
          {
            block: { id: "t", kind: "contentTitle", style: { fontSize: 72 } },
            x: 24,
            y: 300,
            w: 342,
          },
          {
            block: {
              id: "f",
              kind: "text",
              runs: [{ text: "Perros y gatos" }],
            },
            x: 24,
            y: 370,
            w: 342,
          },
        ]),
      ]),
      { type: "links", title: "Veterinaria Patitas" },
    );
    const [title, phrase] = canvasOf(next).items;
    const size =
      (title?.block.style as { fontSize?: number } | undefined)?.fontSize ?? 0;
    expect(size).toBeLessThan(72);
    expect(size * 0.56 * "Veterinaria".length).toBeLessThanOrEqual(342);
    expect(phrase?.y).toBeGreaterThan(370);
  });

  it("trims the empty room under the last item of a canvas", () => {
    const { design: next } = reviewLayout(
      design([
        canvas(
          [
            {
              block: { id: "a", kind: "heading", level: 1, text: "Hola" },
              x: 24,
              y: 40,
              w: 342,
            },
          ],
          { height: 600 },
        ),
      ]),
      { type: "links" },
    );
    expect(canvasOf(next).height).toBeLessThan(200);
  });

  it("leaves a photo cover's height alone", () => {
    const { design: next } = reviewLayout(
      design([
        canvas(
          [
            {
              block: { id: "a", kind: "heading", level: 1, text: "Hola" },
              x: 24,
              y: 420,
              w: 342,
              style: undefined,
            } as CanvasSection["items"][number],
          ],
          { background: { kind: "image", imageRef: photo, overlay: 50 } },
        ),
      ]),
      { type: "links" },
    );
    expect(canvasOf(next).height).toBe(520);
  });
});

describe("reviewLayout: one action, one face, buttons that read", () => {
  const whatsapp = {
    id: "wa",
    kind: "brandButton" as const,
    brand: "whatsapp" as const,
    label: "Agendar por WhatsApp",
    href: "https://wa.me/5215512345678",
    look: "brand" as const,
  };

  it("in a Formulario, a cover button stops competing with the form", () => {
    const { design: next } = reviewLayout(
      design([
        canvas([
          { block: whatsapp, x: 24, y: 300, w: 260 },
          {
            block: {
              id: "b",
              kind: "button",
              label: "Pedir cita",
              href: "https://example.com",
              variant: "primary",
            },
            x: 24,
            y: 370,
            w: 200,
          },
        ]),
        flow([[{ id: "f", kind: "leadForm", look: "card" }]]),
      ]),
      { type: "form" },
    );
    const [wa, button] = canvasOf(next).items;
    expect(wa?.block).toMatchObject({ look: "outline" });
    expect(button?.block).toMatchObject({ variant: "secondary" });
  });

  it("a profile without its own photo drops the initials when the logo shows", () => {
    const base = design([
      canvas([
        {
          block: {
            id: "logo",
            kind: "image",
            imageRef: logo,
            alt: "Logo",
            aspect: "1:1",
            fit: "contain",
          },
          x: 147,
          y: 24,
          w: 96,
          h: 96,
        },
      ]),
      flow([
        [
          {
            id: "ph",
            kind: "profileHeader",
            layout: "stacked",
            avatarShape: "circle",
          },
          { id: "cl", kind: "contentLinks", layout: "list" },
        ],
      ]),
    ]);
    const { design: next } = reviewLayout(base, {
      type: "profile",
      logoRef: logo,
      hasAvatar: false,
    });
    expect((next.sections[1] as DesignSection).columns[0]?.[0]).toMatchObject({
      avatarShape: "none",
    });
    // With its own photo, the avatar stays.
    const kept = reviewLayout(base, {
      type: "profile",
      logoRef: logo,
      hasAvatar: true,
    }).design;
    expect((kept.sections[1] as DesignSection).columns[0]?.[0]).toMatchObject({
      avatarShape: "circle",
    });
  });

  it("an outline button on a photo becomes solid; a brand button shows its colors", () => {
    const outline = {
      ...design([
        canvas(
          [
            {
              block: {
                id: "b",
                kind: "button",
                label: "Reservar",
                href: "https://example.com",
                variant: "primary",
              },
              x: 24,
              y: 420,
              w: 200,
            },
            {
              block: { ...whatsapp, look: "outline" as const },
              x: 24,
              y: 480,
              w: 260,
            },
          ],
          { background: { kind: "image", imageRef: photo, overlay: 50 } },
        ),
      ]),
    };
    outline.style = { ...outline.style, buttonStyle: "outline" };
    const { design: next } = reviewLayout(outline, { type: "links" });
    const [button, wa] = canvasOf(next).items;
    expect(button?.block.style).toMatchObject({
      background: style.palette.accent,
    });
    expect(wa?.block).toMatchObject({ look: "brand" });
  });
});
