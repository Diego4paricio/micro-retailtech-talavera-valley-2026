// Fresh test accounts for a video take in kardo-dev (development only).
//
//   node scripts/video/accounts.mjs owner friend
//
// Each key gets a new auth user (`delivered+kardo-<key>-<stamp>@resend.dev`,
// a Resend test inbox: nothing real is delivered) with a random password.
// The trigger creates its personal workspace. Emails, passwords and
// workspace ids go to scripts/video/.out/accounts.json (mode 600, git-ignored);
// nothing secret is printed.
import { randomBytes } from "node:crypto";
import { postgres, readAccounts, readEnv, writeAccounts } from "./lib.mjs";

const keys = process.argv.slice(2);
if (keys.length === 0) {
  console.error("Uso: node scripts/video/accounts.mjs <clave> [clave…]");
  process.exit(1);
}
const env = readEnv();
if (!["local", "development", "test"].includes(env.KARDO_ENV ?? "local"))
  throw new Error("Video accounts are only created outside production.");

const names = {
  owner: "Dueña de prueba",
  friend: "Amigo beta",
  scout: "Ensayo",
  guest: "Gema",
};
const stamp = new Date().toISOString().slice(5, 19).replace(/[-T:]/g, "");
const sql = postgres()(env.SUPABASE_ADMIN_DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});
const accounts = readAccounts();
try {
  for (const key of keys) {
    const email = `delivered+kardo-${key}-${stamp}@resend.dev`;
    const password = `Vid-${randomBytes(15).toString("base64url")}!7`;
    const name = names[key] ?? key;
    const id = await sql.begin(async (tx) => {
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
          ${tx.json({ display_name: name })}, now(), now(),
          '', '', '', '', '', '', '', ''
        ) returning id`;
      await tx`
        insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (${user.id}, ${user.id}::text,
          ${tx.json({ sub: user.id, email, email_verified: true })},
          'email', now(), now(), now())`;
      return user.id;
    });
    const [workspace] = await sql`
      select workspace_id from kardo_core.workspace_memberships
      where profile_id = ${id} and role = 'owner' limit 1`;
    accounts[key] = {
      id,
      email,
      password,
      name,
      workspaceId: workspace?.workspace_id ?? null,
    };
    console.log(`${key}: ${email} (espacio ${workspace?.workspace_id ?? "?"})`);
  }
} finally {
  await sql.end();
}
writeAccounts(accounts);
console.log(
  "scripts/video/.out/accounts.json actualizado (contraseñas no mostradas)",
);
