// End-to-end acceptance of Kardo Operations (internal staff panel) against
// kardo-dev: real Supabase sign-in + TOTP (AAL2) → Staff API (local) → RLS
// with the least-privileged staff login → Resolver (suspension).
// Usage: node scripts/e2e/operations.mjs   (after prepare-staff.mjs and a run
// of vertical-slice.mjs, which creates the "E2E Kardo" organization).
// Never prints tokens, passwords, TOTP secrets or database URLs.
import { createHmac, randomUUID } from "node:crypto";
import fs from "node:fs";
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
const staffApi = (process.env.E2E_STAFF_API_URL ?? env.VITE_STAFF_API_URL ?? "http://localhost:3002").replace(/\/$/, "");
const resolver = (env.TAP_RESOLVER_URL ?? env.VITE_TAP_RESOLVER_URL).replace(/\/$/, "");
const run = randomUUID().slice(0, 8);
const results = [];
const started = Date.now();

function record(name, ok, detail = "", pendingStep = false) {
  results.push({ name, ok, detail, pending: pendingStep });
  console.log(`${pendingStep ? "⏸️ " : ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}
async function step(name, fn) {
  try {
    const detail = await fn();
    record(name, true, typeof detail === "string" ? detail : "");
  } catch (error) {
    record(name, false, error instanceof Error ? error.message : String(error));
  }
}
function expect(condition, message) {
  if (!condition) throw new Error(message);
}
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function totp(base32Secret, time = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const char of base32Secret.replace(/=+$/, "").toUpperCase()) {
    bits += alphabet.indexOf(char).toString(2).padStart(5, "0");
  }
  const key = Buffer.from(bits.match(/.{8}/g).map((byte) => Number.parseInt(byte, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(time / 1000 / 30)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).toString().padStart(6, "0");
}

async function auth(route, body, token) {
  const response = await fetch(`${supabaseUrl}/auth/v1${route}`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`auth ${route.split("?")[0]} HTTP ${response.status}`);
  return json;
}

async function call(token, method, route, body, headers = {}) {
  const response = await fetch(`${staffApi}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
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
  return { status: response.status, json, headers: response.headers };
}

console.log(`Kardo Operations E2E · run ${run}\nStaff API ${staffApi}\n`);

// --- Identity ------------------------------------------------------------------
const aal1 = await auth("/token?grant_type=password", {
  email: env.E2E_STAFF_EMAIL,
  password: env.E2E_STAFF_PASSWORD,
});
const factor = aal1.user.factors?.find((item) => item.factor_type === "totp" && item.status === "verified");
let staffToken;
await step("Staff sin segundo factor (AAL1) → STAFF_MFA_REQUIRED", async () => {
  const response = await call(aal1.access_token, "GET", "/v1/staff/session");
  expect(response.status === 403 && response.json?.code === "STAFF_MFA_REQUIRED", `HTTP ${response.status} ${response.json?.code ?? ""}`);
});
await step("TOTP real eleva la sesión a AAL2", async () => {
  expect(factor, "sin factor TOTP verificado");
  const challenge = await auth(`/factors/${factor.id}/challenge`, {}, aal1.access_token);
  const verified = await auth(
    `/factors/${factor.id}/verify`,
    { challenge_id: challenge.id, code: totp(env.E2E_STAFF_TOTP_SECRET) },
    aal1.access_token,
  );
  staffToken = verified.access_token;
  const payload = JSON.parse(Buffer.from(staffToken.split(".")[1], "base64url").toString("utf8"));
  expect(payload.aal === "aal2", `aal ${payload.aal}`);
});
await step("Cliente (no staff) no entra, ni con encabezados de Access falsificados", async () => {
  const customer = await auth("/token?grant_type=password", {
    email: env.E2E_OWNER_EMAIL,
    password: env.E2E_OWNER_PASSWORD,
  });
  const response = await call(customer.access_token, "GET", "/v1/staff/metrics/overview", undefined, {
    "cf-access-authenticated-user-email": env.E2E_STAFF_EMAIL,
  });
  expect(response.status === 403, `HTTP ${response.status}`);
  expect(["STAFF_MFA_REQUIRED", "STAFF_ACCESS_DENIED"].includes(response.json?.code), `código ${response.json?.code}`);
  const anonymous = await call(null, "GET", "/v1/staff/session");
  expect(anonymous.status === 401, `sin token HTTP ${anonymous.status}`);
});
await step("Sesión de staff con permisos y cabeceras seguras", async () => {
  const response = await call(staffToken, "GET", "/v1/staff/session");
  expect(response.status === 200, `HTTP ${response.status} ${response.json?.code ?? ""}`);
  for (const permission of ["customers.read", "operations.metrics.read", "touchpoints.suspend.write", "audit.read"]) {
    expect(response.json.permissions.includes(permission), `falta ${permission}`);
  }
  expect(response.headers.get("cache-control")?.includes("no-store"), "sin no-store");
});

// --- Business dashboard ----------------------------------------------------------
await step("Resumen del negocio con series diarias y tráfico público", async () => {
  const response = await call(staffToken, "GET", "/v1/staff/metrics/overview?days=7");
  expect(response.status === 200, `HTTP ${response.status} ${response.json?.code ?? ""}`);
  const metrics = response.json;
  expect(metrics.daily.length === 7, `${metrics.daily.length} días`);
  expect(metrics.totals.workspaces >= 1 && metrics.totals.touchpoints >= 1, "totales vacíos");
  expect(metrics.totals.customers >= 2, `clientes ${metrics.totals.customers}`);
  expect(metrics.taps === null || metrics.taps.total >= 0, "taps inválidos");
  return `clientes ${metrics.totals.customers}, Touchpoints ${metrics.totals.touchpoints} (activos ${metrics.totals.activeTouchpoints}), taps 7d ${metrics.taps?.total ?? "sin AE"}, éxito publicación ${metrics.publicationHealth.successRate === null ? "n/d" : `${Math.round(metrics.publicationHealth.successRate * 100)}%`}`;
});

// --- Customers ------------------------------------------------------------------
let org;
let detail;
await step("Buscar la organización E2E y ver su detalle (sin datos personales de leads)", async () => {
  const page = await call(staffToken, "GET", `/v1/staff/workspaces?query=${encodeURIComponent("E2E Kardo")}`);
  expect(page.status === 200, `HTTP ${page.status} ${page.json?.code ?? ""}`);
  org = page.json.items.find((item) => item.name === "E2E Kardo");
  expect(org, "organización no encontrada (corre antes vertical-slice.mjs)");
  const response = await call(staffToken, "GET", `/v1/staff/workspaces/${org.id}`);
  expect(response.status === 200, `detalle HTTP ${response.status}`);
  detail = response.json;
  expect(detail.members.some((member) => member.email === env.E2E_OWNER_EMAIL), "sin el owner");
  expect(detail.touchpoints.length > 0, "sin Touchpoints");
  expect(typeof detail.leads.total === "number" && !JSON.stringify(detail.leads).includes("@"), "leads con datos personales");
  return `${detail.touchpoints.length} Touchpoints, ${detail.experiences.length} Experiences, leads ${detail.leads.total}`;
});
await step("Paginación de clientes por cursor", async () => {
  const first = await call(staffToken, "GET", "/v1/staff/workspaces?limit=1");
  expect(first.status === 200 && first.json.items.length === 1, `HTTP ${first.status}`);
  if (!first.json.nextCursor) return "una sola página";
  const second = await call(staffToken, "GET", `/v1/staff/workspaces?limit=1&cursor=${encodeURIComponent(first.json.nextCursor)}`);
  expect(second.status === 200 && second.json.items[0]?.id !== first.json.items[0].id, "el cursor repitió la fila");
});

// --- Touchpoints & suspension -------------------------------------------------------
const liveTouchpoint = () => detail?.touchpoints.find((tp) => tp.status === "active" && tp.liveExperienceName && !tp.suspended);
await step("Diagnóstico de un Touchpoint (URLs, publicaciones)", async () => {
  const target = liveTouchpoint();
  expect(target, "sin Touchpoint activo");
  const search = await call(staffToken, "GET", `/v1/staff/touchpoints?query=${target.publicId.slice(0, 10)}`);
  expect(search.status === 200 && search.json.items.some((tp) => tp.id === target.id), "búsqueda por public ID");
  const response = await call(staffToken, "GET", `/v1/staff/touchpoints/${target.id}`);
  expect(response.status === 200, `HTTP ${response.status}`);
  expect(response.json.urls.qr.includes(`/t/${target.publicId}`) && response.json.urls.qr.includes("src=qr"), "URL QR");
  expect(response.json.publications.length > 0, "sin historial de publicaciones");
});
const suspendStep = "Suspender un Touchpoint bloquea el acceso público; levantarlo lo restaura";
let suspensionPending = false;
await step("Sin confirmación del Resolver la suspensión se revierte (no queda a medias)", async () => {
  const target = liveTouchpoint();
  expect(target, "sin Touchpoint activo");
  const suspended = await call(staffToken, "POST", `/v1/staff/touchpoints/${target.id}/suspension`, {
    reason: `Prueba E2E ${run}`,
  });
  if (suspended.status !== 503) return "el Resolver confirmó; se prueba el flujo completo";
  suspensionPending = true;
  const after = await call(staffToken, "GET", `/v1/staff/touchpoints/${target.id}`);
  expect(after.status === 200 && after.json.touchpoint.suspended === false, "quedó suspendido sin confirmación del Resolver");
  const lifted = await call(staffToken, "DELETE", `/v1/staff/touchpoints/${target.id}/suspension`);
  expect(lifted.status === 200, `levantar (idempotente) HTTP ${lifted.status}`);
  return "503 del Resolver → la base no cambió";
});
if (suspensionPending) record(suspendStep, true, "requiere desplegar el Resolver nuevo y su secreto SUSPENSION_COMMAND_KEY", true);
else await step(suspendStep, async () => {
  const target = liveTouchpoint();
  expect(target, "sin Touchpoint activo");
  const suspended = await call(staffToken, "POST", `/v1/staff/touchpoints/${target.id}/suspension`, {
    reason: `Prueba E2E ${run}`,
  });
  expect(suspended.status === 200 && suspended.json.touchpoint.suspended, `suspender HTTP ${suspended.status} ${suspended.json?.code ?? ""}`);
  const blocked = await fetch(`${resolver}/t/${target.publicId}?src=qr`, { redirect: "manual" });
  const blockedText = await blocked.text();
  expect(blocked.status === 404 && blockedText.includes("no está disponible"), `público HTTP ${blocked.status}`);
  const lifted = await call(staffToken, "DELETE", `/v1/staff/touchpoints/${target.id}/suspension`);
  expect(lifted.status === 200 && !lifted.json.touchpoint.suspended, `levantar HTTP ${lifted.status}`);
  const restored = await fetch(`${resolver}/t/${target.publicId}?src=qr`, { redirect: "manual" });
  await restored.body?.cancel();
  expect([200, 302].includes(restored.status), `restaurado HTTP ${restored.status}`);
});

// --- Publications ------------------------------------------------------------------
await step("Monitor de publicaciones y reintento solo de fallidas", async () => {
  const failed = await call(staffToken, "GET", "/v1/staff/publications?status=failed&limit=5");
  expect(failed.status === 200, `fallidas HTTP ${failed.status}`);
  const published = await call(staffToken, "GET", "/v1/staff/publications?status=published&limit=1");
  expect(published.status === 200 && published.json.items.length === 1, "sin publicadas");
  const retry = await call(staffToken, "POST", `/v1/staff/publications/${published.json.items[0].id}/retry`);
  expect(retry.status === 409, `reintentar publicada HTTP ${retry.status}`);
  return `${failed.json.items.length} fallidas recientes`;
});

// --- Plans ---------------------------------------------------------------------------
await step("Crear un plan y asignarlo a la organización (con motivo auditado)", async () => {
  const code = `e2e-${run}`;
  const created = await call(staffToken, "POST", "/v1/staff/plans", {
    code,
    name: `E2E ${run}`,
    isActive: false,
    entitlements: { "touchpoints.max": 50, "members.max": 5, "organizations.max": 3, "assets.storage_mb": null },
  });
  expect(created.status === 201, `crear HTTP ${created.status} ${created.json?.code ?? ""}`);
  const duplicate = await call(staffToken, "POST", "/v1/staff/plans", {
    code,
    name: "dup",
    isActive: false,
    entitlements: {},
  });
  expect(duplicate.status === 409, `duplicado HTTP ${duplicate.status}`);
  const plans = await call(staffToken, "GET", "/v1/staff/plans");
  const beta = plans.json.find((plan) => plan.code === "beta");
  expect(beta, "sin plan beta");
  const assigned = await call(staffToken, "PUT", `/v1/staff/workspaces/${org.id}/plan`, {
    planId: beta.id,
    reason: `Asignación E2E ${run}`,
  });
  expect(assigned.status === 200 && assigned.json.plan?.code === "beta", `asignar HTTP ${assigned.status} ${assigned.json?.code ?? ""}`);
});

// --- Audit & staff directory ------------------------------------------------------------
await step("Auditoría registra las acciones del staff", async () => {
  await sleep(500);
  const response = await call(staffToken, "GET", `/v1/staff/audit?actorType=staff&action=staff.&limit=50`);
  expect(response.status === 200, `HTTP ${response.status}`);
  const actions = new Set(response.json.items.map((event) => event.action));
  for (const action of ["staff.workspace_viewed", "staff.plan_assigned"]) {
    expect(actions.has(action), `falta ${action}`);
  }
  return [...actions].slice(0, 6).join(", ");
});
await step("Directorio del equipo Kardo (solo lectura)", async () => {
  const response = await call(staffToken, "GET", "/v1/staff/staff-members");
  expect(response.status === 200, `HTTP ${response.status}`);
  const me = response.json.find((member) => member.email === env.E2E_STAFF_EMAIL);
  expect(me?.roles.includes("platform-admin"), "sin rol platform-admin");
});

const failedSteps = results.filter((result) => !result.ok);
const pendingSteps = results.filter((result) => result.pending);
console.log(
  `\n${results.length - failedSteps.length - pendingSteps.length}/${results.length} comprobaciones OK${pendingSteps.length ? `, ${pendingSteps.length} pendientes de despliegue` : ""} en ${Math.round((Date.now() - started) / 1000)}s`,
);
process.exit(failedSteps.length ? 1 : 0);
