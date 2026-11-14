// New owners from zero to the panel, each with another kind of page
// (owner, 2026-10-07: «lo que menos espero es que seleccionen menú»): a
// florist uploads her catalog in PDF and her logo and shares a link; an
// accountant makes a business card with his logo on an NFC tag; a bar
// uploads a photo of its drinks list and skips the logo; a nail studio
// makes a links page with its logo. Each one: sign up with the emailed code,
// the alta, the five steps (with the logo before the looks), the published
// page as a customer sees it and the Resumen.
//
//   node scripts/research/usuarios-simulados/servidores.mjs api     # 3031
//   node scripts/research/usuarios-simulados/servidores.mjs panel   # 5196
//   node scripts/video/primeros-pasos-tipos.mjs floreria|despacho|bar|unas
//
// kardo-dev only. Resend test inboxes: the code is read off camera from
// kardo-dev (scripts/research/usuarios-simulados/codigo.mjs). Passwords are
// random, kept in scripts/video/.out/accounts.json and never printed. The
// uploaded files (logos, catalog, drinks list) are drawn here first.
//
// The test Assets Worker only answers CORS for the panels on 5173 and 5175
// (its wrangler.jsonc). This panel runs on 5196, so the recording browser
// passes the requests to that Worker through Node with the same signed URL
// and adds the CORS header for 5196. Nothing in the Worker changes.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright-core";
import {
  createNarrator,
  finishVideo,
  log,
  outDir,
  postgres,
  readAccounts,
  readEnv,
  recordingContext,
  root,
  sleep,
  writeAccounts,
} from "./lib.mjs";

const PANEL = process.env.VIDEO_PANEL ?? "http://localhost:5196";
const TOTAL = 11;

const personas = {
  floreria: {
    title: "Una florería sube su catálogo en PDF",
    first: "Mariana",
    last: "Ortega Luna",
    preferred: "Mariana",
    business: "Florería Jacaranda",
    industry: "retail",
    phone: "4421234567",
    days: ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado"],
    open: "09:00",
    close: "19:00",
    city: ["quer", /Querétaro/],
    page: {
      tile: "Sube tu catálogo en PDF",
      say: "Ya tiene su catálogo hecho en PDF: lo sube y Kardo muestra sus páginas, sin descargar nada.",
    },
    logo: "jacaranda",
    look: "Patrón",
    color: null,
    phrase: "Arreglos y ramos a domicilio en Querétaro",
    share: "link",
  },
  despacho: {
    title: "Un despacho hace su tarjeta de presentación",
    first: "Ricardo",
    last: "Salas Vega",
    preferred: "Lic. Salas",
    business: "Despacho Contable Salas",
    industry: "servicios",
    phone: "8112345678",
    days: ["lunes", "martes", "miércoles", "jueves", "viernes"],
    open: "09:00",
    close: "18:00",
    city: ["monte", /Monterrey/],
    page: {
      tile: "Tarjeta de presentación",
      say: "Una tarjeta con sus botones: WhatsApp, cómo llegar y su sitio web.",
    },
    logo: "salas",
    look: "Esquina",
    color: null,
    phrase: "Contabilidad e impuestos para negocios",
    share: "nfc",
  },
  bar: {
    title: "Un bar sube la foto de su carta",
    first: "Daniela",
    last: "Ríos Pérez",
    preferred: "Dani",
    business: "La Terraza Bar",
    industry: "bar",
    phone: "3312345678",
    days: ["jueves", "viernes", "sábado"],
    open: "18:00",
    close: "23:30",
    city: ["guada", /Guadalajara/],
    page: {
      tile: "Una foto de tu menú",
      say: "Ya tiene su carta de bebidas como imagen: la sube y se ve en grande.",
    },
    logo: null,
    look: "Marco",
    color: null,
    phrase: "Mezcal y coctelería de jueves a sábado",
    share: "qr",
  },
  unas: {
    title: "Un estudio de uñas arma sus enlaces",
    first: "Sofía",
    last: "Lara Méndez",
    preferred: "Sofi",
    business: "Estudio de Uñas Sofi",
    industry: "belleza",
    phone: "2229876501",
    days: ["martes", "miércoles", "jueves", "viernes", "sábado"],
    open: "10:00",
    close: "20:00",
    city: ["pueb", /Puebla/],
    page: {
      tile: "Tus enlaces",
      say: "Su página de enlaces, como la de su bio de Instagram: WhatsApp primero y sus redes.",
    },
    logo: "sofi",
    look: "Aurora",
    color: null,
    phrase: "Uñas acrílicas, gel y diseño en Puebla",
    share: "link",
  },
};

