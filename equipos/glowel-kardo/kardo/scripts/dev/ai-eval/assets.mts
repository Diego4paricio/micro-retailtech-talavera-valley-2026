// Kardo AI test bench: draws the images the cases need that no real photo
// covers, once, into out/assets/ (gitignored):
// - a logo per case (`logo-<caseId>.png`, 512 x 512, transparent), the kind
//   of simple badge a small business uploads;
// - the barbershop's own promo poster (`barberia-poster.png`), since an
//   Imagen Experience shows a picture the customer already made;
// - the PDF pages of the two Documento PDF cases (`hotel-page-N.png`,
//   `taller-page-N.png`), the way the panel turns a PDF into page images.
// Drawn with Chrome through playwright-core (the same dependency
// preview.mjs uses, from scripts/video).

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { type EvalCase, evalCases } from "./cases.mts";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "../../..");
export const assetsDir = path.join(here, "out/assets");

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

const fontStacks = {
  serif: "Georgia, 'Times New Roman', serif",
  sans: "'Helvetica Neue', Arial, sans-serif",
  rounded: "'Arial Rounded MT Bold', 'Helvetica Neue', Arial, sans-serif",
};

function logoHtml(item: EvalCase): string {
  const { logo, brand } = item.business;
  const radius =
    logo.shape === "circle"
      ? "50%"
      : logo.shape === "arch"
        ? "150px 150px 24px 24px"
        : "56px";
  return `<!doctype html><html><body style="margin:0;background:transparent">
<div style="width:512px;height:512px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:22px;font-family:${fontStacks[logo.font]}">
  <div style="width:300px;height:300px;border-radius:${radius};background:${brand.primary};display:flex;align-items:center;justify-content:center;box-shadow:inset 0 0 0 10px ${brand.accent}">
    <span style="color:#fff;font-size:${logo.mark.length > 1 ? 120 : 160}px;font-weight:700;letter-spacing:2px">${escapeHtml(logo.mark)}</span>
  </div>
  <span style="color:${brand.primary};font-size:44px;font-weight:700">${escapeHtml(logo.wordmark)}</span>
</div></body></html>`;
}

const posterHtml = `<!doctype html><html><body style="margin:0">
<div style="width:1080px;height:1350px;background:#111;color:#fff;font-family:'Helvetica Neue',Arial,sans-serif;display:flex;flex-direction:column;justify-content:space-between;padding:90px;box-sizing:border-box">
  <div style="font-size:44px;letter-spacing:6px;color:#C8102E;font-weight:700">BARBERÍA EL BIGOTE</div>
  <div>
    <div style="font-size:150px;font-weight:800;line-height:0.95">CORTE<br>+ BARBA</div>
    <div style="margin-top:40px;display:inline-block;background:#C8102E;padding:20px 44px;border-radius:16px;font-size:170px;font-weight:800">$199</div>
  </div>
  <div style="font-size:46px;line-height:1.4">Todo octubre, de martes a domingo.<br>Sin cita o reserva por WhatsApp.<br><span style="color:#bbb">Av. Patria 1200, Zapopan</span></div>
</div></body></html>`;

function documentPage(
  accent: string,
  title: string,
  body: string,
  footer: string,
): string {
  return `<!doctype html><html><body style="margin:0">
<div style="width:1240px;height:1754px;background:#fffdf8;font-family:Georgia,serif;color:#2b2420;padding:130px 120px;box-sizing:border-box;position:relative">
  <div style="height:14px;width:180px;background:${accent};margin-bottom:60px"></div>
  <h1 style="font-size:84px;margin:0 0 50px">${title}</h1>
  <div style="font-size:40px;line-height:1.6">${body}</div>
  <div style="position:absolute;bottom:100px;left:120px;right:120px;border-top:2px solid #ddd;padding-top:30px;font-size:30px;color:#777">${footer}</div>
</div></body></html>`;
}

