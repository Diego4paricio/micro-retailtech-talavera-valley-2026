// Video 3 (relevo 20, T5), take 2 with the owner's changes of 2026-10-01:
// new prices, the personal-or-business question, Stripe's hosted Checkout
// and the AI caps in dollars. Then the invoice generated
// (Stripe receipt and CFDI), the branded portal, the renewal reminder and a
// failed payment on a Stripe test clock, the real deletion at 90 days, and
// people who join by invitation. Time jumps are simulated in the database or
// on the Stripe test clock and labeled on screen.
//
//   node scripts/video/accounts.mjs owner guest
//   node scripts/video/round2-tour.mjs
//
// Local stack (scripts/video/README.md): Customer API 3011 with
// BILLING_RESOLVER_URL=http://localhost:8787, BILLING_COMMAND_KEY (local) and
// BILLING_DELETE_ENABLED=true (this copy only, kardo-dev); Staff API 3012;
// panel 5185; Operations 5186; site 5177; the Resolver from
// `node scripts/video/resolver-local.mjs <keys>`; and
// `node scripts/stripe/listen.mjs --port=3011`. Stripe test mode only.
// With FACTURAPI_KEY (sk_test_) the CFDI is issued with Facturapi; without
// it, Operations captures a test folio (phase 1).
import { execFileSync } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { chromium } from "playwright-core";
import {
  createNarrator,
  finishVideo,
  log,
  offCameraSession,
  outDir,
  postgres,
  readAccounts,
  readEnv,
  recordingContext,
  root,
  sleep,
  totp,
  writeAccounts,
} from "./lib.mjs";

const SITE = process.env.VIDEO_SITE ?? "http://localhost:5177";
const PANEL = process.env.VIDEO_PANEL ?? "http://localhost:5185";
const OPS = process.env.VIDEO_OPS ?? "http://localhost:5186";
const API = process.env.VIDEO_API ?? "http://localhost:3011";
const RESOLVER = process.env.VIDEO_RESOLVER ?? "http://127.0.0.1:8787";
const BUSINESS = process.env.VIDEO_BUSINESS ?? "Cafetería Aurora";
const CLOCK_BUSINESS = "Taller Reloj";
const NAME = "facturacion-ronda-2";
const TOTAL = 30;
// Rehearsal only: VIDEO_FROM=clock skips scenes 1 to 4 and VIDEO_FROM=invite
// also the clock (the owner of the last take must already have its
// business). The take is always complete.
const FROM = process.env.VIDEO_FROM ?? "start";

const env = readEnv();
if (!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? ""))
  throw new Error("Hace falta una llave de PRUEBA de Stripe.");
const facturapi = /^sk_test_/.test(env.FACTURAPI_KEY ?? "");
const accounts = readAccounts();
const { owner, guest } = accounts;
if (!owner || !guest)
  throw new Error("Primero: node scripts/video/accounts.mjs owner guest");

const requireBilling = createRequire(
  path.join(root, "packages/billing/package.json"),
);
const Stripe = requireBilling("stripe");
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-08-26.dahlia",
});
// Transaction pooler (6543): the session pooler (5432) is shared with every
// local API and runs out of clients, which stalled the take.
const sql = postgres()(
  env.SUPABASE_ADMIN_DATABASE_URL.replace(":5432/", ":6543/"),
  {
    max: 1,
    prepare: false,
    onnotice: () => {},
  },
);
const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const DAY = 86_400;

const dateMx = (date) =>
  date.toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

/**
 * The hourly job of the Customer API copy. Deletion is on in this copy, so
 * first it checks that only the video's own test organization (if any) is
 * due: any other due organization of kardo-dev stops the take.
 */
