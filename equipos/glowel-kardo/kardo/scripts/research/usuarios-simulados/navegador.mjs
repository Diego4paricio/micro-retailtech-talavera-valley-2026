// One persona's browser for the simulated-user study (README.md here).
//
//   node scripts/research/usuarios-simulados/navegador.mjs <persona> <sesion> [--continuar]
//
// Keeps a system Chrome (playwright-core, channel "chrome") open with the
// persona's own context and listens on 127.0.0.1:<port> for commands from
// k.mjs. Every action leaves a numbered screenshot and a JSON line in
// .out/<sesion>/<persona>/registro.jsonl (time, task, action, thought,
// result). The agent only sees the screen: nothing here exposes the repo, the
// API or any secret. `--continuar` reopens the browser with the session the
// persona left saved (a phone that stays signed in).
import { createHash, randomBytes, randomInt } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { postgres, readEnv } from "../../video/lib.mjs";
import { emailFor, PANEL_URL, persona } from "./personas.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const { chromium } = createRequire(path.join(here, "../../video/lib.mjs"))(
  "playwright-core",
);

const [key, sessionName = "primera", ...flags] = process.argv.slice(2);
const who = persona(key);
const outRoot = path.join(here, ".out");
const outDir = path.join(outRoot, sessionName, key);
const downloadsDir = path.join(outDir, "descargas");
const filesDir = path.join(outRoot, "archivos", key);
const stateFile = path.join(outRoot, "estado", `${key}.json`);
fs.mkdirSync(downloadsDir, { recursive: true });
fs.mkdirSync(path.dirname(stateFile), { recursive: true });
const logFile = path.join(outDir, "registro.jsonl");

// Account: email + password chosen once per persona (kept across sessions).
const accountsFile = path.join(outRoot, "cuentas.json");
const accounts = fs.existsSync(accountsFile)
  ? JSON.parse(fs.readFileSync(accountsFile, "utf8"))
  : {};
if (!accounts[key]) {
  const stamp = new Date().toISOString().slice(5, 16).replace(/[-T:]/g, "");
  accounts[key] = {
    email: emailFor(key, stamp),
    password: `${who.business.split(" ").at(-1).normalize("NFD").replace(/[^A-Za-z]/g, "")}.${randomInt(1000, 9999)}${randomBytes(2).toString("hex")}`,
  };
  // Several personas start at once: merge into what is on disk right now.
  const latest = fs.existsSync(accountsFile)
    ? JSON.parse(fs.readFileSync(accountsFile, "utf8"))
    : {};
  fs.writeFileSync(
    accountsFile,
    JSON.stringify({ ...latest, [key]: accounts[key] }, null, 2),
    { mode: 0o600 },
  );
}
const account = accounts[key];

const browser = await chromium.launch({ channel: "chrome", headless: true });
const contextOptions = {
  viewport: who.viewport,
  deviceScaleFactor: who.deviceScaleFactor,
  isMobile: who.isMobile,
  hasTouch: who.hasTouch,
  ...(who.userAgent ? { userAgent: who.userAgent } : {}),
  locale: "es-MX",
  timezoneId: "America/Mexico_City",
  acceptDownloads: true,
};
const resume = flags.includes("--continuar") && fs.existsSync(stateFile);
const context = await browser.newContext({
  ...contextOptions,
  ...(resume ? { storageState: stateFile } : {}),
});
let customerPhone = null;

// The dev Assets Worker only allows 5173/5175: answer CORS for this panel
// inside this browser only (same as scripts/video). http(s) only: WebKit and
// Chrome also route blob: URLs.
async function allowAssets(ctx) {
  const panelOrigin = new URL(PANEL_URL).origin;
  await ctx.route(
    (url) =>
      url.protocol.startsWith("http") &&
      url.hostname !== "localhost" &&
      url.hostname !== "127.0.0.1" &&
      !url.hostname.endsWith("supabase.co") &&
      !url.hostname.endsWith("stripe.com") &&
      !url.hostname.includes("fonts.g"),
    async (route) => {
      const headers = {
        "access-control-allow-origin": panelOrigin,
        "access-control-allow-methods": "GET,PUT,POST,OPTIONS",
        "access-control-allow-headers": "content-type,authorization",
      };
      if (route.request().method() === "OPTIONS")
        return route.fulfill({ status: 204, headers });
      try {
        const response = await route.fetch();
        return route.fulfill({
          response,
          headers: { ...response.headers(), ...headers },
        });
      } catch {
        return route.abort();
      }
    },
  );
}
await allowAssets(context);

// No payments in the study, not even test ones (relevo 35 §8): Stripe's hosted
// Checkout and billing portal show a stop page instead, and the log says so.
await context.route(
  (url) => /^(checkout|billing|buy)\.stripe\.com$/.test(url.hostname),
  (route) => {
    writeLog({ kind: "payment-blocked", url: route.request().url().split("?")[0] });
    return route.fulfill({
      status: 200,
      contentType: "text/html; charset=utf-8",
      body: `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width"><title>Pago</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px;max-width:520px;margin:auto">
<h1>Aquí empezaría el pago con tarjeta</h1>
<p>En este estudio no se paga nada. Regresa a Kardo con «atras».</p></body></html>`,
    });
  },
);

// ---------------------------------------------------------------- tabs
const tabs = []; // { label, page }
let current = 0;
let pendingNotes = [];
const inflight = new WeakMap();

