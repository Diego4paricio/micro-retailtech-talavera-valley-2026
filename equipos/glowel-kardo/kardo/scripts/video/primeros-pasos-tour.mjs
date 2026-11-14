// A new owner from zero to the panel (relevo 33, 2026-10-07): sign up with
// the emailed code, the alta («Tú» and the account), the five steps
// of Primeros pasos (business, page, look, how customers find it, try it),
// the published page as a customer sees it and the Resumen.
//
//   node scripts/research/usuarios-simulados/servidores.mjs api     # 3031
//   node scripts/research/usuarios-simulados/servidores.mjs panel   # 5196
//   node scripts/video/primeros-pasos-tour.mjs
//
// kardo-dev only. The account is a Resend test inbox: the code is read off
// camera from kardo-dev (scripts/research/usuarios-simulados/codigo.mjs) and
// typed on camera, so nothing is emailed to anyone. The password is random,
// kept in scripts/video/.out/accounts.json and never printed.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import path from "node:path";
import { chromium } from "playwright-core";
import {
  createNarrator,
  finishVideo,
  log,
  postgres,
  readAccounts,
  readEnv,
  recordingContext,
  root,
  sleep,
  writeAccounts,
} from "./lib.mjs";

const PANEL = process.env.VIDEO_PANEL ?? "http://localhost:5196";
const NAME = "primeros-pasos";
const TOTAL = 11;

const env = readEnv();
if (!["local", "development", "test"].includes(env.KARDO_ENV ?? "local"))
  throw new Error("Only outside production.");
const resolver = env.TAP_RESOLVER_URL;
if (!resolver) throw new Error("Falta TAP_RESOLVER_URL en .env.");

const stamp = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, "");
const email = `delivered+kardo-sim-video-${stamp}@resend.dev`;
const password = `Kd-${randomBytes(9).toString("base64url")}7a`;
const accounts = readAccounts();
accounts[`video-${stamp}`] = {
  email,
  password,
  note: "Primeros pasos, video de punta a punta (relevo 33)",
};
writeAccounts(accounts);

const sql = postgres()(env.SUPABASE_ADMIN_DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});

/** The 6-digit code of the sign up, read off camera from kardo-dev. */
function emailedCode() {
  return execFileSync(
    "node",
    [path.join(root, "scripts/research/usuarios-simulados/codigo.mjs"), email],
    { encoding: "utf8" },
  ).trim();
}

const browser = await chromium.launch({ channel: "chrome", headless: true });
const { context, dir } = await recordingContext(browser, NAME);
const page = await context.newPage();
const n = createNarrator(page, TOTAL);
const type = async (locator, text, delay = 45) => {
  await locator.click();
  await locator.pressSequentially(text, { delay });
};
const heading = (text) => page.getByRole("heading", { name: text });

