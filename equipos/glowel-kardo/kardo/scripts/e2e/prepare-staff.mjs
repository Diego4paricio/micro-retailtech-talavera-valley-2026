// Prepares Kardo Operations for end-to-end tests in kardo-dev ONLY:
//   1. a dedicated staff account (e2e-staff@kardo.test) with an active staff
//      profile and the platform-admin role, enrolled in TOTP MFA;
//   2. a fresh password for the least-privileged `kardo_staff_api_runtime`
//      login (stored as a SCRAM verifier, never in plain text) and the
//      matching STAFF_DATABASE_URL;
//   3. a SUSPENSION_COMMAND_KEY shared by the Staff API and the Resolver.
// Secrets are written only to the git-ignored .env and never printed.
import { createHash, createHmac, pbkdf2Sync, randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "services/customer-api/package.json"));
const postgres = require("postgres");

const envPath = path.join(root, ".env");
const envText = fs.readFileSync(envPath, "utf8");
const rawEnv = Object.fromEntries(
  envText
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
  throw new Error("Staff E2E setup only runs outside production.");
for (const key of ["SUPABASE_ADMIN_DATABASE_URL", "SUPABASE_DATABASE_URL", "VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"]) {
  if (!env[key]) throw new Error(`${key} is required.`);
}

const updates = {};
const staffEmail = "e2e-staff@kardo.test";
const staffPassword = `E2e-${randomBytes(18).toString("base64url")}!9`;

// --- 1. Staff account ----------------------------------------------------------
const sql = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
let staffId;
try {
  const [existing] = await sql`select id from auth.users where email = ${staffEmail}`;
  if (existing) {
    staffId = existing.id;
    await sql`
      update auth.users
      set encrypted_password = extensions.crypt(${staffPassword}, extensions.gen_salt('bf')),
          email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
      where id = ${staffId}
    `;
    // Re-enroll MFA from scratch so the stored TOTP secret is always current.
    await sql`delete from auth.mfa_factors where user_id = ${staffId}`;
  } else {
    staffId = await sql.begin(async (tx) => {
      const [user] = await tx`
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          email_change_token_current, reauthentication_token, phone_change, phone_change_token
        ) values (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          ${staffEmail}, extensions.crypt(${staffPassword}, extensions.gen_salt('bf')), now(),
          ${sql.json({ provider: "email", providers: ["email"] })},
          ${sql.json({ display_name: "E2E Staff" })}, now(), now(),
          '', '', '', '', '', '', '', ''
        )
        returning id
      `;
      await tx`
        insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (${user.id}, ${user.id}::text, ${sql.json({ sub: user.id, email: staffEmail, email_verified: true })},
                'email', now(), now(), now())
      `;
      return user.id;
    });
  }
  await sql`
    insert into kardo_staff.staff_profiles (id, status, display_name)
    values (${staffId}::uuid, 'active', 'E2E Staff')
    on conflict (id) do update set status = 'active', revoked_at = null, display_name = excluded.display_name
  `;
  await sql`
    insert into kardo_staff.role_assignments (staff_id, role_id)
    select ${staffId}::uuid, id from kardo_staff.roles where code = 'platform-admin'
    on conflict do nothing
  `;
  await sql`
    insert into kardo_audit.events (actor_type, action, target_type, target_id, result, reason, metadata)
    values ('service', 'staff.e2e_account_prepared', 'staff_profile', ${staffId}::uuid, 'succeeded',
            'Cuenta de staff para pruebas end-to-end en kardo-dev', ${sql.json({ role: "platform-admin" })})
  `;

  // --- 2. Staff API runtime login ------------------------------------------------
  const runtimePassword = randomBytes(32).toString("base64url");
  const verifier = scramVerifier(runtimePassword);
  if (!/^SCRAM-SHA-256\$4096:[A-Za-z0-9+/=]+\$[A-Za-z0-9+/=]+:[A-Za-z0-9+/=]+$/.test(verifier))
    throw new Error("Unexpected verifier format.");
  await sql.unsafe(`alter role kardo_staff_api_runtime with login password '${verifier}'`);
  const customerUrl = new URL(env.SUPABASE_DATABASE_URL);
  const staffUrl = new URL(customerUrl);
  // Supavisor usernames are `<role>.<project-ref>`.
  staffUrl.username = customerUrl.username.replace(/^[^.]+/, "kardo_staff_api_runtime");
  staffUrl.password = runtimePassword;
  updates.STAFF_DATABASE_URL = staffUrl.toString();
} finally {
  await sql.end();
}

// --- 1b. TOTP enrollment through Supabase Auth ------------------------------------
const auth = (route, init = {}, token) =>
  fetch(`${env.VITE_SUPABASE_URL}/auth/v1${route}`, {
    ...init,
    headers: {
      apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
  });
const signIn = await auth("/token?grant_type=password", {
  method: "POST",
  body: JSON.stringify({ email: staffEmail, password: staffPassword }),
});
if (!signIn.ok) throw new Error(`staff sign-in HTTP ${signIn.status}`);
const session = await signIn.json();
const enroll = await auth(
  "/factors",
  { method: "POST", body: JSON.stringify({ factor_type: "totp", friendly_name: `e2e-${Date.now()}` }) },
  session.access_token,
);
if (!enroll.ok) throw new Error(`TOTP enroll HTTP ${enroll.status}`);
const factor = await enroll.json();
const secret = factor.totp.secret;
const challenge = await auth(`/factors/${factor.id}/challenge`, { method: "POST", body: "{}" }, session.access_token);
if (!challenge.ok) throw new Error(`TOTP challenge HTTP ${challenge.status}`);
const { id: challengeId } = await challenge.json();
const verify = await auth(
  `/factors/${factor.id}/verify`,
  { method: "POST", body: JSON.stringify({ challenge_id: challengeId, code: totp(secret) }) },
  session.access_token,
);
if (!verify.ok) throw new Error(`TOTP verify HTTP ${verify.status}`);

updates.E2E_STAFF_EMAIL = staffEmail;
updates.E2E_STAFF_PASSWORD = staffPassword;
updates.E2E_STAFF_TOTP_SECRET = secret;
if (!rawEnv.SUSPENSION_COMMAND_KEY) updates.SUSPENSION_COMMAND_KEY = randomBytes(32).toString("base64url");

// --- Write .env --------------------------------------------------------------------
const lines = envText.split("\n");
for (const [key, value] of Object.entries(updates)) {
  const index = lines.findIndex((line) => line.startsWith(`${key}=`));
  if (index >= 0) lines[index] = `${key}=${value}`;
  else lines.push(`${key}=${value}`);
}
fs.writeFileSync(envPath, lines.join("\n"), { mode: fs.statSync(envPath).mode & 0o777 });
console.log(`Staff E2E listo: cuenta ${staffEmail} (platform-admin, TOTP), login de Staff API rotado.`);
console.log(`.env actualizado: ${Object.keys(updates).join(", ")} (valores no mostrados)`);

// --- Helpers -----------------------------------------------------------------------
function scramVerifier(password) {
  const salt = randomBytes(16);
  const iterations = 4096;
  const salted = pbkdf2Sync(password.normalize("NFKC"), salt, iterations, 32, "sha256");
  const clientKey = createHmac("sha256", salted).update("Client Key").digest();
  const storedKey = createHash("sha256").update(clientKey).digest();
  const serverKey = createHmac("sha256", salted).update("Server Key").digest();
  return `SCRAM-SHA-256$${iterations}:${salt.toString("base64")}$${storedKey.toString("base64")}:${serverKey.toString("base64")}`;
}

export function totp(base32Secret, time = Date.now()) {
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