function watch(page, label) {
  inflight.set(page, 0);
  const tracked = (request) =>
    ["fetch", "xhr", "document"].includes(request.resourceType());
  page.on("request", (request) => {
    if (tracked(request)) inflight.set(page, inflight.get(page) + 1);
  });
  const done = (request) => {
    if (tracked(request))
      inflight.set(page, Math.max(0, inflight.get(page) - 1));
  };
  page.on("requestfinished", done);
  page.on("requestfailed", done);
  page.on("response", (response) => {
    const url = response.url();
    if (
      response.status() >= 400 &&
      (url.includes("localhost:3031") || url.includes("/v1/"))
    )
      writeLog({
        kind: "http",
        status: response.status(),
        url: url.replace(/^https?:\/\/[^/]+/, ""),
      });
  });
  page.on("pageerror", (error) =>
    writeLog({ kind: "pageerror", message: String(error.message).slice(0, 300) }),
  );
  page.on("download", async (download) => {
    const name = download.suggestedFilename();
    const target = path.join(downloadsDir, name);
    await download.saveAs(target).catch(() => undefined);
    pendingNotes.push(`Se descargó un archivo: «${name}».`);
    writeLog({ kind: "download", name });
  });
  page.on("popup", (popup) => adopt(popup, "pestaña nueva"));
  tabs.push({ label, page });
  current = tabs.length - 1;
}

function adopt(page, label) {
  if (tabs.some((tab) => tab.page === page)) return;
  watch(page, label);
  pendingNotes.push("Se abrió una pestaña nueva y ahora estás en ella.");
}
context.on("page", (page) => adopt(page, "pestaña nueva"));
const first = await context.newPage();
if (!tabs.some((tab) => tab.page === first)) watch(first, "Kardo");
tabs[0].label = who.device === "celular" ? "tu celular" : "tu computadora";
pendingNotes = [];
// A blank first screen read as «Kardo no carga» (round 2): start on a home
// screen that says how to open the link the persona was given.
await first.setContent(
  `<!doctype html><html lang="es"><head><meta name="viewport" content="width=device-width"><title>Inicio</title></head>
<body style="font-family:system-ui,sans-serif;padding:32px"><h1>Pantalla de inicio de ${who.device === "celular" ? "tu celular" : "tu computadora"}</h1>
<p>Para abrir el enlace que te pasaron, usa: abrir &lt;dirección&gt;.</p></body></html>`,
);

const page = () => tabs[current].page;
// Where the persona last touched or typed: a person scrolls the panel they
// are working in, not the middle of the screen (on a laptop that is the
// preview, and the side panels never moved).
let lastPoint = null;
async function remember(locator) {
  const box = await locator.boundingBox().catch(() => null);
  lastPoint = box ? { x: box.x + box.width / 2, y: box.y + box.height / 2 } : null;
}

