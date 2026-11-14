// Local tool, not part of the build: draws the flat print design of Kardo's
// own sample pieces ("edición Kardo"), with the official logo from
// Docs/Marca and a real QR to kardo.com.mx. They are the reference image to
// upload when generating the hero (Docs/engineering/research/
// 2026-10-11-imagenes-sitio.md): image models draw logos wrong, so they get
// the exact artwork instead.
//
//   node scripts/media/kardo-edition.mjs
//
// Output: Docs/renders/referencias/kardo-edicion-{stand,sticker}.png
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import QRCode from "qrcode";

const site = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const repo = path.resolve(site, "../..");
const store = path.join(repo, "node_modules/.pnpm");
const sharpDir = fs
  .readdirSync(store)
  .find((name) => name.startsWith("sharp@"));
if (!sharpDir) throw new Error("sharp is not in node_modules/.pnpm");
const sharp = createRequire(path.join(store, sharpDir, "node_modules/"))(
  "sharp",
);

const out = path.join(repo, "Docs/renders/referencias");
fs.mkdirSync(out, { recursive: true });

const ink = "#16232E";
const paper = "#F7F5F0";
const logo = fs.readFileSync(
  path.join(repo, "Docs/Marca/kardo-logo-oscuro.svg"),
);
const logoUri = `data:image/svg+xml;base64,${logo.toString("base64")}`;
const [, , logoW, logoH] = /viewBox="([\d.\s]+)"/
  .exec(logo.toString())[1]
  .split(/\s+/)
  .map(Number);

const qrSvg = await QRCode.toString("https://kardo.com.mx", {
  type: "svg",
  margin: 0,
  errorCorrectionLevel: "M",
  color: { dark: ink, light: "#0000" },
});
const qrUri = `data:image/svg+xml;base64,${Buffer.from(qrSvg).toString("base64")}`;

// The NFC mark is the Kardo symbol alone (owner decision 2026-10-12): the
// ring, the dot and the signal, from Docs/Marca/kardo-icono.svg. `s` is the
// height of the box it fills.
const icon = fs.readFileSync(path.join(repo, "Docs/Marca/kardo-icono.svg"));
const iconUri = `data:image/svg+xml;base64,${icon.toString("base64")}`;
const [, , iconW, iconH] = /viewBox="([\d.\s]+)"/
  .exec(icon.toString())[1]
  .split(/\s+/)
  .map(Number);
const tap = (x, y, s) => {
  const h = s * 0.82;
  const w = (h * iconW) / iconH;
  return `<image href="${iconUri}" x="${x + (s - w) / 2}" y="${y + (s - h) / 2}" width="${w}" height="${h}"/>`;
};

const font = `font-family="Helvetica Neue, Arial, sans-serif"`;

// Stand: 10 × 15 cm at 100 px per cm.
function stand() {
  const w = 1000;
  const h = 1500;
  const lw = 620;
  const lh = (lw * logoH) / logoW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
    <rect width="${w}" height="${h}" rx="40" fill="${ink}"/>
    <image href="${logoUri}" x="${(w - lw) / 2}" y="170" width="${lw}" height="${lh}"/>
    <text x="${w / 2}" y="${200 + lh + 90}" text-anchor="middle" ${font} font-size="48" fill="${paper}" opacity=".9">Acerca tu celular o escanea</text>
    <rect x="110" y="680" width="360" height="360" rx="44" fill="${paper}"/>
    <image href="${qrUri}" x="150" y="720" width="280" height="280"/>
    <rect x="530" y="680" width="360" height="360" rx="44" fill="${paper}"/>
    ${tap(590, 740, 240)}
    <text x="290" y="1105" text-anchor="middle" ${font} font-size="34" fill="${paper}" opacity=".8">Escanea</text>
    <text x="710" y="1105" text-anchor="middle" ${font} font-size="34" fill="${paper}" opacity=".8">Acerca tu celular</text>
    <text x="${w / 2}" y="1390" text-anchor="middle" ${font} font-size="34" fill="${paper}" opacity=".55">kardo.com.mx</text>
  </svg>`;
}

// Sticker: 10 cm round.
function sticker() {
  const s = 1000;
  const lw = 520;
  const lh = (lw * logoH) / logoW;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">
    <circle cx="500" cy="500" r="500" fill="${ink}"/>
    <image href="${logoUri}" x="${(s - lw) / 2}" y="150" width="${lw}" height="${lh}"/>
    <rect x="200" y="400" width="600" height="250" rx="125" fill="${paper}"/>
    <image href="${qrUri}" x="290" y="435" width="180" height="180"/>
    ${tap(540, 440, 170)}
    <text x="500" y="740" text-anchor="middle" ${font} font-size="44" fill="${paper}">Acerca tu celular o escanea</text>
    <text x="500" y="850" text-anchor="middle" ${font} font-size="40" fill="${paper}" opacity=".7">kardo.com.mx</text>
  </svg>`;
}

for (const [name, svg] of [
  ["stand", stand()],
  ["sticker", sticker()],
]) {
  const file = path.join(out, `kardo-edicion-${name}.png`);
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(file);
  console.log(path.relative(repo, file));
}
