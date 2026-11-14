// Creates (or re-keys) the two dedicated end-to-end accounts in kardo-dev.
// Development only: refuses to run unless KARDO_ENV is local/development/test.
// Passwords are random, sent only as bind parameters (never in SQL text or
// logs) and stored in the local, git-ignored .env as E2E_* variables.
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "services/customer-api/package.json"));
const postgres = require("postgres");

const envPath = path.join(root, ".env");
const envText = fs.readFileSync(envPath, "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);
if (!["local", "development", "test"].includes(env.KARDO_ENV ?? "local"))
  throw new Error("E2E accounts are only created outside production.");
const adminUrl = env.SUPABASE_ADMIN_DATABASE_URL;
if (!adminUrl) throw new Error("SUPABASE_ADMIN_DATABASE_URL is required.");

const accounts = [
  { key: "OWNER", email: "e2e-owner@kardo.test", name: "E2E Owner" },
  { key: "MEMBER", email: "e2e-member@kardo.test", name: "E2E Member" },
];

const sql = postgres(adminUrl, { max: 1, prepare: false, onnotice: () => {} });
const updates = {};
try {
  for (const account of accounts) {
    const password = `E2e-${randomBytes(18).toString("base64url")}!9`;
    const [existing] = await sql`select id from auth.users where email = ${account.email}`;
    if (existing) {
      await sql`
        update auth.users
        set encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')),
            email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
        where id = ${existing.id}
      `;
      console.log(`${account.email}: contraseña renovada`);
    } else {
      await sql.begin(async (tx) => {
        const [user] = await tx`
          insert into auth.users (
            instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
            confirmation_token, recovery_token, email_change_token_new, email_change,
            email_change_token_current, reauthentication_token, phone_change, phone_change_token
          ) values (
            '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
            ${account.email}, extensions.crypt(${password}, extensions.gen_salt('bf')), now(),
            ${sql.json({ provider: "email", providers: ["email"] })},
            ${sql.json({ display_name: account.name })}, now(), now(),
            '', '', '', '', '', '', '', ''
          )
          returning id
        `;
        await tx`
          insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
          values (
            ${user.id}, ${user.id}::text,
            ${sql.json({ sub: user.id, email: account.email, email_verified: true })},
            'email', now(), now(), now()
          )
        `;
      });
      console.log(`${account.email}: cuenta creada (el trigger crea su espacio personal)`);
    }
    updates[`E2E_${account.key}_EMAIL`] = account.email;
    updates[`E2E_${account.key}_PASSWORD`] = password;
  }
} finally {
  await sql.end();
}

const lines = envText.split("\n");
for (const [key, value] of Object.entries(updates)) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
}
if (!envText.includes("# Dedicated kardo-dev end-to-end accounts"))
  lines.splice(
    lines.findIndex((line) => line.startsWith("E2E_OWNER_EMAIL=")),
    0,
    "# Dedicated kardo-dev end-to-end accounts (scripts/e2e). Never valid in production.",
  );
fs.writeFileSync(envPath, lines.join("\n"), { mode: fs.statSync(envPath).mode & 0o777 });
console.log(".env: credenciales E2E guardadas (no se muestran)");
