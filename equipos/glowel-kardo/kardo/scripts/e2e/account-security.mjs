// End-to-end check of «Tu cuenta» (ADR 023) against kardo-dev: preferences
// saved on the server, active sessions closed one by one (the API cuts the
// closed one at once) and the 90-day sign-in history.
//
// Uses e2e-mfa@kardo.test (see customer-second-factor.mjs); its password is
// random on every run and never stored or printed. Development only.
//
// Usage: E2E_API_URL=http://localhost:3011 node scripts/e2e/account-security.mjs
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
const email = "e2e-mfa@kardo.test";
const password = `E2e-${randomBytes(18).toString("base64url")}!9`;
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
  if (error) throw new Error(`sign in: ${error.message}`);
  return { client, token: data.session.access_token };
}

// The account (created by customer-second-factor.mjs) with a fresh password,
// no factor, no sessions and its preferences cleared.
const admin = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
try {
  const [user] = await admin`select id from auth.users where email = ${email}`;
  if (!user) throw new Error("Run scripts/e2e/customer-second-factor.mjs first: it creates e2e-mfa@kardo.test.");
  await admin`
    update auth.users
    set encrypted_password = extensions.crypt(${password}, extensions.gen_salt('bf')), updated_at = now()
    where id = ${user.id}
  `;
  await admin`delete from auth.mfa_factors where user_id = ${user.id}`;
  await admin`delete from auth.sessions where user_id = ${user.id}`;
  await admin`
    update kardo_core.profiles
    set preferred_name = null, time_zone = null, hour_cycle = null, marketing_emails = false, marketing_emails_at = null
    where id = ${user.id}
  `;
} finally {
  await admin.end();
}

// 1. Preferences.
const laptop = await signIn();
const saved = await call(laptop.token, "PATCH", "/v1/me/profile", {
  preferredName: "  Ana  ",
  timeZone: "America/Monterrey",
  hourCycle: "h23",
  marketingEmails: true,
});
record(
  "Guarda nombre preferido, zona, formato de hora y permiso de novedades",
  saved.status === 200 &&
    saved.body.preferredName === "Ana" &&
    saved.body.timeZone === "America/Monterrey" &&
    saved.body.hourCycle === "h23" &&
    saved.body.marketingEmails === true &&
    saved.body.locale === "es-MX",
  `${saved.status}`,
);
const read = await call(laptop.token, "GET", "/v1/me/profile");
record("Se leen igual desde otra petición", read.body?.preferredName === "Ana");
const badZone = await call(laptop.token, "PATCH", "/v1/me/profile", { timeZone: "Marte/Olympus" });
record("Rechaza una zona horaria que no existe", badZone.status === 400, `${badZone.status}`);
const badLocale = await call(laptop.token, "PATCH", "/v1/me/profile", { locale: "en-US" });
record("Solo acepta español de México", badLocale.status === 400, `${badLocale.status}`);
const cleared = await call(laptop.token, "PATCH", "/v1/me/profile", { preferredName: null });
record("null borra el nombre preferido", cleared.body?.preferredName === null);
const empty = await call(laptop.token, "PATCH", "/v1/me/profile", {});
record("Un PATCH vacío no cambia nada (400)", empty.status === 400, `${empty.status}`);

// 2. Sessions.
const phone = await signIn();
const list = await call(laptop.token, "GET", "/v1/me/sessions");
const items = list.body?.items ?? [];
record(
  "Lista dos sesiones y marca la actual",
  items.length === 2 && items.filter((item) => item.current).length === 1,
  `${items.length} sesiones`,
);
const phoneSession = items.find((item) => !item.current);
const before = await call(phone.token, "GET", "/v1/me");
record("La otra sesión entra antes de cerrarla", before.status === 200, `${before.status}`);
const closed = await call(laptop.token, "DELETE", `/v1/me/sessions/${phoneSession?.id}`);
record("Cerrar la otra sesión", closed.body?.closed === 1, JSON.stringify(closed.body));
const after = await call(phone.token, "GET", "/v1/me");
record(
  "El token de la sesión cerrada deja de abrir el API al instante",
  after.status === 401 && after.body?.code === "AUTH_REQUIRED",
  `${after.status} ${after.body?.code}`,
);
const foreign = await call(laptop.token, "DELETE", "/v1/me/sessions/00000000-0000-4000-8000-000000000000");
record("Una sesión ajena o inexistente no se cierra", foreign.body?.closed === 0);

const tablet = await signIn();
const others = await call(laptop.token, "POST", "/v1/me/sessions/close-others");
const tabletAfter = await call(tablet.token, "GET", "/v1/me");
const laptopAfter = await call(laptop.token, "GET", "/v1/me");
record(
  "«Cerrar las demás» corta las otras y deja esta",
  others.body?.closed === 1 && tabletAfter.status === 401 && laptopAfter.status === 200,
  `${others.body?.closed} cerradas`,
);

// 3. Sign-in history.
const history = await call(laptop.token, "GET", "/v1/me/sign-ins");
record(
  "El historial guarda los inicios de sesión de 90 días",
  history.status === 200 && history.body.days === 90 && history.body.items.length >= 3,
  `${history.body?.items?.length} inicios`,
);

await laptop.client.auth.signOut({ scope: "global" });
const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
