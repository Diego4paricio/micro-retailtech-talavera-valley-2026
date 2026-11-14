// End-to-end walkthrough of the changes from this session (security #2/#3,
// round-4 fixes, the publish replace guard) and kardo-a9's P2/Disponibilidad,
// recorded as an MP4 with captions. Development only, against kardo-dev and the
// local panel. Prepare the preview accounts first (owner-preview / demo-admin
// with 3 orgs, an NFC, a Link and pending transfers), then:
//
//   node scripts/video/ronda4-cambios-tour.mjs
//
// Local stack: Customer API on 3011 (kardo-dev) and the panel on 5185.
import { chromium } from "playwright-core";
import {
  createNarrator,
  finishVideo,
  log,
  recordingContext,
  sleep,
} from "./lib.mjs";

const PANEL = process.env.VIDEO_PANEL ?? "http://localhost:5185";
// The preview owner's credentials come from the environment, never from the
// repository: VIDEO_OWNER_EMAIL (default owner-preview@kardo.test) and
// VIDEO_OWNER_PASSWORD.
const OWNER = {
  email: process.env.VIDEO_OWNER_EMAIL ?? "owner-preview@kardo.test",
  password: process.env.VIDEO_OWNER_PASSWORD ?? "",
};
if (!OWNER.password) {
  console.error("Falta VIDEO_OWNER_PASSWORD (contraseña de la cuenta de vista previa).");
  process.exit(1);
}
const NAME = "ronda4-cambios";
const TOTAL = 12;
const H = 5200; // default caption hold

async function step(label, fn) {
  try {
    await fn();
  } catch (error) {
    log(`! ${label}: ${error instanceof Error ? error.message.split("\n")[0] : error}`);
  }
}

