// Video 2 (ADR 020): the 15-day Kardo trial end to end, with the global
// banner, the limited panel, the billing pause of public pages, Checkout
// with the Kardo brand and the conversion coupon, reactivation, internal
// accounts, courtesies and CFDI requests. Time jumps are simulated in the
// database and labeled SIMULADO on screen.
//
//   node scripts/video/accounts.mjs owner friend demo
//   VIDEO_LOCAL_PUBLISH_KEY=… node scripts/video/trial-tour.mjs
//
// Local stack (scripts/video/README.md) plus the Resolver in `wrangler dev`
// on 8787 with the same BILLING_COMMAND_KEY the Customer API copy uses
// (BILLING_RESOLVER_URL=http://localhost:8787). Stripe test mode only.
import { randomBytes, randomUUID } from "node:crypto";
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
const NAME = "trial-tour";
const TOTAL = 24;

const env = readEnv();
const accounts = readAccounts();
const { owner, friend, demo } = accounts;
if (!owner || !friend || !demo)
  throw new Error("Primero: node scripts/video/accounts.mjs owner friend demo");
const publishKey = process.env.VIDEO_LOCAL_PUBLISH_KEY;
if (!publishKey) throw new Error("Falta VIDEO_LOCAL_PUBLISH_KEY (Resolver local).");