try {
  await n.slide(
    `<h1>De una cuenta nueva a su panel</h1>
     <p>Así empieza un negocio en Kardo: crea su cuenta, dice quién es y en cinco pasos publica su página. Al final, un cliente la abre y el dueño llega a su panel.</p>
     <p class="k">Cocina Doña Lupe, en Puebla</p>`,
    5000,
  );

  // 1. Crear la cuenta -------------------------------------------------------
  await page.goto(`${PANEL}/registro`);
  await heading("Crea tu cuenta.").waitFor();
  const emailField = page.getByLabel("Correo electrónico");
  await n.say(
    1,
    "HOY",
    "Crea su cuenta",
    "Solo su correo y aceptar los términos. Kardo le manda un código para confirmar que es suyo.",
    2500,
    emailField,
  );
  await type(emailField, email, 25);
  await page.getByRole("checkbox").check();
  await sleep(500);
  await page.getByRole("button", { name: "Enviar código" }).click();
  await n.unmark();
  await heading("Confirma tu correo.").waitFor();
  const codeField = page.getByLabel("Código de verificación");
  await n.say(
    1,
    "PRUEBA",
    "El código del correo",
    "El correo es una bandeja de prueba: el código lo leemos de kardo-dev, fuera de cámara, y lo escribimos aquí.",
    3500,
    codeField,
  );
  await type(codeField, emailedCode(), 120);
  await page.keyboard.press("Enter");
  await heading("Protege tu cuenta.").waitFor();
  const passwordField = page.getByLabel("Contraseña", { exact: true });
  await n.say(
    2,
    "HOY",
    "Su contraseña",
    "Doce caracteres o más, con mayúscula, número y símbolo. La lista se palomea mientras escribe.",
    2500,
    passwordField,
  );
  await type(passwordField, password, 35);
  await type(page.getByLabel("Confirmar contraseña"), password, 20);
  await sleep(800);
  await page.getByRole("button", { name: "Continuar" }).click();
  await n.unmark();

  // 2. El alta: quién es, su cuenta y su objetivo -----------------------------
  await heading(/Configura/).waitFor();
  await n.say(
    3,
    "HOY",
    "Primero, quién es",
    "Su nombre, sus apellidos y cómo le gusta que le digan. Así la saluda Kardo en el panel y en los correos, no con el nombre del negocio.",
    3500,
    page.locator("#first-name"),
  );
  await type(page.locator("#first-name"), "Guadalupe");
  await type(page.locator("#last-name"), "Hernández Ruiz");
  const preferred = page.locator("#preferred-name");
  await n.say(
    3,
    "HOY",
    "¿Cómo te decimos?",
    "Se llena solo con su primer nombre. Ella prefiere «Lupita».",
    2500,
    preferred,
  );
  await preferred.fill("");
  await type(preferred, "Lupita", 70);
  await sleep(600);
  await page.getByRole("button", { name: "Continuar" }).click();
  await n.unmark();
  await page.locator("#account-business").waitFor();
  await page.locator("label[for='account-business']").click();
  await type(page.locator("#business-name"), "Cocina Doña Lupe");
  await page.locator("#business-type").selectOption("restaurante");
  await n.say(
    4,
    "HOY",
    "Su cuenta: un negocio",
    "El nombre del negocio y su giro. Si fuera «Personal», la organización llevaría su nombre.",
    3000,
    page.locator("#business-type"),
  );
  await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
  await n.unmark();

  // 3. Primeros pasos, paso 1: su negocio -----------------------------------
  await heading("Tu negocio").waitFor();
  await n.say(
    5,
    "HOY",
    "Primeros pasos: su negocio",
    "Cinco pasos arriba, solo el título como texto. El giro ya viene del alta; falta su WhatsApp, su horario y su ciudad.",
    3500,
    page.locator(".fs-stepper"),
  );
  await type(page.locator("#fs-phone"), "2224567812", 60);
  for (const day of [
    "lunes",
    "martes",
    "miércoles",
    "jueves",
    "viernes",
    "sábado",
  ])
    await page.getByRole("button", { name: day, exact: true }).click();
  const times = page.locator(".hours-times select");
  await times.nth(0).selectOption("08:00");
  await times.nth(1).selectOption("17:00");
  await type(page.locator("#fs-city"), "pueb", 90);
  await page
    .getByRole("option", { name: /Puebla/ })
    .first()
    .click();
  await sleep(1200);
  await n.say(
    5,
    "HOY",
    "Horario y ciudad, elegidos",
    "Días y horas se tocan, la ciudad se busca. Kardo propone la dirección del negocio y revisa que esté libre (aquí, con el dominio de pruebas).",
    3500,
    page.getByText("Tu dirección en Kardo"),
  );
  await page.getByRole("button", { name: "Guardar y seguir" }).click();
  await n.unmark();

  // 4. Paso 2: su página -----------------------------------------------------
  await heading("Tu página").waitFor();
  await n.say(
    6,
    "HOY",
    "Qué ven sus clientes",
    "Todos los tipos de página a la vista, en cuadros. Los de su giro van primero: escribir el menú, subirlo en PDF o una foto.",
    3500,
    page.locator(".fs-tiles"),
  );
  await page.getByRole("button", { name: "Escribe tu menú" }).click();
  await n.unmark();
  await page.getByRole("button", { name: /Pégala aquí/ }).click();
  await type(
    page.locator("#qie-paste"),
    "Desayunos:\nChilaquiles verdes $95\nMolletes $70\nComida:\nMole poblano $140\nChiles en nogada $185\nBebidas:\nAgua de jamaica $30\nCafé de olla $35",
    18,
  );
  await page.getByRole("button", { name: "Acomodar mi lista" }).click();
  await sleep(600);
  await n.say(
    6,
    "HOY",
    "Su menú, pegado",
    "Pegó la lista que ya tenía escrita: Kardo la acomoda en secciones con sus precios.",
    3500,
    page.locator(".fs-section").first(),
  );
  await page
    .getByRole("button", { name: /Guardar \d+ platillos y seguir/ })
    .click();
  // The look step draws twenty pages first: no caption over it meanwhile.
  await n.hide();

  // 5. Paso 3: cómo se ve -----------------------------------------------------
  await heading("Cómo se ve").waitFor();
  await sleep(2500);
  await n.say(
    7,
    "HOY",
    "Su página, ya diseñada",
    "Veinte estilos de primera impresión, los de comida primero, llenos con sus datos reales: nombre, horario, ciudad, menú y WhatsApp.",
    4500,
    page.locator(".fs-look-strip"),
  );
  await page.getByRole("button", { name: "Sello", exact: true }).click();
  await sleep(1500);
  await page.getByRole("button", { name: "Rojo" }).click();
  await sleep(1200);
  const phrase = page.getByLabel("Frase");
  await phrase.fill("");
  await type(phrase, "Comida casera en Puebla", 55);
  await sleep(1500);
  await n.say(
    7,
    "HOY",
    "Estilo, color y texto aquí mismo",
    "Eligió «Sello», el rojo y su propia frase. Para cambiar más, una línea la lleva al Estudio o a la IA.",
    4500,
    page.locator(".fs-look-phone"),
  );
  await page.getByRole("button", { name: "Usar este diseño y seguir" }).click();
  await n.unmark();

  // 6. Paso 4: cómo la encuentran --------------------------------------------
  await heading("Cómo te encuentran").waitFor();
  await n.say(
    8,
    "HOY",
    "QR, NFC o link",
    "Tres cuadros con los símbolos de siempre. Elige un QR para sus mesas: Kardo le pone nombre y publica.",
    3500,
    page.locator(".fs-ways"),
  );
  await page.getByRole("button", { name: "Crear mi QR y publicar" }).click();
  await n.unmark();

  // 7. Paso 5: pruébalo, y la página como la ve un cliente --------------------
  await heading("Pruébalo").waitFor({ timeout: 30_000 });
  await sleep(1200);
  await n.say(
    9,
    "HOY",
    "Su QR, con el marco de Kardo",
    "Listo para imprimir. Desde aquí ya no se puede volver a publicar: los pasos anteriores se cierran.",
    4000,
    page.locator(".fs-qr"),
  );
  const [touchpoint] = await sql`
    select t.public_id
    from kardo_core.touchpoints t
    join kardo_core.workspace_memberships m on m.workspace_id = t.workspace_id
    join kardo_core.profiles p on p.id = m.profile_id
    where lower(p.email) = lower(${email}) and t.kind = 'qr'
    order by t.created_at desc
    limit 1
  `;
  if (!touchpoint) throw new Error("No se encontró el QR publicado.");
  await n.hide();
  await page.goto(`${resolver}/t/${touchpoint.public_id}`);
  await sleep(2500);
  await n.say(
    10,
    "HOY",
    "Lo que ve un cliente al escanear",
    "La página publicada, servida por el Resolver de pruebas: portada, horario, ubicación, el menú y el botón para pedir por WhatsApp.",
    4500,
  );
  await n.wheel(900, 14);
  await sleep(2000);
  await n.wheel(900, 14);
  await sleep(2500);

  // 8. ¡Listo! y su panel -----------------------------------------------------
  await n.hide();
  await page.goto(`${PANEL}/primeros-pasos`);
  await heading("Pruébalo").waitFor();
  await page.getByRole("button", { name: "Ya lo vi, se ve bien" }).click();
  await n.unmark();
  await heading(/¡Listo!/).waitFor();
  await n.say(
    11,
    "HOY",
    "¡Listo!",
    "Sale una sola vez. Después, Primeros pasos ya no vuelve: ni el botón flotante ni la entrada de Ayuda.",
    3500,
    page.locator(".fs-finished"),
  );
  await page.getByRole("link", { name: "Ir a mi panel" }).click();
  await n.unmark();
  await heading("Resumen").waitFor();
  await sleep(2500);
  await n.say(
    11,
    "HOY",
    "Su panel",
    "La saluda por su nombre preferido, «Lupita», y abajo a la izquierda está su nombre completo, no su correo.",
    5000,
    page.locator(".ov-greeting"),
  );
  await n.hide();
  await sleep(3500);

  await n.slide(
    `<h2>Lo que vimos</h2>
     <ul>
       <li>Cuenta nueva con su código, y en el alta su nombre y cómo le gusta que le digan.</li>
       <li>Cinco pasos con solo el título: su negocio, su página, cómo se ve, cómo la encuentran y pruébalo.</li>
       <li>Veinte estilos de primera impresión con sus datos reales; color y texto se cambian ahí mismo.</li>
       <li>Publicado una sola vez, la página abierta como cliente y su panel al final.</li>
     </ul>`,
    6000,
  );
} finally {
  await context.close();
  await browser.close();
  await sql.end();
}

finishVideo(dir, NAME);
log(
  `Cuenta de prueba: ${email} (contraseña en scripts/video/.out/accounts.json)`,
);
