// End-to-end check of the domain-audit fixes (2026-10-13, kardo-a9) against
// kardo-dev, through the Customer API:
//   A9-4  the page that loses a QR stops listing it (no «ghost» target), so
//         republishing it never takes the QR back;
//   A9-5  going back to a version takes the same replace guard as a publish;
//   A9-6  taking the only place where a page is live off it is refused;
//   A9-17 renaming a link never makes it the main one;
//   A9-19 a Link is never created through POST …/touchpoints;
//   A9-1  a deleted organization keeps its address (never recycled).
//
// A throwaway account e2e-audit-<stamp>@kardo.test is created by SQL and
// deleted at the end through «Borrar mi cuenta». Its password is random and
// never printed. No email is sent. Development only.
//
// Usage (API without watch, with this code):
//   cd services/customer-api && E2E_API_URL=http://localhost:3021 \
//     pnpm exec tsx ../../scripts/e2e/domain-audit.mjs
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

const api = (process.env.E2E_API_URL ?? "http://localhost:3021").replace(/\/$/, "");
const stamp = new Date().toISOString().slice(5, 19).replace(/[-T:]/g, "");
const email = `e2e-audit-${stamp}@kardo.test`;
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const { legalVersions } = await import(path.join(root, "packages/contracts/src/index.ts"));
const admin = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
let userId;
let workspaceId;
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
        ${tx.json({ display_name: "E2E Auditoría" })}, now(), now(),
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
  workspaceId = personal?.id;
  const onboarded = await call(token, "PATCH", `/v1/workspaces/${workspaceId}/onboarding`, {
    workspaceName: "Taller Auditoría E2E",
    accountType: "business",
  });
  record("Termina el alta (usa su prueba)", onboarded.status === 200, `${onboarded.status}`);
  const base = `/v1/workspaces/${workspaceId}`;
  const publish = (experienceId, body) =>
    call(token, "POST", `${base}/experiences/${experienceId}/publication-intents`, body, { "idempotency-key": randomUUID() });
  const targetsOf = async (experienceId) =>
    ((await call(token, "GET", `${base}/experiences/${experienceId}`)).body?.targets ?? [])
      .filter((item) => item.via === "touchpoint")
      .map((item) => item.touchpointId);
  async function liveOn(touchpointId, experienceId, seconds = 150) {
    const end = Date.now() + seconds * 1000;
    while (Date.now() < end) {
      const list = (await call(token, "GET", `${base}/touchpoints`)).body ?? [];
      if (list.find((item) => item.id === touchpointId)?.live?.experienceId === experienceId) return true;
      await sleep(3000);
    }
    return false;
  }

  // A9-19: a Link only comes from POST …/links.
  const genericLink = await call(token, "POST", `${base}/touchpoints`, { operationalName: "Instagram", kind: "link" });
  record("Un link no se crea por la ruta de QR y etiquetas (A9-19)", genericLink.status === 400, `${genericLink.status}`);

  const qr = await call(token, "POST", `${base}/touchpoints`, { operationalName: "Mostrador", kind: "qr" });
  record("Crea un QR", qr.status === 201, `${qr.status}`);
  const qrId = qr.body?.id;

  const page = (name, url) =>
    call(token, "POST", `${base}/experiences`, { type: "redirect", name, content: { destinationUrl: url } });
  const first = await page("Menú de siempre", "https://kardo.test/menu");
  const second = await page("Promo de otoño", "https://kardo.test/promo");
  const firstId = first.body?.id;
  const secondId = second.body?.id;
  record("Crea dos páginas", first.status === 201 && second.status === 201, `${first.status} ${second.status}`);

  await call(token, "PUT", `${base}/experiences/${firstId}/targets`, { touchpointIds: [qrId], groupIds: [] });
  const firstPublished = await publish(firstId);
  record("Publica la primera en el QR", firstPublished.status === 201, `${firstPublished.status} ${firstPublished.body?.code ?? ""}`);
  record("La primera se ve en el QR", await liveOn(qrId, firstId));
  const firstVersionId = firstPublished.body?.versionId;

  // A9-4: the second page takes the QR; the first one stops listing it.
  await call(token, "PUT", `${base}/experiences/${secondId}/targets`, { touchpointIds: [qrId], groupIds: [] });
  const takeover = await publish(secondId, { replaceTargets: [qrId] });
  record("La segunda reemplaza a la primera, confirmado", takeover.status === 201, `${takeover.status} ${takeover.body?.code ?? ""}`);
  const firstTargets = await targetsOf(firstId);
  record("La página que pierde el QR deja de listarlo, al instante (A9-4)", !firstTargets.includes(qrId), JSON.stringify(firstTargets));
  record("La segunda se ve en el QR", await liveOn(qrId, secondId));

  // A9-4: republishing the first page «in place» never takes the QR back.
  const inPlace = await publish(firstId, { replaceTargets: [] });
  record("Volver a publicar la primera no recupera el QR", inPlace.status === 400 || inPlace.status === 409, `${inPlace.status} ${inPlace.body?.code}`);

  // A9-5: a rollback takes the same guard.
  await call(token, "PUT", `${base}/experiences/${firstId}/targets`, { touchpointIds: [qrId], groupIds: [] });
  const rollback = await call(
    token,
    "POST",
    `${base}/experiences/${firstId}/versions/${firstVersionId}/publication-intents`,
    { replaceTargets: [] },
    { "idempotency-key": randomUUID() },
  );
  record("Regresar a una versión no le quita el QR a otra página (A9-5)", rollback.status === 409 && rollback.body?.code === "REPLACE_NOT_CONFIRMED", `${rollback.status} ${rollback.body?.code}`);
  const stillSecond = (await call(token, "GET", `${base}/touchpoints`)).body?.find((item) => item.id === qrId)?.live?.experienceId === secondId;
  record("El QR sigue mostrando la segunda", stillSecond);
  // The first page was only a plan there: drop it again for the next step.
  await call(token, "PUT", `${base}/experiences/${firstId}/targets`, { touchpointIds: [], groupIds: [] });

  // A9-6: the second page also goes on a second QR; taking it off the first
  // one (which has no group page to fall back to) is refused, instead of the
  // QR silently keeping a page that no longer lists it.
  const qrTwo = await call(token, "POST", `${base}/touchpoints`, { operationalName: "Caja", kind: "qr" });
  const qrTwoId = qrTwo.body?.id;
  await call(token, "PUT", `${base}/experiences/${secondId}/targets`, { touchpointIds: [qrId, qrTwoId], groupIds: [] });
  await publish(secondId, { replaceTargets: [qrTwoId] });
  record("La segunda también se ve en el otro QR", await liveOn(qrTwoId, secondId));
  const orphan = await call(token, "PUT", `${base}/experiences/${secondId}/targets`, { touchpointIds: [qrTwoId], groupIds: [] });
  record("Quitar un lugar donde solo se ve esta página se rechaza (A9-6)", orphan.status === 409 && orphan.body?.code === "TARGET_STILL_LIVE", `${orphan.status} ${orphan.body?.code} ${orphan.body?.message ?? ""}`);
  const stillListed = await targetsOf(secondId);
  record("La página sigue listando los dos QR", stillListed.includes(qrId) && stillListed.includes(qrTwoId), JSON.stringify(stillListed));

  // A9-13: deleting a group that a page is published on keeps the page
  // listing the QR codes where it is live.
  const groupMade = await call(token, "POST", `${base}/touchpoint-groups`, { name: "Terraza", touchpointIds: [] });
  const groupId = groupMade.body?.id;
  const inGroup = await call(token, "POST", `${base}/touchpoints`, { operationalName: "Mesa 1", kind: "qr", groupId });
  const groupPage = await page("Carta de la terraza", "https://kardo.test/terraza");
  await call(token, "PUT", `${base}/experiences/${groupPage.body?.id}/targets`, { touchpointIds: [], groupIds: [groupId] });
  await publish(groupPage.body?.id, { replaceTargets: [] });
  record("La página del grupo se ve en su mesa", await liveOn(inGroup.body?.id, groupPage.body?.id));
  const groupGone = await call(token, "DELETE", `${base}/touchpoint-groups/${groupId}`);
  const afterDelete = await targetsOf(groupPage.body?.id);
  record("Borrar el grupo deja la mesa en «Dónde se ve» de su página (A9-13)", [200, 204].includes(groupGone.status) && afterDelete.includes(inGroup.body?.id), `${groupGone.status} ${JSON.stringify(afterDelete)}`);

  // A9-17: renaming a link never makes it the main one.
  const businessSlug = `taller-auditoria-${stamp.slice(-6)}`;
  const business = await call(token, "PUT", `${base}/slug`, { slug: businessSlug });
  record("Guarda la dirección del negocio", business.status === 200, `${business.status}`);
  const linkOne = await call(token, "POST", `${base}/links`, { experienceId: secondId, slug: "uno" });
  const linkTwo = await call(token, "POST", `${base}/links`, { experienceId: secondId, slug: "dos" });
  record("Crea dos links", linkOne.status === 201 && linkTwo.status === 201, `${linkOne.status} ${linkTwo.status}`);
  const mainOf = async () =>
    ((await call(token, "GET", "/v1/workspaces")).body ?? []).find((item) => item.id === workspaceId)?.mainLinkId ?? null;
  record("El primero es el principal", (await mainOf()) === linkOne.body?.id);
  await call(token, "POST", `${base}/touchpoints/${linkOne.body?.id}/retire`);
  record("Retirar el principal deja el negocio sin principal", (await mainOf()) === null);
  const renamed = await call(token, "PUT", `${base}/links/${linkTwo.body?.id}/slug`, { slug: "tres" });
  record("Cambiar la dirección de otro link no lo vuelve principal (A9-17)", renamed.status === 200 && (await mainOf()) === null, `${renamed.status} ${await mainOf()}`);

  // A9-23/A9-24 and lead retention: the summary still answers with the new
  // SQL, lists every place with its kind and counts only physical objects
  // as «QR y etiquetas».
  const summary = await call(token, "GET", `${base}/analytics/summary?days=30&tz=America%2FMexico_City`);
  const kinds = new Set((summary.body?.touchpoints ?? []).map((item) => item.kind));
  const physical = ((await call(token, "GET", `${base}/touchpoints`)).body ?? []).filter(
    (item) => item.kind !== "link" && item.status !== "retired",
  ).length;
  record(
    "El resumen responde, trae el tipo de cada lugar y no cuenta los links como QR (A9-24)",
    summary.status === 200 && kinds.has("link") && kinds.has("qr") && summary.body?.kpis?.touchpoints?.total === physical,
    `${summary.status} ${[...kinds].join(",")} total=${summary.body?.kpis?.touchpoints?.total} físicos=${physical}`,
  );
  record(
    "Los grupos vienen aunque tengan cero (A9-26)",
    Array.isArray(summary.body?.groups),
    JSON.stringify(summary.body?.groups?.slice(0, 2)),
  );

  // A9-1: the business address is never recycled.
  token = await signIn();
  const erased = await call(token, "DELETE", "/v1/me", { confirm: "BORRAR MI CUENTA" });
  deleted = erased.status === 200;
  record("Limpieza: la cuenta y su organización se borran", deleted, JSON.stringify(erased.body));
  const [kept] = await admin`
    select w.slug, kardo_core.workspace_slug_available(${businessSlug}, gen_random_uuid()) as available
    from kardo_core.workspaces w where w.id = ${workspaceId}::uuid
  `;
  record("La dirección del negocio borrado queda apartada para siempre (A9-1)", kept?.slug === businessSlug && kept?.available === false, JSON.stringify(kept));
} finally {
  if (userId && !deleted) {
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