const key = process.argv[2];
const persona = personas[key];
if (!persona)
  throw new Error(
    `Uso: primeros-pasos-tipos.mjs ${Object.keys(personas).join("|")}`,
  );
const NAME = `primeros-pasos-${key}`;

const env = readEnv();
if (!["local", "development", "test"].includes(env.KARDO_ENV ?? "local"))
  throw new Error("Only outside production.");
const resolver = env.TAP_RESOLVER_URL;
if (!resolver) throw new Error("Falta TAP_RESOLVER_URL en .env.");

const stamp = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, "");
const email = `delivered+kardo-sim-${key}-${stamp}@resend.dev`;
const password = `Kd-${randomBytes(9).toString("base64url")}7a`;
const accounts = readAccounts();
accounts[`${key}-${stamp}`] = {
  email,
  password,
  note: `Primeros pasos, ${persona.business} (relevo 33)`,
};
writeAccounts(accounts);

const sql = postgres()(env.SUPABASE_ADMIN_DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});

function emailedCode() {
  return execFileSync(
    "node",
    [path.join(root, "scripts/research/usuarios-simulados/codigo.mjs"), email],
    { encoding: "utf8" },
  ).trim();
}

// --- Files the owners upload, drawn off camera ------------------------------
const assets = path.join(outDir, "primeros-pasos-assets");
fs.mkdirSync(assets, { recursive: true });

const logos = {
  jacaranda: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" fill="#6b3fa0"/><g fill="#e9d8fd">${[0, 72, 144, 216, 288].map((r) => `<ellipse cx="100" cy="62" rx="18" ry="34" transform="rotate(${r} 100 100)"/>`).join("")}</g><circle cx="100" cy="100" r="16" fill="#f6c453"/></svg>`,
  salas: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><rect x="6" y="6" width="188" height="188" rx="28" fill="#0f2a4a"/><text x="100" y="128" font-family="Georgia,serif" font-size="88" font-weight="700" fill="#ffffff" text-anchor="middle">DS</text><rect x="52" y="146" width="96" height="6" rx="3" fill="#c9a24b"/></svg>`,
  sofi: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><circle cx="100" cy="100" r="96" fill="#f6d5dc"/><text x="100" y="134" font-family="Georgia,serif" font-style="italic" font-weight="700" font-size="112" fill="#b0305a" text-anchor="middle">S</text><circle cx="142" cy="60" r="9" fill="#b0305a"/><circle cx="58" cy="146" r="5" fill="#b0305a"/></svg>`,
};

