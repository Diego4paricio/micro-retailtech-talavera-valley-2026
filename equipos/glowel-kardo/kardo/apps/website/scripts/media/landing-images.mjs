// Local tool, not part of the build: every photo the landing serves, from
// its source, in one command.
//
//   node scripts/media/landing-images.mjs
//
// For each source it writes public/media/landing/<name>-<width>.webp at 640,
// 1200 and 1800 px wide, never wider than the source (a source of 1024 px
// gets 640 and 1024), and records the real sizes in
// src/content/media.json, which EditorialImage reads to build srcset, width
// and height. It also crops the four print artworks of the real-size strip
// (arte-<id>.webp). Optional sources that do not exist yet (the /piezas
// details) are skipped; add the file and run it again.
//
// Before it: python3 scripts/media/fix-cafe-sticker.py (café photo) and
// python3 scripts/media/hero-video.py (hero video and poster).
//
// sharp is not a dependency of the site: it is taken from the workspace
// store, where another package already installs it.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const site = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const repo = path.resolve(site, "../..");
const store = path.resolve(repo, "node_modules/.pnpm");
const sharpDir = fs
  .readdirSync(store)
  .find((name) => name.startsWith("sharp@"));
if (!sharpDir) throw new Error("sharp is not in node_modules/.pnpm");
const sharp = createRequire(path.join(store, sharpDir, "node_modules/"))(
  "sharp",
);

const sitio = path.join(repo, "Docs/renders/sitio");
const prints = path.join(repo, "Docs/renders/DiseñosImprimir");
const renders = path.join(repo, "Docs/renders");
const target = path.join(site, "public/media/landing");
const manifestFile = path.join(site, "src/content/media.json");

const WIDTHS = [640, 1200, 1800];

/** name → source. `optional` sources may not exist yet. */
const photos = [
  {
    name: "negocio-alimentos",
    from: path.join(sitio, "alimentos-cafe-corregida.jpg"),
  },
  { name: "negocio-tiendas", from: path.join(sitio, "tiendas-floreria.jpg") },
  { name: "negocio-servicios", from: path.join(sitio, "servicios-card.jpg") },
  {
    name: "como-funciona",
    from: path.join(sitio, "como-funciona-sticker.jpg"),
  },
  ...["stand", "card", "magnet", "sticker"].flatMap((id) => [
    { name: `pieza-${id}`, from: path.join(renders, `kardo-${id}.jpg`) },
    {
      name: `pieza-${id}-detalle`,
      from: path.join(sitio, `pieza-${id}-detalle.jpg`),
      optional: true,
    },
  ]),
  ...["publicar", "conectar", "medir"].map((id) => ({
    name: `panel-${id}`,
    from: path.join(sitio, `panel-${id}.png`),
    optional: true,
  })),
  // Real screens of the panel in demo mode (Café Nube), taken 2026-10-13
  // for the home's «Tu panel por dentro» and /plataforma/: the whole window
  // and, for the rest, the content without the side menu.
  ...[
    "completo",
    "resumen",
    "qr-etiquetas",
    "ficha",
    "diseno-qr",
    "paginas",
    "disponibilidad",
    "analitica",
    "solicitudes",
    "links",
  ].map((id) => ({
    name: `panel-${id}`,
    from: path.join(sitio, `panel-${id}.png`),
  })),
];

const manifest = {};

for (const photo of photos) {
  if (!fs.existsSync(photo.from)) {
    if (photo.optional) continue;
    throw new Error(`Missing source: ${path.relative(repo, photo.from)}`);
  }
  const { width, height } = await sharp(photo.from).metadata();
  const widths = [...WIDTHS.filter((w) => w < width), Math.min(width, 1800)];
  const unique = [...new Set(widths)];
  for (const w of unique) {
    await sharp(photo.from)
      .resize({ width: w })
      .webp({ quality: w <= 640 ? 76 : 80 })
      .toFile(path.join(target, `${photo.name}-${w}.webp`));
  }
  const largest = unique.at(-1);
  manifest[photo.name] = {
    width: largest,
    height: Math.round((height * largest) / width),
    widths: unique,
  };
  console.log(`${photo.name}: ${unique.join(", ")} (from ${width}×${height})`);
}

// Print artworks for the real-size strip: trimmed of their white margin,
// the card's front only, the sticker cut round.
const artworks = [
  { id: "stand", file: "kardo_stand.jpg" },
  { id: "card", file: "kardo_card.jpg", leftHalf: true },
  { id: "magnet", file: "kardo_magnet.jpg" },
  { id: "sticker", file: "kardo_sticker.jpg", round: true },
];
for (const art of artworks) {
  let image = sharp(path.join(prints, art.file));
  if (art.leftHalf) {
    const { width, height } = await image.metadata();
    image = sharp(
      await image
        .extract({ left: 0, top: 0, width: Math.floor(width / 2), height })
        .toBuffer(),
    );
  }
  const trimmed = await image
    .trim({ background: "#ffffff", threshold: 18 })
    .toBuffer({ resolveWithObject: true });
  let out = sharp(trimmed.data).resize({
    width: 900,
    height: 900,
    fit: "inside",
  });
  if (art.round) {
    const { width, height } = await sharp(
      await out.clone().toBuffer(),
    ).metadata();
    const circle = Buffer.from(
      `<svg width="${width}" height="${height}"><ellipse cx="${width / 2}" cy="${height / 2}" rx="${width / 2}" ry="${height / 2}"/></svg>`,
    );
    out = sharp(await out.toBuffer()).composite([
      { input: circle, blend: "dest-in" },
    ]);
  }
  await out
    .webp({ quality: 86 })
    .toFile(path.join(target, `arte-${art.id}.webp`));
  console.log(`arte-${art.id}`);
}

fs.writeFileSync(manifestFile, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(path.relative(site, manifestFile));
