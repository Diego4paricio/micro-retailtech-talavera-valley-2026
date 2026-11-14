// Browser check of «Tu cuenta» (ADR 023) against kardo-dev, with Playwright:
// preferred name and hour format in their dialogs, turning on the second
// factor from Seguridad (QR + code), the sessions list, changing the
// password with the current one, and turning the factor off again.
//
// Uses e2e-mfa@kardo.test (created by customer-second-factor.mjs); its
// password is random on every run and never stored or printed.
//
// Usage:
//   E2E_API_URL=http://localhost:3011 E2E_PANEL_URL=http://localhost:5185 \
//     node scripts/e2e/account-panel.mjs
import { createHmac, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rawEnv = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);
const env = Object.fromEntries(
  Object.entries(rawEnv).map(([key, value]) => [
    key,
    value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => rawEnv[name] ?? ""),
  ]),
);
if (!["local", "development", "test"].includes(env.KARDO_ENV ?? "local"))
  throw new Error("This check only runs outside production.");

const postgres = createRequire(path.join(root, "services/customer-api/package.json"))("postgres");
const { createClient } = createRequire(path.join(root, "apps/customer-web/package.json"))("@supabase/supabase-js");
const { chromium } = createRequire(path.join(root, "scripts/video/package.json"))("playwright-core");

const panel = (process.env.E2E_PANEL_URL ?? "http://localhost:5185").replace(/\/$/, "");
const out = path.join(root, "scripts/video/.out");
const email = "e2e-mfa@kardo.test";
const password = `E2e-${randomBytes(18).toString("base64url")}!9`;
const newPassword = `E2e-${randomBytes(18).toString("base64url")}!7`;
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function totp(base32Secret, time = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32Secret.replace(/=+$/, "").toUpperCase()) bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

const admin = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
const [user] = await admin`select id from auth.users where email = ${email}`;
if (!user) throw new Error("Run scripts/e2e/customer-second-factor.mjs first.");
await admin`update auth.users set encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')) where id = ${user.id}`;
await admin`delete from auth.mfa_factors where user_id = ${user.id}`;
await admin`delete from auth.sessions where user_id = ${user.id}`;
await admin`update kardo_core.profiles set preferred_name = null, hour_cycle = null where id = ${user.id}`;
// The legal acceptance has its own check; here it is already accepted.
const { legalVersions } = await import(path.join(root, "packages/contracts/src/index.ts")).catch(() => ({
  legalVersions: { terms: "1.1", privacy: "1.1" },
}));
await admin`
  update kardo_core.profiles
  set terms_version = ${legalVersions.terms}, privacy_version = ${legalVersions.privacy}, terms_accepted_at = now()
  where id = ${user.id}
`;

const browser = await chromium.launch({ channel: "chrome", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const step = async (name, action) => {
  try {
    const detail = await action();
    record(name, true, detail ?? "");
  } catch (error) {
    record(name, false, error instanceof Error ? error.message.split("\n")[0] : String(error));
    await page.screenshot({ path: path.join(out, `account-panel-fail-${results.length}.png`) }).catch(() => {});
  }
};

try {
  await page.goto(panel);
  await page.fill("#email", email);
  await page.fill("#password", password);
  await page.click("button[type=submit]");
  await page.getByRole("link", { name: "Configuración" }).first().waitFor({ timeout: 20_000 });
  await page.keyboard.press("Escape");

  await step("Perfil: el nombre preferido se cambia en su diálogo", async () => {
    await page.goto(`${panel}/settings/cuenta`);
    await page.getByRole("button", { name: "Cambiar nombre preferido" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Nombre preferido", { exact: true }).fill("Mar");
    await dialog.getByRole("button", { name: "Guardar" }).click();
    await page.getByText("Listo, guardamos el cambio.").waitFor({ timeout: 10_000 });
    const [row] = await admin`select preferred_name from kardo_core.profiles where id = ${user.id}`;
    if (row.preferred_name !== "Mar") throw new Error(`en la base: ${row.preferred_name}`);
  });

  await step("Preferencias: el formato de 24 h se guarda al elegirlo", async () => {
    await page.goto(`${panel}/settings/preferencias`);
    await page.getByRole("radio", { name: "15:30" }).click();
    await page.getByText("Formato de hora guardado.").waitFor({ timeout: 10_000 });
    const [row] = await admin`select hour_cycle from kardo_core.profiles where id = ${user.id}`;
    if (row.hour_cycle !== "h23") throw new Error(`en la base: ${row.hour_cycle}`);
  });

  let secret = "";
  await step("Seguridad: activar la verificación en dos pasos con el QR y el código", async () => {
    await page.goto(`${panel}/settings/seguridad`);
    await page.getByRole("button", { name: "Activar la verificación en dos pasos" }).click();
    await page.getByRole("button", { name: "Continuar" }).click();
    secret = await page.locator("#two-factor-secret").inputValue();
    await page.locator("#two-factor-code").fill(totp(secret));
    await page.getByRole("button", { name: "Activar", exact: true }).click();
    await page.getByText("Verificación en dos pasos activada.").waitFor({ timeout: 10_000 });
    await page.getByText(/Activada · 1 app/).waitFor({ timeout: 10_000 });
    await page.screenshot({ path: path.join(out, "account-panel-security.png"), fullPage: true });
  });

  await step("Seguridad: la lista de sesiones marca esta sesión", async () => {
    await page.getByText("Esta sesión").waitFor({ timeout: 10_000 });
  });

  await step("Contraseña: pide la actual y rechaza una equivocada", async () => {
    await page.getByRole("button", { name: "Cambiar contraseña" }).click();
    await page.locator("#password-current").fill("no-es-la-contraseña");
    await page.locator("#password-new").fill(newPassword);
    await page.locator("#password-confirmation").fill(newPassword);
    await page.getByRole("dialog").getByRole("button", { name: "Cambiar contraseña" }).click();
    await page.getByText("La contraseña actual no es correcta.").waitFor({ timeout: 10_000 });
  });

  await step("Contraseña: con la actual correcta, cambia", async () => {
    await page.locator("#password-current").fill(password);
    await page.getByRole("dialog").getByRole("button", { name: "Cambiar contraseña" }).click();
    await page.getByText("Cambiamos tu contraseña y cerramos tus otras sesiones.").waitFor({ timeout: 15_000 });
    const probe = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error } = await probe.auth.signInWithPassword({ email, password: newPassword });
    if (error) throw new Error(`la nueva no entra: ${error.message}`);
    await probe.auth.signOut({ scope: "local" });
  });

  await step("Seguridad: quitar la única app desactiva la verificación", async () => {
    await page.getByRole("button", { name: "Administrar la verificación en dos pasos" }).click();
    await page.getByRole("button", { name: /^Quitar / }).click();
    await page.getByRole("button", { name: "Quitar y desactivar" }).click();
    await page.getByText("Desactivamos la verificación en dos pasos.").waitFor({ timeout: 10_000 });
    const [row] = await admin`select count(*)::int as n from auth.mfa_factors where user_id = ${user.id}`;
    if (row.n !== 0) throw new Error(`${row.n} factores siguen`);
  });
} finally {
  await browser.close();
  await admin`update kardo_core.profiles set preferred_name = null, hour_cycle = null where id = ${user.id}`;
  await admin`delete from auth.mfa_factors where user_id = ${user.id}`;
  await admin`delete from auth.sessions where user_id = ${user.id}`;
  await admin.end();
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
