// End-to-end check of Links with their own address (Links redesign,
// phase 2, 2026-10-04) against kardo-dev, through the Customer API:
// kardo.com.mx/<negocio>/<link> is recommended and checked before creating,
// unique inside the business («car-ta» counts as «carta»), the first link is
// the main one, a link's address changes once every 7 days with the old one
// kept for it, and retiring a link frees its addresses.
//
// A throwaway account e2e-links-<stamp>@kardo.test is created by SQL and
// deleted at the end through «Borrar mi cuenta». Its password is random and
// never printed. No email is sent. Development only.
//
// Usage (API without watch on 3011; tsx because it reads `legalVersions`):
//   cd services/customer-api && E2E_API_URL=http://localhost:3011 \
//     pnpm exec tsx ../../scripts/e2e/links-addresses.mjs
import { randomBytes, randomUUID } from "node:crypto";
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
const stamp = new Date().toISOString().slice(5, 19).replace(/[-T:]/g, "");
const email = `e2e-links-${stamp}@kardo.test`;
const password = `E2e-${randomBytes(18).toString("base64url")}!9`;
const results = [];

// Links, phase 3b: the Resolver serves <Resolver>/<negocio>/<link> (in
// development, its own workers.dev address; kardo.com.mx in production).
const resolver = (env.TAP_RESOLVER_URL ?? "").replace(/\/$/, "");
async function viaResolver(path) {
  const response = await fetch(`${resolver}${path}`, {
    redirect: "manual",
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" },
  });
  await response.body?.cancel();
  return { status: response.status, location: response.headers.get("location") };
}
async function untilResolver(path, done, seconds = 90) {
  const end = Date.now() + seconds * 1000;
  let last = await viaResolver(path);
  while (!done(last) && Date.now() < end) {
    await new Promise((resolve) => setTimeout(resolve, 3000));
    last = await viaResolver(path);
  }
  return last;
}

function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

