// End-to-end check of a second organization (relevo 32, A10 and B2; since
// ADR 024 the person's trial covers it) against kardo-dev:
// - the menu's selector offers «Crear organización…» with one organization;
// - the wizard says the person's trial covers it («Tu prueba de Profesional
//   incluye 3: usas 1.») and saves the profile (giro, WhatsApp; it used to
//   answer 403 and show «no pudimos guardar todos los datos del perfil»);
// - the profile keeps the new «Horario» (B5), Equipo can read the
//   invitations, and the new organization can create content.
//
// A throwaway account e2e-org-<stamp>@kardo.test is created by SQL and
// deleted at the end through «Borrar mi cuenta» (DELETE /v1/me), so its
// organizations go too. Its password is random and never printed. No email
// is sent. Development only.
//
// Usage (API without watch on 3011, panel on 5185 without demo mode; tsx
// because it reads `legalVersions` from packages/contracts):
//   cd services/customer-api && E2E_API_URL=http://localhost:3011 \
//     E2E_PANEL_URL=http://localhost:5185 pnpm exec tsx ../../scripts/e2e/second-organization.mjs
import { randomBytes } from "node:crypto";
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
const postgres = requireApi("postgres");
const { createClient } = createRequire(path.join(root, "apps/customer-web/package.json"))("@supabase/supabase-js");

