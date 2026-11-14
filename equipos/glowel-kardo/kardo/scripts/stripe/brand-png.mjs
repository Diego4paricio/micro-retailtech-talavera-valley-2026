// Rasterizes the Kardo logo and icon (Docs/Marca/*.svg) to PNG for Stripe
// Checkout's `branding_settings` (Files API, purposes business_logo and
// business_icon). Uses the installed Google Chrome through playwright-core
// (installed under scripts/video, see its README). Output: Docs/Marca/png/.
//
//   node scripts/stripe/brand-png.mjs
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "scripts/video/lib.mjs"));
const { chromium } = require("playwright-core");

const out = path.join(root, "Docs/Marca/png");
fs.mkdirSync(out, { recursive: true });

const svg = (name) => fs.readFileSync(path.join(root, "Docs/Marca", name), "utf8");

// The wordmark uses the system font (as the SVG says); Chrome on macOS draws
// it with SF Pro, like the site and the panel.
const jobs = [
  {
    file: "kardo-logo.png",
    width: 868,
    height: 272,
    html: `<div style="width:868px;height:272px;display:flex;align-items:center;justify-content:center">${svg("kardo-logo.svg").replace("<svg ", '<svg width="868" height="272" ')}</div>`,
  },
  {
    // Square, with room around the symbol so it survives a round crop.
    file: "kardo-icono.png",
    width: 512,
    height: 512,
    html: `<div style="width:512px;height:512px;display:flex;align-items:center;justify-content:center;background:#f7f5f0;border-radius:0">${svg("kardo-icono.svg").replace("<svg ", '<svg width="340" height="296" ')}</div>`,
  },
];

const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  for (const job of jobs) {
    const page = await browser.newPage({
      viewport: { width: job.width, height: job.height },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent">${job.html}</body></html>`,
    );
    await page.screenshot({
      path: path.join(out, job.file),
      omitBackground: job.file === "kardo-logo.png",
      clip: { x: 0, y: 0, width: job.width, height: job.height },
    });
    await page.close();
    const bytes = fs.statSync(path.join(out, job.file)).size;
    console.log(`${job.file}: ${job.width}x${job.height}, ${Math.round(bytes / 1024)} KB`);
  }
} finally {
  await browser.close();
}
