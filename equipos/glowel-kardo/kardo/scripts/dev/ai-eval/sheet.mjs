// Kardo AI test bench: a contact sheet of a round's phone screenshots, the
// first screen of each (390 x 844, what a person sees right after scanning),
// labeled with the case key, to compare a whole round at a glance.
//
//   node scripts/dev/ai-eval/sheet.mjs <round> [--columns=6]
// writes scripts/dev/ai-eval/out/<round>/sheet.png

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const round = process.argv[2];
if (!round) {
  console.error(
    "usage: node scripts/dev/ai-eval/sheet.mjs <round> [--columns=6]",
  );
  process.exit(1);
}
const columns = Number(
  process.argv.find((value) => value.startsWith("--columns="))?.slice(10) ?? 6,
);
const shots = path.join(here, "out", round, "shots");
const files = fs
  .readdirSync(shots)
  .filter((file) => file.endsWith("-phone.png"))
  .sort();

const cells = files
  .map((file) => {
    const label = file.replace("-phone.png", "");
    return `<figure><div class="frame"><img src="${pathToFileURL(path.join(shots, file)).href}"></div><figcaption>${label}</figcaption></figure>`;
  })
  .join("");
const html = `<!doctype html><html><body style="margin:0;padding:12px;background:#e9e9e9;font:600 15px system-ui,sans-serif;display:grid;grid-template-columns:repeat(${columns},390px);gap:14px;width:${columns * 404}px">${cells}<style>figure{margin:0}.frame{width:390px;height:844px;overflow:hidden;background:#fff;border-radius:10px}.frame img{width:390px;display:block}figcaption{padding:6px 2px}</style></body></html>`;
const htmlPath = path.join(here, "out", round, "sheet.html");
fs.writeFileSync(htmlPath, html);

const { chromium } = createRequire(
  path.join(root, "scripts/video/package.json"),
)("playwright-core");
const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({
  viewport: { width: columns * 404 + 24, height: 900 },
});
await page.goto(pathToFileURL(htmlPath).href);
await page.waitForTimeout(300);
const out = path.join(here, "out", round, "sheet.png");
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
