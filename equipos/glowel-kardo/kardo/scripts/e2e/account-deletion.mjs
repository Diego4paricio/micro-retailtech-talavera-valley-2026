// End-to-end check of «Tus datos» (ADR 023) against kardo-dev: export my
// data, and delete my account — blocked while the person is the only Owner
// of a team, refused without a recent sign in, and then for real: the
// account goes, its personal space and lone organization are deleted (QR
// retired), and the team organization keeps going without it.
//
// Creates a throwaway account e2e-borrar-<random>@kardo.test every run (it
// is deleted by the check itself) and uses e2e-mfa@kardo.test as the other
// member of the team. Development only; no email is sent.
//
// Usage: E2E_API_URL=http://localhost:3011 [E2E_PANEL_URL=http://localhost:5185] \
//   pnpm --dir services/customer-api exec tsx ../../scripts/e2e/account-deletion.mjs
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

const postgres = createRequire(path.join(root, "services/customer-api/package.json"))("postgres");
const { createClient } = createRequire(path.join(root, "apps/customer-web/package.json"))("@supabase/supabase-js");

const api = (process.env.E2E_API_URL ?? "http://localhost:3011").replace(/\/$/, "");
const panel = process.env.E2E_PANEL_URL?.replace(/\/$/, "") ?? null;
const email = `e2e-borrar-${randomBytes(4).toString("hex")}@kardo.test`;
const password = `E2e-${randomBytes(18).toString("base64url")}!9`;
const results = [];
const randomId = (prefix) => `${prefix}${randomBytes(12).toString("base64url")}`.slice(0, 24);

function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const admin = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

async function signIn() {
  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`sign in: ${error.message}`);
  return data.session;
}

