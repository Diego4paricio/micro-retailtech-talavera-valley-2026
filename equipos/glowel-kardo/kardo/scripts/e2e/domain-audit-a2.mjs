// End-to-end check of the domain audit fixes of kardo-a2 (2026-10-13)
// against kardo-dev: the business profile saved by field, the draft's
// revision, the profile logo that cannot be deleted, invitations (preview,
// already a member) and the request recipients that follow the team, the
// webhook errors in Spanish, the one AI counter, the CSV in Spanish and the
// organization's data export.
// Usage: E2E_API_URL=http://localhost:3041 node scripts/e2e/domain-audit-a2.mjs
// (after prepare-dev-accounts.mjs). Uses the «E2E Kardo» organization and
// leaves it as it found it. Never prints tokens, passwords or database URLs.
import { randomUUID } from "node:crypto";
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
const supabaseUrl = env.VITE_SUPABASE_URL;
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
// Only the A2-30 step writes directly (two versions of its own page).
const adminSql = () =>
  createRequire(path.join(root, "services/customer-api/package.json"))("postgres")(
    env.SUPABASE_ADMIN_DATABASE_URL,
    { max: 1, prepare: false, onnotice: () => {} },
  );
const api = (process.env.E2E_API_URL ?? "http://localhost:3041").replace(/\/$/, "");
const run = randomUUID().slice(0, 8);
const results = [];
const started = Date.now();

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}
function pending(name, reason) {
  results.push({ name, ok: true, pending: true, detail: reason });
  console.log(`⏸️  ${name} — ${reason}`);
}
async function step(name, fn) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === "string" ? detail : "");
    return true;
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
    return false;
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function signIn(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`sign-in → HTTP ${response.status}`);
  return { token: body.access_token, subject: body.user.id, email };
}

