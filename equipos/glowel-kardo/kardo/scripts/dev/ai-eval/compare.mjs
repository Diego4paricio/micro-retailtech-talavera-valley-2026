// Kardo AI test bench: side by side first screens of the same cases across
// rounds (one row per case, one column per round), for the report.
//
//   node scripts/dev/ai-eval/compare.mjs --rounds=base-sonnet,final-haiku,final-sonnet \
//     --cases=floreria-links.design,fonda-menu.design --name=antes-despues
// writes scripts/dev/ai-eval/out/compare-<name>.png

import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const option = (name) =>
  process.argv
    .find((value) => value.startsWith(`--${name}=`))
    ?.slice(name.length + 3);
const rounds = option("rounds")?.split(",") ?? [];
const cases = option("cases")?.split(",") ?? [];
const name = option("name") ?? "comparativa";
if (!rounds.length || !cases.length) {
  console.error(
    "usage: node scripts/dev/ai-eval/compare.mjs --rounds=a,b --cases=x,y [--name=n]",
  );
  process.exit(1);
}

const header = rounds.map((round) => `<div class="h">${round}</div>`).join("");
const rows = cases
  .map((key) =>
    rounds
      .map((round) => {
        const file = path.join(here, "out", round, "shots", `${key}-phone.png`);
        return fs.existsSync(file)
          ? `<figure><div class="f"><img src="${pathToFileURL(file).href}"></div><figcaption>${key}</figcaption></figure>`
          : `<figure><div class="f empty">Sin captura (falló)</div><figcaption>${key}</figcaption></figure>`;
      })
      .join(""),
  )
  .join("");
const columns = rounds.length;
const html = `<!doctype html><html><body style="margin:0;padding:12px;background:#e9e9e9;font:600 15px system-ui,sans-serif;display:grid;grid-template-columns:repeat(${columns},390px);gap:14px;width:${columns * 404}px">${header}${rows}<style>.h{font-size:20px;padding:4px 2px}figure{margin:0}.f{width:390px;height:844px;overflow:hidden;background:#fff;border-radius:10px}.f img{width:390px;display:block}.empty{display:flex;align-items:center;justify-content:center;color:#a33}figcaption{padding:6px 2px;font-weight:500}</style></body></html>`;
const htmlPath = path.join(here, "out", `compare-${name}.html`);
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
const out = path.join(here, "out", `compare-${name}.png`);
await page.screenshot({ path: out, fullPage: true });
await browser.close();
console.log(out);
