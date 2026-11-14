// End-to-end acceptance of notifications and service status (ADR 022)
// against kardo-dev: staff (Supabase + TOTP) writes in the Staff API, the
// E2E owner and member read through the Customer API, and the status Worker
// shows the incidents staff publish.
//
// Usage (after prepare-dev-accounts.mjs, prepare-staff.mjs and one run of
// vertical-slice.mjs, which creates the "E2E Kardo" organization):
//   E2E_API_URL=http://127.0.0.1:3011 E2E_STAFF_API_URL=http://127.0.0.1:3012 \
//   E2E_STATUS_URL=http://127.0.0.1:8797 node scripts/e2e/notifications-status.mjs
//
// Only organization and person audiences, aimed at the E2E accounts: a
// broadcast here would reach every account in kardo-dev. Every notification
// it creates is retired at the end. Never prints tokens, passwords or secrets.
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
const customerApi = (process.env.E2E_API_URL ?? env.VITE_CUSTOMER_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const staffApi = (process.env.E2E_STAFF_API_URL ?? env.VITE_STAFF_API_URL ?? "http://localhost:3002").replace(/\/$/, "");
const statusUrl = (process.env.E2E_STATUS_URL ?? env.VITE_STATUS_URL ?? "").replace(/\/$/, "");
const run = randomUUID().slice(0, 8);
const results = [];
const started = Date.now();
const created = [];

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

async function call(base, token, method, route, body) {
  const response = await fetch(`${base}${route}`, {
    method,
    headers: {
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
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
  return { status: response.status, json };
}
const staff = (token, method, route, body) => call(staffApi, token, method, route, body);
const customer = (token, method, route, body) => call(customerApi, token, method, route, body);

async function inbox(token, query = "") {
  const response = await customer(token, "GET", `/v1/notifications?limit=50${query}`);
  expect(response.status === 200, `inbox HTTP ${response.status} ${response.json?.code ?? ""}`);
  return response.json;
}

console.log(
  `Kardo notificaciones y estado · run ${run}\nCustomer API ${customerApi}\nStaff API ${staffApi}\nEstado ${statusUrl || "(sin E2E_STATUS_URL)"}\n`,
);

// --- Identity ------------------------------------------------------------------
const aal1 = await auth("/token?grant_type=password", {
  email: env.E2E_STAFF_EMAIL,
  password: env.E2E_STAFF_PASSWORD,
});
const factor = aal1.user.factors?.find((item) => item.factor_type === "totp" && item.status === "verified");
const challenge = await auth(`/factors/${factor.id}/challenge`, {}, aal1.access_token);
const staffToken = (
  await auth(
    `/factors/${factor.id}/verify`,
    { challenge_id: challenge.id, code: totp(env.E2E_STAFF_TOTP_SECRET) },
    aal1.access_token,
  )
).access_token;
const owner = await auth("/token?grant_type=password", {
  email: env.E2E_OWNER_EMAIL,
  password: env.E2E_OWNER_PASSWORD,
});
const member = await auth("/token?grant_type=password", {
  email: env.E2E_MEMBER_EMAIL,
  password: env.E2E_MEMBER_PASSWORD,
});
const ownerToken = owner.access_token;
const memberToken = member.access_token;
const memberId = member.user.id;

const workspaces = await customer(ownerToken, "GET", "/v1/workspaces");
const e2eWorkspace = workspaces.json?.find((item) => item.name === "E2E Kardo");
if (!e2eWorkspace) throw new Error('No existe la organización "E2E Kardo": corre antes vertical-slice.mjs.');
const memberWorkspaces = await customer(memberToken, "GET", "/v1/workspaces");
const memberInWorkspace = memberWorkspaces.json?.some((item) => item.id === e2eWorkspace.id) === true;

async function publish(body) {
  const response = await staff(staffToken, "POST", "/v1/staff/notifications", body);
  expect(response.status === 201, `crear HTTP ${response.status} ${response.json?.code ?? ""}`);
  created.push(response.json.id);
  return response.json;
}

// --- Notifications ---------------------------------------------------------------
let toWorkspace;
let toMember;
let ownersOnly;
let scheduled;

await step("Staff calcula a cuántas personas llega una organización", async () => {
  const response = await staff(staffToken, "POST", "/v1/staff/notifications/estimate", {
    kind: "workspace",
    workspaceId: e2eWorkspace.id,
  });
  expect(response.status === 200, `HTTP ${response.status}`);
  expect(response.json.workspaces === 1 && response.json.profiles >= 1, JSON.stringify(response.json));
  return `${response.json.profiles} personas`;
});

await step("Un botón con javascript: se rechaza", async () => {
  const response = await staff(staffToken, "POST", "/v1/staff/notifications", {
    category: "tip",
    title: `E2E ${run} inseguro`,
    body: "No debe guardarse.",
    action: { label: "Abrir", url: "javascript:alert(1)" },
    audience: { kind: "workspace", workspaceId: e2eWorkspace.id },
  });
  expect(response.status === 400, `HTTP ${response.status}`);
});

await step("Staff publica a la organización, a una persona, solo a Owners y una programada", async () => {
  toWorkspace = await publish({
    category: "account",
    title: `E2E ${run} para la organización`,
    body: "Hola, equipo. Revisamos su QR de la entrada.\n\nSegundo párrafo.",
    action: { label: "Ir a QR y etiquetas", url: "/touchpoints" },
    audience: { kind: "workspace", workspaceId: e2eWorkspace.id },
  });
  toMember = await publish({
    category: "account",
    title: `E2E ${run} para el miembro`,
    body: "Solo para ti.",
    audience: { kind: "profile", profileId: memberId },
  });
  ownersOnly = await publish({
    category: "tip",
    title: `E2E ${run} solo Owners`,
    body: "Solo para quien es Owner.",
    pinned: true,
    audience: { kind: "workspace", workspaceId: e2eWorkspace.id, roles: ["owner"] },
  });
  scheduled = await publish({
    category: "maintenance",
    title: `E2E ${run} programada`,
    body: "Todavía no.",
    publishAt: new Date(Date.now() + 3_600_000).toISOString(),
    audience: { kind: "workspace", workspaceId: e2eWorkspace.id },
  });
  expect(toWorkspace.state === "active" && scheduled.state === "scheduled", `${toWorkspace.state}/${scheduled.state}`);
  expect(toWorkspace.audienceLabel.workspaceName === "E2E Kardo", toWorkspace.audienceLabel.workspaceName);
});

await step("El Owner ve la de su organización y la de Owners (fijada arriba), no la del miembro ni la programada", async () => {
  const box = await inbox(ownerToken);
  const ids = box.items.map((item) => item.id);
  expect(ids.includes(toWorkspace.id) && ids.includes(ownersOnly.id), "faltan");
  expect(!ids.includes(toMember.id) && !ids.includes(scheduled.id), "ve de más");
  expect(box.items[0]?.pinned === true, "la fijada no va primero");
  const item = box.items.find((entry) => entry.id === toWorkspace.id);
  expect(item.workspace?.name === "E2E Kardo", "sin nombre de organización");
  expect(item.action?.url === "/touchpoints", "sin botón");
  expect(box.autoOpen === true, "no se abriría sola");
  return `${box.unreadCount} sin leer`;
});

await step("El miembro ve la suya y la de la organización, no la de Owners", async () => {
  const box = await inbox(memberToken);
  const ids = box.items.map((item) => item.id);
  expect(ids.includes(toMember.id), "no ve la suya");
  expect(ids.includes(toWorkspace.id) === memberInWorkspace, "organización");
  expect(!ids.includes(ownersOnly.id), "ve la de Owners");
});

await step("El Owner no puede marcar la del miembro (404) y sí la suya", async () => {
  const foreign = await customer(ownerToken, "POST", `/v1/notifications/${toMember.id}/read`);
  expect(foreign.status === 404, `ajena HTTP ${foreign.status}`);
  const own = await customer(ownerToken, "POST", `/v1/notifications/${ownersOnly.id}/read`);
  expect(own.status === 204, `propia HTTP ${own.status}`);
  const box = await inbox(ownerToken, "&unread=true");
  expect(!box.items.some((item) => item.id === ownersOnly.id), "sigue sin leer");
});

await step("Abrir la campana apaga la apertura automática sin marcar leídas", async () => {
  const before = await inbox(ownerToken);
  const opened = await customer(ownerToken, "POST", "/v1/notifications/opened");
  expect(opened.status === 204, `HTTP ${opened.status}`);
  const after = await inbox(ownerToken);
  expect(after.autoOpen === false, "se seguiría abriendo");
  expect(after.unreadCount === before.unreadCount, "abrir marcó leídas");
});

await step("Corregir el texto la marca como Editada sin volver a avisar", async () => {
  const response = await staff(staffToken, "PATCH", `/v1/staff/notifications/${toWorkspace.id}`, {
    title: `E2E ${run} para la organización (corregida)`,
  });
  expect(response.status === 200 && response.json.editedAt, `HTTP ${response.status}`);
  const box = await inbox(ownerToken);
  const item = box.items.find((entry) => entry.id === toWorkspace.id);
  expect(item?.title.endsWith("(corregida)") && item.editedAt, "sin corregir");
  expect(box.autoOpen === false, "editar volvió a avisar");
});

await step("La audiencia no se puede cambiar", async () => {
  const response = await staff(staffToken, "PATCH", `/v1/staff/notifications/${toWorkspace.id}`, {
    audience: { kind: "profile", profileId: memberId },
  });
  expect(response.status === 400, `HTTP ${response.status}`);
});

await step("Staff ve cuántos la leyeron, nunca quiénes", async () => {
  const response = await staff(staffToken, "GET", `/v1/staff/notifications/${ownersOnly.id}`);
  expect(response.status === 200 && response.json.reads === 1, `lecturas ${response.json?.reads}`);
  expect(!JSON.stringify(response.json).includes(owner.user.email), "expone a quien la leyó");
});

await step("Retirar la quita de la campana", async () => {
  const response = await staff(staffToken, "POST", `/v1/staff/notifications/${toWorkspace.id}/retire`);
  expect(response.status === 200 && response.json.state === "retired", `HTTP ${response.status}`);
  const box = await inbox(ownerToken);
  expect(!box.items.some((item) => item.id === toWorkspace.id), "sigue visible");
  const again = await staff(staffToken, "POST", `/v1/staff/notifications/${toWorkspace.id}/retire`);
  expect(again.status === 409, `retirar dos veces HTTP ${again.status}`);
});

// --- Service status ----------------------------------------------------------------
if (!statusUrl) {
  record("Estado del servicio", true, "sin E2E_STATUS_URL", true);
} else {
  let incident;
  await step("El estado público responde sin nada técnico", async () => {
    const response = await fetch(`${statusUrl}/v1/status`);
    expect(response.status === 200, `HTTP ${response.status}`);
    expect(response.headers.get("access-control-allow-origin") === "*", "sin CORS");
    const text = await response.text();
    expect(!/latenc|https?:\/\//i.test(text), "lleva detalle técnico");
    return JSON.parse(text).overall;
  });
  await step("Staff reporta un incidente y el estado público lo muestra", async () => {
    const response = await staff(staffToken, "POST", "/v1/staff/status/incidents", {
      kind: "incident",
      title: `E2E ${run} falla de prueba en la IA`,
      impact: "degraded",
      components: ["ai"],
      message: "Prueba automática: estamos revisando.",
    });
    expect(response.status === 201, `HTTP ${response.status} ${response.json?.code ?? ""}`);
    incident = response.json;
    const status = await (await fetch(`${statusUrl}/v1/status`)).json();
    expect(status.incidents.some((item) => item.id === incident.id), "no aparece");
    const ai = status.components.find((item) => item.id === "ai");
    expect(ai && ai.level !== "operational", `IA ${ai?.level}`);
  });
  await step("Actualizar y resolver lo quita del estado", async () => {
    expect(incident, "sin incidente");
    const update = await staff(staffToken, "POST", `/v1/staff/status/incidents/${incident.id}/updates`, {
      status: "identified",
      message: "Ya sabemos qué es.",
    });
    expect(update.status === 200 && update.json.updates[0].status === "identified", `HTTP ${update.status}`);
    const resolved = await staff(staffToken, "POST", `/v1/staff/status/incidents/${incident.id}/updates`, {
      status: "resolved",
      message: "Listo.",
    });
    expect(resolved.status === 200 && resolved.json.resolvedAt, `HTTP ${resolved.status}`);
    const status = await (await fetch(`${statusUrl}/v1/status`)).json();
    expect(!status.incidents.some((item) => item.id === incident.id), "sigue abierto");
  });
  await step("Staff ve el detalle técnico de las pruebas", async () => {
    const response = await staff(staffToken, "GET", "/v1/staff/status");
    expect(response.status === 200, `HTTP ${response.status}`);
    expect(response.json.probes.length === 7, `${response.json.probes.length} pruebas`);
    const api = response.json.probes.find((item) => item.id === "api");
    return `API ${api.configured ? (api.ok ? `${api.latencyMs} ms` : api.error) : "sin configurar"}`;
  });
}

// --- Cleanup --------------------------------------------------------------------------
for (const id of created) {
  await staff(staffToken, "POST", `/v1/staff/notifications/${id}/retire`).catch(() => undefined);
}

const failed = results.filter((item) => !item.ok);
const pendingCount = results.filter((item) => item.pending).length;
console.log(
  `\n${results.length - failed.length - pendingCount}/${results.length} OK${pendingCount ? ` (${pendingCount} pendientes)` : ""} en ${Math.round((Date.now() - started) / 1000)} s`,
);
process.exit(failed.length > 0 ? 1 : 0);
