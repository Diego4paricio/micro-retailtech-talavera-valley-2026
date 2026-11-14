// Simulated customers who fill in a persona's published form, so Leads has
// fresh requests when the persona comes back "days later" (relevo 35 §4).
// Each one opens the page from a new phone, like scanning the QR, and sends
// the form. Emails go to Resend's test inbox; Kardo never writes to them.
//
//   node scripts/research/usuarios-simulados/prospectos.mjs <persona> "<Nombre>|<teléfono>|<mensaje>" […]
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgres, readEnv } from "../../video/lib.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../video/lib.mjs"))("playwright-core");
const [key, ...people] = process.argv.slice(2);
const accounts = JSON.parse(fs.readFileSync(path.join(here, ".out/cuentas.json"), "utf8"));
const email = accounts[key]?.email;
if (!email || !people.length) throw new Error("Uso: prospectos.mjs <persona> \"Nombre|teléfono|mensaje\" …");
const env = readEnv();
const sql = postgres()(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
// Touchpoints of the persona that show a published Formulario.
const forms = await sql`
  select distinct t.public_id, t.operational_name as name
  from kardo_core.touchpoints t
  join kardo_core.workspace_memberships m on m.workspace_id = t.workspace_id and m.role = 'owner'
  join kardo_core.profiles p on p.id = m.profile_id
  join kardo_core.publications pb on pb.touchpoint_id = t.id and pb.status = 'published'
  join kardo_core.experience_versions v on v.id = pb.experience_version_id
  join kardo_core.experiences e on e.id = v.experience_id
  where lower(p.email) = lower(${email}) and t.retired_at is null and e.type = 'form'`;
await sql.end();
if (!forms.length) throw new Error(`${key} no tiene un formulario publicado`);
const browser = await chromium.launch({ channel: "chrome", headless: true });
let sent = 0;
for (const [index, person] of people.entries()) {
  const [name, phone, message] = person.split("|");
  const touchpoint = forms[index % forms.length];
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    locale: "es-MX",
  });
  const page = await context.newPage();
  await page.goto(`${env.TAP_RESOLVER_URL}/t/${touchpoint.public_id}?src=qr`, { waitUntil: "domcontentloaded" });
  const form = page.locator("form.kd-form").first();
  const slug = name.normalize("NFD").replace(/[^A-Za-z]/g, "").toLowerCase();
  await form.locator('input[name="email"]').fill(`delivered+kardo-sim-${key}-${slug}@resend.dev`);
  if (await form.locator('input[name="name"]').count()) await form.locator('input[name="name"]').fill(name);
  if (phone && (await form.locator('input[name="phone"]').count())) await form.locator('input[name="phone"]').fill(phone);
  if (message && (await form.locator('textarea[name="message"]').count())) await form.locator('textarea[name="message"]').fill(message);
  await form.locator('input[name="consent"]').check();
  await Promise.all([page.waitForLoadState("domcontentloaded"), form.locator("button[type=submit]").click()]);
  await page.waitForTimeout(1500);
  const text = (await page.locator("body").innerText()).slice(0, 80).replace(/\s+/g, " ");
  if (!/no pudimos|error|demasiados/i.test(text)) sent += 1;
  console.log(`${name} → ${touchpoint.name}: ${text}`);
  await context.close();
}
await browser.close();
console.log(`${key}: ${sent} de ${people.length} solicitudes enviadas`);