async function call(token, method, url, body) {
  const response = await fetch(`${api}${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}

let userId;
let loneOrg;
let teamOrg;
try {
  // The account (the bootstrap trigger gives it its personal space).
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
        ${tx.json({ display_name: "E2E Borrar" })}, now(), now(),
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
  const [helper] = await admin`select id from auth.users where email = 'e2e-mfa@kardo.test'`;
  if (!helper) throw new Error("Run scripts/e2e/customer-second-factor.mjs first.");
  // An organization only it belongs to, with a QR; and a team with e2e-mfa.
  [loneOrg] = await admin`
    insert into kardo_core.workspaces (public_id, kind, name)
    values (${randomId("ws")}, 'organization', 'E2E Borrar sola') returning id
  `;
  [teamOrg] = await admin`
    insert into kardo_core.workspaces (public_id, kind, name)
    values (${randomId("ws")}, 'organization', 'E2E Borrar equipo') returning id
  `;
  await admin`
    insert into kardo_core.workspace_memberships (workspace_id, profile_id, role) values
      (${loneOrg.id}::uuid, ${userId}::uuid, 'owner'),
      (${teamOrg.id}::uuid, ${userId}::uuid, 'owner'),
      (${teamOrg.id}::uuid, ${helper.id}::uuid, 'editor')
  `;
  const [qr] = await admin`
    insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind)
    values (${randomId("tp")}, ${loneOrg.id}::uuid, 'assigned', 'other', 'qr') returning id
  `;
  await admin`
    insert into kardo_core.experiences (workspace_id, type, name, draft_content, created_by)
    values (${teamOrg.id}::uuid, 'profile', 'Perfil del equipo', '{}', ${userId}::uuid)
  `;

  let session = await signIn();

  // 1. Export.
  const exported = await call(session.access_token, "GET", "/v1/me/export");
  record(
    "Exportar mis datos trae perfil, organizaciones e historial",
    exported.status === 200 && exported.body.profile.email === email &&
      exported.body.organizations.length === 3 && exported.body.signIns.length >= 1,
    `${exported.status}, ${exported.body?.organizations?.length} espacios`,
  );

  // 2. What deletion would do.
  const check = await call(session.access_token, "GET", "/v1/me/deletion");
  record(
    "La revisión dice qué se borra y qué lo impide",
    check.body?.recentSignIn === true &&
      check.body.erase.length === 2 &&
      check.body.blockers.some((blocker) => blocker.kind === "owner_with_team" && blocker.workspaceId === teamOrg.id),
    JSON.stringify({ erase: check.body?.erase?.length, blockers: check.body?.blockers?.map((b) => b.kind) }),
  );
  const blocked = await call(session.access_token, "DELETE", "/v1/me", { confirm: "BORRAR MI CUENTA" });
  record("Siendo Owner único de un equipo, no se puede", blocked.status === 409 && blocked.body?.code === "ACCOUNT_DELETION_BLOCKED", `${blocked.status} ${blocked.body?.code}`);

  // 3. The team gets another Owner; an old sign in is not enough.
  await admin`update kardo_core.workspace_memberships set role = 'owner' where workspace_id = ${teamOrg.id}::uuid and profile_id = ${helper.id}::uuid`;
  await admin`
    update auth.mfa_amr_claims set created_at = now() - interval '1 hour', updated_at = now() - interval '1 hour'
    where session_id in (select id from auth.sessions where user_id = ${userId}::uuid)
  `;
  const old = await call(session.access_token, "DELETE", "/v1/me", { confirm: "BORRAR MI CUENTA" });
  record("Con un inicio de sesión de hace una hora, pide volver a entrar", old.status === 403 && old.body?.code === "REAUTHENTICATION_REQUIRED", `${old.status} ${old.body?.code}`);
  const typo = await call(session.access_token, "DELETE", "/v1/me", { confirm: "borrar" });
  record("Sin la frase exacta no borra", typo.status === 400, `${typo.status}`);

  // 4. Sign in again and delete: through the API, or through the panel
  //    (password + phrase in «Tus datos») when E2E_PANEL_URL is set.
  if (panel) {
    const { chromium } = createRequire(path.join(root, "scripts/video/package.json"))("playwright-core");
    const browser = await chromium.launch({ channel: "chrome", headless: true });
    try {
      const { legalVersions } = await import(path.join(root, "packages/contracts/src/index.ts"));
      await admin`
        update kardo_core.profiles set terms_version = ${legalVersions.terms}, privacy_version = ${legalVersions.privacy}, terms_accepted_at = now()
        where id = ${userId}::uuid
      `;
      const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
      await page.goto(panel);
      await page.fill("#email", email);
      await page.fill("#password", password);
      await page.click("button[type=submit]");
      await page.getByRole("link", { name: "Configuración" }).first().waitFor({ timeout: 20_000 });
      await page.goto(`${panel}/settings/datos`);
      await page.getByRole("button", { name: "Borrar mi cuenta" }).click();
      await page.locator("#delete-account-password").fill(password);
      await page.locator("#delete-account-phrase").fill("BORRAR MI CUENTA");
      await page.screenshot({ path: path.join(root, "scripts/video/.out/account-deletion-dialog.png") });
      await page.getByRole("dialog").getByRole("button", { name: "Borrar mi cuenta" }).click();
      await page.getByText("Borramos tu cuenta y tus datos.").waitFor({ timeout: 20_000 });
      record("Borrar mi cuenta desde el panel (contraseña y frase)", true);
    } catch (error) {
      record("Borrar mi cuenta desde el panel", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
    } finally {
      await browser.close();
    }
    session = { access_token: session.access_token };
  } else {
    session = await signIn();
    const deleted = await call(session.access_token, "DELETE", "/v1/me", { confirm: "BORRAR MI CUENTA" });
    record("Borrar mi cuenta", deleted.status === 200 && deleted.body?.erasedWorkspaces === 2, JSON.stringify(deleted.body));
  }
  const [after] = await admin`
    select
      (select count(*)::int from auth.users where id = ${userId}::uuid) as users,
      (select deleted_at is not null from kardo_core.workspaces where id = ${loneOrg.id}::uuid) as lone_deleted,
      (select deleted_at is null from kardo_core.workspaces where id = ${teamOrg.id}::uuid) as team_alive,
      (select status::text from kardo_core.touchpoints where id = ${qr.id}::uuid) as qr_status,
      (select created_by is null from kardo_core.experiences where workspace_id = ${teamOrg.id}::uuid and name = 'Perfil del equipo') as authorless
  `;
  record(
    "La cuenta y sus espacios propios se fueron; el equipo sigue con su trabajo",
    after.users === 0 && after.lone_deleted && after.team_alive && after.qr_status === "retired" && after.authorless,
    JSON.stringify(after),
  );
  const gone = await call(session.access_token, "GET", "/v1/me");
  record("Su token ya no abre nada", gone.status === 401, `${gone.status}`);
} finally {
  if (userId) await admin`delete from auth.users where id = ${userId}::uuid`.catch(() => undefined);
  if (teamOrg) await admin`update kardo_core.workspaces set name = 'E2E Borrar equipo (prueba)' where id = ${teamOrg.id}::uuid`.catch(() => undefined);
  await admin.end();
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