const sql = postgres()(env.SUPABASE_ADMIN_DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Hourly job of the Customer API copy (notices, pause, resume). */
async function tick() {
  const response = await fetch(`${API}/internal/billing/tick`, {
    method: "POST",
    headers: { authorization: `Bearer ${env.BILLING_CRON_KEY}` },
  });
  const body = await response.json().catch(() => ({}));
  log(`tick ${response.status} ${JSON.stringify(body)}`);
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

const dateMx = (date) =>
  date.toLocaleDateString("es-MX", {
    timeZone: "America/Mexico_City",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

const browser = await chromium.launch({ channel: "chrome", headless: true });
const session = await offCameraSession(browser, PANEL, owner);
const { context, dir } = await recordingContext(browser, NAME);
const page = await context.newPage();
page.setDefaultTimeout(20_000);
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
  await page.getByLabel("Correo de trabajo").pressSequentially(env.E2E_STAFF_EMAIL, { delay: 15 });
  await page.getByLabel("Contraseña").pressSequentially(env.E2E_STAFF_PASSWORD, { delay: 8 });
  await page.keyboard.press("Enter");
  await page.getByLabel("Código de 6 dígitos").waitFor({ timeout: 20_000 });
  await page.getByLabel("Código de 6 dígitos").pressSequentially(totp(env.E2E_STAFF_TOTP_SECRET), { delay: 40 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3500);
}

/** Waits out Operations' "Verificando tu sesión" screen, if it shows. */
async function settleOps() {
  await page.waitForTimeout(800);
  await page
    .getByText(/Verificando tu sesión/)
    .first()
    .waitFor({ state: "detached", timeout: 30_000 })
    .catch(() => undefined);
  await page.waitForTimeout(600);
}

async function opsNotices(workspaceId) {
  await unmark();
  await page.goto(`${OPS}/billing/workspaces/${workspaceId}`);
  await seen(page.getByText("Avisos al cliente").first(), 60_000);
  await page.waitForTimeout(1200);
  const notices = page.getByText("Avisos al cliente").first();
  await notices.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, -90);
  await sleep(600);
  await repaint();
}

async function panel(path) {
  await unmark();
  await page.goto(`${PANEL}${path}`);
  await page.waitForTimeout(2500);
}

const banner = () => page.locator(".access-strip").first();

let publicId = null;

try {
  // ---------------------------------------------------------------------------
  await slide(
    `<p class="k" style="font-weight:700;letter-spacing:.12em;font-size:15px">KARDO · VIDEO 2</p>
    <h1>La prueba de 15 días, de punta a punta</h1>
    <p>Grabado el ${dateMx(new Date())}. Stripe en <b>modo prueba</b>: ningún cobro es real. Los saltos de tiempo se simulan en la base y se marcan en pantalla.</p>
    <p style="margin-top:22px"><span class="tag hoy">YA FUNCIONA</span><span class="tag sim">TIEMPO SIMULADO</span><span class="tag" style="background:#4ec3ce;color:#16232e">PRUEBA</span><span class="tag pen">PENDIENTE</span></p>`,
    7000,
  );
  await slide(
    `<h2>Cronograma de una prueba sin contratar</h2>
    <div class="lanes">
      <div class="lane"><h3>Prueba (días 0 a 15)</h3><div class="row">
        <div class="ev"><b>Día 0</b>Alta con el plan de /precios/. Franja con los días.</div>
        <div class="ev"><b>Días 8 y 12</b>Correos: quedan 7 y 3 días.</div>
        <div class="ev"><b>Día 15</b>Termina: panel limitado, cupón 20 % por 3 meses durante 7 días.</div></div></div>
      <div class="lane"><h3>Gracia (días 15 a 22)</h3><div class="row">
        <div class="ev"><b>Días 18 y 21</b>Correos: tus páginas se pausan el día 22.</div>
        <div class="ev"><b>Día 22</b>Páginas en pausa con un aviso neutral, sin mencionar pagos.</div>
        <div class="ev"><b>Al contratar</b>Todo vuelve al instante, también los QR impresos.</div></div></div>
      <div class="lane"><h3>Operations</h3><div class="row">
        <div class="ev"><b>Avisos</b>Cada correo con fecha, hora y destinatario.</div>
        <div class="ev"><b>Cuentas internas</b>Demos del dueño: nunca se cobran ni se pausan.</div>
        <div class="ev"><b>Cortesías</b>Amigos con fecha fin y aviso antes de vencer.</div>
        <div class="ev"><b>Facturas</b>CFDI a solicitud y factura global.</div></div></div>
    </div>`,
    12000,
  );

  // 1. Pricing page: Negocio, yearly.
  await page.goto(`${SITE}/precios/`);
  await page.waitForTimeout(1800);
  await say(1, "HOY", "Sitio público: /precios/", "Los planes viven en el sitio, no en el panel. La prueba de 15 días no pide tarjeta.", 5500);
  await wheel(620);
  await page.getByText("Anual", { exact: true }).first().click();
  await page.waitForTimeout(600);
  const negocio = page.getByRole("link", { name: /Empieza gratis/ }).nth(2);
  await say(1, "HOY", "Negocio, pago anual", "Elegimos Negocio anual (2 meses gratis). La prueba será de ese plan.", 5500, negocio);
  await negocio.click();
  await page.waitForURL(new RegExp(escape(PANEL)));
  await page.waitForTimeout(1500);

  // 2. Sign up with the Terms box.
  await page.getByLabel("Correo electrónico").pressSequentially(owner.email, { delay: 18 });
  await page.locator("#accept-terms").check();
  await say(2, "HOY", "Registro con casilla de Términos", "Sin marcarla no se crea la cuenta; se guarda con la hora del servidor.", 5000, page.locator("label.legal-check"));
  await say(2, "PRUEBA", "Código por correo", "Kardo manda un código de 6 dígitos. Para no enviar correos reales, el video sigue con la cuenta ya verificada.", 5000, page.getByRole("button", { name: "Enviar código" }));
  await page.evaluate(([entries]) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value);
    localStorage.setItem("kardo.pendingTermsAcceptance", JSON.stringify({ terms: "1.0", privacy: "1.0" }));
    sessionStorage.setItem("kardo.registration-stage", "password");
  }, [session]);
  await page.goto(`${PANEL}/`);
  await page.getByLabel("Contraseña", { exact: true }).waitFor();
  const newPassword = `Vid-${randomBytes(15).toString("base64url")}!7`;
  owner.password = newPassword;
  writeAccounts(accounts);
  await page.getByLabel("Contraseña", { exact: true }).pressSequentially(newPassword, { delay: 8 });
  await page.getByLabel("Confirmar contraseña").pressSequentially(newPassword, { delay: 8 });
  await page.keyboard.press("Enter");

  // 3. Onboarding starts the trial.
  await page.locator("#business-name").waitFor({ timeout: 25_000 });
  await page.locator("#business-name").pressSequentially(BUSINESS, { delay: 30 });
  if ((await page.locator("#business-type option").count()) > 1)
    await page.locator("#business-type").selectOption({ index: 1 });
  await say(3, "HOY", "Alta del negocio", "Nombre y giro. Al terminar empieza la prueba de Negocio: sin tarjeta, una por persona.", 5000);
  await page.locator("form button.button-primary").first().click();
  await page.waitForTimeout(5000);
  const gate = page.getByRole("heading", { name: "Antes de continuar" });
  if (await gate.isVisible().catch(() => false)) {
    await page.getByLabel(/Acepto los Términos/).check();
    await page.getByRole("button", { name: "Aceptar y continuar" }).click();
    await page.waitForTimeout(1500);
  }

  // Off camera: the table QR of the demo, published on the local Resolver.
  publicId = randomBytes(24).toString("base64url").replace(/[-_]/g, "x").slice(0, 22);
  await sql`
    insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind, operational_name)
    values (${publicId}, ${owner.workspaceId}, 'active', 'label', 'qr', 'Mesa 1')`;
  const published = await fetch(`${RESOLVER}/internal/publish`, {
    method: "POST",
    headers: { authorization: `Bearer ${publishKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      publicId,
      revision: 1,
      experience: {
        type: "links",
        title: BUSINESS,
        links: [
          { id: "l1", label: "Ver el menú del día", url: "https://kardo.mx/" },
          { id: "l2", label: "Pedir por WhatsApp", url: "https://wa.me/5215512345678" },
        ],
      },
    }),
  });
  log(`publicación local ${published.status}`);

  // 4. The banner, everywhere.
  await panel("/");
  await seen(banner());
  await say(4, "HOY", "Franja global: días de prueba", "Un solo renglón bajo la barra superior, en todas las pantallas.", 6500, banner());
  await panel("/touchpoints");
  await seen(banner());
  await say(4, "HOY", "También en Touchpoints", "El QR de la mesa 1 ya está impreso y publicado.", 5000, banner());
  await panel("/settings/plan");
  await seen(page.getByText("Consumo y límites").first(), 30_000);
  await say(5, "HOY", "Configuración, Plan", "Durante la prueba aplican los límites de Negocio. Los planes y precios se eligen en el sitio.", 6000, page.getByText(/Te quedan|Te queda/).first());
  await wheel(650);
  await say(5, "HOY", "Límites de Negocio", "300 Touchpoints, 30 Links, 30 miembros. Sin catálogo dentro del panel: el botón lleva a /precios/.", 6000);

  // Public page served by the local Resolver.
  await unmark();
  await page.goto(`${RESOLVER}/t/${publicId}?src=qr`);
  await page.waitForTimeout(1500);
  await say(6, "PRUEBA", "La página pública del QR", "Servida por el Resolver en local (wrangler dev): el Resolver con la pausa por cobro falta desplegarlo.", 6500);

  // 6. Operations: organization in trial, day 0 notice with the time.
  await tick();
  await opsLogin();
  await page.goto(`${OPS}/billing`);
  await seen(page.getByText("MRR").first(), 60_000);
  await page.waitForTimeout(1500);
  await say(7, "HOY", "Operations: estado de acceso", "Nuevas tarjetas: en prueba, limitadas, en pausa, por borrar e internas. Las internas no cuentan en el MRR.", 7000, page.getByText("En prueba", { exact: true }).nth(1));
  await opsNotices(owner.workspaceId);
  await say(7, "HOY", "Aviso de inicio de la prueba", "El correo del día 0 salió con fecha, hora y destinatario.", 7000);

  // 8. SIMULADO day 8 and 12.
  await trialDay(owner.workspaceId, 8);
  await tick();
  await panel("/");
  await seen(banner());
  await say(8, "SIMULADO", "Día 8: quedan 7 días", "Movimos la fecha de la prueba y corrimos la tarea horaria: la franja se actualiza sola.", 6000, banner(), "Día 8 de la prueba");
  await trialDay(owner.workspaceId, 12);
  await tick();
  await panel("/");
  await seen(banner());
  await say(8, "SIMULADO", "Día 12: quedan 3 días", "Cada recordatorio sale una sola vez, aunque la tarea corra cada hora.", 5500, banner(), "Día 12 de la prueba");
  await opsNotices(owner.workspaceId);
  await say(9, "SIMULADO", "Recordatorios en Operations", "Los avisos de 7 y 3 días quedaron enviados, con su hora.", 6500, null, "Día 12 de la prueba");

  // 10. SIMULADO day 15: limited panel with the coupon.
  await trialDay(owner.workspaceId, 15);
  await tick();
  await panel("/");
  await seen(banner());
  await say(10, "SIMULADO", "Día 15: terminó la prueba", "El panel queda limitado. La franja anuncia la pausa del día 22 y el 20 % por 3 meses si contrata en 7 días.", 8000, banner(), "Día 15 de la prueba");
  await panel("/touchpoints");
  await page.getByRole("link", { name: /Mesa 1/ }).first().waitFor({ timeout: 10_000 }).catch(() => undefined);
  const newTouchpoint = page.getByRole("button", { name: /Nuevo touchpoint/ }).first();
  if (await newTouchpoint.isVisible().catch(() => false)) {
    await newTouchpoint.click();
    await page.waitForTimeout(800);
  }
  const nameField = page.getByLabel("Nombre interno").first();
  if (await seen(nameField, 8000)) {
    await nameField.pressSequentially("Mesa 2", { delay: 30 });
    await say(11, "HOY", "Intentar crear algo", "Crear o editar ya no se puede sin plan.", 3500, nameField, "Día 15 de la prueba");
    await page.locator("main form button[type=submit]").first().click();
  }
  const dialog = page.getByRole("dialog").filter({ hasText: "Elige un plan para seguir editando" });
  await seen(dialog, 10_000);
  await say(11, "HOY", "Elige un plan para seguir editando", "En lugar de un error, el panel explica qué pasa y ofrece ver planes o descargar la información.", 7000, dialog, "Día 15 de la prueba");
  const download = page.waitForEvent("download", { timeout: 15_000 }).catch(() => null);
  await dialog.getByRole("button", { name: "Descargar mi información" }).click();
  const file = await download;
  if (file) log(`descarga ${file.suggestedFilename()}`);
  await say(11, "HOY", "Descargar mi información: sí funciona", `Un archivo JSON con Touchpoints, Experiences y leads${file ? ` (${file.suggestedFilename()})` : ""}. El CSV de leads también sigue disponible.`, 6500, null, "Día 15 de la prueba");
  await page.keyboard.press("Escape");
  await opsNotices(owner.workspaceId);
  await say(12, "SIMULADO", "Aviso de fin de la prueba", "Dice que no se cobró nada, hasta cuándo siguen abiertas sus páginas y el cupón de conversión.", 6500, null, "Día 15 de la prueba");

  // 13. The coupon in Checkout, with the Kardo brand (not paid).
  await panel("/");
  const choose = banner().getByRole("link", { name: "Elegir plan" }).or(banner().getByRole("button", { name: "Elegir plan" })).first();
  await say(13, "HOY", "Elegir plan desde la franja", "Lleva a /precios/ del sitio, que sabe que viene del panel.", 4000, choose, "Día 15 de la prueba");
  await choose.click();
  await page.waitForURL(/\/precios\//);
  await page.waitForTimeout(1800);
  await page.getByText("Mensual", { exact: true }).first().click();
  await page.waitForTimeout(500);
  await wheel(560);
  const pickNegocio = page.getByRole("link", { name: "Elegir este plan" }).nth(2);
  await say(13, "HOY", "Elegir este plan", "Con ?desde=panel los botones regresan al panel para contratar esa organización.", 5000, pickNegocio, "Día 15 de la prueba");
  await pickNegocio.click();
  await page.waitForURL(new RegExp(escape(PANEL)));
  const confirmCard = page.locator(".plan-choice").first();
  await seen(confirmCard, 30_000);
  await page.waitForTimeout(1200);
  await say(14, "HOY", "Confirmación en el panel", "Negocio mensual con el 20 % en los 3 primeros meses: el cupón se aplica solo, nunca como código público.", 7000, confirmCard, "Día 15 de la prueba");
  await page.getByRole("button", { name: "Continuar a pago" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 40_000 });
  await page.locator("#cardNumber").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(2000);
  await say(14, "HOY", "Checkout con la marca Kardo y el cupón", "Logo, colores y bordes de Kardo; 20 % por 3 meses ya aplicado. Aquí no pagamos: seguimos la historia.", 8500, null, "Día 15 de la prueba");

  // 15. SIMULADO days 18, 21 and 22: notices and the pause.
  await trialDay(owner.workspaceId, 18);
  await tick();
  await trialDay(owner.workspaceId, 21);
  await tick();
  await opsNotices(owner.workspaceId);
  await say(15, "SIMULADO", "Días 18 y 21: tus páginas se pausan el día 22", "Dos recordatorios antes de pausar: 14 días de aviso contando desde el día 8.", 7000, null, "Días 18 y 21");
  await trialDay(owner.workspaceId, 22);
  await tick();
  await panel("/");
  await seen(banner());
  await say(16, "SIMULADO", "Día 22: páginas en pausa", "La tarea horaria pausó las páginas en el Resolver. Contratando vuelven al instante.", 6500, banner(), "Día 22");
  await page.goto(`${RESOLVER}/t/${publicId}?src=qr`);
  await page.waitForTimeout(1500);
  await say(16, "SIMULADO", "La página pública, en pausa", "Aviso neutral: no dice que no se pagó, no mide visitas ni recibe formularios. Resolver en local.", 7500, null, "Día 22");
  await opsNotices(owner.workspaceId);
  const accessCard = page.getByText("Acceso").first();
  await accessCard.evaluate((el) => el.scrollIntoView({ block: "start" })).catch(() => undefined);
  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, -90);
  await sleep(500);
  await repaint();
  await say(17, "SIMULADO", "Operations: en pausa", "Estado, fin de la prueba, fecha de pausa y hora exacta en que se pausaron sus páginas.", 7000, null, "Día 22");

  // 18. Contract: branded Checkout, pay, instant reactivation.
  await panel("/");
  await banner().getByRole("link", { name: "Elegir plan" }).or(banner().getByRole("button", { name: "Elegir plan" })).first().click();
  await page.waitForURL(/\/precios\//);
  await page.waitForTimeout(1500);
  await page.getByText("Mensual", { exact: true }).first().click();
  await page.waitForTimeout(400);
  await wheel(560);
  await page.getByRole("link", { name: "Elegir este plan" }).nth(2).click();
  await page.waitForURL(new RegExp(escape(PANEL)));
  await seen(page.locator(".plan-choice").first(), 30_000);
  await page.waitForTimeout(1000);
  await say(18, "HOY", "Contratar Negocio mensual", "El cupón venció el día 22 (7 días después del fin de la prueba): precio completo.", 5500, page.locator(".plan-choice").first(), "Día 22");
  await page.getByRole("button", { name: "Continuar a pago" }).click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 40_000 });
  await page.locator("#cardNumber").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await page.locator("#cardNumber").pressSequentially("4242424242424242", { delay: 25 });
  await page.locator("#cardExpiry").pressSequentially("1234", { delay: 25 });
  await page.locator("#cardCvc").pressSequentially("123", { delay: 25 });
  await page.locator("#billingName").pressSequentially(BUSINESS, { delay: 20 });
  await say(18, "PRUEBA", "Checkout con la marca Kardo", "Tarjeta de prueba 4242 de Stripe; no es real. Abajo del botón dice que se cobra hoy y cada mes.", 6000, null, "Día 22");
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(new RegExp(escape(PANEL)), { timeout: 90_000 });
  // The webhook arrives in seconds; the banner refreshes on its own.
  for (let i = 0; i < 15; i += 1) {
    const text = (await banner().textContent().catch(() => null)) ?? "";
    if (!text) break;
    await page.waitForTimeout(2000);
  }
  await page.waitForTimeout(1500);
  await say(19, "HOY", "Reactivación al instante", "El webhook marcó la suscripción activa: la franja desaparece y el panel vuelve a editar.", 6500, null, "Día 22");
  await page.goto(`${RESOLVER}/t/${publicId}?src=qr`);
  await page.waitForTimeout(1500);
  await say(19, "HOY", "El QR impreso vuelve a funcionar", "La misma URL del QR muestra otra vez el contenido, sin reimprimir nada. Resolver en local.", 7000, null, "Día 22");

  // 20. Operations: subscription, all notices; internal account; courtesy.
  await unmark();
  await page.goto(`${OPS}/billing`);
  await seen(page.getByText("MRR").first(), 60_000);
  await page.waitForTimeout(1200);
  await say(20, "HOY", "MRR y suscripciones", "La nueva suscripción de Negocio ya cuenta en el MRR.", 5500, page.getByText("MRR").first());
  await opsNotices(owner.workspaceId);
  await say(20, "HOY", "Todos los avisos, con hora", "Inicio, recordatorios, fin, pausa próxima, páginas en pausa y contratación: evidencia ante PROFECO.", 8000);

  await page.goto(`${OPS}/billing/workspaces/${demo.workspaceId}`);
  await settleOps();
  await seen(page.getByText("Acceso").first(), 60_000);
  await page.waitForTimeout(1000);
  const internalSwitch = page.getByRole("switch", { name: /Cuenta interna/ }).or(page.getByLabel(/Cuenta interna/)).or(page.getByRole("button", { name: /Cuenta interna/ })).first();
  await say(21, "HOY", "Cuenta interna (demo)", "Para las demos del dueño: nunca se cobra, limita, pausa ni borra, y no cuenta en el MRR.", 5500, internalSwitch);
  await internalSwitch.click();
  await page.waitForTimeout(600);
  const reason = page.getByRole("dialog").getByRole("textbox").first();
  await reason.pressSequentially("Demo del dueño para ventas", { delay: 22 });
  await say(21, "HOY", "Con motivo y en la auditoría", "Solo staff con permiso de cobro puede marcarla o quitarla.", 4500, page.getByRole("dialog").first());
  await page.getByRole("dialog").getByRole("button", { name: "Marcar como interna" }).click();
  await unmark();
  await settleOps();
  const internalBlock = page.getByText("Demo del dueño para ventas").first();
  if (!(await seen(internalBlock, 8000))) {
    // The Operations session may re-verify around here: reload the detail.
    await page.goto(`${OPS}/billing/workspaces/${demo.workspaceId}`);
    await settleOps();
    await seen(internalBlock, 30_000);
  }
  await page.waitForTimeout(1200);
  await say(21, "HOY", "Etiqueta Interna", "Queda visible junto al nombre, con motivo, quién y cuándo.", 6500, page.locator("h1").first());
  await say(21, "HOY", "Estado: Interna", "Nunca se limita ni se pausa; el motivo y quién la marcó quedan a la vista.", 5500, internalBlock);

  await page.goto(`${OPS}/clientes/${friend.workspaceId}`);
  await page.getByRole("button", { name: "Cambiar plan" }).waitFor({ timeout: 60_000 });
  await page.getByRole("button", { name: "Cambiar plan" }).click();
  await page.locator("#plan-select option", { hasText: "(profesional)" }).waitFor({ state: "attached", timeout: 20_000 });
  const options = await page.locator("#plan-select option").allTextContents();
  const pro = options.find((option) => option.includes("(profesional)"));
  if (pro) await page.locator("#plan-select").selectOption({ label: pro });
  const until = new Date(Date.now() + 6 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  await page.locator("#plan-until").fill(until);
  await page.locator("#plan-reason").pressSequentially("Amigo probando el MVP", { delay: 20 });
  await say(22, "HOY", "Cortesía para un amigo", "Profesional sin costo hasta una fecha. Aquí vence en 6 días para ver su aviso.", 5500, page.locator("#plan-dialog-form"));
  await page.getByRole("button", { name: "Guardar plan" }).click();
  await unmark();
  await page.locator("#plan-dialog-form").waitFor({ state: "detached", timeout: 20_000 }).catch(() => undefined);
  await tick();
  await opsNotices(friend.workspaceId);
  await say(22, "HOY", "Aviso de fin de cortesía", "Sale 7 días y 1 día antes de vencer. Al vencer sigue el mismo camino que una prueba terminada.", 7000);

  // 23. CFDI on request.
  await panel("/settings/plan");
  await seen(page.getByText("Datos de facturación").first(), 30_000);
  const addFiscal = page.getByRole("button", { name: "Agregar datos de facturación" });
  await say(23, "HOY", "Factura (CFDI) opcional", "Solo quien quiere factura da sus datos. Nunca se pide la Constancia, solo los datos.", 5500, page.getByText("Datos de facturación").first());
  await addFiscal.click();
  await page.getByLabel("RFC").fill("CAU200101AB1");
  await page.getByLabel(/Nombre o razón social/).fill(`${BUSINESS} SA de CV`);
  await page.getByLabel("Régimen fiscal").selectOption("601");
  await page.getByLabel(/Código postal/).fill("06700");
  await page.getByLabel(/Correo para recibir/).fill(owner.email);
  await say(23, "HOY", "Datos de facturación", "RFC, razón social, régimen, código postal, uso del CFDI y correo.", 5500);
  await page.getByRole("button", { name: "Guardar" }).first().click();
  await page.waitForTimeout(2000);
  const ask = page.getByRole("button", { name: "Pedir factura" }).first();
  if (await seen(ask, 15_000)) {
    await say(23, "HOY", "Pedir factura del pago del mes", "Lo que no se pide va a la factura global mensual.", 4500, ask);
    await ask.click();
    await page.waitForTimeout(2000);
    await say(23, "HOY", "Factura pedida", "La ley pide emitirla dentro de las 24 horas del cobro.", 4500, page.getByText("Factura pedida").first());
  }
  await page.goto(`${OPS}/billing/facturas`);
  await seen(page.getByText("Solicitudes de factura").first(), 60_000);
  await page.waitForTimeout(1500);
  await say(24, "HOY", "Operations: facturas por emitir", "Datos para copiar, enlace al pago en Stripe y alerta si pasan 24 horas. Se emite a mano en el portal del SAT.", 7000);
  await page.getByRole("button", { name: "Marcar emitida" }).first().click();
  await page.getByLabel("Folio fiscal (UUID)").fill(randomUUID().toUpperCase());
  await say(24, "PRUEBA", "Folio fiscal de prueba", "Al confirmar, el cliente recibe un correo con el folio fiscal.", 5000, page.getByRole("dialog").first());
  await page.getByRole("dialog").getByRole("button", { name: "Marcar emitida" }).click();
  await page.waitForTimeout(2500);
  await say(24, "HOY", "Factura emitida", "Queda el folio en la solicitud y en los avisos del cliente.", 4500);

  // Summary.
  await slide(
    `<h2>Qué quedó listo y qué falta</h2>
    <div class="cols"><div><p class="k"><b>Funciona hoy (probado)</b></p><ul>
      <li>Prueba de 15 días con franja global y avisos 0, 8, 12 y 15</li>
      <li>Panel limitado con "Elige un plan" y descarga de información</li>
      <li>Pausa por cobro y reactivación al instante</li>
      <li>/precios/ desde el panel, cupón 20 % por 3 meses</li>
      <li>Checkout con la marca Kardo</li>
      <li>Cuentas internas, cortesías con aviso, facturas CFDI</li></ul></div>
    <div><p style="color:#f2b33d"><b>Pendiente del dueño</b></p><ul>
      <li>Desplegar Resolver, APIs y migraciones</li>
      <li>Marca de la cuenta en el Dashboard de Stripe</li>
      <li>Aprobar precios y límites</li>
      <li>Borrado automático a los 90 días: aún no existe</li>
      <li>Revisión legal y datos del titular</li></ul></div></div>`,
    12000,
  );
} catch (error) {
  log(`ERROR ${error.message.split("\n")[0]}`);
  await page.screenshot({ path: `${outDir}/${NAME}-error.png` }).catch(() => undefined);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  await sql.end({ timeout: 5 });
  finishVideo(dir, NAME);
}