async function drawFiles(browser) {
  const context = await browser.newContext({ deviceScaleFactor: 1 });
  const page = await context.newPage();
  if (persona.logo) {
    await page.setViewportSize({ width: 512, height: 512 });
    await page.setContent(
      `<html><body style="margin:0;background:transparent">${logos[persona.logo].replace("<svg ", '<svg width="512" height="512" ')}</body></html>`,
    );
    await page.screenshot({
      path: path.join(assets, `${persona.logo}.png`),
      omitBackground: true,
    });
  }
  if (key === "floreria") {
    const products = [
      ["Ramo Jacaranda", "Rosas lilas y eucalipto", 650],
      ["Caja de girasoles", "Doce girasoles en caja kraft", 520],
      ["Arreglo Primavera", "Tulipanes, lisianthus y alstroemerias", 890],
      ["Orquídea en maceta", "Phalaenopsis blanca, dos varas", 760],
      ["Ramo de novia", "Peonías y rosas de jardín", 1450],
      ["Corona de condolencia", "Lilis, crisantemos y follaje", 1800],
    ];
    const flower = (x, y, size, color) =>
      [0, 72, 144, 216, 288]
        .map(
          (turn) =>
            `<div style="position:absolute;left:${x - size * 0.22}px;top:${y - size * 0.5}px;width:${size * 0.44}px;height:${size * 0.5}px;border-radius:50%;background:${color};transform-origin:50% 100%;transform:rotate(${turn}deg)"></div>`,
        )
        .join("") +
      `<div style="position:absolute;left:${x - size * 0.1}px;top:${y - size * 0.1}px;width:${size * 0.2}px;height:${size * 0.2}px;border-radius:50%;background:#f6c453"></div>`;
    const pageHtml = (title, rows, tone) =>
      `<html><body style="margin:0;width:1240px;height:1754px;background:#fbf8f3;font-family:Georgia,serif;color:#2b1d33">
        <div style="box-sizing:border-box;height:1754px;padding:110px 120px 100px;display:flex;flex-direction:column">
        <div style="font-size:30px;letter-spacing:6px;color:#6b3fa0">FLORERÍA JACARANDA</div>
        <h1 style="font-size:96px;margin:20px 0 48px;font-weight:400">${title}</h1>
        <div style="position:relative;height:420px;border-radius:36px;overflow:hidden;background:linear-gradient(135deg,${tone[0]},${tone[1]})">
          ${flower(230, 250, 260, "#e9d8fd")}${flower(560, 170, 180, "#ffffff")}${flower(820, 280, 300, "#d6bcfa")}${flower(960, 150, 150, "#ffffff")}
        </div>
        <div style="margin-top:36px">${rows.map(([n, d, p]) => `<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #e3d6ee;padding:30px 0"><div><div style="font-size:52px">${n}</div><div style="font-size:30px;color:#6e5b7a;margin-top:8px;font-family:Helvetica,Arial,sans-serif">${d}</div></div><div style="font-size:52px;color:#6b3fa0">$${p}</div></div>`).join("")}</div>
        <div style="margin-top:auto;display:flex;justify-content:space-between;font-size:28px;color:#6e5b7a;font-family:Helvetica,Arial,sans-serif"><span>Pedidos por WhatsApp</span><span>Entrega el mismo día en Querétaro</span></div>
        </div></body></html>`;
    await page.setViewportSize({ width: 1240, height: 1754 });
    const pngs = [];
    for (const [index, [title, rows, tone]] of [
      ["Ramos y arreglos", products.slice(0, 3), ["#8a5cc2", "#5b2f8f"]],
      ["Ocasiones especiales", products.slice(3), ["#b08ad8", "#6b3fa0"]],
    ].entries()) {
      await page.setContent(pageHtml(title, rows, tone));
      const file = path.join(assets, `catalogo-${index + 1}.png`);
      await page.screenshot({ path: file });
      pngs.push(file);
    }
    // An image-only PDF: no forms or scripts for the Assets Worker to flag.
    execFileSync("python3", [
      "-c",
      "import sys;from PIL import Image;i=[Image.open(p).convert('RGB') for p in sys.argv[2:]];i[0].save(sys.argv[1],save_all=True,append_images=i[1:],resolution=150)",
      path.join(assets, "catalogo-jacaranda.pdf"),
      ...pngs,
    ]);
  }
  if (key === "bar") {
    const drinks = [
      ["Mezcal espadín", "Copita, con naranja y sal de gusano", 120],
      ["Carajillo", "Licor 43 y espresso", 140],
      ["Margarita de tamarindo", "Tequila, tamarindo y chile", 150],
      ["Paloma", "Tequila blanco y toronja", 130],
      ["Cerveza artesanal", "Pregunta por la de la semana", 90],
    ];
    await page.setViewportSize({ width: 1080, height: 1350 });
    await page.setContent(`<html><body style="margin:0;width:1080px;height:1350px;background:#141110;color:#f3ead8;font-family:Georgia,serif">
      <div style="padding:110px 100px"><div style="font-size:28px;letter-spacing:8px;color:#d4a853">LA TERRAZA BAR</div>
      <h1 style="font-size:104px;font-weight:400;margin:20px 0 70px">Carta de bebidas</h1>
      ${drinks.map(([n, d, p]) => `<div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1px solid #3a322a;padding:26px 0"><div><div style="font-size:46px">${n}</div><div style="font-size:26px;color:#b9ab9b;margin-top:6px;font-family:Helvetica,Arial,sans-serif">${d}</div></div><div style="font-size:46px;color:#d4a853">$${p}</div></div>`).join("")}
      </div></body></html>`);
    await page.screenshot({ path: path.join(assets, "carta-terraza.png") });
  }
  await context.close();
}

// --- The take -----------------------------------------------------------------
const browser = await chromium.launch({ channel: "chrome", headless: true });
await drawFiles(browser);
const { context, dir } = await recordingContext(browser, NAME);
if (env.ASSET_WORKER_URL) {
  const worker = new URL(env.ASSET_WORKER_URL).origin;
  const cors = {
    "access-control-allow-origin": new URL(PANEL).origin,
    vary: "origin",
  };
  await context.route(
    (url) => url.origin === worker,
    async (route) => {
      if (route.request().method() === "OPTIONS")
        return route.fulfill({
          status: 204,
          headers: {
            ...cors,
            "access-control-allow-methods": "PUT",
            "access-control-allow-headers": "content-type",
          },
        });
      try {
        const response = await route.fetch();
        await route.fulfill({
          response,
          headers: { ...response.headers(), ...cors },
        });
      } catch {
        // The page moved on (or the take ended) while it was in flight.
        await route.abort().catch(() => undefined);
      }
    },
  );
}
const page = await context.newPage();
const n = createNarrator(page, TOTAL);
// A recording that starts on a blank page draws its first pages smaller
// than the window; one real page first fixes it, and that second is cut.
const startedAt = Date.now();
await page.goto(`${PANEL}/favicon.svg`).catch(() => undefined);
await sleep(800);
const lead = (Date.now() - startedAt) / 1000;
const type = async (locator, text, delay = 45) => {
  await locator.click();
  await locator.pressSequentially(text, { delay });
};
const heading = (text) => page.getByRole("heading", { name: text });
const shareKind = { link: "link", nfc: "nfc", qr: "qr" }[persona.share];

try {
  await n.slide(
    `<h1>${persona.title}</h1>
     <p>De una cuenta nueva a su panel: crea su cuenta, dice quién es y en cinco pasos publica su página. Al final, un cliente la abre.</p>
     <p class="k">${persona.business}</p>`,
    4500,
  );

  // 1. Crear la cuenta
  await page.goto(`${PANEL}/registro`);
  await heading("Crea tu cuenta.").waitFor();
  const emailField = page.getByLabel("Correo electrónico");
  await n.say(
    1,
    "HOY",
    "Crea su cuenta",
    "Su correo y aceptar los términos. Kardo le manda un código.",
    2200,
    emailField,
  );
  await type(emailField, email, 20);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Enviar código" }).click();
  await n.hide();
  await heading("Confirma tu correo.").waitFor();
  const codeField = page.getByLabel("Código de verificación");
  await n.say(
    1,
    "PRUEBA",
    "El código del correo",
    "Bandeja de prueba: el código se lee de kardo-dev fuera de cámara y se escribe aquí.",
    2800,
    codeField,
  );
  await type(codeField, emailedCode(), 110);
  await page.keyboard.press("Enter");
  await n.hide();
  await heading("Protege tu cuenta.").waitFor();
  const passwordField = page.getByLabel("Contraseña", { exact: true });
  await n.say(
    2,
    "HOY",
    "Su contraseña",
    "Doce caracteres o más.",
    1800,
    passwordField,
  );
  await type(passwordField, password, 30);
  await type(page.getByLabel("Confirmar contraseña"), password, 15);
  await sleep(500);
  await page.getByRole("button", { name: "Continuar" }).click();
  await n.hide();

  // 2. El alta
  await heading(/Configura/).waitFor();
  await n.say(
    3,
    "HOY",
    "Primero, quién es",
    `Su nombre y cómo le gusta que le digan: «${persona.preferred}».`,
    2500,
    page.locator("#first-name"),
  );
  await type(page.locator("#first-name"), persona.first);
  await type(page.locator("#last-name"), persona.last);
  const preferred = page.locator("#preferred-name");
  if (persona.preferred !== persona.first) {
    await preferred.fill("");
    await type(preferred, persona.preferred, 60);
  }
  await sleep(600);
  await page.getByRole("button", { name: "Continuar" }).click();
  await n.hide();
  await page.locator("#account-business").waitFor();
  await page.locator("label[for='account-business']").click();
  await type(page.locator("#business-name"), persona.business);
  await page.locator("#business-type").selectOption(persona.industry);
  await n.say(
    4,
    "HOY",
    "Su cuenta: un negocio",
    "El nombre del negocio y su giro.",
    2200,
    page.locator("#business-type"),
  );
  await page.getByRole("button", { name: "Entrar a mi espacio" }).click();
  await n.hide();

  // 3. Paso 1: su negocio
  await heading("Tu negocio").waitFor();
  await n.say(
    5,
    "HOY",
    "Primeros pasos: su negocio",
    "El giro ya viene del alta. Su WhatsApp, su horario y su ciudad se eligen.",
    2800,
    page.locator(".fs-stepper"),
  );
  await type(page.locator("#fs-phone"), persona.phone, 50);
  for (const day of persona.days)
    await page.getByRole("button", { name: day, exact: true }).click();
  const times = page.locator(".hours-times select");
  await times.nth(0).selectOption(persona.open);
  await times.nth(1).selectOption(persona.close);
  await type(page.locator("#fs-city"), persona.city[0], 90);
  await page.getByRole("option", { name: persona.city[1] }).first().click();
  await sleep(1500);
  await page.getByRole("button", { name: "Guardar y seguir" }).click();
  await n.hide();

  // 4. Paso 2: su página
  await heading("Tu página").waitFor();
  const tile = page.getByRole("button", { name: persona.page.tile });
  await n.say(
    6,
    "HOY",
    `Elige: «${persona.page.tile}»`,
    persona.page.say,
    3500,
    tile,
  );
  await tile.click();
  await n.hide();
  const ready = page
    .locator(".fs-card button.fs-cta:not([disabled])")
    .filter({ hasText: /y seguir/ });
  if (key === "floreria") {
    await page
      .locator(".fs-card input[type=file][accept='application/pdf']")
      .setInputFiles(path.join(assets, "catalogo-jacaranda.pdf"));
    await ready.waitFor({ timeout: 90_000 });
    await sleep(1200);
    await n.say(
      6,
      "HOY",
      "Su catálogo, subido",
      "Kardo lee las dos páginas del PDF y las guarda como imágenes para mostrarlas grandes.",
      3500,
      page.locator(".fs-card").first(),
    );
  } else if (key === "bar") {
    await page
      .locator(".fs-card input[type=file]")
      .setInputFiles(path.join(assets, "carta-terraza.png"));
    await ready.waitFor({ timeout: 60_000 });
    await sleep(1500);
    await n.say(
      6,
      "HOY",
      "Su carta, subida",
      "La foto de su carta de bebidas, con su descripción ya escrita para quien no la puede ver.",
      3500,
      page.locator(".fs-card").first(),
    );
  } else if (key === "despacho") {
    await type(
      page.locator("#fs-link-maps"),
      "maps.app.goo.gl/DespachoSalasMty",
      25,
    );
    await type(page.locator("#fs-link-website"), "despachosalas.mx", 40);
    await n.say(
      6,
      "HOY",
      "Sus botones",
      "WhatsApp viene marcado con su número del paso 1; agrega cómo llegar y su sitio web.",
      3200,
      page.locator(".fs-card").first(),
    );
  } else if (key === "unas") {
    await type(page.locator("#fs-link-instagram"), "@unassofistudio", 40);
    await type(page.locator("#fs-link-tiktok"), "@unassofi", 40);
    await type(page.locator("#fs-link-maps"), "maps.app.goo.gl/SofiStudio", 25);
    await n.say(
      6,
      "HOY",
      "Sus enlaces",
      "WhatsApp con su número, su Instagram y su TikTok por @usuario, y cómo llegar.",
      3200,
      page.locator(".fs-card").first(),
    );
  }
  await page.getByRole("button", { name: /Guardar.*y seguir/ }).click();
  await n.hide();

  // 5. Paso 3: su logo y cómo se ve
  await heading("Cómo se ve").waitFor();
  const logoField = page.getByLabel("Sube tu logo");
  await logoField.waitFor();
  await n.say(
    7,
    "HOY",
    "Antes de los estilos, su logo",
    persona.logo
      ? "Lo sube aquí y aparece en todas las plantillas. También queda en Configuración, en Marca."
      : "Todavía no tiene logo: «Ahora no» y lo puede subir después.",
    3200,
    page.locator(".fs-logo-drop"),
  );
  if (persona.logo) {
    await logoField.setInputFiles(path.join(assets, `${persona.logo}.png`));
  } else {
    await page.getByRole("button", { name: "Ahora no" }).click();
  }
  await n.hide();
  await page.locator(".fs-look-strip").waitFor({ timeout: 30_000 });
  await sleep(3000);
  await n.say(
    8,
    "HOY",
    "Su página, ya diseñada",
    persona.logo
      ? "Veinte estilos llenos con sus datos reales, y su logo en cada uno. Los de su giro van primero."
      : "Veinte estilos llenos con sus datos reales. Los de su giro van primero.",
    4000,
    page.locator(".fs-look-strip"),
  );
  await page.getByRole("button", { name: persona.look, exact: true }).click();
  await sleep(1500);
  if (persona.color) {
    await page.getByRole("button", { name: persona.color }).click();
    await sleep(1000);
  }
  const phrase = page.getByLabel("Frase");
  await phrase.fill("");
  await type(phrase, persona.phrase, 45);
  await sleep(1800);
  await n.say(
    8,
    "HOY",
    `Estilo «${persona.look}» y su frase`,
    "Estilo, color y texto se cambian aquí mismo; lo demás, en el Estudio o con la IA.",
    4000,
    page.locator(".fs-look-phone"),
  );
  await page.getByRole("button", { name: "Usar este diseño y seguir" }).click();
  await n.hide();

  // 6. Paso 4: cómo la encuentran
  await heading("Cómo te encuentran").waitFor();
  const ways = {
    link: [
      "Link",
      "Crear mi link y publicar",
      "Su link, con la dirección de su negocio. Kardo la propone y revisa que esté libre.",
    ],
    nfc: [
      "Etiqueta NFC",
      "Crear mi etiqueta y publicar",
      "Una etiqueta NFC: sus clientes acercan el celular y se abre su tarjeta.",
    ],
    qr: [
      "Código QR",
      "Crear mi QR y publicar",
      "Un QR para sus mesas: Kardo le pone nombre y publica.",
    ],
  }[persona.share];
  await page.getByRole("button", { name: ways[0], exact: true }).click();
  await sleep(1500);
  if (persona.share === "link")
    await page
      .getByRole("button", { name: ways[1] })
      .and(page.locator(":not([disabled])"))
      .waitFor({ timeout: 20_000 });
  await n.say(9, "HOY", ways[0], ways[2], 3500, page.locator(".fs-ways"));
  await page.getByRole("button", { name: ways[1] }).click();
  await n.hide();

  // 7. Paso 5: pruébalo, y la página como la ve un cliente
  await heading("Pruébalo").waitFor({ timeout: 30_000 });
  await sleep(1200);
  await n.say(
    10,
    "HOY",
    "Pruébalo",
    persona.share === "nfc"
      ? "Cómo grabar su etiqueta. Desde aquí ya no se publica otra vez: los pasos se cierran."
      : persona.share === "link"
        ? "Su link para copiar o mandar por WhatsApp. Los pasos anteriores ya se cerraron."
        : "Su QR con el marco de Kardo. Los pasos anteriores ya se cerraron.",
    3500,
    page.locator(".fs-card").first(),
  );
  const [touchpoint] = await sql`
    select t.public_id
    from kardo_core.touchpoints t
    join kardo_core.workspace_memberships m on m.workspace_id = t.workspace_id
    join kardo_core.profiles p on p.id = m.profile_id
    where lower(p.email) = lower(${email}) and t.kind = ${shareKind}
    order by t.created_at desc
    limit 1
  `;
  if (!touchpoint) throw new Error("No se encontró dónde se publicó.");
  await n.hide();
  await page.goto(`${resolver}/t/${touchpoint.public_id}`);
  await sleep(2500);
  await n.say(
    10,
    "HOY",
    "Lo que ve su cliente",
    "La página publicada, servida por el Resolver de pruebas.",
    4000,
  );
  await n.wheel(900, 14);
  await sleep(2000);
  await n.wheel(1200, 14);
  await sleep(2500);

  // 8. ¡Listo! y su panel
  await n.hide();
  await page.goto(`${PANEL}/primeros-pasos`);
  await heading("Pruébalo").waitFor();
  await page.getByRole("button", { name: "Ya lo vi, se ve bien" }).click();
  await heading(/¡Listo!/).waitFor();
  await n.say(
    11,
    "HOY",
    "¡Listo!",
    "Sale una sola vez; después, Primeros pasos ya no vuelve.",
    3000,
    page.locator(".fs-finished"),
  );
  await page.getByRole("link", { name: "Ir a mi panel" }).click();
  await n.hide();
  await heading("Resumen").waitFor();
  await sleep(2000);
  await n.say(
    11,
    "HOY",
    "Su panel",
    `El saludo usa su nombre preferido, «${persona.preferred}».`,
    3500,
    page.locator(".ov-greeting"),
  );
  await n.hide();
  await sleep(2500);
} finally {
  await context.unrouteAll({ behavior: "ignoreErrors" });
  await context.close();
  await browser.close();
  await sql.end();
}

finishVideo(dir, NAME, [[0, lead]]);
log(
  `Cuenta de prueba: ${email} (contraseña en scripts/video/.out/accounts.json)`,
);
