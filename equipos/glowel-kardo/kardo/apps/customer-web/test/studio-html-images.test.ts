import { describe, expect, it } from "vitest";
import { prepareSource } from "../src/features/studio/html/engine.js";
import {
  connectImageSlot,
  findImageSlots,
  imageSlotLabel,
  imageSlotLabels,
  isKardoAssetValue,
} from "../src/features/studio/html/images.js";
import { starterCode, widgetsFor } from "../src/features/studio/html/model.js";

const uuid = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const other = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
const sha = "ab".repeat(32);

const values = (html: string, css = "") =>
  findImageSlots({ html, css }).map((slot) => slot.value);

describe("isKardoAssetValue", () => {
  it("accepts exactly a library uuid or a published hash", () => {
    expect(isKardoAssetValue(`kardo-asset:${uuid}`)).toBe(true);
    expect(isKardoAssetValue(` kardo-asset:${uuid} `)).toBe(true);
    expect(isKardoAssetValue(`kardo-asset:${sha}`)).toBe(true);
    expect(isKardoAssetValue(`kardo-asset:${uuid.toUpperCase()}`)).toBe(false);
    expect(isKardoAssetValue(`KARDO-ASSET:${uuid}`)).toBe(false);
    expect(isKardoAssetValue("kardo-asset:logo")).toBe(false);
    expect(isKardoAssetValue("imagen-1.jpg")).toBe(false);
  });
});

describe("findImageSlots", () => {
  it("lists the AI's placeholders in order, with their count and alt", () => {
    const html = [
      '<img src="imagen-2.jpg" alt="Foto de la terraza">',
      '<img alt="Taza de café" src="imagen-1.jpg">',
      '<img src="imagen-10.jpg">',
      '<img src="imagen-1.jpg" alt="">',
    ].join("\n");
    const css = ".portada { background-image: url(imagen-2.jpg); }";
    expect(findImageSlots({ html, css })).toEqual([
      {
        value: "imagen-1.jpg",
        kind: "placeholder",
        count: 2,
        alt: "Taza de café",
      },
      {
        value: "imagen-2.jpg",
        kind: "placeholder",
        count: 2,
        alt: "Foto de la terraza",
      },
      { value: "imagen-10.jpg", kind: "placeholder", count: 1, alt: null },
    ]);
  });

  it("reads double, single and unquoted src, in any case", () => {
    expect(
      values(
        `<img src="a.png"><img src='b.png'><img src=c.png><IMG SRC="d.png"><Img Src = 'e.png' >`,
      ),
    ).toEqual(["a.png", "b.png", "c.png", "d.png", "e.png"]);
  });

  it("reads url() in the CSS with or without quotes, in any case", () => {
    const css = `
      .a { background: url("uno.jpg") center / cover; }
      .b { background-image: url('dos.jpg'); }
      .c { background-image: url(tres.jpg); }
      .d { background-image: URL( cuatro.jpg ); }
    `;
    expect(values("", css)).toEqual([
      "uno.jpg",
      "dos.jpg",
      "tres.jpg",
      "cuatro.jpg",
    ]);
  });

  it("reads url() inside style attributes", () => {
    expect(
      values(
        `<section style="background-image: url('imagen-3.jpg'); color: red"></section><div STYLE="background:url(fondo.png)"></div>`,
      ),
    ).toEqual(["imagen-3.jpg", "fondo.png"]);
  });

  it("keeps a quoted '>' inside the tag", () => {
    expect(
      findImageSlots({ html: '<img alt="2 > 1" src="logo.png">', css: "" }),
    ).toEqual([{ value: "logo.png", kind: "file", count: 1, alt: "2 > 1" }]);
  });

  it("never lists valid library images", () => {
    const html = `<img src="kardo-asset:${uuid}"><img src='kardo-asset:${sha}'><div style="background:url(kardo-asset:${uuid})"></div>`;
    const css = `.a{background:url("kardo-asset:${uuid}")}`;
    expect(findImageSlots({ html, css })).toEqual([]);
  });

  it("tells what each value is", () => {
    const html = [
      '<img src="imagen-1.jpg">',
      '<img src="./img/logo.png">',
      '<img src="https://cdn.example.com/fotos/cafe.jpg?w=800">',
      '<img src="//cdn.example.com/b.jpg">',
      '<img src="data:image/png;base64,iVBORw0KGgo=">',
      `<img src="kardo-asset:${uuid.toUpperCase()}">`,
      '<img src="">',
    ].join("");
    expect(
      findImageSlots({ html, css: "" }).map((slot) => [slot.value, slot.kind]),
    ).toEqual([
      ["imagen-1.jpg", "placeholder"],
      ["./img/logo.png", "file"],
      ["https://cdn.example.com/fotos/cafe.jpg?w=800", "external"],
      ["//cdn.example.com/b.jpg", "external"],
      ["data:image/png;base64,iVBORw0KGgo=", "embedded"],
      [`kardo-asset:${uuid.toUpperCase()}`, "broken"],
      ["", "empty"],
    ]);
  });

  it("only looks at src and url(), never at text or links", () => {
    const html = [
      "<p>Usa imagen-1.jpg o url(imagen-1.jpg) en tu código.</p>",
      '<a href="imagen-1.jpg">ver</a>',
      '<img data-src="imagen-1.jpg" alt="imagen-1.jpg">',
    ].join("");
    expect(findImageSlots({ html, css: "" })).toEqual([]);
  });

  it("skips fonts, @import and SVG references", () => {
    const css = `
      @import url("https://fonts.googleapis.com/css2?family=Lora");
      @font-face { font-family: X; src: url(x.woff2) format("woff2"), url('x.ttf'); }
      .a { font: 16px X; mask: url(#forma); }
      .b { background: url(fondo.jpg); }
    `;
    expect(values("", css)).toEqual(["fondo.jpg"]);
  });
});

