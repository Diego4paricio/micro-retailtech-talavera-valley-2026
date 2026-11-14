// Dev AI bridge helper: draws a draft with the real @kardo/page-render (the
// same code the Resolver serves pages with) so the agent answering a turn by
// hand (see README.md in this folder, and the .claude/skills/kardo-disenador
// skill) can actually look at it before writing done/ — catching cramped
// spacing, bad contrast or the "look de IA" the design guide warns against,
// none of which a JSON check alone can see.
//
// Usage (run with tsx, like check.mjs — see scripts/e2e/billing-sync.mts for
// the same import-workspace-TypeScript-directly pattern):
//   pnpm exec tsx scripts/dev/ai-bridge/preview.mjs <path-to-json> <out-prefix>
//
// <path-to-json> is a draft, one of:
//   - `{ "html": "...", "css": "...", "type"?: "links"|"profile"|"linkpage" }`
//     for "custom-html"/"html-block" (a whole modo HTML page, or one block
//     drawn the same way, as a standalone page; `type` picks which sample
//     content/widgets it renders with, default "links");
//   - `{ "type": "menu", "design": { ... } }` for "design" — the whole
//     PageDesign object under `design`, `type` one of the designable types
//     (see --help), which also picks this script's own sample content for
//     that type (the AI never sees that content: it is a stand-in here only,
//     the same way the panel's own template thumbnails use one).
//   - a done-file `{ "text": "<raw model answer>" }` wrapping either shape
//     above, same tolerant shape `check.mjs` accepts.
//
// Two optional keys draw a real business instead of the stand-in (the AI
// test bench, scripts/dev/ai-eval, uses them):
//   - `"content"`: a whole `DesignableContent` object (packages/page-render
//     types) used instead of this script's sample content; its `type`
//     wins over the top-level `type`;
//   - `"images"`: `{ "<ref>": "/absolute/path.png" }`, so an imageRef (a
//     design block's or the content's own) draws that local file instead
//     of the gray placeholder.
//
// <out-prefix> is a path prefix (directories are created as needed); this
// writes `<out-prefix>-phone.png` (390x844) and `<out-prefix>-desktop.png`
// (1280x800), and prints both paths. Read them with your own image-reading
// tool — this script only draws them.

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { designableExperienceTypes } from "../../../packages/contracts/src/design.ts";
import {
  htmlBlockRenderer,
  prepareCustomHtml,
  renderCustomHtmlDocument,
  renderDesignedDocument,
} from "../../../packages/page-render/src/index.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function printHelp() {
  console.log(
    [
      "usage: pnpm exec tsx scripts/dev/ai-bridge/preview.mjs <path-to-json> <out-prefix>",
      "",
      `design drafts: "type" is one of ${designableExperienceTypes.join(", ")} (default links)`,
      'custom-html/html-block drafts: optional "type" is one of links, profile, linkpage (default links)',
      "  --public   draw the published page: photo spaces are not drawn (by default they are, like in the Estudio)",
    ].join("\n"),
  );
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  printHelp();
  process.exit(0);
}
const [inputArg, outArg] = args;
if (!inputArg || !outArg) {
  printHelp();
  fail("missing <path-to-json> or <out-prefix>");
}

const inputPath = path.resolve(process.cwd(), inputArg);
let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (error) {
  fail(`could not read/parse ${inputPath}: ${error.message}`);
}
// Real content and local images (see the header): read before unwrapping a
// done-file, since they sit next to its `text`.
const contentOverride =
  parsed !== null &&
  typeof parsed === "object" &&
  typeof parsed.content === "object" &&
  parsed.content !== null
    ? parsed.content
    : undefined;
const imageFiles =
  parsed !== null &&
  typeof parsed === "object" &&
  typeof parsed.images === "object" &&
  parsed.images !== null
    ? parsed.images
    : {};
const topLevelType = typeof parsed?.type === "string" ? parsed.type : undefined;

// A done-file `{ "text": "..." }` wraps the real JSON as a string, same as
// what you write to done/<jobId>.turnN.json.
if (typeof parsed.text === "string") {
  try {
    parsed = JSON.parse(parsed.text);
  } catch {
    fail("parsed.text is not valid JSON (write the raw object instead?)");
  }
}

