// End-to-end check of the customer second factor (relevo 28, ADR 023)
// against kardo-dev: the Customer API refuses aal1 tokens of an account with
// a verified TOTP factor (401 MFA_REQUIRED), and the panel asks for the code
// after the password and after a code by email.
//
// Uses its own account, e2e-mfa@kardo.test (never e2e-owner/e2e-member, whose
// scripts sign in without a second factor). Its password is random on every
// run and never stored or printed. Development only.
//
// Usage:
//   node scripts/e2e/customer-second-factor.mjs
//     E2E_API_URL=http://localhost:3011       Customer API (default 3011)
//     E2E_PANEL_URL=http://localhost:5185     also drive the panel (needs
//                                             scripts/video/node_modules/playwright-core)
import { createHash, createHmac, randomBytes } from "node:crypto";
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

const requireApi = createRequire(path.join(root, "services/customer-api/package.json"));
const requireWeb = createRequire(path.join(root, "apps/customer-web/package.json"));
const postgres = requireApi("postgres");
const { createClient } = requireWeb("@supabase/supabase-js");

const api = (process.env.E2E_API_URL ?? "http://localhost:3011").replace(/\/$/, "");
const panel = process.env.E2E_PANEL_URL?.replace(/\/$/, "") ?? null;
const email = "e2e-mfa@kardo.test";
const password = `E2e-${randomBytes(18).toString("base64url")}!9`;
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function totp(base32Secret, time = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32Secret.replace(/=+$/, "").toUpperCase()) {
    const value = alphabet.indexOf(char);
    if (value < 0) throw new Error("Invalid base32 secret.");
    bits += value.toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const code = (digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000;
  return code.toString().padStart(6, "0");
}

/** Waits for a fresh 30-second window, so a code is never reused. */
async function nextCode(secret, lastCode) {
  let code = totp(secret);
  while (code === lastCode) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    code = totp(secret);
  }
  return code;
}

