// End-to-end check of the touchpoint's object (relevo 36, 2026-10-07)
// against kardo-dev, through the Customer API: every step of «Conecta el
// objeto» is saved (a reload — the list read again — finds it), undo, the
// card replacement with cancel, the rules per format, a new format starting
// over, «Pruébalo» marked by the first real NFC visit, and «Crear
// organización»: account type, its logo, its address and hours. Since ADR
// 024 the person's trial covers the new organization, so it works in full.
//
// A throwaway account e2e-object-<stamp>@kardo.test is created by SQL and
// deleted at the end through «Borrar mi cuenta». Its password is random and
// never printed. No email is sent. Development only.
//
// Usage (API without watch on 3011; tsx because it reads `legalVersions`):
//   cd services/customer-api && E2E_API_URL=http://localhost:3011 \
//     pnpm exec tsx ../../scripts/e2e/touchpoint-object.mjs
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
const email = `e2e-object-${stamp}@kardo.test`;
const password = `E2e-${randomBytes(18).toString("base64url")}!9`;
const results = [];

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
        ${tx.json({ display_name: "E2E Objeto" })}, now(), now(),
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
    workspaceName: "Estética Brillo E2E",
    accountType: "business",
  });
  record("Termina el alta (usa su prueba)", onboarded.status === 200, `${onboarded.status}`);
  const base = `/v1/workspaces/${workspaceId}`;
  const object = (touchpoint) => touchpoint?.object ?? {};
  const listed = async (id) =>
    ((await call(token, "GET", `${base}/touchpoints`)).body ?? []).find((item) => item.id === id);
  const step = (id, body) => call(token, "POST", `${base}/touchpoints/${id}/object`, body);

  // --- An NFC, step by step, with "reloads" (the list read again) ---
  const nfc = await call(token, "POST", `${base}/touchpoints`, { operationalName: "Tarjeta en recepción", kind: "nfc" });
  const nfcId = nfc.body?.id;
  record("Un NFC nuevo empieza «Sin grabar»", nfc.status === 201 && object(nfc.body).state === "pending", `${nfc.status} ${object(nfc.body).state}`);

  const written = await step(nfcId, { action: "done", step: "prepared" });
  record("«Ya lo grabé» lo deja «Grabado»", written.status === 200 && object(written.body).state === "ready" && Boolean(object(written.body).preparedAt), `${written.status} ${object(written.body).state}`);
  const reloaded = await listed(nfcId);
  record("Al recargar, el paso sigue guardado", object(reloaded).preparedAt === object(written.body).preparedAt && !object(reloaded).testedAt);

  const again = await step(nfcId, { action: "done", step: "prepared" });
  record("Marcar otra vez no cambia la hora del paso", object(again.body).preparedAt === object(written.body).preparedAt);

  const tested = await step(nfcId, { action: "done", step: "tested" });
  const backup = await step(nfcId, { action: "done", step: "backup" });
  const placed = await step(nfcId, { action: "done", step: "placed" });
  record("Probado, QR de respaldo y colocado: «Colocado»", tested.status === 200 && backup.status === 200 && object(placed.body).state === "placed", `${object(placed.body).state}`);

  const undone = await step(nfcId, { action: "undo", step: "placed" });
  record("«Deshacer» regresa a «Grabado»", object(undone.body).state === "ready" && object(undone.body).placedAt === null && Boolean(object(undone.body).backupAt));
  await step(nfcId, { action: "done", step: "placed" });

  const notReplacing = await step(nfcId, { action: "done", step: "replace_ready" });
  record("Los pasos de reemplazo piden un reemplazo en curso", notReplacing.status === 409 && notReplacing.body?.code === "OBJECT_NOT_REPLACING", `${notReplacing.status} ${notReplacing.body?.code}`);
  const noStep = await step(nfcId, { action: "done" });
  record("Marcar sin decir qué paso se rechaza", noStep.status === 400 && noStep.body?.code === "INVALID_OBJECT_STEP", `${noStep.status} ${noStep.body?.code}`);

  // --- Replace the card: halfway, reload, cancel, then finish ---
  const before = await listed(nfcId);
  const started = await step(nfcId, { action: "start_replace" });
  record("«Reemplazar la tarjeta» empieza el reemplazo", object(started.body).state === "replacing" && Boolean(object(started.body).replacingAt), `${object(started.body).state}`);
  await step(nfcId, { action: "done", step: "replace_ready" });
  const midway = await listed(nfcId);
  record("A medio reemplazo, al recargar sigue en el mismo paso", object(midway).state === "replacing" && Boolean(object(midway).replaceReadyAt) && !object(midway).replacePreparedAt);
  const cancelled = await step(nfcId, { action: "cancel_replace" });
  record("Cancelar deja la tarjeta anterior como estaba", object(cancelled.body).state === "placed" && object(cancelled.body).preparedAt === object(before).preparedAt && object(cancelled.body).replaceReadyAt === null);
  await step(nfcId, { action: "start_replace" });
  await step(nfcId, { action: "done", step: "replace_ready" });
  const newWritten = await step(nfcId, { action: "done", step: "replace_prepared" });
  await step(nfcId, { action: "done", step: "replace_tested" });
  const finished = await step(nfcId, { action: "done", step: "placed" });
  record("Al colocar la tarjeta nueva, el reemplazo termina con sus horas", object(finished.body).state === "placed" && object(finished.body).replacingAt === null && object(finished.body).preparedAt === object(newWritten.body).replacePreparedAt, `${object(finished.body).state}`);

  // --- A QR: no backup, no card to replace; another format starts over ---
  const qr = await call(token, "POST", `${base}/touchpoints`, { operationalName: "Mostrador", kind: "qr" });
  const qrId = qr.body?.id;
  const qrBackup = await step(qrId, { action: "done", step: "backup" });
  record("Un QR no lleva QR de respaldo", qrBackup.status === 400 && qrBackup.body?.code === "INVALID_OBJECT_STEP", `${qrBackup.status}`);
  const qrReplace = await step(qrId, { action: "start_replace" });
  record("Un QR no tiene tarjeta que reemplazar", qrReplace.status === 400, `${qrReplace.status}`);
  const switched = await call(token, "PATCH", `${base}/touchpoints/${nfcId}`, { operationalName: "Tarjeta en recepción", kind: "qr" });
  record("Cambiar de NFC a QR reinicia los pasos del objeto", switched.status === 200 && object(switched.body).state === "pending" && object(switched.body).placedAt === null, `${switched.status} ${object(switched.body).state}`);

  // --- «Pruébalo»: the first visit through the channel marks it alone ---
  const experience = await call(token, "POST", `${base}/experiences`, {
    type: "redirect",
    name: "Bienvenida",
    content: { destinationUrl: "https://kardo.test/bienvenida" },
  });
  const tap = await call(token, "POST", `${base}/touchpoints`, { operationalName: "Mesa 4", kind: "nfc" });
  const tapId = tap.body?.id;
  const tapPublic = tap.body?.publicId;
  const quiet = await call(token, "POST", `${base}/touchpoints/${tapId}/object/probe`, {});
  record("Sin nada publicado, «Pruébalo» no busca visitas", quiet.status === 200 && quiet.body?.detected === false, JSON.stringify({ detected: quiet.body?.detected, source: quiet.body?.source }));
  await call(token, "PUT", `${base}/experiences/${experience.body?.id}/targets`, { touchpointIds: [tapId], groupIds: [] });
  const published = await call(token, "POST", `${base}/experiences/${experience.body?.id}/publication-intents`, undefined, { "idempotency-key": randomUUID() });
  record("Publica una página en el NFC", [200, 201, 202].includes(published.status), `${published.status} ${published.body?.code ?? ""}`);
  await step(tapId, { action: "done", step: "prepared" });
  // The panel opens «Pruébalo» now: only later visits count.
  const opened = new Date().toISOString();
  const resolverUrl = (env.TAP_RESOLVER_URL ?? "").replace(/\/$/, "");
  let live = false;
  for (let i = 0; i < 30 && !live; i++) {
    const response = await fetch(`${resolverUrl}/t/${tapPublic}?src=nfc`, {
      redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1" },
    });
    await response.body?.cancel();
    live = response.status === 302;
    if (!live) await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  record("El NFC abre en el Resolver (una visita por NFC)", live);
  let detected = null;
  for (let i = 0; i < 40 && !detected?.detected; i++) {
    await new Promise((resolve) => setTimeout(resolve, 6000));
    detected = (await call(token, "POST", `${base}/touchpoints/${tapId}/object/probe`, { since: opened })).body;
    if (detected?.source === "unavailable") break;
  }
  record("«Pruébalo» se marca solo con la primera visita", detected?.detected === true && Boolean(object(detected?.touchpoint).testedAt), JSON.stringify({ detected: detected?.detected, source: detected?.source, testedAt: object(detected?.touchpoint).testedAt }));
  // Undo «Probar» and open it again: the visit above is old and must not count.
  await step(tapId, { action: "undo", step: "tested" });
  await new Promise((resolve) => setTimeout(resolve, 65_000)); // past the server's minute of slack
  const reopened = await call(token, "POST", `${base}/touchpoints/${tapId}/object/probe`, { since: new Date(Date.now() + 90_000).toISOString() });
  record("Al deshacer «Probar», una visita vieja ya no lo marca", reopened.body?.detected === false && !object(reopened.body?.touchpoint).testedAt, JSON.stringify({ detected: reopened.body?.detected }));

  // --- «Crear organización»: a business, its address and its logo ---
  const created = await call(token, "POST", "/v1/organizations", { name: "Brillo Angelópolis E2E" });
  const orgId = created.body?.id;
  record("Crea otra organización", created.status === 201, `${created.status} ${created.body?.code ?? ""}`);
  const [row] = await admin`select account_type from kardo_core.workspaces where id = ${orgId}::uuid`;
  record("Queda como «Negocio» (E11)", row?.account_type === "business", row?.account_type);
  const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  async function upload(name) {
    const auth = await call(token, "POST", `/v1/workspaces/${orgId}/assets/upload-authorizations`, { filename: name, mediaType: "image/png", byteSize: pixel.length });
    if (auth.status !== 200 && auth.status !== 201) return { status: auth.status, code: auth.body?.code };
    const put = await fetch(auth.body.uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: pixel });
    const done = await call(token, "POST", `/v1/workspaces/${orgId}/assets/${auth.body.assetId}/finalizations`);
    return { status: done.status, put: put.status, id: done.body?.id, state: done.body?.status, code: done.body?.code };
  }
  const logo = await upload("logo.png");
  record("Sube su logo", logo.status === 200 && Boolean(logo.id), JSON.stringify(logo));
  // ADR 024: the person's trial covers it (it used to be limited, with the
  // logo as the only exception).
  const second = await upload("otra.png");
  record("La prueba de la persona la cubre: sube otra imagen", second.status === 200 && Boolean(second.id), JSON.stringify(second));
  const profile = await call(token, "PUT", `/v1/workspaces/${orgId}/profile`, {
    industry: "belleza",
    city: "Puebla",
    address: "Blvd. del Niño Poblano 2510, Reserva Territorial Atlixcáyotl",
    hours: "Martes a sábado, de 10:00 a 19:00",
    phone: "222 123 4567",
    country: "MX",
    timezone: "America/Mexico_City",
    brand: { primary: "#8e3b4e", accent: "#f1dfe4" },
    ...(logo.id ? { logoAssetId: logo.id } : {}),
  });
  record("Guarda su perfil con dirección, horario y logo", profile.status === 200 && profile.body?.address?.startsWith("Blvd.") && profile.body?.logoAssetId === logo.id, `${profile.status} ${profile.body?.code ?? ""}`);
  const covered = await call(token, "POST", `/v1/workspaces/${orgId}/touchpoints`, { operationalName: "Mostrador", kind: "qr" });
  record("La prueba de la persona la cubre: crea un QR", covered.status === 201, `${covered.status} ${covered.body?.code ?? ""}`);

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
