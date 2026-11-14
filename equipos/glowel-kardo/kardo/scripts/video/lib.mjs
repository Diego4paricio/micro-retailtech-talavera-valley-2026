// Shared helpers for the annotated demo videos (scripts/video/README.md).
// Headless system Chrome through playwright-core, captions with a Mexico City
// clock and a highlight box, title slides, and MP4 + contact sheets. Never
// prints secrets: .env values and account passwords stay in memory.
import { execFileSync } from "node:child_process";
import { createHmac } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const outDir = path.join(root, "scripts/video/.out");
fs.mkdirSync(outDir, { recursive: true });

/** Repo .env with Vite's `${VAR}` expansion. Values are never printed. */
export function readEnv() {
  const raw = Object.fromEntries(
    fs
      .readFileSync(path.join(root, ".env"), "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => [
        line.slice(0, line.indexOf("=")).trim(),
        line.slice(line.indexOf("=") + 1).trim(),
      ]),
  );
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => raw[name] ?? ""),
    ]),
  );
}

/** postgres.js from the workspace (no extra install). */
export function postgres() {
  return createRequire(path.join(root, "services/customer-api/package.json"))(
    "postgres",
  );
}

/** RFC 6238 code for the E2E staff account (Operations MFA). */
export function totp(base32Secret, time = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32Secret.replace(/=+$/, "").toUpperCase())
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(
    bits.match(/.{8}/g).map((byte) => Number.parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export const log = (message) =>
  console.log(`[${new Date().toLocaleTimeString("es-MX")}] ${message}`);

export function readAccounts() {
  const file = path.join(outDir, "accounts.json");
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : {};
}

export function writeAccounts(accounts) {
  fs.writeFileSync(
    path.join(outDir, "accounts.json"),
    JSON.stringify(accounts, null, 2),
    { mode: 0o600 },
  );
}

/**
 * Signs in off camera and returns the panel's localStorage (the Supabase
 * session). Used to stand in for the emailed code without sending email.
 */
export async function offCameraSession(browser, panelUrl, account) {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();
  await page.goto(`${panelUrl}/`);
  await page.getByLabel("Correo electrónico").fill(account.email);
  await page.getByLabel("Contraseña", { exact: true }).fill(account.password);
  await page.keyboard.press("Enter");
  await page.waitForTimeout(4000);
  const storage = await page.evaluate(() =>
    Object.fromEntries(Object.entries(localStorage)),
  );
  await context.close();
  return storage;
}

const tones = {
  HOY: ["#1f9d6b", "#fff", "YA FUNCIONA"],
  PENDIENTE: ["#f2b33d", "#16232e", "PENDIENTE"],
  PRUEBA: ["#4ec3ce", "#16232e", "PRUEBA"],
  SIMULADO: ["#8e7cc3", "#fff", "TIEMPO SIMULADO"],
};

/**
 * Caption bar, clock chip and highlight box on top of any page (repainted
 * after each navigation, CSP bypassed by the context).
 */
export function createNarrator(page, total) {
  let caption = null;

  async function paint() {
    if (!caption) return;
    await page
      .evaluate(
        ([c, palette]) => {
          const id = "__kv";
          let rootEl = document.getElementById(id);
          if (!rootEl) {
            rootEl = document.createElement("div");
            rootEl.id = id;
            Object.assign(rootEl.style, {
              position: "fixed",
              inset: "0",
              pointerEvents: "none",
              zIndex: "2147483647",
              fontFamily: '-apple-system, "Helvetica Neue", Arial, sans-serif',
            });
            const clock = document.createElement("div");
            clock.id = `${id}c`;
            Object.assign(clock.style, {
              position: "absolute",
              top: "14px",
              right: "14px",
              background: "rgba(13,22,29,.9)",
              color: "#fff",
              padding: "7px 14px",
              borderRadius: "999px",
              fontSize: "13px",
              fontWeight: "600",
            });
            const cap = document.createElement("div");
            cap.id = `${id}t`;
            Object.assign(cap.style, {
              position: "absolute",
              left: "50%",
              bottom: "22px",
              transform: "translateX(-50%)",
              width: "min(1080px, calc(100% - 64px))",
              background: "rgba(13,22,29,.93)",
              color: "#fff",
              padding: "14px 20px 16px",
              borderRadius: "16px",
              boxShadow: "0 14px 40px rgba(0,0,0,.35)",
              fontSize: "17px",
              lineHeight: "1.45",
            });
            const head = document.createElement("div");
            Object.assign(head.style, {
              display: "flex",
              alignItems: "center",
              gap: "10px",
              marginBottom: "4px",
            });
            const tag = document.createElement("span");
            tag.id = `${id}g`;
            Object.assign(tag.style, {
              fontSize: "11px",
              fontWeight: "800",
              letterSpacing: ".08em",
              padding: "3px 9px",
              borderRadius: "999px",
            });
            const title = document.createElement("strong");
            title.id = `${id}h`;
            title.style.fontSize = "18px";
            head.append(tag, title);
            const text = document.createElement("div");
            text.id = `${id}x`;
            text.style.color = "#d6e4e2";
            cap.append(head, text);
            const box = document.createElement("div");
            box.id = `${id}b`;
            Object.assign(box.style, {
              position: "absolute",
              border: "3px solid #4ec3ce",
              borderRadius: "12px",
              boxShadow: "0 0 0 6px rgba(78,195,206,.25)",
              display: "none",
            });
            rootEl.append(box, clock, cap);
            document.documentElement.appendChild(rootEl);
            setInterval(() => {
              const now = new Intl.DateTimeFormat("es-MX", {
                timeZone: "America/Mexico_City",
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
                hour12: false,
              }).format(new Date());
              const el = document.getElementById(`${id}c`);
              if (el)
                el.textContent = `Paso ${window.__kvStep}/${window.__kvTotal}  ·  ${now} hora de México${window.__kvDay ? `  ·  ${window.__kvDay}` : ""}`;
            }, 500);
          }
          window.__kvStep = c.step;
          window.__kvTotal = c.total;
          window.__kvDay = c.day ?? "";
          const [bg, fg, label] = palette[c.tag] ?? palette.HOY;
          const tag = document.getElementById(`${id}g`);
          tag.textContent = label;
          tag.style.background = bg;
          tag.style.color = fg;
          document.getElementById(`${id}h`).textContent = c.title;
          document.getElementById(`${id}x`).textContent = c.text;
          const box = document.getElementById(`${id}b`);
          if (c.box)
            Object.assign(box.style, {
              display: "block",
              left: `${c.box.x - 8}px`,
              top: `${c.box.y - 8}px`,
              width: `${c.box.width + 16}px`,
              height: `${c.box.height + 16}px`,
            });
          else box.style.display = "none";
        },
        [caption, tones],
      )
      .catch(() => undefined);
  }
  page.on("load", () => void paint());

  return {
    /** Caption for `hold` ms; `highlight` (a locator) is centered and boxed. */
    async say(
      step,
      tag,
      title,
      text,
      hold = 5000,
      highlight = null,
      day = null,
    ) {
      let box = null;
      if (highlight) {
        await highlight
          .evaluate((el) => el.scrollIntoView({ block: "center" }))
          .catch(() => undefined);
        await sleep(350);
        box = await highlight.boundingBox().catch(() => null);
      }
      caption = { step, total, tag, title, text, box, day };
      await paint();
      log(`${step} ${title}`);
      await sleep(hold);
    },
    async unmark() {
      if (caption) caption = { ...caption, box: null };
      await paint();
    },
    /** Takes the caption, the box and the clock off the screen. */
    async hide() {
      caption = null;
      await page
        .evaluate(() => document.getElementById("__kv")?.remove())
        .catch(() => undefined);
    },
    async repaint() {
      await paint();
    },
    /** Smooth-ish scroll under the pointer (panels scroll inner elements). */
    async wheel(totalPx, steps = 10) {
      await page.mouse.move(900, 450);
      for (let i = 0; i < steps; i += 1) {
        await page.mouse.wheel(0, totalPx / steps);
        await sleep(70);
      }
      await sleep(400);
      await paint();
    },
    /** Full-screen title slide (no caption). */
    async slide(html, hold) {
      caption = null;
      await page.setContent(`<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
        *{box-sizing:border-box} body{margin:0;height:100vh;background:#16232e;color:#fff;font-family:-apple-system,"Helvetica Neue",Arial,sans-serif;display:flex;align-items:center;justify-content:center}
        .wrap{width:1240px} h1{font-size:54px;letter-spacing:-.03em;margin:0 0 14px} h2{font-size:38px;letter-spacing:-.02em;margin:0 0 22px}
        p{color:#c9d8d6;font-size:21px;line-height:1.5;margin:0 0 12px} .k{color:#4ec3ce}
        .tag{display:inline-block;font-size:12px;font-weight:800;letter-spacing:.08em;padding:4px 10px;border-radius:999px;margin-right:8px;vertical-align:middle}
        .hoy{background:#1f9d6b} .pen{background:#f2b33d;color:#16232e} .sim{background:#8e7cc3}
        .lanes{display:grid;gap:16px} .lane{background:#1d2d38;border:1px solid #2a3d49;border-radius:18px;padding:16px 20px}
        .lane h3{margin:0 0 10px;font-size:19px} .row{display:flex;gap:10px;flex-wrap:wrap}
        .ev{background:#0d161d;border:1px solid #2a3d49;border-radius:12px;padding:8px 12px;font-size:15px;color:#dfeae8;max-width:250px}
        .ev b{display:block;color:#4ec3ce;font-size:13px;margin-bottom:2px}
        ul{margin:0;padding-left:22px;color:#dfeae8;font-size:19px;line-height:1.6} .cols{display:grid;grid-template-columns:1fr 1fr;gap:28px}
      </style></head><body><div class="wrap">${html}</div></body></html>`);
      await sleep(hold);
    },
  };
}

/** Recording context: 1440x900, Spanish (Mexico), CSP bypassed for captions. */
export async function recordingContext(browser, name) {
  const dir = path.join(outDir, `${name}-webm`);
  fs.rmSync(dir, { recursive: true, force: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    recordVideo: { dir, size: { width: 1440, height: 900 } },
    locale: "es-MX",
    timezoneId: "America/Mexico_City",
    bypassCSP: true,
  });
  return { context, dir };
}

/**
 * webm → MP4 (H.264, minus the optional cuts) plus contact sheets (one frame every 10 s, 4x4) to
 * review the take before handing it over. Needs ffmpeg in PATH.
 */
export function finishVideo(dir, name, cuts = []) {
  const webm = fs.readdirSync(dir).find((file) => file.endsWith(".webm"));
  if (!webm) throw new Error("no video recorded");
  const mp4 = path.join(outDir, `${name}.mp4`);
  // Optional cuts ([from, to] in seconds of the recording): waits that only
  // show a still screen are dropped (no audio track to keep in sync).
  const skip = cuts
    .map(([from, to]) => `between(t,${from.toFixed(2)},${to.toFixed(2)})`)
    .join("+");
  const filter = skip
    ? ["-vf", `fps=25,select='not(${skip})',setpts=N/25/TB`]
    : [];
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    path.join(dir, webm),
    ...filter,
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "22",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    mp4,
  ]);
  const frames = path.join(outDir, `${name}-frames`);
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames);
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-i",
    mp4,
    "-vf",
    "fps=1/10,scale=960:-1",
    path.join(frames, "f%03d.jpg"),
  ]);
  const count = fs.readdirSync(frames).length;
  for (let start = 1, sheet = 1; start <= count; start += 16, sheet += 1) {
    execFileSync("ffmpeg", [
      "-y",
      "-loglevel",
      "error",
      "-start_number",
      String(start),
      "-i",
      path.join(frames, "f%03d.jpg"),
      "-vf",
      "tile=4x4:padding=4",
      "-frames:v",
      "1",
      path.join(outDir, `${name}-sheet${sheet}.jpg`),
    ]);
  }
  log(`MP4: ${mp4} (hojas de contacto en ${outDir})`);
  return mp4;
}