async function call(session, method, route, body, headers = {}) {
  const response = await fetch(`${api}${route}`, {
    method,
    headers: {
      ...(session ? { authorization: `Bearer ${session.token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status, json, text };
}
const code = (response) => `HTTP ${response.status} ${response.json?.code ?? ""}`.trim();

function tinyPng() {
  // 8×8 teal PNG (valid IHDR/IDAT/IEND with real CRCs).
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPgyqnAihiGlgQAJKE7geROx/IAAAAASUVORK5CYII=",
    "base64",
  );
}

console.log(`Kardo E2E · auditoría de dominios (a2) · run ${run}\nAPI ${api}\n`);

const owner = await signIn(env.E2E_OWNER_EMAIL, env.E2E_OWNER_PASSWORD);
const member = await signIn(env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD);
record("Inicio de sesión real en Supabase (owner y member)", true);

const list = await call(owner, "GET", "/v1/workspaces");
const org = list.json?.find?.((workspace) => workspace.kind === "organization" && workspace.name === "E2E Kardo");
if (!org) {
  record("Organización «E2E Kardo»", false, "no existe: corre antes vertical-slice.mjs");
  process.exit(1);
}
const w = org.id;
const memberIn = async () =>
  (await call(owner, "GET", `/v1/workspaces/${w}/members`)).json?.some?.((item) => item.profileId === member.subject);
if (await memberIn()) await call(owner, "DELETE", `/v1/workspaces/${w}/members/${member.subject}`);

// --- A2-1: the business profile, by field ----------------------------------
await step("Perfil del negocio: el PATCH solo cambia lo que se manda (A2-1)", async () => {
  const before = (await call(owner, "GET", `/v1/workspaces/${w}/profile`)).json ?? {};
  const hours = `Lun a vie, 9 a 18 (${run})`;
  const about = `Prueba de la auditoría ${run}.`;
  const first = await call(owner, "PATCH", `/v1/workspaces/${w}/profile`, { hours });
  expect(first.status === 200, `PATCH horario ${code(first)}`);
  const second = await call(owner, "PATCH", `/v1/workspaces/${w}/profile`, { about });
  expect(second.status === 200 && second.json.hours === hours && second.json.about === about, "el segundo PATCH borró el horario");
  for (const [key, value] of Object.entries(before)) {
    if (key === "hours" || key === "about") continue;
    expect(JSON.stringify(second.json[key]) === JSON.stringify(value), `cambió ${key} sin mandarlo`);
  }
  const removed = await call(owner, "PATCH", `/v1/workspaces/${w}/profile`, { about: null });
  expect(removed.status === 200 && !("about" in removed.json) && removed.json.hours === hours, "null no quitó el campo");
  const restored = await call(owner, "PATCH", `/v1/workspaces/${w}/profile`, {
    hours: before.hours ?? null,
    about: before.about ?? null,
  });
  expect(restored.status === 200, `restaurar ${code(restored)}`);
});

// --- A2-45: the profile's logo cannot be deleted -----------------------------
let uploadedLogo = null;
const uploadOk = await (async () => {
  const bytes = tinyPng();
  const authorization = await call(owner, "POST", `/v1/workspaces/${w}/assets/upload-authorizations`, {
    filename: `logo-audit-${run}.png`,
    mediaType: "image/png",
    byteSize: bytes.byteLength,
  });
  if (authorization.status !== 201) return false;
  const stored = await fetch(authorization.json.uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: bytes });
  if (!stored.ok) return false;
  const finalized = await call(owner, "POST", `/v1/workspaces/${w}/assets/${authorization.json.assetId}/finalizations`);
  if (finalized.json?.status !== "validated") return false;
  uploadedLogo = authorization.json.assetId;
  return true;
})();
if (!uploadOk) pending("Borrar el logo del negocio se rechaza (A2-45)", "no se pudo subir una imagen (Worker de Assets o plan)");
else await step("Borrar el logo del negocio se rechaza (A2-45)", async () => {
  const before = (await call(owner, "GET", `/v1/workspaces/${w}/profile`)).json ?? {};
  const set = await call(owner, "PATCH", `/v1/workspaces/${w}/profile`, { logoAssetId: uploadedLogo });
  expect(set.status === 200 && set.json.logoAssetId === uploadedLogo, `poner logo ${code(set)}`);
  const usage = await call(owner, "GET", `/v1/workspaces/${w}/assets/${uploadedLogo}/usage`);
  expect(usage.status === 200 && usage.json.profile?.includes("logo"), "«Dónde se usa» no dice el logo");
  const refused = await call(owner, "DELETE", `/v1/workspaces/${w}/assets/${uploadedLogo}`);
  expect(refused.status === 409 && refused.json.code === "ASSET_IN_USE" && /logo/.test(refused.json.message), `borrar el logo ${code(refused)}`);
  const back = await call(owner, "PATCH", `/v1/workspaces/${w}/profile`, { logoAssetId: before.logoAssetId ?? null });
  expect(back.status === 200, `quitar logo ${code(back)}`);
  const removed = await call(owner, "DELETE", `/v1/workspaces/${w}/assets/${uploadedLogo}`);
  expect(removed.status === 204, `borrar ya libre ${code(removed)}`);
});

// --- A2-22, A2-24, A2-30: the draft's revision, versions, light polling -----
await step("Borrador con versión: quien guarda con una revisión vieja recibe 409 (A2-22)", async () => {
  const created = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    targets: { touchpointIds: [], groupIds: [] },
    name: `Auditoría ${run}`,
    type: "redirect",
    content: { destinationUrl: "https://example.com/kardo-audit" },
  });
  expect(created.status === 201 && created.json.draftRevision === 1, `crear ${code(created)} rev ${created.json?.draftRevision}`);
  const id = created.json.id;
  try {
    const saved = await call(owner, "PATCH", `/v1/workspaces/${w}/experiences/${id}`, {
      name: `Auditoría ${run}`,
      content: { destinationUrl: "https://example.com/kardo-audit-2" },
      expectedDraftRevision: 1,
    });
    expect(saved.status === 200 && saved.json.draftRevision === 2, `guardar ${code(saved)}`);
    const stale = await call(owner, "PATCH", `/v1/workspaces/${w}/experiences/${id}`, {
      name: `Pisado ${run}`,
      content: { destinationUrl: "https://example.com/pisado" },
      expectedDraftRevision: 1,
    });
    expect(stale.status === 409 && stale.json.code === "EXPERIENCE_CHANGED", `revisión vieja ${code(stale)}`);
    const renamed = await call(owner, "PATCH", `/v1/workspaces/${w}/experiences/${id}`, {
      name: `Renombrada ${run}`,
      expectedDraftRevision: 2,
    });
    expect(
      renamed.status === 200 &&
        renamed.json.name === `Renombrada ${run}` &&
        renamed.json.content.destinationUrl === "https://example.com/kardo-audit-2",
      `renombrar sin contenido ${code(renamed)}`,
    );
    const detail = await call(owner, "GET", `/v1/workspaces/${w}/experiences/${id}`);
    expect(detail.status === 200 && detail.json.versionCount === 0, `detalle versionCount ${detail.json?.versionCount}`);
    const states = await call(owner, "GET", `/v1/workspaces/${w}/experiences/publication-states`);
    const state = states.json?.find?.((item) => item.id === id);
    expect(states.status === 200 && state && !("content" in state) && state.draftRevision === 3, `estados ${code(states)}`);
  } finally {
    await call(owner, "POST", `/v1/workspaces/${w}/experiences/${id}/archive`);
  }
});

// --- A2-30: the detail lists old versions without their content ------------
await step("Historial: las versiones viejas llegan sin contenido y se piden una por una (A2-30)", async () => {
  const created = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    name: `Versiones ${run}`,
    type: "redirect",
    content: { destinationUrl: "https://example.com/version-1" },
  });
  expect(created.status === 201, `crear ${code(created)}`);
  const id = created.json.id;
  try {
    // Two versions as publishing leaves them (publishing needs a QR, which
    // this organization does not lend to the check); none is live.
    const admin = adminSql();
    try {
      await admin`
        insert into kardo_core.experience_versions (experience_id, revision, content, created_by)
        values
          (${id}::uuid, 1, ${admin.json({ destinationUrl: "https://example.com/version-1" })}, ${owner.subject}::uuid),
          (${id}::uuid, 2, ${admin.json({ destinationUrl: "https://example.com/version-2" })}, ${owner.subject}::uuid)
      `;
    } finally {
      await admin.end({ timeout: 5 });
    }
    const detail = await call(owner, "GET", `/v1/workspaces/${w}/experiences/${id}`);
    const [newest, older] = detail.json?.versions ?? [];
    expect(
      detail.status === 200 &&
        newest?.revision === 2 &&
        newest.content?.destinationUrl === "https://example.com/version-2" &&
        older?.revision === 1 &&
        !("content" in older),
      `detalle ${code(detail)} ${JSON.stringify(detail.json?.versions?.map((v) => [v.revision, "content" in v]))}`,
    );
    const one = await call(owner, "GET", `/v1/workspaces/${w}/experiences/${id}/versions/${older.id}`);
    expect(
      one.status === 200 && one.json.revision === 1 && one.json.content?.destinationUrl === "https://example.com/version-1",
      `una versión ${code(one)}`,
    );
    const foreign = await call(member, "GET", `/v1/workspaces/${w}/experiences/${id}/versions/${older.id}`);
    expect([403, 404].includes(foreign.status), `otra persona ${code(foreign)}`);
  } finally {
    await call(owner, "POST", `/v1/workspaces/${w}/experiences/${id}/archive`);
  }
});

// --- A2-11, A2-17, A2-49: invitations and the team's request emails --------
await step("Invitación: vista previa, ya es parte del equipo y correos de solicitudes (A2-11, A2-17, A2-49)", async () => {
  const stranger = `e2e-audit-${run}@kardo.test`;
  const invited = await call(owner, "POST", `/v1/workspaces/${w}/invitations`, { email: stranger, role: "viewer" });
  expect(invited.status === 201 && typeof invited.json.inviteUrl === "string" && invited.json.inviteUrl.includes("/invite#token="), `invitar ${code(invited)}`);
  const preview = await call(member, "POST", "/v1/invitations/preview", { token: invited.json.token });
  expect(
    preview.status === 200 &&
      preview.json.state === "wrong_email" &&
      preview.json.workspaceName === "E2E Kardo" &&
      preview.json.role === "viewer" &&
      preview.json.emailHint.includes("•••") &&
      !preview.json.emailHint.includes(stranger.split("@")[0]),
    `vista previa ${code(preview)} ${preview.json?.state ?? ""}`,
  );
  const revoked = await call(owner, "DELETE", `/v1/workspaces/${w}/invitations/${invited.json.invitation.id}`);
  expect(revoked.status === 204, `revocar ${code(revoked)}`);
  const afterRevoke = await call(member, "POST", "/v1/invitations/preview", { token: invited.json.token });
  expect(afterRevoke.json?.state === "revoked", `vista previa revocada ${afterRevoke.json?.state}`);

  const join = await call(owner, "POST", `/v1/workspaces/${w}/invitations`, { email: member.email, role: "viewer" });
  expect(join.status === 201, `invitar al member ${code(join)}`);
  const own = await call(member, "POST", "/v1/invitations/preview", { token: join.json.token });
  expect(own.json?.state === "valid", `su propia invitación ${own.json?.state}`);
  const accepted = await call(member, "POST", "/v1/invitations/accept", { token: join.json.token });
  expect([200, 201].includes(accepted.status), `aceptar ${code(accepted)}`);
  const again = await call(owner, "POST", `/v1/workspaces/${w}/invitations`, { email: member.email, role: "viewer" });
  expect(again.status === 409 && again.json.code === "ALREADY_MEMBER", `invitar a quien ya está ${code(again)}`);

  const before = (await call(owner, "GET", `/v1/workspaces/${w}/lead-delivery`)).json;
  const saved = await call(owner, "PUT", `/v1/workspaces/${w}/lead-delivery`, {
    notifyEmail: true,
    notifyRecipients: [member.email],
    webhookUrl: before?.webhookUrl ?? null,
  });
  expect(saved.status === 200 && saved.json.settings.notifyRecipients.includes(member.email.toLowerCase()), `avisar al member ${code(saved)}`);
  const left = await call(owner, "DELETE", `/v1/workspaces/${w}/members/${member.subject}`);
  expect(left.status === 204, `quitar al member ${code(left)}`);
  const after = (await call(owner, "GET", `/v1/workspaces/${w}/lead-delivery`)).json;
  expect(!after.notifyRecipients.includes(member.email.toLowerCase()), "sigue avisando a quien ya salió del equipo");
  await call(owner, "PUT", `/v1/workspaces/${w}/lead-delivery`, {
    notifyEmail: before?.notifyEmail ?? false,
    notifyRecipients: (before?.notifyRecipients ?? []).filter((email) => email !== member.email.toLowerCase()),
    webhookUrl: before?.webhookUrl ?? null,
  });
});

// --- A2-50, A2-51: webhook ---------------------------------------------------
await step("Webhook: URL rechazada en español y rotar sin URL (A2-50, A2-51)", async () => {
  const before = (await call(owner, "GET", `/v1/workspaces/${w}/lead-delivery`)).json;
  const local = await call(owner, "PUT", `/v1/workspaces/${w}/lead-delivery`, {
    notifyEmail: before?.notifyEmail ?? false,
    notifyRecipients: before?.notifyRecipients ?? [],
    webhookUrl: "https://localhost/kardo",
  });
  expect(local.status === 400 && local.json.code === "INVALID_WEBHOOK_URL" && /servidor público/.test(local.json.message), `localhost ${code(local)}`);
  if (!before?.webhookUrl) {
    const rotate = await call(owner, "POST", `/v1/workspaces/${w}/lead-delivery/webhook-secret`, {});
    expect(rotate.status === 503 && /Primero guarda la URL/.test(rotate.json?.message ?? ""), `rotar sin URL ${code(rotate)}`);
  }
});

// --- A2-37: one AI counter -----------------------------------------------------
await step("IA: un solo contador con la hora de la persona (A2-37)", async () => {
  const usage = await call(owner, "GET", `/v1/workspaces/${w}/design/ai-usage`);
  expect(usage.status === 200, `ai-usage ${code(usage)}`);
  expect(usage.json.hour?.limit === 5 && typeof usage.json.running === "boolean", "sin la hora ni «running»");
  expect(typeof usage.json.htmlEnabled === "boolean", "sin htmlEnabled");
});

// --- A2-53: CSV in Spanish with the state --------------------------------------
await step("CSV de solicitudes en español, con estado y filtro (A2-53)", async () => {
  const csv = await call(owner, "GET", `/v1/workspaces/${w}/leads/export?status=new`);
  if (csv.status === 403 && csv.json?.code === "PLAN_LIMIT") return "el plan no incluye exportar (sin probar el archivo)";
  expect(csv.status === 200, `exportar ${code(csv)}`);
  const header = csv.text.replace(/^﻿/, "").split("\r\n")[0];
  expect(header === "Fecha,\"QR, etiqueta o link\",Nombre,Correo,Teléfono,Mensaje,Estado", `encabezados: ${header}`);
  const rows = csv.text.split("\r\n").slice(1).filter(Boolean);
  expect(rows.every((row) => row.endsWith(",Por atender")), "el filtro de estado no se aplicó");
});

// --- A2-59, A2-62: billing reads with the shared rules ---------------------------
await step("Cobro: cuenta, plan y elección de lo que sigue (A2-59, A2-62)", async () => {
  const account = await call(owner, "GET", "/v1/billing/account");
  expect(account.status === 200 && typeof account.json.organizationsUsed === "number", `cuenta ${code(account)}`);
  const billing = await call(owner, "GET", `/v1/workspaces/${w}/billing`);
  expect(billing.status === 200, `plan ${code(billing)}`);
  const selection = await call(owner, "GET", `/v1/workspaces/${w}/plan-selection`);
  expect(selection.status === 200 && Array.isArray(selection.json.suggestedKeep), `elegir qué sigue ${code(selection)}`);
});

// --- A2-64: the organization's data --------------------------------------------
await step("Descargar los datos de la organización (A2-64)", async () => {
  const exported = await call(owner, "GET", `/v1/workspaces/${w}/export`);
  expect(exported.status === 200 && exported.json?.format === "kardo.workspace-export", `exportar ${code(exported)}`);
});

const failed = results.filter((result) => !result.ok);
const pendings = results.filter((result) => result.pending);
console.log(
  `\n${results.length - failed.length - pendings.length}/${results.length} OK${pendings.length ? ` · ${pendings.length} pendientes` : ""} en ${Math.round((Date.now() - started) / 1000)} s`,
);
process.exit(failed.length ? 1 : 0);