function client() {
  return createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function me(token) {
  const response = await fetch(`${api}/v1/me`, { headers: { authorization: `Bearer ${token}` } });
  const body = await response.json().catch(() => null);
  return { status: response.status, code: body?.code ?? null };
}

// 1. The account, with a new password and no factor.
const admin = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
let userId;
try {
  const [existing] = await admin`select id from auth.users where email = ${email}`;
  if (existing) {
    userId = existing.id;
    await admin`
      update auth.users
      set encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
      where id = ${userId}
    `;
  } else {
    await admin.begin(async (tx) => {
      const [user] = await tx`
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          email_change_token_current, reauthentication_token, phone_change, phone_change_token
        ) values (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          ${email}, extensions.crypt(${password}, extensions.gen_salt('bf')), now(),
          ${tx.json({ provider: "email", providers: ["email"] })},
          ${tx.json({ display_name: "E2E Segundo factor" })}, now(), now(),
          '', '', '', '', '', '', '', ''
        )
        returning id
      `;
      await tx`
        insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (${user.id}, ${user.id}::text,
          ${tx.json({ sub: user.id, email, email_verified: true })}, 'email', now(), now(), now())
      `;
      userId = user.id;
    });
  }
  await admin`delete from auth.mfa_factors where user_id = ${userId}`;
  await admin`delete from auth.sessions where user_id = ${userId}`;
} finally {
  await admin.end();
}

// 2. Without a factor, the password is enough.
const first = client();
const signIn = await first.auth.signInWithPassword({ email, password });
if (signIn.error) throw new Error(`sign in: ${signIn.error.message}`);
const passwordOnlyToken = signIn.data.session.access_token;
const before = await me(passwordOnlyToken);
record("Sin segundo factor, la contraseña basta", before.status === 200, `${before.status}`);

// 3. Activating TOTP upgrades the session that did it.
const enroll = await first.auth.mfa.enroll({ factorType: "totp", friendlyName: "E2E" });
if (enroll.error) throw new Error(`enroll: ${enroll.error.message}`);
const secret = enroll.data.totp.secret;
let lastCode = await nextCode(secret, null);
const activated = await first.auth.mfa.challengeAndVerify({ factorId: enroll.data.id, code: lastCode });
record("Activar TOTP funciona en kardo-dev", !activated.error, activated.error?.message ?? "");
const { data: afterEnroll } = await first.auth.getSession();
const enrolledCheck = await me(afterEnroll.session.access_token);
record("La sesión que lo activó queda en aal2 y entra", enrolledCheck.status === 200, `${enrolledCheck.status}`);

// 4. An older aal1 token stops working (after the API's short cache).
await new Promise((resolve) => setTimeout(resolve, 11_000));
const stale = await me(passwordOnlyToken);
record(
  "Un token anterior, solo con contraseña, ya no abre nada",
  stale.status === 401 && stale.code === "MFA_REQUIRED",
  `${stale.status} ${stale.code}`,
);

// 5. A new sign in stops at the password until the code arrives.
const second = client();
const again = await second.auth.signInWithPassword({ email, password });
if (again.error) throw new Error(`second sign in: ${again.error.message}`);
const level = await second.auth.mfa.getAuthenticatorAssuranceLevel();
record(
  "Supabase marca la sesión nueva como aal1 → aal2 pendiente",
  level.data?.currentLevel === "aal1" && level.data?.nextLevel === "aal2",
  `${level.data?.currentLevel} → ${level.data?.nextLevel}`,
);
const blocked = await me(again.data.session.access_token);
record(
  "El API responde 401 MFA_REQUIRED a la contraseña sola",
  blocked.status === 401 && blocked.code === "MFA_REQUIRED",
  `${blocked.status} ${blocked.code}`,
);
const wrong = await second.auth.mfa.challengeAndVerify({
  factorId: enroll.data.id,
  code: lastCode === "000000" ? "111111" : "000000",
});
record("Un código equivocado no entra", Boolean(wrong.error), wrong.error ? "rechazado" : "aceptado");
lastCode = await nextCode(secret, lastCode);
const verified = await second.auth.mfa.challengeAndVerify({ factorId: enroll.data.id, code: lastCode });
const { data: upgraded } = await second.auth.getSession();
const allowed = verified.error ? { status: 0 } : await me(upgraded.session.access_token);
record("Con el código correcto entra", allowed.status === 200, `${allowed.status}`);
await second.auth.signOut({ scope: "local" });

// 6. The panel: password → «Verificación en dos pasos.» → code → inside.
if (panel) {
  const requireVideo = createRequire(path.join(root, "scripts/video/package.json"));
  const { chromium } = requireVideo("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    const apiStatuses = [];
    page.on("response", (response) => {
      if (response.url().startsWith(api)) apiStatuses.push(response.status());
    });
    await page.goto(panel);
    await page.fill("#email", email);
    await page.fill("#password", password);
    await page.click("button[type=submit]");
    await page.getByRole("heading", { name: "Verificación en dos pasos." }).waitFor({ timeout: 15_000 });
    record("El panel pide el código después de la contraseña", true);
    await page.screenshot({ path: path.join(root, "scripts/video/.out/second-factor-step.png") }).catch(() => {});
    record("Antes del código el panel no llama al API", apiStatuses.length === 0, `${apiStatuses.length} llamadas`);
    await page.fill("#second-factor-code", lastCode === "000000" ? "111111" : "000000");
    await page.click("button[type=submit]");
    await page.getByText("El código no es válido o ya cambió").waitFor({ timeout: 10_000 });
    record("El panel avisa de un código equivocado", true);
    lastCode = await nextCode(secret, lastCode);
    await page.fill("#second-factor-code", lastCode);
    await page.click("button[type=submit]");
    await page
      .getByRole("heading", { name: "Verificación en dos pasos." })
      .waitFor({ state: "detached", timeout: 15_000 });
    await page.waitForResponse((response) => response.url().startsWith(api) && response.status() === 200, {
      timeout: 15_000,
    });
    record("Con el código, el panel entra y el API responde 200", true);
    await page.screenshot({ path: path.join(root, "scripts/video/.out/second-factor-inside.png") }).catch(() => {});
  } catch (error) {
    record("Recorrido del panel", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
  }

  // 6b. Entering with a code by email («¿La olvidaste?») also asks for the
  //     authenticator before the new password. The email goes to
  //     e2e-mfa@kardo.test; the code is replaced in the database with a
  //     known one, hashed as Supabase Auth does (sha224 of email + code).
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 860 } });
    await page.goto(panel);
    await page.getByRole("button", { name: "¿La olvidaste?" }).click();
    await page.fill("#email", email);
    await page.getByRole("button", { name: "Enviar código" }).click();
    await page.locator("#verification-code").waitFor({ timeout: 15_000 });
    const emailCode = String(100000 + (randomBytes(3).readUIntBE(0, 3) % 900000));
    const tokenHash = createHash("sha224").update(email + emailCode).digest("hex");
    const db = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
    try {
      await db`update auth.users set recovery_token = ${tokenHash}, recovery_sent_at = now() where id = ${userId}`;
      await db`update auth.one_time_tokens set token_hash = ${tokenHash}, created_at = now() where user_id = ${userId} and token_type = 'recovery_token'`;
    } finally {
      await db.end();
    }
    await page.fill("#verification-code", emailCode);
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("heading", { name: "Verificación en dos pasos." }).waitFor({ timeout: 15_000 });
    record("Con el código por correo, el panel también pide el de la app", true);
    lastCode = await nextCode(secret, lastCode);
    await page.fill("#second-factor-code", lastCode);
    await page.click("button[type=submit]");
    await page.getByRole("heading", { name: "Elige una nueva contraseña." }).waitFor({ timeout: 15_000 });
    record("Después del código de la app, deja elegir la contraseña nueva", true);
  } catch (error) {
    record("Entrar con código por correo", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
  } finally {
    await browser.close();
  }
}

// 7. Leave the account without a factor (needs an aal2 session).
await first.auth.mfa.unenroll({ factorId: enroll.data.id });
await first.auth.signOut({ scope: "global" });

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
