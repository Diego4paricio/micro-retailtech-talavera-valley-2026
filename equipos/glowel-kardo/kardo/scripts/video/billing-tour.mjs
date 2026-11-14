// Reference tour (recorded 2026-09-29, updated for the Kardo trial): pricing
// page → sign up → trial → Checkout → plan change → Operations → courtesy
// plan for a friend. Base for new takes (scripts/video/README.md).
//
//   node scripts/video/accounts.mjs owner friend
//   node scripts/video/billing-tour.mjs
//
// Local stack on SITE/PANEL/OPS below (see README), Stripe test mode only.
import { randomBytes } from "node:crypto";
import { chromium } from "playwright-core";
import {
  createNarrator,
  finishVideo,
  log,
  offCameraSession,
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
const BUSINESS = process.env.VIDEO_BUSINESS ?? "Estética Sol";
const TOTAL = 18;

const env = readEnv();
const accounts = readAccounts();
const { owner, friend } = accounts;
if (!owner || !friend)
  throw new Error("Primero: node scripts/video/accounts.mjs owner friend");

const browser = await chromium.launch({ channel: "chrome", headless: true });
const session = await offCameraSession(browser, PANEL, owner);
const { context, dir } = await recordingContext(browser, "billing-tour");
const page = await context.newPage();
page.setDefaultTimeout(15_000);
page.on("pageerror", (error) => log(`pageerror ${error.message}`));
const { say, unmark, wheel, slide, repaint } = createNarrator(page, TOTAL);

try {
  await slide(
    `<p class="k" style="font-weight:700;letter-spacing:.12em;font-size:15px">KARDO · RECORRIDO</p>
    <h1>Alta, prueba, facturación y Operations</h1>
    <p>Grabado el ${new Date().toLocaleDateString("es-MX", { timeZone: "America/Mexico_City", day: "numeric", month: "long", year: "numeric" })} con Stripe en <b>modo prueba</b>: ningún cobro es real.</p>`,
    6000,
  );

  // Pricing page.
  await page.goto(`${SITE}/precios/`);
  await page.waitForTimeout(1500);
  await say(1, "HOY", "Sitio público: /precios/", "Los precios viven en el sitio y salen del mismo catálogo que usa Stripe. En producción no se publican hasta que el dueño los apruebe.", 6000);
  await wheel(640);
  await say(2, "HOY", "Planes", "Precios en pesos con IVA incluido. Profesional va recomendado: es el plan de la prueba.", 5000, page.getByText("Recomendado").first());
  await page.getByText("Anual", { exact: true }).first().click();
  await say(2, "HOY", "Anual: 2 meses gratis", "Con el pago anual se pagan 10 meses.", 4500, page.getByText(/Equivale a/).first());
  await page.getByText("Mensual", { exact: true }).first().click();
  await unmark();

  // Sign up with the chosen plan.
  const start = page.getByRole("link", { name: /Empieza gratis/ }).nth(1);
  await say(3, "HOY", "Empieza gratis (Profesional)", "Lleva al registro con el plan elegido: /registro?plan=profesional&periodo=mensual.", 4500, start);
  await start.click();
  await page.waitForURL(new RegExp(PANEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  await page.waitForTimeout(1500);
  await page.getByLabel("Correo electrónico").pressSequentially(owner.email, { delay: 25 });
  await page.locator("#accept-terms").check();
  await say(4, "HOY", "Casilla de Términos (clickwrap)", "Sin marcarla no se crea la cuenta. Se guarda con la hora del servidor.", 5500, page.locator("label.legal-check"));
  await say(4, "PRUEBA", "Código por correo", "Kardo manda un código de 6 dígitos. Para no enviar correos reales, el video sigue con la cuenta ya verificada.", 5500, page.getByRole("button", { name: "Enviar código" }));

  // Same state the app keeps after verifying the code (the plan chosen on
  // /precios/ is already in sessionStorage from /registro?plan=…).
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
  await say(5, "HOY", "Elige tu contraseña", "Después del código, la persona elige su contraseña.", 3000);
  await page.getByLabel("Contraseña", { exact: true }).pressSequentially(newPassword, { delay: 15 });
  await page.getByLabel("Confirmar contraseña").pressSequentially(newPassword, { delay: 15 });
  await page.keyboard.press("Enter");
  await page.locator("#business-name").waitFor({ timeout: 20_000 });
  await page.locator("#business-name").pressSequentially(BUSINESS, { delay: 40 });
  if ((await page.locator("#business-type option").count()) > 1)
    await page.locator("#business-type").selectOption({ index: 1 });
  await say(6, "HOY", "Datos del negocio", "Nombre y giro, y entra a su espacio.", 3000);
  await say(6, "HOY", "Al terminar el alta empieza la prueba", "15 días sin tarjeta del plan elegido (o Profesional). Una sola prueba por persona.", 5000);
  await page.locator("form button.button-primary").first().click();
  await page.waitForTimeout(5000);
  const gate = page.getByRole("heading", { name: "Antes de continuar" });
  if (await gate.isVisible().catch(() => false)) {
    await page.getByLabel(/Acepto los Términos/).check();
    await page.getByRole("button", { name: "Aceptar y continuar" }).click();
    await page.waitForTimeout(1500);
  }
  await say(7, "HOY", "Panel del cliente", "La cuenta ya está en su panel, en prueba.", 4000);

  // Configuración → Plan with the trial.
  await page.goto(`${PANEL}/settings/plan`);
  await page.getByText("Consumo y límites").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(800);
  await say(8, "HOY", "Días de prueba", "Configuración, Plan muestra los días que quedan y que no se cobra nada hasta contratar.", 7000, page.getByText(/Te quedan|Te queda/).first());
  await wheel(700);
  await say(8, "HOY", "Límites del plan de la prueba", "Durante la prueba aplican los límites del plan elegido.", 4500);
  await wheel(900);
  const choose = page.getByRole("button", { name: "Elegir plan" }).nth(1);
  await say(9, "HOY", "Elegir Profesional", "Kardo crea una sesión de Checkout en Stripe.", 4000, choose);
  await choose.click();
  await page.waitForURL(/checkout\.stripe\.com/, { timeout: 40_000 });
  await page.locator("#cardNumber").waitFor({ timeout: 30_000 });
  await page.waitForTimeout(1500);
  await say(9, "HOY", "Checkout de Stripe", "Con 5 días o más de prueba, hoy no se cobra: el primer cargo es el día que termina la prueba.", 7000);
  await page.locator("#cardNumber").pressSequentially("4242424242424242", { delay: 35 });
  await page.locator("#cardExpiry").pressSequentially("1234", { delay: 35 });
  await page.locator("#cardCvc").pressSequentially("123", { delay: 35 });
  await page.locator("#billingName").pressSequentially(BUSINESS, { delay: 30 });
  await say(10, "PRUEBA", "Tarjeta de prueba 4242", "Tarjeta de prueba de Stripe; no es real.", 4000);
  await page.locator('button[type="submit"]').first().click();
  await page.waitForURL(new RegExp(PANEL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), { timeout: 90_000 });
  await page.waitForTimeout(4000);
  await page.reload();
  await page.getByText("Consumo y límites").first().waitFor({ timeout: 20_000 });
  await page.waitForTimeout(1500);
  await say(11, "HOY", "Suscripción creada", "El webhook llegó en segundos: plan, primer cobro, tarjeta y límites. Se encoló el correo de confirmación.", 7000, page.getByText(/Primer cobro|Próximo cobro/).first());

  // Operations.
  await page.goto(`${OPS}/`);
  await page.getByLabel("Correo de trabajo").waitFor({ timeout: 20_000 });
  await say(12, "HOY", "Operations: panel privado", "Correo, contraseña y código de 6 dígitos (2FA).", 2500);
  await page.getByLabel("Correo de trabajo").pressSequentially(env.E2E_STAFF_EMAIL, { delay: 20 });
  await page.getByLabel("Contraseña").pressSequentially(env.E2E_STAFF_PASSWORD, { delay: 10 });
  await page.keyboard.press("Enter");
  await page.getByLabel("Código de 6 dígitos").waitFor({ timeout: 20_000 });
  await page.getByLabel("Código de 6 dígitos").pressSequentially(totp(env.E2E_STAFF_TOTP_SECRET), { delay: 60 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(3500);
  await page.goto(`${OPS}/billing`);
  await page.getByText("MRR").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await say(13, "HOY", "Suscripciones", "MRR, activas, en prueba, en mora y canceladas.", 6000, page.getByText("MRR").first());
  await unmark();
  await page.goto(`${OPS}/billing/workspaces/${owner.workspaceId}`);
  await page.getByText("Avisos al cliente").first().waitFor({ timeout: 60_000 });
  await page.waitForTimeout(1200);
  await say(14, "HOY", "Detalle de cobro", "Plan, prueba de Kardo, suscripción y acciones del equipo.", 7000, page.getByText("Prueba de Kardo").first());
  const notices = page.getByText("Avisos al cliente").first();
  await notices.evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.mouse.move(900, 450);
  await page.mouse.wheel(0, -90);
  await sleep(600);
  await repaint();
  await say(15, "HOY", "Avisos al cliente", "Cada correo legal queda con fecha, hora, destinatario y estado.", 8000);

  // Courtesy for a friend.
  await page.goto(`${OPS}/clientes/${friend.workspaceId}`);
  await page.getByRole("button", { name: "Cambiar plan" }).waitFor({ timeout: 60_000 });
  await say(16, "HOY", "Cuenta de un amigo", "Plan manual con fecha de fin para que pruebe el MVP sin pagar.", 4500);
  await page.getByRole("button", { name: "Cambiar plan" }).click();
  await page.locator("#plan-select option", { hasText: "(profesional)" }).waitFor({ state: "attached", timeout: 20_000 });
  const options = await page.locator("#plan-select option").allTextContents();
  const pro = options.find((option) => option.includes("(profesional)"));
  if (pro) await page.locator("#plan-select").selectOption({ label: pro });
  const until = new Date(Date.now() + 30 * 86_400_000).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });
  await page.locator("#plan-until").fill(until);
  await page.locator("#plan-reason").pressSequentially("Amigo probando el MVP por 30 días", { delay: 25 });
  await say(17, "HOY", "Plan manual con vencimiento", "Profesional por 30 días, con motivo; queda en la auditoría.", 5000, page.locator("#plan-dialog-form"));
  await page.getByRole("button", { name: "Guardar plan" }).click();
  await page.locator("#plan-dialog-form").waitFor({ state: "detached", timeout: 20_000 }).catch(() => undefined);
  await page.waitForTimeout(2000);
  await say(18, "HOY", "Cortesía guardada", "La organización del amigo queda en Profesional hasta la fecha elegida.", 5000);
} catch (error) {
  log(`ERROR ${error.message.split("\n")[0]}`);
  process.exitCode = 1;
} finally {
  await context.close();
  await browser.close();
  finishVideo(dir, "billing-tour");
}