async function tick(allowDeletionOf = null) {
  const due = await sql`
    select w.id, w.name from kardo_core.workspaces w
    cross join lateral kardo_billing.resolve_workspace_access(w.id) a
    where w.deleted_at is null and a.state = 'paused' and a.delete_at <= now()`;
  const foreign = due.filter((row) => row.id !== allowDeletionOf);
  if (foreign.length > 0)
    throw new Error(
      `Otra organización vencería para borrarse (${foreign.map((row) => row.name).join(", ")}): no se corre la tarea.`,
    );
  const response = await fetch(`${API}/internal/billing/tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.BILLING_CRON_KEY}` },
  });
  const body = await response.json().catch(() => ({}));
  log(`tick ${response.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

/** SIMULADO: moves the trial so that today is day `day` of 15. */
async function trialDay(workspaceId, day) {
  await sql`
    update kardo_billing.trials set
      started_at = now() - make_interval(days => ${day}) - interval '5 minutes',
      ends_at = now() - make_interval(days => ${day}) - interval '5 minutes' + interval '15 days'
    where workspace_id = ${workspaceId}`;
}

/** SIMULADO: the subscription of the clock organization ended `days` ago.
 * Stripe's clock dates are in the future, and the webhooks of a clock
 * advance arrive in bursts that write them back: it repeats until the
 * simulated date holds on two reads in a row. */
async function endedDaysAgo(workspaceId, days) {
  let steady = 0;
  for (let attempt = 0; attempt < 20 && steady < 2; attempt += 1) {
    await sql`
      update kardo_billing.subscriptions set
        ended_at = now() - make_interval(days => ${days}) - interval '5 minutes',
        canceled_at = now() - make_interval(days => ${days}) - interval '5 minutes'
      where workspace_id = ${workspaceId} and status = 'canceled'`;
    await sleep(3000);
    const [access] = await sql`
      select lapsed_at from kardo_billing.resolve_workspace_access(${workspaceId})`;
    const lapsedDays = access?.lapsed_at
      ? (Date.now() - new Date(access.lapsed_at).getTime()) / 86_400_000
      : null;
    steady =
      lapsedDays !== null && Math.abs(lapsedDays - days) < 0.5 ? steady + 1 : 0;
    if (steady === 0)
      log(
        `fin simulado todavía no queda (${lapsedDays?.toFixed(2)}); se repite`,
      );
  }
  if (steady < 2) throw new Error("La fecha de fin simulada no se sostuvo.");
}

async function waitFor(label, read, seconds = 90) {
  for (let elapsed = 0; elapsed < seconds; elapsed += 2) {
    const value = await read().catch(() => null);
    if (value) return value;
    await sleep(2000);
  }
  log(`(no llegó a tiempo: ${label})`);
  return null;
}

async function advanceClock(clockId, to) {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: to });
  await waitFor(
    "reloj de prueba",
    async () =>
      (await stripe.testHelpers.testClocks.retrieve(clockId)).status ===
      "ready",
    180,
  );
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const ownerSession = await offCameraSession(browser, PANEL, owner);
const guestSession = await offCameraSession(browser, PANEL, guest);
const { context, dir } = await recordingContext(browser, NAME);
const page = await context.newPage();
// The video starts with the page; waits on Stripe's clock are cut when
// encoding (the clock on screen shows the jump).
const videoStart = Date.now();
const cuts = [];
async function offRecord(work) {
  const from = (Date.now() - videoStart) / 1000 + 1.5;
  const result = await work();
  const to = (Date.now() - videoStart) / 1000 - 0.5;
  if (to - from > 2) cuts.push([from, to]);
  return result;
}
page.setDefaultTimeout(25_000);
page.on("pageerror", (error) => log(`pageerror ${error.message}`));
const { say, unmark, wheel, slide, repaint } = createNarrator(page, TOTAL);

async function seen(locator, timeout = 20_000) {
  try {
    await locator.waitFor({ timeout });
    return true;
  } catch {
    log("no apareció a tiempo");
    return false;
  }
}

async function opsLogin() {
  await page.goto(`${OPS}/`);
  await page.getByLabel("Correo de trabajo").waitFor({ timeout: 30_000 });
  await page
    .getByLabel("Correo de trabajo")
    .pressSequentially(env.E2E_STAFF_EMAIL, { delay: 15 });
  await page
    .getByLabel("Contraseña")
    .pressSequentially(env.E2E_STAFF_PASSWORD, { delay: 8 });
  await page.keyboard.press("Enter");
  await page.getByLabel("Código de 6 dígitos").waitFor({ timeout: 20_000 });
  await page
    .getByLabel("Código de 6 dígitos")
    .pressSequentially(totp(env.E2E_STAFF_TOTP_SECRET), { delay: 40 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3500);
}

async function settleOps() {
  await page.waitForTimeout(800);
  await page
    .getByText(/Verificando tu sesión/)
    .first()
    .waitFor({ state: "detached", timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(600);
}

async function ops(pathname, text) {
  await unmark();
  await page.goto(`${OPS}${pathname}`);
  await settleOps();
  await seen(page.getByText(text).first(), 60_000);
  await page.waitForTimeout(1200);
}

async function opsNotices(workspaceId) {
  await ops(`/billing/workspaces/${workspaceId}`, "Avisos al cliente");
  const notices = page.getByText("Avisos al cliente").first();
  await notices.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, -90);
  await sleep(600);
  await repaint();
}

async function panel(pathname) {
  await unmark();
  await page.goto(`${PANEL}${pathname}`);
  await page.waitForTimeout(2500);
}

const banner = () => page.locator(".access-strip").first();

/** Signs in the panel as an account (the email code is skipped, as in
 * video 2). Storage belongs to the panel origin, so it goes there first. */
async function signIn(session, extra = {}, workspaceId = null) {
  if (!page.url().startsWith(PANEL)) {
    await page.goto(`${PANEL}/`);
    await page.waitForTimeout(800);
  }
  if (workspaceId)
    await page.evaluate(
      (id) => localStorage.setItem("kardo.workspace", id),
      workspaceId,
    );
  await page.evaluate(
    ([entries, more]) => {
      for (const [key, value] of Object.entries(entries))
        localStorage.setItem(key, value);
      localStorage.setItem(
        "kardo.pendingTermsAcceptance",
        JSON.stringify({ terms: "1.0", privacy: "1.0" }),
      );
      for (const [key, value] of Object.entries(more))
        sessionStorage.setItem(key, value);
    },
    [session, extra],
  );
}

async function acceptTermsGate() {
  const gate = page.getByRole("heading", { name: "Antes de continuar" });
  if (await gate.isVisible().catch(() => false)) {
    await page.getByLabel(/Acepto los Términos/).check();
    await page.getByRole("button", { name: "Aceptar y continuar" }).click();
    await page.waitForTimeout(1500);
  }
}

async function choosePassword(account) {
  await page
    .getByLabel("Contraseña", { exact: true })
    .waitFor({ timeout: 25_000 });
  const password = `Vid-${randomBytes(15).toString("base64url")}!7`;
  account.password = password;
  writeAccounts(accounts);
  await page
    .getByLabel("Contraseña", { exact: true })
    .pressSequentially(password, { delay: 8 });
  await page
    .getByLabel("Confirmar contraseña")
    .pressSequentially(password, { delay: 8 });
  await page.keyboard.press("Enter");
}

/** Renders the first page of a PDF as an image slide (macOS `sips`). */
async function showPdf(file, title, note) {
  const png = `${file}.png`;
  execFileSync("sips", ["-s", "format", "png", file, "--out", png], {
    stdio: "ignore",
  });
  const data = fs.readFileSync(png).toString("base64");
  await slide(
    `<h2>${title}</h2><p>${note}</p>
    <div style="background:#fff;border-radius:14px;padding:10px;max-height:640px;overflow:hidden;text-align:center">
      <img src="data:image/png;base64,${data}" style="max-width:100%;max-height:620px"/></div>`,
    9000,
  );
}

async function showXml(file, title) {
  const text = fs
    .readFileSync(file, "utf8")
    .replace(/></g, ">\n<")
    .split("\n")
    .slice(0, 26)
    .join("\n")
    .replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]);
  await slide(
    `<h2>${title}</h2><pre style="background:#0d161d;border:1px solid #2a3d49;border-radius:14px;padding:16px;color:#cfe3e1;font-size:12.5px;line-height:1.45;white-space:pre-wrap;max-height:640px;overflow:hidden">${text}</pre>`,
    8000,
  );
}

let clock = null;
let clockWorkspace = null;
let clockPublicId = null;

try {
  // ---------------------------------------------------------------------------
  await slide(
    `<p class="k" style="font-weight:700;letter-spacing:.12em;font-size:15px">KARDO · VIDEO 3</p>
    <h1>Contratar en la página de Stripe, la factura generada y el ciclo completo</h1>
    <p>Grabado el ${dateMx(new Date())}. Stripe en <b>modo prueba</b>${facturapi ? " y Facturapi en <b>modo prueba</b>" : ""}: ningún cobro ni factura es real. Los saltos de tiempo se simulan y se marcan en pantalla; las esperas del reloj de Stripe se recortaron (la hora real de la esquina lo muestra).</p>
    <p style="margin-top:22px"><span class="tag hoy">YA FUNCIONA</span><span class="tag sim">TIEMPO SIMULADO</span><span class="tag" style="background:#4ec3ce;color:#16232e">PRUEBA</span><span class="tag pen">PENDIENTE</span></p>`,
    7000,
  );
  await slide(
    `<h2>Qué vas a ver</h2>
    <div class="lanes">
      <div class="lane"><h3>Contratar y facturar</h3><div class="row">
        <div class="ev"><b>Precios</b>$199 / $379 / $699 al mes; el anual dice cuánto ahorra cada plan.</div>
        <div class="ev"><b>Alta</b>Primero: ¿personal o negocio? Nace como organización, con 15 días de prueba.</div>
        <div class="ev"><b>Pago</b>En la página de Stripe con la marca Kardo, con "Necesito factura".</div>
        <div class="ev"><b>Factura</b>Recibo de Stripe y CFDI${facturapi ? " generado con Facturapi" : " con folio de prueba"}.</div>
        <div class="ev"><b>Portal</b>Cambiar tarjeta, cambiar de plan y cancelar.</div></div></div>
      <div class="lane"><h3>Cobro recurrente (reloj de prueba de Stripe)</h3><div class="row">
        <div class="ev"><b>7 días antes</b>Aviso de renovación.</div>
        <div class="ev"><b>Pago fallido</b>Reintentos por 2 semanas y cancelación.</div>
        <div class="ev"><b>Gracia y pausa</b>Las páginas se pausan sin mencionar pagos.</div>
        <div class="ev"><b>Día 90</b>Borrado real: la página responde 410 y las facturas se conservan.</div></div></div>
      <div class="lane"><h3>Equipo</h3><div class="row">
        <div class="ev"><b>Invitación</b>Entra directo a la organización, sin pasos que no le tocan.</div>
        <div class="ev"><b>Su propio negocio</b>Con su propia prueba, si la quiere.</div></div></div>
    </div>`,
    12000,
  );

  if (FROM === "start") {
    // 1. Pricing page and sign up: the business is born as an organization.
    await page.goto(`${SITE}/precios/`);
    await page.waitForTimeout(1800);
    await say(
      1,
      "HOY",
      "Sitio público: /precios/",
      "La prueba de 15 días no pide tarjeta. Empezamos con Profesional.",
      5000,
    );
    await wheel(620);
    await say(
      1,
      "HOY",
      "Precios nuevos",
      "$199, $379 y $699 al mes, con IVA incluido.",
      5000,
    );
    await page.getByText("Anual", { exact: true }).first().click();
    await page.waitForTimeout(800);
    await say(
      1,
      "HOY",
      "Pago anual",
      "Cada plan dice cuánto ahorra: 2 meses en Profesional y Negocio, $198 en Esencial.",
      6500,
      page.getByText(/ahorras hasta/).first(),
    );
    await page.getByText("Mensual", { exact: true }).first().click();
    await page.waitForTimeout(600);
    const start = page.getByRole("link", { name: /Empieza gratis/ }).nth(1);
    await say(
      1,
      "HOY",
      "Empieza 15 días gratis",
      "Profesional, pago mensual.",
      4000,
      start,
    );
    await start.click();
    await page.waitForURL(new RegExp(escapeRegExp(PANEL)));
    await page.waitForTimeout(1500);
    await page
      .getByLabel("Correo electrónico")
      .pressSequentially(owner.email, { delay: 18 });
    await page.locator("#accept-terms").check();
    await say(
      2,
      "PRUEBA",
      "Registro",
      "Kardo manda un código por correo. Para no enviar correos reales, el video sigue con la cuenta ya verificada.",
      5000,
      page.locator("label.legal-check"),
    );
    await signIn(ownerSession, { "kardo.registration-stage": "password" });
    await page.goto(`${PANEL}/`);
    await choosePassword(owner);
    // First question of the sign up (2026-10-01): personal or business.
    await page.locator("#account-business").waitFor({ timeout: 25_000 });
    await page.waitForTimeout(800);
    await say(
      2,
      "HOY",
      "Primera pregunta: ¿personal o negocio?",
      "Se guarda con la cuenta. Con las dos puede invitar a quien le ayude.",
      6000,
      page.locator(".account-type").first(),
    );
    await page.locator("#account-business").check();
    await page.locator("#business-name").waitFor({ timeout: 25_000 });
    await page
      .locator("#business-name")
      .pressSequentially(BUSINESS, { delay: 30 });
    if ((await page.locator("#business-type option").count()) > 1)
      await page.locator("#business-type").selectOption({ index: 2 });
    await say(
      2,
      "HOY",
      "Alta del negocio",
      "Nombre y giro. Al terminar empieza la prueba.",
      4500,
    );
    await page.locator("form button.button-primary").first().click();
    await page.waitForTimeout(5000);
    await acceptTermsGate();
    const [ownerSpace] = await offRecord(
      () => sql`
    select w.id from kardo_core.workspace_memberships m
    join kardo_core.workspaces w on w.id = m.workspace_id
    where m.profile_id = ${owner.id} and m.role = 'owner' and w.kind = 'organization'
    order by w.created_at limit 1`,
    );
    owner.workspaceId = ownerSpace.id;
    writeAccounts(accounts);
    await panel("/");
    await seen(banner());
    await say(
      3,
      "HOY",
      "Negocio, ya como organización",
      "El selector dice Negocio. Puede invitar a su equipo con el mismo plan; la franja cuenta los días de prueba.",
      7000,
      page.locator(".workspace-switcher").first(),
    );

    // 2. SIMULADO day 15: pay inside the panel, with the CFDI box.
    await offRecord(async () => {
      await trialDay(owner.workspaceId, 15);
      await tick();
    });
    await panel("/");
    await seen(banner());
    await say(
      4,
      "SIMULADO",
      "Día 15: terminó la prueba",
      "Panel en solo lectura y 20 % por 3 meses si contrata en 7 días.",
      6500,
      banner(),
      "Día 15 de la prueba",
    );
    await banner()
      .getByRole("link", { name: "Elegir plan" })
      .or(banner().getByRole("button", { name: "Elegir plan" }))
      .first()
      .click();
    await page.waitForURL(/\/precios\//);
    await page.waitForTimeout(1800);
    await page.getByText("Mensual", { exact: true }).first().click();
    await page.waitForTimeout(500);
    await wheel(560);
    const pickNegocio = page
      .getByRole("link", { name: "Elegir este plan" })
      .nth(2);
    await say(
      4,
      "HOY",
      "Elegir este plan: Negocio",
      "Los botones regresan al panel para contratar esta organización.",
      4500,
      pickNegocio,
      "Día 15 de la prueba",
    );
    await pickNegocio.click();
    await page.waitForURL(new RegExp(escapeRegExp(PANEL)));
    const confirmCard = page.locator(".plan-choice").first();
    await seen(confirmCard, 30_000);
    await page.waitForTimeout(1000);
    await page.locator("#plan-choice-cfdi").check();
    await page.waitForTimeout(500);
    await say(
      5,
      "HOY",
      "Necesito factura (CFDI)",
      "Marcada, pide los datos fiscales aquí mismo. Nunca la Constancia, solo los datos.",
      5500,
      page.locator(".plan-choice-invoice").first(),
      "Día 15 de la prueba",
    );
    await page
      .locator("#fiscal-rfc")
      .pressSequentially(process.env.VIDEO_RFC ?? "CAU200101AB1", {
        delay: 25,
      });
    await page
      .locator("#fiscal-name")
      .pressSequentially(process.env.VIDEO_LEGAL_NAME ?? BUSINESS, {
        delay: 20,
      });
    await page
      .locator("#fiscal-regime")
      .selectOption(process.env.VIDEO_REGIME ?? "601");
    await page
      .locator("#fiscal-postal")
      .pressSequentially(process.env.VIDEO_ZIP ?? "06700", { delay: 25 });
    await page
      .locator("#fiscal-use")
      .selectOption("G03")
      .catch(() => undefined);
    await say(
      5,
      "PRUEBA",
      "Datos fiscales de prueba",
      "RFC, razón social sin régimen societario, régimen, código postal y uso del CFDI.",
      5500,
      page.locator(".plan-choice-invoice").first(),
      "Día 15 de la prueba",
    );
    await page
      .getByRole("button", { name: "Guardar y continuar a pago" })
      .click();
    // Owner decision (2026-10-01): Stripe's hosted Checkout, with the brand
    // set up in the Stripe Dashboard.
    await page.waitForURL(/checkout\.stripe\.com/, { timeout: 60_000 });
    await page.locator("#cardNumber").waitFor({ timeout: 45_000 });
    await page.waitForTimeout(1500);
    await say(
      6,
      "HOY",
      "La página de pago de Stripe",
      "Con la marca de Kardo y el 20 % ya aplicado. La tarjeta va directo a Stripe; también acepta Apple Pay y Link.",
      8000,
      null,
      "Día 15 de la prueba",
    );
    await page
      .locator("#cardNumber")
      .pressSequentially("4242424242424242", { delay: 25 });
    await page.locator("#cardExpiry").pressSequentially("1234", { delay: 25 });
    await page.locator("#cardCvc").pressSequentially("123", { delay: 25 });
    await page
      .locator("#billingName")
      .pressSequentially(BUSINESS, { delay: 15 });
    const termsBox = page.locator("#termsOfServiceConsentCheckbox");
    if (await termsBox.isVisible().catch(() => false)) await termsBox.check();
    await say(
      6,
      "PRUEBA",
      "Tarjeta de prueba 4242",
      "No es una tarjeta real. Stripe dice cuánto se cobra hoy y cada cuándo.",
      5000,
      null,
      "Día 15 de la prueba",
    );
    await unmark();
    await page.getByTestId("hosted-payment-submit-button").click();
    await page.waitForURL(/checkout=return/, { timeout: 120_000 });
    await page.waitForTimeout(4000);
    await say(
      7,
      "HOY",
      "De regreso en el panel",
      "Vuelve con el número de la sesión: Kardo confirma con Stripe y reactiva todo al instante.",
      7000,
      page.locator(".billing-notices").first(),
      "Día 15 de la prueba",
    );

    // 3. The invoice: Stripe receipt, the CFDI request, the CFDI itself.
    const paid = await offRecord(() =>
      waitFor("factura pagada en el espejo", async () => {
        const [row] = await sql`
      select stripe_invoice_id, hosted_invoice_url, number from kardo_billing.invoices
      where workspace_id = ${owner.workspaceId} and status = 'paid'
      order by stripe_created_at desc limit 1`;
        return row ?? null;
      }),
    );
    await offRecord(() =>
      waitFor("solicitud de CFDI", async () => {
        const [row] = await sql`
      select id from kardo_billing.cfdi_requests where workspace_id = ${owner.workspaceId}
      order by requested_at desc limit 1`;
        return row ?? null;
      }),
    );
    await panel("/settings/plan");
    await seen(page.getByText("Facturas").first(), 30_000);
    const invoices = page.locator("section", { hasText: "Facturas" }).last();
    await invoices
      .evaluate((el) => el.scrollIntoView({ block: "start" }))
      .catch(() => undefined);
    await sleep(500);
    await repaint();
    await say(
      8,
      "HOY",
      "La factura del pago",
      `Recibo de Stripe${paid?.number ? ` ${paid.number}` : ""} y la solicitud de CFDI, creada sola al pagar porque marcó "Necesito factura".`,
      7500,
      invoices,
    );
    if (paid?.hosted_invoice_url) {
      await unmark();
      await page.goto(paid.hosted_invoice_url);
      await seen(page.getByText(/MXN/).first(), 30_000);
      await page.waitForTimeout(1500);
      await say(
        8,
        "PRUEBA",
        "Recibo de Stripe",
        "Monto con IVA incluido, descuento del cupón y PDF descargable. Sandbox de Stripe.",
        7000,
      );
    }
    await opsLogin();
    await ops("/billing/facturas", "Solicitudes de factura");
    // The card of this payment (never another pending one).
    if (!paid?.number) throw new Error("No llegó la factura pagada al espejo.");
    const card = page.locator(".cfdi-card", { hasText: paid.number }).first();
    if (!(await seen(card, 30_000)))
      throw new Error(`No está la solicitud del pago ${paid.number}.`);
    await say(
      9,
      "HOY",
      "Operations: facturas por emitir",
      "La solicitud llegó sola, con los datos fiscales y el enlace al pago en Stripe.",
      6500,
      card,
    );
    let cfdiFile = null;
    if (facturapi) {
      await card.getByRole("button", { name: /Emitir con Facturapi/ }).click();
      const dialog = page.getByRole("dialog").first();
      await seen(dialog);
      await say(
        9,
        "PRUEBA",
        "Emitir con Facturapi (modo prueba)",
        "Genera el XML y el PDF reales, sin timbrar ante el SAT: no tienen validez fiscal.",
        6000,
        dialog,
      );
      await dialog.getByRole("button", { name: "Emitir CFDI" }).click();
      await page.waitForTimeout(2000);
      await page
        .getByRole("button", { name: "Emitidas" })
        .first()
        .click()
        .catch(() => undefined);
      await page.waitForTimeout(2500);
      const issued = page
        .locator(".cfdi-card", { hasText: paid.number })
        .first();
      if (!(await seen(issued, 30_000)))
        throw new Error("El CFDI no aparece en Emitidas.");
      await say(
        10,
        "HOY",
        "CFDI emitido",
        "Folio fiscal (UUID), marca de prueba y descargas del PDF y el XML.",
        7000,
        issued,
      );
      const downloadPdf = page.waitForEvent("download", { timeout: 30_000 });
      await issued.getByRole("button", { name: "Descargar PDF" }).click();
      const pdf = await downloadPdf;
      cfdiFile = path.join(outDir, "cfdi-video.pdf");
      await pdf.saveAs(cfdiFile);
      const downloadXml = page.waitForEvent("download", { timeout: 30_000 });
      await issued.getByRole("button", { name: "Descargar XML" }).click();
      const xml = await downloadXml;
      const xmlFile = path.join(outDir, "cfdi-video.xml");
      await xml.saveAs(xmlFile);
      await showPdf(
        cfdiFile,
        "El CFDI generado (PDF)",
        "Facturapi en modo prueba: XML y PDF reales, sin timbre del SAT.",
      );
      await showXml(xmlFile, "El CFDI generado (XML, primeras líneas)");
    } else {
      await card.getByRole("button", { name: /Marcar emitida/ }).click();
      await page
        .getByLabel("Folio fiscal (UUID)")
        .fill(randomUUID().toUpperCase());
      await say(
        10,
        "PRUEBA",
        "Folio fiscal de prueba",
        "Sin Facturapi se emite en el portal del SAT y aquí se captura el folio.",
        5500,
        page.getByRole("dialog").first(),
      );
      await page
        .getByRole("dialog")
        .getByRole("button", { name: "Marcar emitida" })
        .click();
      await page.waitForTimeout(2500);
    }
    await panel("/settings/plan");
    await seen(page.getByText("Facturas").first(), 30_000);
    const invoices2 = page.locator("section", { hasText: "Facturas" }).last();
    await invoices2
      .evaluate((el) => el.scrollIntoView({ block: "start" }))
      .catch(() => undefined);
    if (
      facturapi &&
      !(await seen(
        invoices2.getByRole("button", { name: "Descargar PDF" }).first(),
        30_000,
      ))
    )
      throw new Error("El panel no muestra el CFDI emitido.");
    await sleep(500);
    await repaint();
    await say(
      11,
      "HOY",
      "En el panel: factura emitida",
      facturapi
        ? "El cliente descarga su CFDI (PDF y XML) desde Configuración, Plan."
        : "El cliente ve su factura emitida con el folio fiscal.",
      7000,
      invoices2,
    );
    await opsNotices(owner.workspaceId);
    await say(
      11,
      "HOY",
      "Avisos con hora",
      "Contratación y CFDI emitido: cada correo con fecha, hora y destinatario.",
      6500,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await sleep(500);
    await repaint();
    await say(
      11,
      "HOY",
      "Cuenta de negocio",
      "Lo que eligió en el alta queda guardado y Operations lo ve.",
      5000,
      page.getByText(/Cuenta de negocio/).first(),
    );
    await ops("/planes", "Esencial");
    // The plan list also has test plans (Beta, E2E…): point at Esencial's
    // card, with Profesional and Negocio next to it.
    const esencialCard = page
      .locator("article.plan-card")
      .filter({
        has: page.getByRole("heading", { name: "Esencial", exact: true }),
      })
      .first();
    const aiCap = esencialCard
      .locator("li")
      .filter({ hasText: "Gasto en IA al mes" })
      .first();
    await esencialCard
      .evaluate((el) => el.scrollIntoView({ block: "start" }))
      .catch(() => undefined);
    await page.mouse.move(900, 450);
    await page.mouse.wheel(0, -90);
    await sleep(500);
    await repaint();
    await say(
      11,
      "HOY",
      "Topes de IA en dólares",
      "Esencial US$1 (2 generaciones), Profesional US$2 y Negocio US$4 al mes, en centavos de dólar. La IA todavía no se vende.",
      7500,
      aiCap,
    );

    // 4. The Stripe portal with the Kardo brand: card, plan change, cancel.
    await panel("/settings/plan");
    await seen(page.getByRole("button", { name: "Cambiar tarjeta" }), 30_000);
    await say(
      12,
      "HOY",
      "Portal de Stripe con la marca Kardo",
      "Para lo que mueve dinero: tarjeta, cambio de plan y cancelación. Regresa siempre al panel.",
      5500,
      page.getByRole("button", { name: "Cambiar tarjeta" }),
    );
    await page.getByRole("button", { name: "Cambiar tarjeta" }).click();
    await page.waitForURL(/billing\.stripe\.com/, { timeout: 40_000 });
    await page.waitForTimeout(3500);
    await say(
      12,
      "PRUEBA",
      "Cambiar tarjeta",
      "Página segura de Stripe con el logo y los colores de Kardo.",
      6000,
    );
    await page.goto(`${PANEL}/settings/plan`);
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Cambiar de plan" }).click();
    await page.waitForURL(/billing\.stripe\.com/, { timeout: 40_000 });
    await page.waitForTimeout(3500);
    await say(
      13,
      "PRUEBA",
      "Cambiar de plan",
      "Stripe muestra el monto prorrateado exacto antes de confirmar.",
      6000,
    );
    await page.goto(`${PANEL}/settings/plan`);
    await page.waitForTimeout(2500);
    await page.getByRole("button", { name: "Cancelar plan" }).click();
    const cancelDialog = page
      .getByRole("dialog")
      .filter({ hasText: "Cancelar plan" })
      .first();
    await seen(cancelDialog, 10_000);
    await say(
      14,
      "HOY",
      "Antes de ir a Stripe",
      "Kardo explica qué pasa: el plan sigue hasta el fin del periodo pagado y el contenido se conserva.",
      5500,
      cancelDialog,
    );
    await cancelDialog
      .getByRole("button", { name: "Continuar para cancelar" })
      .click();
    await page.waitForURL(/billing\.stripe\.com/, { timeout: 40_000 });
    await page.waitForTimeout(3500);
    // Stripe first asks why (optional); then "Cancelar suscripción" cancels at
    // the end of the paid period.
    const survey = page.getByRole("button", {
      name: "Continuar con la cancelación",
    });
    if (await seen(survey, 10_000)) {
      await say(
        14,
        "PRUEBA",
        "Primero, el motivo",
        "Stripe pregunta por qué se va; es opcional.",
        4500,
        survey,
      );
      await unmark();
      await survey.click();
      await page.waitForTimeout(1500);
    }
    const confirmCancel = page.getByRole("button", {
      name: "Cancelar suscripción",
    });
    if (!(await seen(confirmCancel, 10_000)))
      throw new Error("No apareció Cancelar suscripción.");
    await say(
      14,
      "PRUEBA",
      "Cancelar el plan",
      "Stripe dice hasta qué día sigue el plan; se confirma con un clic.",
      5000,
      confirmCancel,
    );
    await unmark();
    await confirmCancel.click();
    if (!(await seen(page.getByText("Suscripción cancelada").first(), 30_000)))
      throw new Error("Stripe no confirmó la cancelación.");
    await say(
      14,
      "PRUEBA",
      "Suscripción cancelada",
      "El servicio sigue hasta el fin del periodo pagado.",
      5000,
      page.getByText(/Tu servicio finalizará/).first(),
    );
    await unmark();
    await page.goto(`${PANEL}/settings/plan`);
    if (!(await seen(page.getByText("Cancelación programada").first(), 40_000)))
      throw new Error("El panel no muestra la cancelación programada.");
    await page.waitForTimeout(1000);
    await say(
      14,
      "HOY",
      "Cancelación programada",
      "El panel lo dice y Kardo manda el folio de cancelación por correo.",
      6500,
      page.getByText("Cancelación programada").first(),
    );
  }

  if (FROM === "clock") await opsLogin();

  if (FROM !== "invite") {
    // 5. Off camera: the clock organization (Stripe test clock), with a page.
    [clockWorkspace] = await sql`
    insert into kardo_core.workspaces (public_id, kind, name)
    values (${`reloj${randomBytes(9).toString("hex")}`.slice(0, 24)}, 'organization', ${CLOCK_BUSINESS})
    returning id`;
    await sql`insert into kardo_core.workspace_memberships (workspace_id, profile_id, role) values (${clockWorkspace.id}, ${owner.id}, 'owner')`;
    clockPublicId = randomBytes(24)
      .toString("base64url")
      .replace(/[-_]/g, "x")
      .slice(0, 22);
    await sql`
    insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind, operational_name)
    values (${clockPublicId}, ${clockWorkspace.id}, 'active', 'label', 'qr', 'Mostrador')`;
    const published = await fetch(`${RESOLVER}/internal/publish`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.PUBLISH_COMMAND_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        publicId: clockPublicId,
        revision: 1,
        experience: {
          type: "links",
          title: CLOCK_BUSINESS,
          links: [
            { id: "l1", label: "Agenda tu servicio", url: "https://kardo.mx/" },
            {
              id: "l2",
              label: "Escríbenos por WhatsApp",
              url: "https://wa.me/5215512345678",
            },
          ],
        },
      }),
    });
    log(`publicación local ${published.status}`);
    const [esencial] =
      await sql`select stripe_price_id from kardo_billing.prices where lookup_key = 'kardo_esencial_month' and active`;
    const clockStart = Math.floor(Date.now() / 1000);
    clock = await stripe.testHelpers.testClocks.create({
      frozen_time: clockStart,
      name: "Kardo video 3",
    });
    const customer = await stripe.customers.create({
      email: owner.email,
      name: CLOCK_BUSINESS,
      test_clock: clock.id,
      preferred_locales: ["es-419"],
      metadata: { kardo_workspace_id: clockWorkspace.id },
    });
    await sql`
    insert into kardo_billing.customers (workspace_id, stripe_customer_id, livemode, email, created_by)
    values (${clockWorkspace.id}, ${customer.id}, false, ${owner.email}, ${owner.id})`;
    const visa = await stripe.paymentMethods.attach("pm_card_visa", {
      customer: customer.id,
    });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: visa.id },
    });
    const subscription = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: esencial.stripe_price_id }],
      default_payment_method: visa.id,
      ...(env.STRIPE_TAX_RATE_ID
        ? { default_tax_rates: [env.STRIPE_TAX_RATE_ID] }
        : {}),
      metadata: {
        kardo_workspace_id: clockWorkspace.id,
        kardo_profile_id: owner.id,
      },
    });
    await waitFor("suscripción del reloj en el espejo", async () => {
      const [row] =
        await sql`select status::text as status from kardo_billing.subscriptions where stripe_subscription_id = ${subscription.id}`;
      return row?.status === "active" ? row : null;
    });

    // 5. Renewal reminder 7 days before (Stripe test clock).
    await slide(
      `<h2>${CLOCK_BUSINESS}: el cobro recurrente</h2>
    <p>Otra organización de prueba en Esencial mensual, con un <b>reloj de prueba de Stripe</b>: Stripe adelanta el tiempo y manda los mismos eventos que en la vida real.</p>
    <p>Arriba a la derecha se ve el día simulado.</p>`,
      7000,
    );
    // Stripe sends invoice.upcoming 7 days before the renewal (Dashboard
    // setting); the jumps follow the real period end (October has 31 days).
    const renewal = subscription.items.data[0].current_period_end;
    const clockDay = (at) =>
      `Día ${Math.round((at - clockStart) / DAY)} (reloj de Stripe)`;
    const reminderAt = renewal - 7 * DAY + 3 * 3600;
    await offRecord(async () => {
      await advanceClock(clock.id, reminderAt);
      await waitFor("aviso de renovación", async () => {
        const [row] =
          await sql`select id from kardo_billing.notices where workspace_id = ${clockWorkspace.id} and kind = 'renewal_upcoming'`;
        return row ?? null;
      });
    });
    await opsNotices(clockWorkspace.id);
    await say(
      15,
      "SIMULADO",
      "7 días antes de renovar",
      "Stripe avisa (invoice.upcoming) y Kardo manda su aviso de renovación: la ley pide al menos 5 días.",
      7500,
      null,
      clockDay(reminderAt),
    );
    await say(
      15,
      "PRUEBA",
      "El correo de Stripe",
      "En el sandbox Stripe solo envía estos correos a miembros del equipo o a un dominio verificado.",
      5500,
      null,
      clockDay(reminderAt),
    );

    // 6. Failed payment, retries for 2 weeks, cancellation.
    const failing = await stripe.paymentMethods.attach(
      "pm_card_chargeCustomerFail",
      { customer: customer.id },
    );
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: failing.id },
    });
    await stripe.subscriptions.update(subscription.id, {
      default_payment_method: failing.id,
    });
    const chargeAt = renewal + 2 * 3600;
    await offRecord(async () => {
      await advanceClock(clock.id, chargeAt);
      await waitFor("pago fallido", async () => {
        const [row] =
          await sql`select status::text as status from kardo_billing.subscriptions where stripe_subscription_id = ${subscription.id}`;
        return row?.status === "past_due" ? row : null;
      });
    });
    await signIn(ownerSession, {}, clockWorkspace.id);
    await panel("/settings/plan");
    await seen(
      page.getByText("No pudimos cobrar tu suscripción").first(),
      30_000,
    );
    await say(
      16,
      "SIMULADO",
      "Día de renovación: el cobro falló",
      "Sigue con todo mientras Stripe reintenta (8 intentos en 2 semanas). El panel pide actualizar la tarjeta.",
      7500,
      page.getByText("No pudimos cobrar tu suscripción").first(),
      clockDay(chargeAt),
    );
    const lastRetryAt = renewal + 15 * DAY + 2 * 3600;
    await offRecord(async () => {
      await advanceClock(clock.id, lastRetryAt);
      await waitFor(
        "cancelación tras el último intento",
        async () => {
          const [row] =
            await sql`select status::text as status from kardo_billing.subscriptions where stripe_subscription_id = ${subscription.id}`;
          return row?.status === "canceled" ? row : null;
        },
        150,
      );
      await sleep(8000);
      await endedDaysAgo(clockWorkspace.id, 0);
      await tick(clockWorkspace.id);
    });
    await panel("/");
    await seen(banner());
    await say(
      17,
      "SIMULADO",
      "Tras el último intento: cancelada",
      "Panel en solo lectura; sus páginas siguen 7 días más (gracia).",
      7000,
      banner(),
      clockDay(lastRetryAt),
    );

    await offRecord(async () => {
      await endedDaysAgo(clockWorkspace.id, 8);
      await tick(clockWorkspace.id);
    });
    await panel("/");
    await seen(banner());
    await say(
      18,
      "SIMULADO",
      "Fin de la gracia: páginas en pausa",
      "La tarea horaria pausó sus páginas en el Resolver.",
      6000,
      banner(),
      "8 días después del fin",
    );
    await unmark();
    await page.goto(`${RESOLVER}/t/${clockPublicId}?src=qr`);
    await page.waitForTimeout(1500);
    await say(
      18,
      "SIMULADO",
      "La página pública, en pausa",
      "Aviso neutral: no dice que no se pagó. Resolver en local.",
      6500,
      null,
      "8 días después del fin",
    );

    await offRecord(async () => {
      await endedDaysAgo(clockWorkspace.id, 76);
      await tick(clockWorkspace.id);
    });
    await panel("/");
    await seen(banner());
    await say(
      19,
      "SIMULADO",
      "15 días antes del borrado",
      "La franja y un correo avisan la fecha. Puede descargar su información o contratar.",
      7000,
      banner(),
      "Día 76 después del fin",
    );
    await opsNotices(clockWorkspace.id);
    await say(
      19,
      "SIMULADO",
      "Aviso de borrado enviado",
      "Con fecha, hora y destinatario.",
      5500,
      null,
      "Día 76 después del fin",
    );

    await offRecord(async () => {
      await endedDaysAgo(clockWorkspace.id, 91);
      await tick(clockWorkspace.id);
      await waitFor(
        "borrado registrado",
        async () => {
          const [row] =
            await sql`select cleanup_completed_at from kardo_billing.workspace_deletions where workspace_id = ${clockWorkspace.id}`;
          return row ?? null;
        },
        30,
      );
    });
    await unmark();
    await page.goto(`${RESOLVER}/t/${clockPublicId}?src=qr`);
    await page.waitForTimeout(1500);
    await say(
      20,
      "SIMULADO",
      "Día 90: borrado real",
      "El QR impreso responde 410 con una página neutral, sin el contenido de nadie. Su código nunca se reasigna.",
      7500,
      null,
      "Día 91 después del fin",
    );
    await ops(`/billing/workspaces/${clockWorkspace.id}`, "Acceso");
    const access = page.getByText(/Eliminada el/).first();
    await say(
      21,
      "HOY",
      "Operations: Eliminada",
      "Lo borrado (páginas, contenido, miembros) y lo que la ley conserva: facturas y CFDI por 5 años.",
      8000,
      access,
    );
    await wheel(700);
    await say(
      21,
      "HOY",
      "Las facturas se conservan",
      "El cobro, los avisos y la auditoría siguen visibles para Operations.",
      6000,
    );
  }

  // 7. Invitations: the guest joins the organization directly.
  await signIn(ownerSession, {}, owner.workspaceId);
  await panel("/settings/equipo");
  await seen(page.locator("#invite-email"), 30_000);
  await page
    .locator("#invite-email")
    .pressSequentially(guest.email, { delay: 15 });
  await say(
    22,
    "HOY",
    "Invitar al equipo",
    "El negocio del alta ya es organización: invita con su mismo plan. Las invitaciones cuentan contra el tope de miembros.",
    7000,
    page.locator("#invite-email"),
  );
  await page.getByRole("button", { name: "Crear invitación" }).click();
  const link = page
    .locator('.copy-field code[title*="/invite#token="]')
    .first();
  await seen(link, 20_000);
  const inviteUrl = await link.getAttribute("title");
  await say(
    22,
    "HOY",
    "Enlace de invitación",
    "Le llega por correo; el enlace también se puede compartir. Se muestra una sola vez y caduca en 7 días.",
    6000,
    page.locator(".copy-field").first(),
  );
  await page
    .getByRole("button", { name: "Entendido" })
    .click()
    .catch(() => undefined);
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
  await page.goto(inviteUrl.replace(/^https?:\/\/[^/]+/, PANEL));
  await page.waitForTimeout(2500);
  await say(
    23,
    "HOY",
    "La persona invitada abre el enlace",
    "Crea su cuenta con el correo de la invitación o inicia sesión.",
    6000,
    page.getByText(/Te invitaron a un espacio de Kardo/).first(),
  );
  await signIn(guestSession, { "kardo.registration-stage": "password" });
  await page.goto(`${PANEL}/invite`);
  await choosePassword(guest);
  await page.waitForTimeout(4000);
  await acceptTermsGate();
  const accept = page.getByRole("button", { name: "Aceptar invitación" });
  await seen(accept, 30_000);
  await say(
    23,
    "HOY",
    "Sin el alta de un negocio propio",
    "Va directo a la invitación: no le pregunta por un negocio que no tiene.",
    6000,
    accept,
  );
  await accept.click();
  await page.waitForTimeout(5000);
  await say(
    24,
    "HOY",
    `Dentro de ${BUSINESS}`,
    "Con su rol y sin franjas que no le tocan. Su espacio personal no estorba en el selector.",
    7000,
    page.locator(".workspace-switcher").first(),
  );
  const own = page.getByRole("link", { name: "Crear mi propio negocio" });
  await say(
    24,
    "HOY",
    "Crear mi propio negocio",
    "Si algún día lo quiere, con su propia prueba de 15 días (una por persona).",
    5000,
    own,
  );
  await own.click();
  await page.waitForTimeout(2000);
  await page
    .locator("#create-business-name")
    .pressSequentially("Estudio Gema", { delay: 30 });
  await say(
    25,
    "HOY",
    "Su negocio, aparte",
    "Nace como organización, con 15 días gratis de Profesional.",
    5000,
    page.getByRole("button", { name: /Crear mi negocio/ }),
  );
  await unmark();
  await page.getByRole("button", { name: /Crear mi negocio/ }).click();
  await page.waitForTimeout(5000);
  const switcher = page.locator(".workspace-switcher").first();
  await say(
    25,
    "HOY",
    "Dos espacios, cada uno con su plan",
    "Estudio Gema es suyo (Owner) y está en su prueba de 15 días.",
    5500,
    switcher,
  );
  await unmark();
  await page
    .getByLabel("Cambiar espacio de trabajo")
    .selectOption({ label: BUSINESS });
  await page.waitForTimeout(3500);
  await say(
    25,
    "HOY",
    "Y cambia con el selector",
    `En ${BUSINESS} es Editor, con el plan de esa organización.`,
    5500,
    switcher,
  );

  // Summary.
  await slide(
    `<h2>Qué es real, qué es simulado y qué falta</h2>
    <div class="cols"><div><p class="k"><b>Funciona hoy (probado en este video)</b></p><ul>
      <li>Precios nuevos y ahorro anual por plan</li>
      <li>Alta: ¿personal o negocio?</li>
      <li>Pago en la página de Stripe con la marca Kardo</li>
      <li>Recibo de Stripe y CFDI${facturapi ? " de prueba con Facturapi" : " con folio de prueba"}</li>
      <li>Portal con la marca Kardo</li>
      <li>Aviso de renovación, reintentos y cancelación</li>
      <li>Gracia, pausa y borrado real con página 410</li>
      <li>Invitaciones directo a la organización</li></ul>
      <p style="margin-top:14px"><span class="tag sim">SIMULADO</span> fechas movidas en la base y reloj de prueba de Stripe.</p></div>
    <div><p style="color:#f2b33d"><b>Falta para producción</b></p><ul>
      <li>Desplegar migraciones, APIs, Resolver y webs</li>
      <li>Revisión del abogado del borrado (y encenderlo)</li>
      <li>Facturapi en vivo: certificados y plan</li>
      <li>Datos del titular en los textos legales</li>
      <li>Análisis de seguridad previo al lanzamiento</li></ul></div></div>`,
    13000,
  );
} catch (error) {
  log(`ERROR ${error.message.split("\n")[0]}`);
  await page
    .screenshot({ path: `${outDir}/${NAME}-error.png` })
    .catch(() => undefined);
  process.exitCode = 1;
} finally {
  if (clock)
    await stripe.testHelpers.testClocks.del(clock.id).catch(() => undefined);
  await context.close();
  await browser.close();
  await sql.end({ timeout: 5 });
  log(
    `recortes: ${cuts.map(([a, b]) => `${a.toFixed(1)}-${b.toFixed(1)}`).join(", ") || "ninguno"}`,
  );
  finishVideo(dir, NAME, cuts);
}