const isDesign =
  parsed !== null &&
  typeof parsed === "object" &&
  typeof parsed.design === "object" &&
  parsed.design !== null;

// ---------------------------------------------------------------------------
// Sample content per type: this script's own stand-in for "the real content
// a published page would show" (the panel's template thumbnails work the
// same way). The AI that drafted this design never saw any of this.
// ---------------------------------------------------------------------------

const sampleContent = {
  links: {
    type: "links",
    title: "Café Nube",
    description: "Café de especialidad y cocina de temporada",
    links: [
      { id: "l1", label: "Ver el menú", url: "https://cafenube.example/menu" },
      { id: "l2", label: "Reservar", url: "https://cafenube.example/reservar" },
      {
        id: "l3",
        label: "Pedir por WhatsApp",
        url: "https://wa.me/5215555555",
      },
    ],
  },
  profile: {
    type: "profile",
    displayName: "Café Nube",
    headline: "Café de especialidad, barrio Roma",
    links: [
      { id: "l1", label: "Ver el menú", url: "https://cafenube.example/menu" },
      { id: "l2", label: "Reservar", url: "https://cafenube.example/reservar" },
    ],
  },
  linkpage: {
    type: "linkpage",
    displayName: "Café Nube",
    bio: "Café de especialidad y cocina de temporada. Abrimos todos los días de 8 a 20 h.",
    socials: [
      {
        id: "s1",
        network: "instagram",
        value: "https://instagram.com/cafenube",
      },
    ],
    links: [
      {
        id: "l1",
        label: "Ver el menú",
        url: "https://cafenube.example/menu",
        highlight: true,
      },
      { id: "l2", label: "Reservar", url: "https://cafenube.example/reservar" },
    ],
  },
  menu: {
    type: "menu",
    title: "Café Nube",
    description: "Café de especialidad y cocina de temporada",
    currency: "MXN",
    sections: [
      {
        id: "sec-entradas",
        name: "Para empezar",
        items: [
          {
            id: "i1",
            name: "Pan de elote",
            description: "Con mantequilla de vainilla",
            price: 65,
          },
          {
            id: "i2",
            name: "Huevos rancheros",
            description: "Con frijoles de la olla",
            price: 95,
            availability: { soldOut: false, remaining: 3 },
          },
        ],
      },
      {
        id: "sec-bebidas",
        name: "Bebidas",
        items: [
          { id: "i3", name: "Capuchino", price: 55 },
          { id: "i4", name: "Latte de temporada", price: 65 },
          {
            id: "i5",
            name: "Té de hierbas",
            price: 45,
            availability: { soldOut: true, remaining: null },
          },
        ],
      },
    ],
  },
  catalog: {
    type: "catalog",
    title: "Tienda Café Nube",
    description: "Café en grano y accesorios",
    currency: "MXN",
    items: [
      {
        id: "p1",
        name: "Café en grano, 250 g",
        description: "Tueste medio, notas a chocolate y nuez",
        price: 180,
        url: "https://cafenube.example/tienda/cafe-250g",
      },
      {
        id: "p2",
        name: "Taza de barro",
        description: "Hecha a mano en Oaxaca",
        price: 220,
        url: "https://cafenube.example/tienda/taza",
        availability: { soldOut: false, remaining: 5 },
      },
    ],
  },
  form: {
    type: "form",
    title: "Resérvanos tu mesa",
    description: "Te confirmamos por WhatsApp en menos de una hora.",
    fields: { name: "required", phone: "required", message: "optional" },
    submitLabel: "Reservar",
    successMessage: "Gracias, te confirmamos pronto.",
    consentText: "Acepto el tratamiento de mis datos para esta reserva.",
  },
  document: {
    type: "document",
    title: "Carta de vinos",
    description: "Temporada otoño-invierno",
    display: "viewer",
    pages: [
      { ref: "page-1", width: 1240, height: 1754 },
      { ref: "page-2", width: 1240, height: 1754 },
    ],
    allowDownload: true,
  },
  image: {
    type: "image",
    alt: "La terraza de Café Nube al atardecer",
    imageRef: "hero-image",
  },
};