describe("connectImageSlot", () => {
  it("replaces every exact appearance in HTML and CSS, keeping quotes", () => {
    const source = {
      html: [
        '<img src="imagen-1.jpg" alt="Café">',
        "<img src='imagen-1.jpg'>",
        "<img src=imagen-1.jpg>",
        '<div style="background: url(imagen-1.jpg)"></div>',
      ].join("\n"),
      css: `.a { background: url("imagen-1.jpg"); }\n.b { background: url('imagen-1.jpg'); }\n.c { background: URL(imagen-1.jpg); }`,
    };
    const next = connectImageSlot(source, "imagen-1.jpg", uuid);
    expect(next.html).toBe(
      [
        `<img src="kardo-asset:${uuid}" alt="Café">`,
        `<img src='kardo-asset:${uuid}'>`,
        `<img src=kardo-asset:${uuid}>`,
        `<div style="background: url(kardo-asset:${uuid})"></div>`,
      ].join("\n"),
    );
    expect(next.css).toBe(
      `.a { background: url("kardo-asset:${uuid}"); }\n.b { background: url('kardo-asset:${uuid}'); }\n.c { background: URL(kardo-asset:${uuid}); }`,
    );
    expect(findImageSlots(next)).toEqual([]);
  });

  it("touches nothing else: text, links, other slots or library images", () => {
    const source = {
      html: [
        "<p>imagen-1.jpg</p>",
        '<a href="imagen-1.jpg">ver</a>',
        '<img src="imagen-1.jpg">',
        '<img src="imagen-2.jpg">',
        '<img src="IMAGEN-1.JPG">',
        `<img src="kardo-asset:${other}">`,
      ].join(""),
      css: `/* imagen-1.jpg */ .a{background:url(kardo-asset:${other})}`,
    };
    const next = connectImageSlot(source, "imagen-1.jpg", uuid);
    expect(next.html).toBe(
      [
        "<p>imagen-1.jpg</p>",
        '<a href="imagen-1.jpg">ver</a>',
        `<img src="kardo-asset:${uuid}">`,
        '<img src="imagen-2.jpg">',
        '<img src="IMAGEN-1.JPG">',
        `<img src="kardo-asset:${other}">`,
      ].join(""),
    );
    expect(next.css).toBe(source.css);
    expect(values(next.html, next.css)).toEqual([
      "imagen-2.jpg",
      "IMAGEN-1.JPG",
    ]);
  });

  it("replaces a value written with spaces inside its quotes", () => {
    const next = connectImageSlot(
      { html: '<img src=" logo.png ">', css: "" },
      "logo.png",
      uuid,
    );
    expect(next.html).toBe(`<img src="kardo-asset:${uuid}">`);
  });

  it("leaves the source as is when the value is not there", () => {
    const source = { html: '<img src="a.png">', css: ".a{color:red}" };
    expect(connectImageSlot(source, "b.png", uuid)).toEqual(source);
  });

  it("gives the sanitizer images it keeps", () => {
    const source = {
      html: '<img src="imagen-1.jpg" alt="Café"><section class="portada"></section>',
      css: ".portada { background-image: url('imagen-1.jpg'); }",
    };
    const before = prepareSource(source);
    expect(before.imageRefs).toEqual([]);
    expect(before.report.items.map((item) => item.kind).sort()).toEqual([
      "css-external-url",
      "external-image",
    ]);
    const after = prepareSource(connectImageSlot(source, "imagen-1.jpg", uuid));
    expect(after.imageRefs).toEqual([uuid]);
    expect(after.report.items).toEqual([]);
  });
});

describe("slot labels", () => {
  it("never spells out a data: image and numbers several", () => {
    const html =
      '<img src="data:image/png;base64,AAAA"><img src="data:image/png;base64,BBBB"><img src="logo.png">';
    const slots = findImageSlots({ html, css: "" });
    expect([...imageSlotLabels(slots).values()]).toEqual([
      "Imagen incrustada 1",
      "Imagen incrustada 2",
      "logo.png",
    ]);
    expect(
      imageSlotLabel({ value: "data:image/png;base64,AAAA", kind: "embedded" }),
    ).toBe("Imagen incrustada");
  });

  it("shortens other sites to their host and file", () => {
    expect(
      imageSlotLabel({
        value: "https://cdn.example.com/a/b/cafe.jpg?w=800",
        kind: "external",
      }),
    ).toBe("cdn.example.com/…/cafe.jpg");
  });
});

describe("starterCode", () => {
  it.each(["links", "profile", "linkpage"] as const)(
    "gives a %s page a base that publishes as is",
    (type) => {
      const code = starterCode(type, "Café Nube");
      for (const tag of widgetsFor(type))
        expect(code.html).toContain(`<${tag}></${tag}>`);
      const prepared = prepareSource(code);
      expect(prepared.report.items).toEqual([]);
      expect(code.css.trim()).not.toBe("");
    },
  );

  it("adds the profile and socials only to a Link page", () => {
    expect(starterCode("linkpage", "x").html).toContain("<kardo-profile>");
    expect(starterCode("linkpage", "x").html).toContain("<kardo-socials>");
    expect(starterCode("links", "x").html).not.toContain("<kardo-profile>");
    expect(starterCode("links", "x").html).not.toContain("<kardo-socials>");
  });

  it("writes the page's name as text", () => {
    expect(starterCode("links", "Tacos <El Güero> & más").html).toContain(
      "<h1>Tacos &lt;El Güero&gt; &amp; más</h1>",
    );
    expect(starterCode("profile", "  ").html).toContain("<h1>Mi negocio</h1>");
  });
});
