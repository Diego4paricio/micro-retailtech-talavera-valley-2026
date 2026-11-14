// Simulated customers for the "day to day" sessions: opens each persona's
// published Touchpoints a number of times from fresh phone browsers, as if
// people scanned the QR, so Analítica has something to show when the persona
// comes back. Only touches the study's own accounts (cuentas.json).
//
//   node scripts/research/usuarios-simulados/visitas.mjs <persona> [visitas=40]
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgres, readEnv } from "../../video/lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../video/lib.mjs"))("playwright-core");
const [key, countArg = "40"] = process.argv.slice(2);
const total = Number(countArg);
const accounts = JSON.parse(fs.readFileSync(path.join(here, ".out/cuentas.json"), "utf8"));
const email = accounts[key]?.email;
if (!email) throw new Error(`Sin cuenta para ${key}`);
const env = readEnv();
const sql = postgres()(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
const touchpoints = await sql`
  select t.public_id, t.operational_name as name
  from kardo_core.touchpoints t
  join kardo_core.workspace_memberships m on m.workspace_id = t.workspace_id and m.role = 'owner'
  join kardo_core.profiles p on p.id = m.profile_id
  where lower(p.email) = lower(${email}) and t.retired_at is null`;
await sql.end();
if (!touchpoints.length) throw new Error(`${key} no tiene touchpoints`);
const resolver = env.TAP_RESOLVER_URL;
const agents = [
  "Mozilla/5.0 (Linux; Android 14; SM-A145M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36",
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  "Mozilla/5.0 (Linux; Android 13; moto g84) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36",
];
const browser = await chromium.launch({ channel: "chrome", headless: true });
let ok = 0;
for (let i = 0; i < total; i += 1) {
  const touchpoint = touchpoints[i % touchpoints.length];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: agents[i % agents.length],
    locale: "es-MX",
  });
  const page = await context.newPage();
  const source = i % 5 === 4 ? "link" : "qr";
  const response = await page
    .goto(`${resolver}/t/${touchpoint.public_id}?src=${source}`, { waitUntil: "domcontentloaded", timeout: 20_000 })
    .catch(() => null);
  if (response?.ok()) ok += 1;
  await page.mouse.wheel(0, 500).catch(() => undefined);
  await page.waitForTimeout(800);
  // About one in four taps a button (WhatsApp, links), like a real visit.
  if (i % 4 === 1) {
    const link = page.locator("a.kd-btn, a[href*='/go/']").first();
    if (await link.count()) await link.click({ timeout: 3000, noWaitAfter: true }).catch(() => undefined);
    await page.waitForTimeout(600);
  }
  await context.close();
}
await browser.close();
console.log(`${key}: ${ok} de ${total} visitas respondieron (${touchpoints.map((t) => t.name).join(", ")})`);