const api = (process.env.E2E_API_URL ?? "http://localhost:3011").replace(/\/$/, "");
const panel = process.env.E2E_PANEL_URL?.replace(/\/$/, "");
const stamp = new Date().toISOString().slice(5, 19).replace(/[-T:]/g, "");
const email = `e2e-org-${stamp}@kardo.test`;
const password = `E2e-${randomBytes(18).toString("base64url")}!9`;
const outDir = path.join(root, "scripts/video/.out");
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function call(token, method, url, body) {
  const response = await fetch(`${api}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

async function signIn() {
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session.access_token;
}

const { legalVersions } = await import(path.join(root, "packages/contracts/src/index.ts"));
const admin = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
let userId;
let deleted = false;
try {
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
        ${tx.json({ display_name: "E2E Agencia" })}, now(), now(),
        '', '', '', '', '', '', '', ''
      )
      returning id
    `;
    await tx`
      insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (${user.id}, ${user.id}::text, ${tx.json({ sub: user.id, email, email_verified: true })}, 'email', now(), now(), now())
    `;
    userId = user.id;
  });
  await admin`
    update kardo_core.profiles set terms_version = ${legalVersions.terms}, privacy_version = ${legalVersions.privacy}, terms_accepted_at = now()
    where id = ${userId}::uuid
  `;

  // Its own business first, as the sign up does: that uses its trial.
  let token = await signIn();
  const [personal] = (await call(token, "GET", "/v1/workspaces")).body ?? [];
  const onboarded = await call(token, "PATCH", `/v1/workspaces/${personal?.id}/onboarding`, {
    workspaceName: "Nodo Digital E2E",
    accountType: "business",
  });
  record("Termina el alta de su agencia (usa su prueba)", onboarded.status === 200, `${onboarded.status}`);

  let organizationId;
  if (panel) {
    const { chromium } = createRequire(path.join(root, "scripts/video/package.json"))("playwright-core");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
      await page.goto(panel);
      await page.fill("#email", email);
      await page.fill("#password", password);
      await page.click("button[type=submit]");
      const select = page.locator(".sidebar select");
      await select.waitFor({ state: "attached", timeout: 30_000 });
      const options = await select.locator("option").allInnerTexts();
      record("Con una sola organización, el selector ofrece «Crear organización…»", options.includes("Crear organización…"), JSON.stringify(options));
      await select.selectOption("crear-organizacion");
      // «Crear organización» (relevo 36): Negocio, Ubicación, Marca, Confirmar.
      const dialog = page.locator("dialog[open]");
      await page.fill("#new-org-name", "Barbería El Bigote E2E");
      await dialog.getByRole("button", { name: "Belleza" }).click();
      // ADR 024: the person's trial covers it, and the dialog says so.
      const line = dialog.getByText("Tu prueba de Profesional incluye 3: usas 1.", { exact: false });
      await line.waitFor({ timeout: 20_000 });
      record("Dice que su prueba la cubre antes de crearla", await line.isVisible());
      await dialog.getByRole("button", { name: "Siguiente" }).click();
      await page.fill("#new-org-city", "Guadalajara");
      await page.fill("#new-org-whatsapp", "33 1234 5678");
      await dialog.getByRole("button", { name: "Siguiente" }).click();
      await dialog.getByRole("button", { name: "Siguiente" }).click();
      await page.screenshot({ path: path.join(outDir, "second-organization-confirm.png") });
      await dialog.getByRole("button", { name: "Crear organización" }).click();
      await page.getByText("Organización «Barbería El Bigote E2E» creada.").waitFor({ timeout: 20_000 });
      await page.waitForTimeout(1500);
      const failedSave = await page.getByText("no pudimos guardar todos los datos del perfil").count();
      record("El asistente guarda el perfil", failedSave === 0);
      await page.screenshot({ path: path.join(outDir, "second-organization-created.png") });
    } catch (error) {
      record("Crear la organización desde el panel", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
    } finally {
      await browser.close();
    }
    const list = (await call(token, "GET", "/v1/workspaces")).body ?? [];
    organizationId = list.find((item) => item.name === "Barbería El Bigote E2E")?.id;
  } else {
    const created = await call(token, "POST", "/v1/organizations", { name: "Barbería El Bigote E2E" });
    record("Crea la segunda organización", created.status === 201, `${created.status}`);
    organizationId = created.body?.id;
  }
  if (!organizationId) throw new Error("The second organization was not created.");

  // Through the API: what works without a plan, and what still needs one.
  const fromWizard = await call(token, "GET", `/v1/workspaces/${organizationId}/profile`);
  if (panel)
    record("El perfil del asistente quedó guardado (giro y WhatsApp)", fromWizard.body?.industry === "belleza" && /33\s?1234\s?5678/.test(fromWizard.body?.whatsapp ?? fromWizard.body?.phone ?? ""), JSON.stringify(fromWizard.body));
  const profile = await call(token, "PUT", `/v1/workspaces/${organizationId}/profile`, {
    industry: "belleza",
    phone: "33 1234 5678",
    city: "Guadalajara",
    hours: "  Mar a sáb,  10:00 a 19:00 ",
  });
  record("Guarda el perfil (antes 403 sin plan)", profile.status === 200, `${profile.status} ${profile.body?.code ?? ""}`);
  const read = await call(token, "GET", `/v1/workspaces/${organizationId}/profile`);
  record("El horario queda guardado y limpio", read.body?.hours === "Mar a sáb, 10:00 a 19:00", JSON.stringify(read.body?.hours));
  record("El teléfono del asistente o del API queda guardado", read.body?.phone === "33 1234 5678", JSON.stringify(read.body?.phone));
  const invitations = await call(token, "GET", `/v1/workspaces/${organizationId}/invitations`);
  record("Equipo lee las invitaciones", invitations.status === 200, `${invitations.status}`);
  const content = await call(token, "POST", `/v1/workspaces/${organizationId}/experiences`, {
    type: "redirect",
    name: "Prueba",
    content: { destinationUrl: "https://kardo.test" },
  });
  // ADR 024: the trial is the person's, so the new organization can work.
  record("La prueba de la persona cubre el contenido de la segunda", content.status === 201, `${content.status} ${content.body?.code ?? ""}`);

  // Clean up: «Borrar mi cuenta» erases both organizations.
  token = await signIn();
  const erased = await call(token, "DELETE", "/v1/me", { confirm: "BORRAR MI CUENTA" });
  deleted = erased.status === 200;
  record("Limpieza: la cuenta y sus dos organizaciones se borran", deleted && erased.body?.erasedWorkspaces === 2, JSON.stringify(erased.body));
} finally {
  if (userId && !deleted) {
    // Something failed halfway: take the account and its spaces out by hand.
    const spaces = await admin`
      select workspace_id from kardo_core.workspace_memberships where profile_id = ${userId}::uuid
    `.catch(() => []);
    await admin`delete from auth.users where id = ${userId}::uuid`.catch(() => undefined);
    for (const { workspace_id: id } of spaces)
      await admin`delete from kardo_core.workspaces where id = ${id}::uuid`.catch(() =>
        admin`update kardo_core.workspaces set deleted_at = now() where id = ${id}::uuid`.catch(() => undefined),
      );
  }
  await admin.end();
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} pasos correctos`);
process.exit(failed ? 1 : 0);