async function settle(target = page(), max = 10_000) {
  await target.waitForLoadState("domcontentloaded").catch(() => undefined);
  const start = Date.now();
  let quietSince = Date.now();
  while (Date.now() - start < max) {
    if ((inflight.get(target) ?? 0) > 0) quietSince = Date.now();
    if (Date.now() - quietSince > 600) break;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  await new Promise((resolve) => setTimeout(resolve, 450));
}

// ---------------------------------------------------------------- log
let step = 0;
let task = null;
if (fs.existsSync(logFile)) {
  for (const line of fs.readFileSync(logFile, "utf8").split("\n")) {
    if (!line.trim()) continue;
    const entry = JSON.parse(line);
    if (entry.step) step = Math.max(step, entry.step);
    if (entry.kind === "task-start") task = entry.task;
    if (entry.kind === "task-end") task = null;
  }
}
function writeLog(entry) {
  fs.appendFileSync(
    logFile,
    `${JSON.stringify({ t: new Date().toISOString(), task, ...entry })}\n`,
  );
}

// ---------------------------------------------------------------- screen
/** What a person sees: headings, dialogs, notices and what can be touched. */
async function describe(target = page()) {
  return target
    .evaluate((dpr) => {
      const vw = innerWidth;
      const vh = innerHeight;
      const clean = (text) =>
        (text ?? "").replace(/\s+/g, " ").trim().slice(0, 70);
      const onScreen = (el) => {
        const rect = el.getBoundingClientRect();
        if (rect.width < 2 || rect.height < 2) return null;
        if (rect.bottom <= 0 || rect.top >= vh || rect.right <= 0 || rect.left >= vw)
          return null;
        const style = getComputedStyle(el);
        if (style.visibility === "hidden" || Number(style.opacity) === 0) return null;
        const x = Math.min(Math.max(rect.left + rect.width / 2, 1), vw - 1);
        const y = Math.min(Math.max(rect.top + rect.height / 2, 1), vh - 1);
        const hit = document.elementFromPoint(x, y);
        if (hit && !el.contains(hit) && !hit.contains(el)) {
          const labelFor = hit.closest("label");
          if (!labelFor || (labelFor.htmlFor !== el.id && !labelFor.contains(el)))
            return null;
        }
        return { x: Math.round(x * dpr), y: Math.round(y * dpr) };
      };
      const nameOf = (el) => {
        const aria = el.getAttribute("aria-label");
        if (aria) return clean(aria);
        const by = el.getAttribute("aria-labelledby");
        if (by) {
          const text = by
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? "")
            .join(" ");
          if (clean(text)) return clean(text);
        }
        if (["INPUT", "SELECT", "TEXTAREA"].includes(el.tagName)) {
          const label =
            (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
            el.closest("label");
          // A <select> inside its <label> would add every option's text.
          const own = label
            ? [...label.childNodes]
                .filter((node) => node !== el && !(node.nodeType === 1 && node.contains(el)))
                .map((node) => node.textContent)
                .join(" ")
            : "";
          if (label && clean(own)) return clean(own);
          if (label && clean(label.textContent) && el.tagName !== "SELECT") return clean(label.textContent);
          return clean(el.getAttribute("placeholder") || el.title || "");
        }
        const text = clean(el.innerText);
        if (text) return text;
        const img = el.querySelector("img[alt]");
        if (img?.alt) return clean(img.alt);
        const svgTitle = el.querySelector("svg title");
        if (svgTitle) return clean(svgTitle.textContent);
        return clean(el.title || "");
      };
      const kindOf = (el) => {
        const role = el.getAttribute("role");
        if (role === "tab") return "pestaña";
        if (role === "switch") return "interruptor";
        if (role === "menuitem" || role === "menuitemradio") return "opción de menú";
        if (role === "option") return "opción";
        if (role === "checkbox" || el.type === "checkbox") return "casilla";
        if (role === "radio" || el.type === "radio") return "opción";
        if (el.tagName === "A" || role === "link") return "enlace";
        if (el.tagName === "SELECT" || role === "combobox") return "lista";
        if (el.tagName === "INPUT" && el.type === "file") return "archivo";
        if (["INPUT", "TEXTAREA"].includes(el.tagName) || el.isContentEditable)
          return "campo";
        return "botón";
      };
      const stateOf = (el) => {
        const parts = [];
        if (el.disabled || el.getAttribute("aria-disabled") === "true")
          parts.push("desactivado");
        const checked =
          el.type === "checkbox" || el.type === "radio"
            ? el.checked
            : el.getAttribute("aria-checked") === "true"
              ? true
              : el.getAttribute("aria-checked") === "false"
                ? false
                : null;
        if (checked !== null) parts.push(checked ? "marcada" : "sin marcar");
        if (el.getAttribute("aria-selected") === "true") parts.push("elegida");
        if (el.getAttribute("aria-pressed") === "true") parts.push("activo");
        if (el.getAttribute("aria-expanded") === "true") parts.push("abierto");
        if (el.tagName === "SELECT")
          parts.push(`dice «${clean(el.selectedOptions[0]?.textContent)}»`);
        else if (["INPUT", "TEXTAREA"].includes(el.tagName) && !["checkbox", "radio", "file", "submit", "button"].includes(el.type))
          parts.push(
            el.value
              ? el.type === "password"
                ? "escrito (oculto)"
                : `dice «${clean(el.value).slice(0, 40)}»`
              : "vacío",
          );
        return parts.length ? ` (${parts.join(", ")})` : "";
      };
      const selector =
        'a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=link],[role=tab],[role=menuitem],[role=menuitemradio],[role=switch],[role=checkbox],[role=radio],[role=option],[role=combobox],[contenteditable="true"]';
      const items = [];
      const seen = new Set();
      for (const el of document.querySelectorAll(selector)) {
        let point = onScreen(el);
        if (!point && el.tagName === "INPUT" && ["checkbox", "radio", "file"].includes(el.type)) {
          const label =
            (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`)) ||
            el.closest("label");
          if (label) point = onScreen(label);
        }
        if (!point) continue;
        const kind = kindOf(el);
        const name = nameOf(el);
        const text = name
          ? `[${kind}] ${name}${stateOf(el)}`
          : `[${kind} sin texto, en ${point.x},${point.y}]${stateOf(el)}`;
        if (seen.has(text)) continue;
        seen.add(text);
        items.push(text);
        if (items.length >= 70) break;
      }
      const headings = [...document.querySelectorAll("h1,h2,h3,[role=heading]")]
        .filter((el) => onScreen(el))
        .map((el) => clean(el.textContent))
        .filter(Boolean)
        .slice(0, 6);
      const dialogs = [...document.querySelectorAll("[role=dialog],[role=alertdialog],dialog[open]")]
        .filter((el) => onScreen(el))
        .map((el) => {
          const by = el.getAttribute("aria-labelledby");
          return clean(
            el.getAttribute("aria-label") ||
              (by && document.getElementById(by)?.textContent) ||
              el.querySelector("h1,h2,h3")?.textContent ||
              "",
          );
        });
      const notices = [...document.querySelectorAll("[role=alert],[role=status],[aria-live]")]
        .filter((el) => onScreen(el))
        .map((el) => clean(el.innerText).slice(0, 160))
        .filter(Boolean)
        .slice(0, 4);
      const frames = document.querySelectorAll("iframe").length;
      return {
        title: document.title,
        path: location.pathname + location.search,
        headings,
        dialogs,
        notices,
        items,
        frames,
        scroll: {
          top: Math.round(scrollY),
          more: document.documentElement.scrollHeight - (scrollY + vh) > 40,
        },
      };
    }, who.deviceScaleFactor)
    .catch((error) => ({ error: String(error.message).split("\n")[0] }));
}

async function shot(target = page()) {
  const file = path.join(outDir, `${String(step).padStart(3, "0")}.jpg`);
  await target
    .screenshot({ path: file, type: "jpeg", quality: 72, timeout: 15_000 })
    .catch(() => undefined);
  return file;
}

function render(screen, file) {
  const lines = [];
  if (screen.error) lines.push(`(No se pudo leer la pantalla: ${screen.error})`);
  else {
    lines.push(
      `Pantalla: ${screen.headings[0] ?? screen.title}${screen.headings.length > 1 ? ` · también dice: ${screen.headings.slice(1).join(" · ")}` : ""}`,
    );
    if (screen.dialogs.length)
      lines.push(`Ventana abierta encima: ${screen.dialogs.filter(Boolean).join(" · ") || "(sin título)"}`);
    if (screen.notices.length) lines.push(`Avisos en pantalla: ${screen.notices.join(" | ")}`);
    lines.push("Lo que puedes tocar o llenar en esta pantalla:");
    lines.push(...(screen.items.length ? screen.items.map((item) => `  ${item}`) : ["  (nada)"]));
    if (screen.frames) lines.push(`(Hay ${screen.frames} recuadro(s) con contenido incrustado, como una vista previa; míralo en la captura.)`);
    if (screen.scroll.more) lines.push("Hay más abajo (usa: bajar).");
  }
  if (tabs.length > 1)
    lines.push(
      `Pestañas: ${tabs.map((tab, index) => `${index + 1}. ${tab.label}${index === current ? " (aquí estás)" : ""}`).join(" · ")}`,
    );
  lines.push(`Captura: ${file}`);
  return lines.join("\n");
}

// ---------------------------------------------------------------- finding
const ROLES = [
  "button",
  "link",
  "tab",
  "menuitem",
  "menuitemradio",
  "checkbox",
  "radio",
  "switch",
  "option",
  "combobox",
];

async function inView(locator) {
  if (!(await locator.isVisible().catch(() => false))) return "hidden";
  const box = await locator.boundingBox().catch(() => null);
  if (!box) return "hidden";
  const { width, height } = page().viewportSize();
  if (box.y + box.height <= 0 || box.y >= height || box.x + box.width <= 0 || box.x >= width)
    return "offscreen";
  return "ok";
}

/** Something `escribir`, `borrar` or `elegir` can fill: a text input, a list or an editable area. */
function fillable(locator) {
  return locator
    .evaluate((el) => {
      if (el.isContentEditable || el.tagName === "TEXTAREA" || el.tagName === "SELECT") return true;
      if (el.tagName !== "INPUT") return false;
      return !["button", "checkbox", "color", "file", "hidden", "image", "radio", "range", "reset", "submit"].includes(el.type);
    })
    .catch(() => false);
}

async function findTarget(text, nth = 1, kinds = "touch") {
  const frames = page().frames();
  const exact = [];
  const loose = [];
  for (const frame of frames) {
    if (kinds === "field") {
      exact.push(
        frame.getByLabel(text, { exact: true }),
        frame.getByPlaceholder(text, { exact: true }),
        frame.getByRole("textbox", { name: text, exact: true }),
        frame.getByRole("combobox", { name: text, exact: true }),
        frame.getByRole("spinbutton", { name: text, exact: true }),
      );
      loose.push(
        frame.getByLabel(text),
        frame.getByPlaceholder(text),
        frame.getByRole("textbox", { name: text }),
        frame.getByRole("spinbutton", { name: text }),
      );
    } else {
      for (const role of ROLES) exact.push(frame.getByRole(role, { name: text, exact: true }));
      exact.push(frame.getByLabel(text, { exact: true }), frame.getByText(text, { exact: true }));
      for (const role of ROLES) loose.push(frame.getByRole(role, { name: text }));
      loose.push(
        frame.getByLabel(text),
        frame.getByText(text),
        frame.getByTitle(text),
        frame.getByAltText(text),
        frame.getByPlaceholder(text),
      );
    }
  }
  let offscreen = 0;
  for (const group of [exact, loose]) {
    const found = [];
    const covered = [];
    for (const locator of group) {
      const count = Math.min(await locator.count().catch(() => 0), 12);
      const before = found.length;
      for (let i = 0; i < count; i += 1) {
        const candidate = locator.nth(i);
        // A color swatch or a button can share its label with the text field
        // next to it (the Estudio's «Fondo» and its hex code, ronda 4).
        if (kinds === "field" && !(await fillable(candidate))) continue;
        const state = await inView(candidate);
        if (state === "ok") ((await hittable(candidate)) ? found : covered).push(candidate);
        else if (state === "offscreen") offscreen += 1;
      }
      // `matches`: how many this same strategy found on screen (duplicates warning).
      if (found.length >= nth) return { locator: found[nth - 1], matches: found.length - before };
    }
    // Hidden inputs styled through their label, and the like.
    if (found.length + covered.length >= nth)
      return { locator: [...found, ...covered][nth - 1] };
  }
  return { locator: null, offscreen };
}

/**
 * Tap or click like a person. An element that keeps moving (an animated
 * hint) never looks "stable" to Playwright: if a tap at its center reaches
 * it, press it anyway.
 */
async function press(target) {
  // A radio or checkbox hidden inside a big tile («¿Qué muestra?», ronda 4):
  // a person taps the tile, so tap its label, not the 1 px input.
  const hiddenChoice = await target
    .evaluate((el) => {
      if (el.tagName !== "INPUT" || !["radio", "checkbox"].includes(el.type)) return false;
      const box = el.getBoundingClientRect();
      return box.width < 4 && box.height < 4 && Boolean(el.closest("label"));
    })
    .catch(() => false);
  const locator = hiddenChoice ? target.locator("xpath=ancestor::label[1]") : target;
  try {
    if (who.hasTouch) await locator.tap({ timeout: 4000 });
    else await locator.click({ timeout: 4000 });
  } catch (error) {
    if (!/Timeout/.test(String(error.message)) || !(await hittable(locator))) throw error;
    if (who.hasTouch) await locator.tap({ timeout: 3000, force: true });
    else await locator.click({ timeout: 3000, force: true });
  }
}

/** Whether a tap at the element's visible center reaches it (not a dialog over it). */
async function hittable(locator) {
  return locator
    .evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const x = Math.min(Math.max(rect.left + rect.width / 2, 1), innerWidth - 1);
      const y = Math.min(Math.max(rect.top + rect.height / 2, 1), innerHeight - 1);
      const hit = document.elementFromPoint(x, y);
      if (!hit) return false;
      if (el === hit || el.contains(hit) || hit.contains(el)) return true;
      const label = hit.closest("label");
      return Boolean(label && (label.htmlFor === el.id || label.contains(el)));
    })
    .catch(() => false);
}

function notFound(text, offscreen) {
  return offscreen
    ? `«${text}» existe en la página, pero no se ve en la pantalla ahora. Usa bajar o arriba para encontrarlo.`
    : `No encuentro «${text}» en la pantalla. Revisa la captura y usa el texto tal como aparece (o tocar-punto con las coordenadas de la captura).`;
}

// ---------------------------------------------------------------- email
async function emailCode() {
  const env = readEnv();
  const sql = postgres()(env.SUPABASE_ADMIN_DATABASE_URL, {
    max: 1,
    prepare: false,
    onnotice: () => {},
  });
  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const [user] = await sql`
        select id from auth.users where lower(email) = lower(${account.email})`;
      const [token] = user
        ? await sql`
            select id, token_type, created_at from auth.one_time_tokens
            where user_id = ${user.id}
              and token_type in ('confirmation_token', 'recovery_token')
              and created_at > now() - interval '15 minutes'
            order by created_at desc limit 1`
        : [];
      if (token) {
        const known = emailCodes.get(token.id);
        if (known) return { code: known, type: token.token_type };
        const code = String(randomInt(100000, 1000000));
        const hash = createHash("sha224").update(account.email + code).digest("hex");
        await sql.begin(async (tx) => {
          await tx`update auth.one_time_tokens set token_hash = ${hash} where id = ${token.id}`;
          if (token.token_type === "confirmation_token")
            await tx`update auth.users set confirmation_token = ${hash} where id = ${user.id}`;
          else await tx`update auth.users set recovery_token = ${hash} where id = ${user.id}`;
        });
        emailCodes.set(token.id, code);
        return { code, type: token.token_type };
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    return null;
  } finally {
    await sql.end();
  }
}
const emailCodes = new Map();

// ---------------------------------------------------------------- commands
async function act(command, args) {
  const p = page();
  switch (command) {
    case "ver":
      return { ok: true, said: "Miras la pantalla." };
    case "abrir": {
      lastPoint = null;
      const url = args[0] === "kardo" || !args[0] ? PANEL_URL : args[0];
      await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return { ok: true, said: `Abriste ${url}.` };
    }
    case "tocar": {
      const [text, nth] = args;
      if (!text) return { ok: false, said: "Falta qué tocar: tocar \"<texto>\"." };
      const { locator, offscreen } = await findTarget(text, Number(nth) || 1);
      if (!locator) return { ok: false, said: notFound(text, offscreen) };
      // A phone opens its own picker for a <select>, which never shows in a
      // headless screenshot: say what it lists instead of «nothing happened».
      const options = await locator
        .evaluate((el) => {
          const select = el.tagName === "SELECT" ? el : el.tagName === "OPTION" ? el.closest("select") : null;
          return select ? [...select.options].map((o) => o.textContent.trim()) : null;
        })
        .catch(() => null);
      if (options)
        return {
          ok: true,
          said: `Se abrió la lista «${text}». Opciones: ${options.join(" · ")}. Para escoger una: elegir "${text}" "<opción>".`,
        };
      await remember(locator);
      await press(locator);
      return { ok: true, said: `Tocaste «${text}».` };
    }
    case "tocar-punto": {
      const [x, y] = (args.join(" ").match(/\d+(?:\.\d+)?/g) ?? []).map(Number);
      if (!Number.isFinite(x) || !Number.isFinite(y))
        return { ok: false, said: "Usa: tocar-punto <x> <y> (coordenadas de la captura)." };
      const cssX = x / who.deviceScaleFactor;
      const cssY = y / who.deviceScaleFactor;
      // A native <select> under the finger (the organization switcher is one,
      // drawn as a card): say what it lists, as a phone's picker would.
      const picker = await p
        .evaluate(
          ({ px, py }) => {
            let el = document.elementFromPoint(px, py);
            const label = el?.closest("label");
            const select = el?.closest("select") ?? label?.querySelector("select") ?? null;
            if (!select) return null;
            const name = select.getAttribute("aria-label") || label?.innerText?.split("\n")[0] || "la lista";
            return { name: name.trim(), options: [...select.options].map((o) => o.textContent.trim()) };
          },
          { px: cssX, py: cssY },
        )
        .catch(() => null);
      if (picker)
        return {
          ok: true,
          said: `Se abrió la lista «${picker.name}». Opciones: ${picker.options.join(" · ")}. Para escoger una: elegir "${picker.name}" "<opción>".`,
        };
      if (who.hasTouch) await p.touchscreen.tap(cssX, cssY);
      else await p.mouse.click(cssX, cssY);
      return { ok: true, said: `Tocaste el punto ${x},${y} de la captura.` };
    }
    case "escribir": {
      if (args.length === 1) {
        await p.keyboard.type(args[0], { delay: 25 });
        return { ok: true, said: "Escribiste en el campo donde estaba el cursor." };
      }
      const [field, value, nthArg] = args;
      const nth = Number(nthArg) || 1;
      const { locator, offscreen, matches = 1 } = await findTarget(field, nth, "field");
      if (!locator) return { ok: false, said: notFound(field, offscreen) };
      const tag = await locator.evaluate((el) => el.tagName);
      if (tag === "SELECT")
        return { ok: false, said: `«${field}» es una lista: usa elegir "${field}" "<opción>".` };
      await remember(locator);
      await locator.fill(value, { timeout: 8000 });
      const which =
        matches > 1
          ? ` Ojo: hay ${matches} campos «${field}» a la vista y escribiste en el ${nth}.º (de arriba abajo). Para otro: escribir "${field}" "<texto>" <número>.`
          : "";
      return { ok: true, said: `Escribiste en «${field}».${which}`, secret: /contrase/i.test(field) };
    }
    case "borrar": {
      const { locator, offscreen } = await findTarget(args[0], 1, "field");
      if (!locator) return { ok: false, said: notFound(args[0], offscreen) };
      await locator.fill("");
      return { ok: true, said: `Borraste «${args[0]}».` };
    }
    case "elegir": {
      const [field, option] = args;
      const { locator, offscreen } = await findTarget(field, 1, "field");
      if (!locator) {
        const touch = await findTarget(field);
        if (!touch.locator) return { ok: false, said: notFound(field, offscreen || touch.offscreen) };
        await touch.locator.click({ timeout: 8000 });
        await settle(p, 2000);
        const opt = await findTarget(option);
        if (!opt.locator) return { ok: false, said: `Abriste «${field}», pero no veo la opción «${option}».` };
        await opt.locator.click({ timeout: 8000 });
        return { ok: true, said: `Elegiste «${option}» en «${field}».` };
      }
      const tag = await locator.evaluate((el) => el.tagName);
      if (tag === "SELECT") {
        const options = await locator.evaluate((el) =>
          [...el.options].map((o) => o.textContent.trim()),
        );
        const match =
          options.find((o) => o === option) ??
          options.find((o) => o.toLowerCase().includes(option.toLowerCase()));
        if (!match)
          return { ok: false, said: `«${option}» no está en la lista. Opciones: ${options.join(" · ")}` };
        await locator.selectOption({ label: match });
        return { ok: true, said: `Elegiste «${match}» en «${field}».` };
      }
      await locator.click({ timeout: 8000 });
      await settle(p, 2000);
      let opt = await findTarget(option);
      // A search box (city, etc.): type what you look for, then pick it.
      if (!opt.locator && tag === "INPUT") {
        await locator.fill(option, { timeout: 8000 });
        await settle(p, 2500);
        opt = await findTarget(option);
      }
      if (!opt.locator) return { ok: false, said: `Abriste «${field}», pero no veo la opción «${option}».` };
      await opt.locator.click({ timeout: 8000 });
      return { ok: true, said: `Elegiste «${option}» en «${field}».` };
    }
    case "subir": {
      const [target, fileName] = args;
      const file = path.join(filesDir, path.basename(fileName ?? ""));
      if (!fileName || !fs.existsSync(file))
        return { ok: false, said: `No tienes ese archivo. Tus archivos: ${listFiles()}` };
      const { locator, offscreen } = await findTarget(target);
      if (!locator) return { ok: false, said: notFound(target, offscreen) };
      const type = await locator.evaluate((el) => (el.tagName === "INPUT" ? el.type : ""));
      if (type === "file") {
        await locator.setInputFiles(file);
        return { ok: true, said: `Elegiste «${fileName}» de tus archivos.` };
      }
      // Tap it like a person; the phone's file picker opens and they pick the file.
      const chooser = p.waitForEvent("filechooser", { timeout: 4000 }).catch(() => null);
      await press(locator);
      const picker = await chooser;
      if (picker) {
        await picker.setFiles(file);
        return { ok: true, said: `Tocaste «${target}» y elegiste «${fileName}» de tus archivos.` };
      }
      // A visible "Subir" that drives a file input nearby (same row or card).
      const input = await locator.evaluateHandle((el) => {
        for (let node = el, depth = 0; node && depth < 5; node = node.parentElement, depth += 1) {
          const inputs = node.querySelectorAll?.("input[type=file]") ?? [];
          if (inputs.length === 1) return inputs[0];
          if (inputs.length > 1) return null;
        }
        return null;
      });
      const element = input.asElement();
      if (element) {
        await element.setInputFiles(file);
        return { ok: true, said: `Tocaste «${target}» y elegiste «${fileName}» de tus archivos.` };
      }
      return { ok: false, said: `Tocaste «${target}», pero no se abrió nada para elegir un archivo.` };
    }
    case "tecla": {
      const keyName = { enter: "Enter", escape: "Escape", esc: "Escape", tab: "Tab", borrar: "Backspace" }[String(args[0]).toLowerCase()] ?? args[0];
      await p.keyboard.press(keyName);
      return { ok: true, said: `Presionaste ${keyName}.` };
    }
    case "bajar":
    case "arriba": {
      const times = Math.min(Number(args[0]) || 1, 5);
      const { width, height } = p.viewportSize();
      const sign = command === "bajar" ? 1 : -1;
      // Where a person would scroll: the panel they last touched, else the
      // middle; if the wheel moved nothing there, the biggest visible panel
      // that can scroll (the Studio's side panels and bottom sheets).
      const signature = () =>
        p.evaluate(() => {
          let total = Math.round(scrollY);
          for (const el of document.querySelectorAll("*"))
            if (el.scrollTop) total += Math.round(el.scrollTop);
          return total;
        }).catch(() => 0);
      const panels = () =>
        p.evaluate(() =>
          [...document.querySelectorAll("*")]
            .filter((el) => {
              const style = getComputedStyle(el);
              if (!/(auto|scroll)/.test(style.overflowY) || el.scrollHeight - el.clientHeight < 8) return false;
              const r = el.getBoundingClientRect();
              return r.width > 80 && r.height > 80 && r.bottom > 0 && r.top < innerHeight;
            })
            .map((el) => {
              const r = el.getBoundingClientRect();
              const top = Math.max(r.top, 0);
              const bottom = Math.min(r.bottom, innerHeight);
              return { x: r.left + r.width / 2, y: (top + bottom) / 2, area: r.width * (bottom - top) };
            })
            .sort((a, b) => b.area - a.area),
        ).catch(() => []);
      const inView = lastPoint && lastPoint.x > 0 && lastPoint.x < width && lastPoint.y > 0 && lastPoint.y < height;
      const points = [inView ? lastPoint : null, { x: width / 2, y: height / 2 }].filter(Boolean);
      let moved = false;
      for (const point of points) {
        const before = await signature();
        await p.mouse.move(point.x, point.y);
        await p.mouse.wheel(0, sign * height * 0.7);
        await new Promise((resolve) => setTimeout(resolve, 250));
        if ((await signature()) !== before) {
          moved = true;
          for (let i = 1; i < times; i += 1) {
            await p.mouse.wheel(0, sign * height * 0.7);
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          break;
        }
      }
      if (!moved)
        for (const panel of (await panels()).slice(0, 2)) {
          const before = await signature();
          await p.mouse.move(panel.x, panel.y);
          for (let i = 0; i < times; i += 1) {
            await p.mouse.wheel(0, sign * height * 0.7);
            await new Promise((resolve) => setTimeout(resolve, 250));
          }
          if ((await signature()) !== before) break;
        }
      return { ok: true, said: command === "bajar" ? "Bajaste en la pantalla." : "Subiste en la pantalla." };
    }
    case "atras":
      lastPoint = null;
      await p.goBack({ waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => undefined);
      return { ok: true, said: "Regresaste a la pantalla anterior." };
    case "recargar":
      await p.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      return { ok: true, said: "Recargaste la página." };
    case "esperar": {
      const seconds = Math.min(Math.max(Number(args[0]) || 5, 1), 60);
      await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
      return { ok: true, said: `Esperaste ${seconds} segundos.` };
    }
    case "pestanas":
      return { ok: true, said: "Estas son tus pestañas." };
    case "pestana": {
      const index = Number(args[0]) - 1;
      if (!tabs[index]) return { ok: false, said: "Esa pestaña no existe." };
      current = index;
      await tabs[index].page.bringToFront();
      return { ok: true, said: `Cambiaste a la pestaña ${index + 1}.` };
    }
    case "cerrar-pestana": {
      if (tabs.length === 1) return { ok: false, said: "Es tu única pestaña." };
      const [closed] = tabs.splice(current, 1);
      await closed.page.close().catch(() => undefined);
      current = Math.max(0, current - 1);
      return { ok: true, said: "Cerraste la pestaña." };
    }
    case "celular": {
      const url = args[0];
      if (!url || !/^https?:\/\//.test(url))
        return { ok: false, said: "Usa: celular <dirección completa, con https://>." };
      if (!customerPhone) {
        customerPhone = await browser.newContext({
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 1.5,
          isMobile: true,
          hasTouch: true,
          userAgent:
            "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
          locale: "es-MX",
          timezoneId: "America/Mexico_City",
        });
      }
      const phonePage = await customerPhone.newPage();
      watch(phonePage, "celular de un cliente");
      await phonePage.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
      return { ok: true, said: "Abriste la dirección en el celular de un cliente (sin tu sesión)." };
    }
    case "escanear": {
      // Pointing the phone camera at a QR: on the screen, or a downloaded file.
      let image;
      let mime = "image/png";
      if (args[0]) {
        const file = path.join(downloadsDir, path.basename(args[0]));
        if (!fs.existsSync(file))
          return { ok: false, said: `No tienes ese archivo descargado. Descargas: ${fs.readdirSync(downloadsDir).join(", ") || "(ninguna)"}` };
        image = fs.readFileSync(file);
        if (file.endsWith(".svg")) mime = "image/svg+xml";
        else if (/\.jpe?g$/i.test(file)) mime = "image/jpeg";
        else if (!file.endsWith(".png"))
          return { ok: false, said: "La cámara no pudo leer ese archivo (no es una imagen)." };
      } else image = await p.screenshot({ type: "png" });
      const url = await scanQr(image, mime);
      if (!url) return { ok: false, said: "La cámara no encontró ningún código QR." };
      if (!/^https?:\/\//.test(url)) return { ok: true, said: `La cámara leyó el código: ${url}` };
      const opened = await act("celular", [url]);
      return { ok: true, said: `La cámara leyó el código QR y abrió ${url} en el celular de un cliente. ${opened.said}` };
    }
    case "mi-correo": {
      const found = await emailCode();
      if (!found)
        return {
          ok: false,
          said: `No te ha llegado ningún correo nuevo de Kardo a ${account.email} en los últimos minutos.`,
        };
      return {
        ok: true,
        said: `Abriste tu correo (${account.email}). Te llegó un correo de Kardo con tu código: ${found.code}`,
        email: found.type,
      };
    }
    case "archivos":
      return { ok: true, said: `Tus archivos (fotos y logos en tu ${who.device}): ${listFiles()}` };
    default:
      return null;
  }
}

const jsqr = path.resolve(here, "../../../apps/customer-web/node_modules/jsqr/dist/jsQR.js");
async function scanQr(buffer, mime) {
  const helper = await browser.newPage();
  try {
    await helper.addScriptTag({ path: jsqr });
    return await helper.evaluate(
      async ({ b64, type }) => {
        const img = new Image();
        img.src = `data:${type};base64,${b64}`;
        await img.decode();
        const natural = Math.max(img.naturalWidth || 600, img.naturalHeight || 600);
        const scale = Math.min(2, 1600 / natural);
        const width = Math.round((img.naturalWidth || 600) * scale);
        const height = Math.round((img.naturalHeight || 600) * scale);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const data = ctx.getImageData(0, 0, width, height);
        return window.jsQR(data.data, width, height)?.data ?? null;
      },
      { b64: buffer.toString("base64"), type: mime },
    );
  } finally {
    await helper.close();
  }
}

function listFiles() {
  const files = fs.existsSync(filesDir) ? fs.readdirSync(filesDir) : [];
  return files.length ? files.join(", ") : "(no tienes fotos ni logos guardados)";
}

const NO_SCREEN = new Set(["tarea", "termine", "me-atore", "califica", "nota", "archivos", "mi-correo", "guardar-sesion", "salir"]);

async function handle(command, args, thought) {
  command = command
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  // Study bookkeeping (no action on screen).
  if (command === "tarea") {
    task = Number(args[0]) || args[0];
    writeLog({ kind: "task-start", piensa: thought });
    return `Empiezas la tarea ${task}.`;
  }
  if (command === "termine" || command === "me-atore") {
    const outcome = command === "termine" ? "terminada" : "atorada";
    writeLog({ kind: "task-end", outcome, nota: args.join(" "), piensa: thought });
    const finished = task;
    task = null;
    return `Tarea ${finished} marcada como ${outcome}.`;
  }
  if (command === "califica") {
    writeLog({ kind: "rating", ease: Number(args[0]), nota: args.slice(1).join(" ") });
    return "Calificación guardada.";
  }
  if (command === "nota") {
    writeLog({ kind: "note", nota: args.join(" "), piensa: thought });
    return "Nota guardada.";
  }
  if (command === "guardar-sesion") {
    await context.storageState({ path: stateFile });
    fs.chmodSync(stateFile, 0o600);
    return "Sesión guardada.";
  }

  step += 1;
  const started = Date.now();
  let result;
  try {
    result = await act(command, args);
  } catch (error) {
    const message = String(error.message).split("\n")[0];
    writeLog({ kind: "tool-error", cmd: command, message: message.slice(0, 300) });
    result = {
      ok: false,
      said: /Timeout/.test(message)
        ? "No pude tocarlo: algo lo tapa o no responde al toque. Mira la captura."
        : `No se pudo: ${message.slice(0, 200)}`,
    };
  }
  if (!result) {
    step -= 1;
    return `No conozco el comando «${command}». Comandos: ver, abrir, tocar, tocar-punto, escribir, borrar, elegir, subir, tecla, bajar, arriba, atras, recargar, esperar, pestanas, pestana, cerrar-pestana, celular, escanear, mi-correo, archivos, tarea, termine, me-atore, califica, nota.`;
  }
  if (!NO_SCREEN.has(command)) await settle();
  const file = NO_SCREEN.has(command) ? null : await shot();
  const screen = file ? await describe() : null;
  writeLog({
    kind: "action",
    step,
    cmd: command,
    args: result.secret ? [args[0], "••••"] : args,
    piensa: thought,
    ok: result.ok,
    said: result.said.replace(/código: \d{6}/, "código: ******"),
    ms: Date.now() - started,
    path: screen?.path,
    heading: screen?.headings?.[0],
    shot: file ? path.basename(file) : null,
  });
  const notes = pendingNotes.splice(0);
  const head = `#${step}${task ? ` (tarea ${task})` : ""} ${result.ok ? "" : "⚠ "}${result.said}`;
  return [head, ...notes, ...(screen ? [render(screen, file)] : [])].join("\n");
}

// ---------------------------------------------------------------- server
let queue = Promise.resolve();
const server = http.createServer((request, response) => {
  let body = "";
  request.on("data", (chunk) => (body += chunk));
  request.on("end", () => {
    queue = queue.then(async () => {
      let text;
      try {
        const { command, args = [], thought = null } = JSON.parse(body || "{}");
        if (command === "salir") {
          await context.storageState({ path: stateFile }).catch(() => undefined);
          response.end("Cerraste el navegador.");
          await browser.close();
          process.exit(0);
        }
        text = await handle(String(command ?? "ver"), args.map(String), thought);
      } catch (error) {
        text = `Error de la herramienta: ${String(error.message).split("\n")[0]}`;
      }
      response.setHeader("content-type", "text/plain; charset=utf-8");
      response.end(text);
    });
  });
});
server.listen(who.port, "127.0.0.1", () =>
  console.log(
    `${who.short} lista en 127.0.0.1:${who.port} (sesión ${sessionName}${resume ? ", con su sesión guardada" : ""}); correo ${account.email}`,
  ),
);