const hotelPages = [
  documentPage(
    "#5E3A6E",
    "Bienvenida a Casa Jacaranda",
    "<p>Gracias por hospedarte con nosotros.</p><p><b>Entrada:</b> 15:00 h<br><b>Salida:</b> 12:00 h</p><p><b>Wifi:</b> CasaJacaranda<br><b>Clave:</b> oaxaca2026</p><p>Recepción abierta las 24 horas. Marca 0 desde tu habitación.</p>",
    "Casa Jacaranda · Guía del huésped · 1",
  ),
  documentPage(
    "#5E3A6E",
    "Desayuno y alberca",
    "<p><b>Desayuno:</b> de 8:00 a 11:00 h en la terraza. Incluido en tu tarifa.</p><p><b>Alberca:</b> de 9:00 a 21:00 h.</p><ul><li>Regaderazo antes de entrar.</li><li>Niños siempre con un adulto.</li><li>Sin vasos de vidrio.</li><li>Toallas en la recepción.</li></ul>",
    "Casa Jacaranda · Guía del huésped · 2",
  ),
  documentPage(
    "#5E3A6E",
    "Oaxaca cerca de ti",
    "<p><b>Santo Domingo:</b> 5 minutos caminando.</p><p><b>Mercado 20 de Noviembre:</b> 10 minutos caminando.</p><p><b>Monte Albán:</b> 25 minutos en auto. Te pedimos taxi en la recepción.</p><p>¿Algo más? Escríbenos por WhatsApp al 951 123 4567.</p>",
    "Casa Jacaranda · Guía del huésped · 3",
  ),
];

const tallerPages = [
  documentPage(
    "#A0522D",
    "Talleres de octubre",
    "<table style='width:100%;border-collapse:collapse;font-size:36px'><tr style='text-align:left;border-bottom:2px solid #A0522D'><th>Fecha</th><th>Taller</th><th>Precio</th></tr><tr><td>Sáb 4</td><td>Torno para principiantes</td><td>$850</td></tr><tr><td>Dom 5</td><td>Tazas a mano</td><td>$650</td></tr><tr><td>Sáb 11</td><td>Esmaltes de colores</td><td>$700</td></tr><tr><td>Sáb 18</td><td>Torno para principiantes</td><td>$850</td></tr><tr><td>Sáb 25</td><td>Calaveritas de barro</td><td>$550</td></tr></table>",
    "Taller Barro · Coyoacán · 1",
  ),
  documentPage(
    "#A0522D",
    "Cómo apartar tu lugar",
    "<p>Cupo de 8 personas por taller.</p><p>Aparta con el 50% por transferencia y manda tu comprobante por WhatsApp al 55 1234 5678.</p><p>Incluye barro, herramientas, horneado y tu pieza lista en dos semanas.</p><p>Horario: de 11:00 a 14:00 h.</p>",
    "Taller Barro · Coyoacán · 2",
  ),
];

type Shot = { file: string; html: string; width: number; height: number };

/** Draws every missing asset; returns `{ key: absolutePath }` for all of
 * them (keys: `logo-<caseId>`, `barberia-poster`, `hotel-page-N`,
 * `taller-page-N`). */
export async function ensureAssets(): Promise<Record<string, string>> {
  fs.mkdirSync(assetsDir, { recursive: true });
  const shots: (Shot & { key: string })[] = [
    ...evalCases.map((item) => ({
      key: `logo-${item.id}`,
      file: `logo-${item.id}.png`,
      html: logoHtml(item),
      width: 512,
      height: 512,
    })),
    {
      key: "barberia-poster",
      file: "barberia-poster.png",
      html: posterHtml,
      width: 1080,
      height: 1350,
    },
    ...hotelPages.map((html, index) => ({
      key: `hotel-page-${index + 1}`,
      file: `hotel-page-${index + 1}.png`,
      html,
      width: 1240,
      height: 1754,
    })),
    ...tallerPages.map((html, index) => ({
      key: `taller-page-${index + 1}`,
      file: `taller-page-${index + 1}.png`,
      html,
      width: 1240,
      height: 1754,
    })),
  ];

  const missing = shots.filter(
    (shot) => !fs.existsSync(path.join(assetsDir, shot.file)),
  );
  if (missing.length > 0) {
    const { chromium } = createRequire(
      path.join(repoRoot, "scripts/video/package.json"),
    )("playwright-core");
    const browser = await chromium.launch({
      channel: "chrome",
      headless: true,
    });
    try {
      for (const shot of missing) {
        const page = await browser.newPage({
          viewport: { width: shot.width, height: shot.height },
        });
        await page.setContent(shot.html);
        await page.screenshot({
          path: path.join(assetsDir, shot.file),
          omitBackground: shot.key.startsWith("logo-"),
        });
        await page.close();
      }
    } finally {
      await browser.close();
    }
  }

  return Object.fromEntries(
    shots.map((shot) => [shot.key, path.join(assetsDir, shot.file)]),
  );
}