async function call(token, method, url, body, headers = {}) {
  const response = await fetch(`${api}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
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

  let token = await signIn();
  const [personal] = (await call(token, "GET", "/v1/workspaces")).body ?? [];
  const workspaceId = personal?.id;
  const onboarded = await call(token, "PATCH", `/v1/workspaces/${workspaceId}/onboarding`, {
    workspaceName: "Florería Luz E2E",
    accountType: "business",
  });
  record("Termina el alta (usa su prueba)", onboarded.status === 200, `${onboarded.status}`);
  const base = `/v1/workspaces/${workspaceId}`;

  const experience = await call(token, "POST", `${base}/experiences`, {
    type: "redirect",
    name: "Carta de temporada",
    content: { destinationUrl: "https://kardo.test/carta" },
  });
  record("Crea una página", experience.status === 201, `${experience.status}`);
  const experienceId = experience.body?.id;

  const early = await call(token, "POST", `${base}/links`, { experienceId, slug: "carta" });
  record("Sin dirección del negocio, pide elegirla primero", early.status === 409 && early.body?.code === "BUSINESS_SLUG_REQUIRED", `${early.status} ${early.body?.code}`);

  const businessSlug = `floreria-luz-e2e-${stamp.slice(-6)}`;
  const business = await call(token, "PUT", `${base}/slug`, { slug: businessSlug });
  record("Guarda la dirección del negocio", business.status === 200, `${business.status}`);

  const suggestion = await call(token, "GET", `${base}/links/slug-suggestion?name=${encodeURIComponent("Carta de temporada")}&type=menu`);
  record("Recomienda una dirección corta por el nombre", suggestion.body?.slug === "carta", JSON.stringify(suggestion.body));

  const first = await call(token, "POST", `${base}/links`, { experienceId, slug: "carta" });
  record("Crea el link con su dirección", first.status === 201 && first.body?.slug === "carta" && first.body?.kind === "link", `${first.status} ${JSON.stringify(first.body?.slug)}`);
  const firstId = first.body?.id;

  const taken = await call(token, "GET", `${base}/links/slug-availability?slug=car-ta&name=${encodeURIComponent("Carta de temporada")}&type=menu`);
  record("Revisa antes de crear: car-ta cuenta como carta", taken.body?.available === false && taken.body?.reason === "taken" && taken.body?.suggestion === "carta-de-temporada", JSON.stringify(taken.body));

  const duplicate = await call(token, "POST", `${base}/links`, { experienceId, slug: "carta" });
  record("No deja repetir una dirección en el mismo negocio", duplicate.status === 409 && duplicate.body?.code === "SLUG_TAKEN", `${duplicate.status} ${duplicate.body?.code}`);

  let workspaces = (await call(token, "GET", "/v1/workspaces")).body ?? [];
  record("El primer link queda como principal", workspaces.find((item) => item.id === workspaceId)?.mainLinkId === firstId);
  record("La dirección del negocio recién elegida no cuenta como cambio", workspaces.find((item) => item.id === workspaceId)?.slugChangedAt === null, JSON.stringify(workspaces.find((item) => item.id === workspaceId)?.slugChangedAt));

  const targets = await call(token, "GET", `${base}/experiences/${experienceId}`);
  record("El link queda en «Dónde se ve» de la página", Boolean(targets.body?.targets?.some((item) => item.touchpointId === firstId)), JSON.stringify(targets.body?.targets));

  const published = await call(token, "POST", `${base}/experiences/${experienceId}/publication-intents`, undefined, { "idempotency-key": randomUUID() });
  record("Se publica en el link nuevo", [200, 201, 202].includes(published.status), `${published.status} ${published.body?.code ?? ""}`);
  if (resolver) {
    const opens = await untilResolver(`/${businessSlug}/carta`, (r) => r.location === "https://kardo.test/carta");
    record("El link nuevo abre en el Resolver", opens.location === "https://kardo.test/carta", `${opens.status} ${opens.location}`);
    const main = await viaResolver(`/${businessSlug}`);
    record("La dirección del negocio abre el principal", main.location === "https://kardo.test/carta", `${main.status} ${main.location}`);
  }

  const second = await call(token, "POST", `${base}/links`, { experienceId, slug: "promo", name: "Promo de otoño" });
  record("El link se llama por su dirección (ignora name)", second.status === 201 && second.body?.operationalName === "/promo", `${second.status} ${second.body?.operationalName}`);
  const secondId = second.body?.id;

  const main = await call(token, "PUT", `${base}/main-link`, { touchpointId: secondId });
  workspaces = (await call(token, "GET", "/v1/workspaces")).body ?? [];
  record("Cambia el link principal", main.status === 204 && workspaces.find((item) => item.id === workspaceId)?.mainLinkId === secondId, `${main.status}`);

  const renamed = await call(token, "PUT", `${base}/links/${firstId}/slug`, { slug: "menu" });
  record("El primer cambio de dirección se permite", renamed.status === 200 && renamed.body?.slug === "menu", `${renamed.status}`);
  record("Al cambiarla, el nombre la sigue y queda la fecha del cambio", renamed.body?.operationalName === "/menu" && Boolean(renamed.body?.slugChangedAt), `${renamed.body?.operationalName} ${renamed.body?.slugChangedAt}`);
  if (resolver) {
    const old = await viaResolver(`/${businessSlug}/carta`);
    record("La dirección anterior lleva a la nueva", old.status === 302 && old.location === `/${businessSlug}/menu`, `${old.status} ${old.location}`);
    const now = await viaResolver(`/${businessSlug}/menu`);
    record("La dirección nueva abre", now.location === "https://kardo.test/carta", `${now.status} ${now.location}`);
  }
  const tooSoon = await call(token, "PUT", `${base}/links/${firstId}/slug`, { slug: "menu-otono" });
  record("Otro cambio antes de 7 días se rechaza", tooSoon.status === 429 && tooSoon.body?.code === "SLUG_CHANGE_TOO_SOON", `${tooSoon.status} ${tooSoon.body?.code}`);
  const oldOne = await call(token, "PUT", `${base}/links/${secondId}/slug`, { slug: "carta" });
  record("La dirección anterior queda apartada para su link", oldOne.status === 409 && oldOne.body?.code === "SLUG_TAKEN", `${oldOne.status} ${oldOne.body?.code}`);

  const list = (await call(token, "GET", `${base}/touchpoints`)).body ?? [];
  record("La lista de touchpoints trae la dirección", list.find((item) => item.id === firstId)?.slug === "menu");

  const retired = await call(token, "POST", `${base}/touchpoints/${firstId}/retire`);
  const freed = await call(token, "GET", `${base}/links/slug-availability?slug=menu`);
  const freedOld = await call(token, "GET", `${base}/links/slug-availability?slug=carta`);
  if (resolver) {
    const gone = await viaResolver(`/${businessSlug}/menu`);
    record("Un link retirado ya no abre", gone.status === 404, `${gone.status}`);
  }
  record("Retirar un link libera sus direcciones", retired.status === 200 && freed.body?.available === true && freedOld.body?.available === true, `${retired.status} ${JSON.stringify(freed.body)} ${JSON.stringify(freedOld.body)}`);

  // Clean up: «Borrar mi cuenta» erases the organization.
  token = await signIn();
  const erased = await call(token, "DELETE", "/v1/me", { confirm: "BORRAR MI CUENTA" });
  deleted = erased.status === 200;
  record("Limpieza: la cuenta y su organización se borran", deleted, JSON.stringify(erased.body));
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