async function main() {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const { context, dir } = await recordingContext(browser, NAME);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const n = createNarrator(page, TOTAL);

  // 0. Title
  await n.slide(
    `<span class="tag hoy">RESUMEN</span>
     <h1>Cambios de la ronda 4 y de seguridad</h1>
     <p class="k">Transferencia con consentimiento · Un RFC por cuenta · Guarda al publicar</p>
     <p>Más: duplicar sin heredar destinos, «Tu link en Kardo», QR de respaldo del NFC, el límite de organizaciones y «¿Dónde lo vas a compartir?»</p>`,
    5000,
  );

  // 1. Login
  await step("login", async () => {
    await page.goto(`${PANEL}/`, { waitUntil: "domcontentloaded" });
    await page.fill("#email", OWNER.email);
    await page.fill("#password", OWNER.password);
    await page.getByRole("button", { name: "Iniciar sesión", exact: true }).click();
    await page.getByRole("link", { name: "Resumen" }).first().waitFor({ timeout: 20000 });
  });
  await n.say(1, "HOY", "Entramos al panel", "Cuenta de prueba en kardo-dev. Recorremos cada cambio.", 4200);

  const switcher = page.locator(".workspace-switcher select");

  // 2. Organization limit: the cap opens straight (fix) with the trial hint
  await step("org-cap", async () => {
    await switcher.selectOption("crear-organizacion");
    await page.getByRole("heading", { name: /organización/i }).first().waitFor();
    await sleep(900);
  });
  await n.say(
    2,
    "HOY",
    "Límite de organizaciones",
    "Usas 3 de 3 en la prueba. Al tope, el diálogo abre directo aquí (ya no muestra el formulario y luego cambia) y explica que al terminar la prueba puedes agregar una organización sin subir de plan.",
    7000,
    page.getByRole("dialog").first(),
  );
  await step("close-cap", async () => {
    await page.getByRole("button", { name: /Cancelar|Cerrar/ }).first().click();
    await sleep(500);
  });

  // 3. Ownership transfer — recipient side (Barbería El Bigote)
  await step("go-barberia", async () => {
    await switcher.selectOption({ label: "Barbería El Bigote" });
    await sleep(1200);
    await page.getByRole("link", { name: "Equipo" }).first().click();
    await page.getByText(/quiere pasarte la propiedad/i).waitFor({ timeout: 15000 });
  });
  await n.say(
    3,
    "HOY",
    "Transferencia con consentimiento (recibir)",
    "Nadie recibe una organización sin aceptarla. Aquí te ofrecen la propiedad y decides: Aceptar o Rechazar. Hasta entonces nada cambia.",
    7000,
    page.getByText(/quiere pasarte la propiedad/i),
  );

  // 4. Ownership transfer — sender side (Panadería Aurora)
  await step("go-aurora-team", async () => {
    await switcher.selectOption({ label: "Panadería Aurora" });
    await sleep(1200);
    await page.getByRole("link", { name: "Equipo" }).first().click();
    await page.getByText(/Le enviamos la solicitud/i).waitFor({ timeout: 15000 });
  });
  await n.say(
    4,
    "HOY",
    "Transferencia con consentimiento (enviar)",
    "El Owner solo solicita la transferencia; mientras la otra persona no acepta, sigue siendo el Owner y puede cancelarla.",
    6500,
    page.getByText(/Le enviamos la solicitud/i),
  );

  // 5. NFC backup QR on the card's fiche
  await step("nfc", async () => {
    await page.getByRole("link", { name: "QR y etiquetas" }).first().click();
    await sleep(800);
    await page.getByText("Mostrador").first().click();
    await page.getByText(/QR de respaldo/i).first().waitFor({ timeout: 15000 });
  });
  await n.say(
    5,
    "HOY",
    "QR de respaldo del NFC",
    "La etiqueta NFC trae su QR de respaldo en la ficha; en celular ahora queda justo debajo, no al fondo.",
    6000,
    page.getByText(/QR de respaldo/i).first(),
  );

  // 6. New QR dialog: notes about NFC backup and Links-for-social
  await step("new-qr", async () => {
    await page.getByRole("link", { name: "QR y etiquetas" }).first().click();
    await sleep(600);
    await page.getByRole("button", { name: /Nuevo QR|Nuevo QR o etiqueta/ }).first().click();
    await page.getByText(/compartir por WhatsApp o Instagram/i).waitFor({ timeout: 15000 });
  });
  await n.say(
    6,
    "HOY",
    "Nuevo QR o etiqueta: guía",
    "Si solo quieres un enlace para redes, es un Link, no un QR. Y una etiqueta NFC ya trae su propio QR de respaldo.",
    6500,
    page.getByText(/compartir por WhatsApp o Instagram/i),
  );
  await step("close-new-qr", async () => {
    await page.keyboard.press("Escape");
    await sleep(500);
  });

  // 7. Links: the address field now clarifies it's a web address, not a street
  const webHint = page.getByText(/dirección web|no es tu domicilio|no tu domicilio/i).first();
  await step("links", async () => {
    await page.getByRole("link", { name: "Links" }).first().click();
    await sleep(700);
    await page.getByRole("button", { name: "Cambiar la dirección de tu negocio" }).click();
    await webHint.waitFor({ timeout: 15000 });
  });
  await n.say(
    7,
    "HOY",
    "Tu dirección es tu link, no tu calle",
    "El campo de la dirección (tu link en Kardo) ahora aclara que es tu dirección web, no tu domicilio: antes algunas personas escribían la calle del negocio.",
    6500,
    webHint,
  );
  await step("close-address", async () => {
    await page.keyboard.press("Escape");
    await sleep(400);
  });

  // 8. Pages list — caption the N15 fix (duplicate no longer inherits targets)
  const pageRow = page.getByText("Promos de temporada").first();
  await step("duplicate", async () => {
    await page.getByRole("link", { name: "Páginas" }).first().click();
    await pageRow.waitFor({ timeout: 15000 });
    await sleep(500);
  });
  await n.say(
    8,
    "HOY",
    "Duplicar no hereda destinos (N15)",
    "Antes, duplicar una página copiaba sus destinos y publicar la copia reemplazaba al original en silencio. Ahora la copia nace sin destinos: publicarla no pisa a nadie.",
    6500,
    pageRow,
  );

  // 9. Trial banner can be dismissed
  await step("banner", async () => {
    const dismiss = page.getByRole("button", { name: "Ocultar este aviso" }).first();
    await dismiss.scrollIntoViewIfNeeded();
    await n.say(
      9,
      "HOY",
      "Franja de prueba descartable",
      "La franja «Te quedan N días de prueba» ahora se puede ocultar por la sesión; aparecía en cada sección.",
      5500,
      dismiss,
    );
    await dismiss.click().catch(() => undefined);
  });

  // 10–11. Captions for the backend-only guards (not a screen)
  await n.slide(
    `<span class="tag hoy">SERVIDOR</span>
     <h2>Guarda al publicar (B1) y un RFC por cuenta</h2>
     <ul>
       <li>Publicar en un destino nuevo nunca reemplaza otro en silencio: pide «¿Dónde lo vas a compartir?» y solo reemplaza lo que confirmas.</li>
       <li>Los datos fiscales y los CFDI son del titular de la cuenta (una suscripción, un RFC), no de cada organización.</li>
     </ul>`,
    6500,
  );

  await n.slide(
    `<h1>Fin del recorrido</h1>
     <p class="k">Ronda 4 + seguridad #2/#3 + guarda de publicación</p>
     <p>Todo en main, verificado contra kardo-dev. Sin desplegar a producción.</p>`,
    4500,
  );

  await page.close();
  await context.close();
  await browser.close();
  finishVideo(dir, NAME);
  log(`video: scripts/video/.out/${NAME}.mp4`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