const type =
  contentOverride?.type ??
  (typeof parsed.type === "string" ? parsed.type : undefined) ??
  topLevelType ??
  "links";

let content;
let title;
if (isDesign) {
  if (!designableExperienceTypes.includes(type))
    fail(
      `"type": "${type}" is not designable; use one of ${designableExperienceTypes.join(", ")}`,
    );
  content = contentOverride ?? sampleContent[type];
  title = content.title ?? content.displayName ?? "Vista previa";
} else {
  const htmlType = ["links", "profile", "linkpage"].includes(type)
    ? type
    : "links";
  content = contentOverride ?? sampleContent[htmlType];
  title = content.title ?? content.displayName ?? "Vista previa";
}

// ---------------------------------------------------------------------------
// Render context: a placeholder image for any imageRef (this script, like
// the panel's own template thumbnails, cannot know a real business's photos
// outside the panel), webfonts served from the local fonts/ folder over
// file://, and tracked links left as plain hrefs (no real click tracking
// for a draft that is never published).
// ---------------------------------------------------------------------------

const PLACEHOLDER_IMAGE = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600">' +
    '<rect width="100%" height="100%" fill="#dceced"/>' +
    '<text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" ' +
    'font-family="sans-serif" font-size="32" fill="#577078">Imagen</text>' +
    "</svg>",
)}`;

const fontBaseUrl = pathToFileURL(
  `${path.join(root, "packages/page-render/fonts")}${path.sep}`,
).href;

const resolveImage = (ref) => {
  const file = imageFiles[ref];
  return typeof file === "string" && fs.existsSync(file)
    ? pathToFileURL(file).href
    : PLACEHOLDER_IMAGE;
};

// Photo spaces (an image block, gallery photo, dish or background without
// imageRef) are drawn like the Estudio draws them, with their «Foto de
// fondo» or alt label (relevo 37, IA7). --public draws the published page,
// where a space is simply absent or its fallback color.
const ctx = {
  resolveImage,
  linkHref: (_itemId, url) => url,
  fontBaseUrl,
  ...(isDesign ? { renderHtmlBlock: htmlBlockRenderer(resolveImage) } : {}),
  ...(isDesign && !args.includes("--public") ? { imagePlaceholders: true } : {}),
};

let html;
try {
  if (isDesign) {
    html = renderDesignedDocument(content, parsed.design, ctx, { title });
  } else {
    const prepared = prepareCustomHtml({
      html: typeof parsed.html === "string" ? parsed.html : "",
      css: typeof parsed.css === "string" ? parsed.css : "",
    });
    html = renderCustomHtmlDocument(
      content,
      { html: prepared.html, css: prepared.css, links: prepared.links },
      ctx,
      { title },
    );
  }
} catch (error) {
  fail(`could not render the draft: ${error.message}`);
}

// ---------------------------------------------------------------------------
// Draw it: a static file:// page (so the @font-face file:// URLs above load
// as same-origin resources, which a `page.setContent()` page on about:blank
// would not get), two screenshots.
// ---------------------------------------------------------------------------

const outPrefix = path.resolve(process.cwd(), outArg);
fs.mkdirSync(path.dirname(outPrefix), { recursive: true });
const htmlPath = `${outPrefix}.preview.html`;
fs.writeFileSync(htmlPath, html, "utf8");

const { chromium } = createRequire(
  path.join(root, "scripts/video/package.json"),
)("playwright-core");

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const pageUrl = pathToFileURL(htmlPath).href;
  const shots = [
    { suffix: "phone", width: 390, height: 844 },
    { suffix: "desktop", width: 1280, height: 800 },
  ];
  for (const shot of shots) {
    const page = await browser.newPage({
      viewport: { width: shot.width, height: shot.height },
    });
    await page.goto(pageUrl, { waitUntil: "load" });
    // Webfonts load asynchronously; give them a moment before the shot.
    await page.evaluate(() => document.fonts?.ready).catch(() => undefined);
    await page.waitForTimeout(150);
    const outPath = `${outPrefix}-${shot.suffix}.png`;
    await page.screenshot({ path: outPath, fullPage: true });
    console.log(outPath);
    await page.close();
  }
} finally {
  await browser.close();
}
