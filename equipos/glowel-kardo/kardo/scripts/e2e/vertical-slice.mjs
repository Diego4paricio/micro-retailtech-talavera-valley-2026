// End-to-end acceptance of Kardo's vertical slice against kardo-dev:
// real Supabase sign-in → Customer API (local) → Publisher/Resolver (deployed
// test Workers) → Analytics Engine. Also probes tenant isolation and roles.
// Usage: node scripts/e2e/vertical-slice.mjs   (after prepare-dev-accounts.mjs)
// Never prints tokens, passwords or database URLs.
import { randomUUID } from "node:crypto";
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
// Same `${VAR}` expansion Vite applies to the shared .env file.
const env = Object.fromEntries(
  Object.entries(rawEnv).map(([key, value]) => [
    key,
    value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => rawEnv[name] ?? ""),
  ]),
);
const supabaseUrl = env.VITE_SUPABASE_URL;
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const api = (process.env.E2E_API_URL ?? env.VITE_CUSTOMER_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const resolver = (env.TAP_RESOLVER_URL ?? env.VITE_TAP_RESOLVER_URL).replace(/\/$/, "");
const run = randomUUID().slice(0, 8);
const results = [];
const started = Date.now();

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  console.log(`${ok ? "✅" : "❌"} ${name}${detail ? ` — ${detail}` : ""}`);
}
/** Steps that need Worker code newer than what is deployed are reported as
 * pending (never as passed), so a partial deployment is visible. */
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
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function signIn(email, password) {
  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: publishableKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(`sign-in ${email} → HTTP ${response.status}`);
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
  return { status: response.status, json, text, headers: response.headers };
}
const publish = (session, workspaceId, experienceId) =>
  call(session, "POST", `/v1/workspaces/${workspaceId}/experiences/${experienceId}/publication-intents`, undefined, {
    "idempotency-key": randomUUID(),
  });

async function waitForPublished(session, workspaceId, experienceId, label, timeoutMs = 200_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "";
  while (Date.now() < deadline) {
    const list = await call(session, "GET", `/v1/workspaces/${workspaceId}/experiences`);
    const item = list.json?.find?.((experience) => experience.id === experienceId);
    last = item?.publicationStatus ?? `HTTP ${list.status}`;
    if (last === "published") return Math.round((Date.now() - (deadline - timeoutMs)) / 1000);
    if (last === "failed") throw new Error(`${label}: la publicación falló`);
    await sleep(5_000);
  }
  throw new Error(`${label}: sigue en "${last}" tras ${timeoutMs / 1000}s`);
}

async function tap(publicId, src, init) {
  const url = `${resolver}/t/${publicId}${src ? `?src=${src}` : ""}`;
  const response = await fetch(url, { redirect: "manual", ...init });
  return { status: response.status, headers: response.headers, text: await response.text() };
}

async function waitForTap(publicId, predicate, label, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  let last;
  while (Date.now() < deadline) {
    last = await tap(publicId, "qr");
    if (predicate(last)) return last;
    await sleep(3_000);
  }
  throw new Error(`${label}: el Resolver respondió ${last?.status}`);
}

console.log(`Kardo E2E · run ${run}\nAPI ${api}\nResolver ${resolver}\n`);

const owner = await signIn(env.E2E_OWNER_EMAIL, env.E2E_OWNER_PASSWORD);
const member = await signIn(env.E2E_MEMBER_EMAIL, env.E2E_MEMBER_PASSWORD);
record("Inicio de sesión real en Supabase (owner y member)", true);

// Probe the deployed Workers for the lifecycle release.
const probe = await tap("0000000000000000e2e0probe0000000", "qr");
const resolverHasLifecycle = probe.status === 404 && probe.text.includes("aún no tiene contenido");
const assetsHasImages = await (async () => {
  if (!env.ASSET_WORKER_URL) return false;
  // The lifecycle release added /internal/delete: an unsigned call is 401
  // there, while older Workers do not know the route (404).
  const response = await fetch(new URL("/internal/delete", env.ASSET_WORKER_URL), {
    method: "POST",
    headers: { authorization: "Bearer invalid", "content-type": "application/json" },
    body: "{}",
  });
  await response.body?.cancel();
  return response.status === 401;
})();
// The link-page release added /internal/alias (401 unsigned) — older Workers 404.
const resolverHasLinks = await (async () => {
  const response = await fetch(`${resolver}/internal/alias`, { method: "POST", body: "{}" });
  await response.body?.cancel();
  return response.status === 401;
})();
// The Estudio QR release added GET /content/:assetId (401 unsigned) — older Workers 404.
const assetsHasReads = await (async () => {
  if (!env.ASSET_WORKER_URL) return false;
  const response = await fetch(new URL("/content/00000000-0000-4000-8000-000000000000", env.ASSET_WORKER_URL));
  await response.body?.cancel();
  return response.status === 401;
})();
console.log(`Resolver con Links (@handle): ${resolverHasLinks ? "sí" : "no (despliegue pendiente)"} · Assets Worker con lectura firmada: ${assetsHasReads ? "sí" : "no (despliegue pendiente)"}`);
console.log(`Resolver con ciclo de vida: ${resolverHasLifecycle ? "sí" : "no (despliegue pendiente)"} · Assets Worker con JPEG/WebP: ${assetsHasImages ? "sí" : "no (despliegue pendiente)"}\n`);

// --- Access control without a session -------------------------------------
await step("Sin sesión → 401", async () => {
  const response = await call(null, "GET", "/v1/workspaces");
  expect(response.status === 401, `HTTP ${response.status}`);
});
await step("Token falsificado → 401", async () => {
  const response = await call({ token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid" }, "GET", "/v1/workspaces");
  expect(response.status === 401, `HTTP ${response.status}`);
});

// --- Workspace / organization ----------------------------------------------
let org;
await step("Organización E2E (crear o reutilizar)", async () => {
  const list = await call(owner, "GET", "/v1/workspaces");
  expect(list.status === 200, `workspaces HTTP ${list.status}`);
  expect(list.json.some((workspace) => workspace.kind === "personal"), "sin espacio personal (trigger de alta)");
  org = list.json.find((workspace) => workspace.kind === "organization" && workspace.name === "E2E Kardo");
  if (!org) {
    const created = await call(owner, "POST", "/v1/organizations", { name: "E2E Kardo" });
    expect(created.status === 201, `crear organización HTTP ${created.status} ${created.json?.code ?? ""}`);
    org = created.json;
  }
  expect(org.role === "owner", `rol ${org.role}`);
  return org.name;
});
const w = org.id;

// Idempotency: a previous run may have left the member inside the org.
await step("Estado inicial limpio (member fuera de la organización)", async () => {
  const members = await call(owner, "GET", `/v1/workspaces/${w}/members`);
  expect(members.status === 200, `miembros HTTP ${members.status}`);
  const leftover = members.json.find((item) => item.profileId === member.subject);
  if (!leftover) return "sin residuos";
  const removed = await call(owner, "DELETE", `/v1/workspaces/${w}/members/${member.subject}`);
  expect(removed.status === 204, `retirar HTTP ${removed.status}`);
  return "residuo de una corrida anterior retirado";
});

// --- Tenant isolation before any invitation --------------------------------
await step("Aislamiento: otro usuario no ve los QR y etiquetas de la organización", async () => {
  const response = await call(member, "GET", `/v1/workspaces/${w}/touchpoints`);
  expect(response.status === 403, `HTTP ${response.status}`);
});

// --- Group + Touchpoints ----------------------------------------------------
let group;
const touchpoints = [];
await step("Crear grupo y 2 QR y etiquetas dentro", async () => {
  const createdGroup = await call(owner, "POST", `/v1/workspaces/${w}/touchpoint-groups`, {
    name: `Mesas ${run}`,
    description: "Prueba end-to-end",
  });
  expect(createdGroup.status === 201, `grupo HTTP ${createdGroup.status} ${createdGroup.json?.code ?? ""}`);
  group = createdGroup.json;
  for (const label of ["A", "B"]) {
    const created = await call(owner, "POST", `/v1/workspaces/${w}/touchpoints`, {
      operationalName: `Mesa ${label} ${run}`,
      physicalType: "label",
      groupId: group.id,
    });
    expect(created.status === 201, `touchpoint HTTP ${created.status} ${created.json?.code ?? ""}`);
    expect(/^[A-Za-z0-9_-]{16,32}$/.test(created.json.publicId), "publicId no aleatorio");
    touchpoints.push(created.json);
  }
  return `publicIds ${touchpoints.map((item) => item.publicId.slice(0, 8)).join(", ")}…`;
});
const [tpA, tpB] = touchpoints;

// --- Estudio QR: design saved per Touchpoint and "Mis diseños" -------------------
const qrDesign = {
  schema: 2,
  errorCorrection: "H",
  minVersion: null,
  quietZone: 4,
  modules: { shape: "fluid", fill: { kind: "linear", from: "#16232e", to: "#0a6c78", angle: 45 } },
  eyes: {
    frameShape: "extra-rounded",
    ballShape: "circle",
    topLeft: { frame: null, ball: null },
    topRight: { frame: null, ball: null },
    bottomLeft: { frame: "#064d56", ball: null },
  },
  background: { color: "#ffffff", transparent: false },
  logo: { source: "brand", size: 0.2, plate: "rounded", padding: 1, plateColor: null },
  frame: {
    style: "panel-bottom",
    color: "#16232e",
    textColor: "#ffffff",
    text: "Escanea para ver el menú de {nombre}",
    font: "sans",
    uppercase: false,
    icon: "menu",
  },
};
let qrTemplate;
await step("Diseño del QR: guarda el diseño por QR o etiqueta y valida el esquema", async () => {
  const qrPath = `/v1/workspaces/${w}/touchpoints/${tpA.id}/qr-design`;
  const empty = await call(owner, "GET", qrPath);
  expect(empty.status === 200 && empty.json.design === null, `leer HTTP ${empty.status}`);
  const saved = await call(owner, "PUT", qrPath, { design: qrDesign });
  expect(saved.status === 200, `guardar HTTP ${saved.status} ${saved.json?.code ?? ""}`);
  const again = await call(owner, "GET", qrPath);
  expect(JSON.stringify(again.json.design) === JSON.stringify(qrDesign), "el diseño no se conservó tal cual");
  expect(typeof again.json.updatedAt === "string", "sin fecha de guardado");
  const invalid = await call(owner, "PUT", qrPath, {
    design: { ...qrDesign, frame: { ...qrDesign.frame, text: "<script>" } },
  });
  expect(invalid.status === 400, `texto con marcado HTTP ${invalid.status}`);
  const foreignLogo = await call(owner, "PUT", qrPath, {
    design: { ...qrDesign, logo: { ...qrDesign.logo, source: "asset", assetId: randomUUID() } },
  });
  expect(foreignLogo.status === 400 && foreignLogo.json?.code === "INVALID_QR_DESIGN", `logo ajeno HTTP ${foreignLogo.status}`);
  const outsider = await call(member, "GET", qrPath);
  expect(outsider.status === 403, `otro usuario HTTP ${outsider.status}`);
  // An NFC carries the design of its backup QR (relevo 38, model A); an
  // «Otro» object has no QR at all.
  const nfc = await call(owner, "POST", `/v1/workspaces/${w}/touchpoints`, { operationalName: `NFC ${run}`, kind: "nfc" });
  expect(nfc.status === 201, `crear NFC HTTP ${nfc.status}`);
  const backup = await call(owner, "PUT", `/v1/workspaces/${w}/touchpoints/${nfc.json.id}/qr-design`, { design: qrDesign });
  expect(backup.status === 200, `respaldo del NFC HTTP ${backup.status} ${backup.json?.code ?? ""}`);
  const other = await call(owner, "POST", `/v1/workspaces/${w}/touchpoints`, { operationalName: `Otro ${run}`, kind: "other" });
  const notQr = await call(owner, "PUT", `/v1/workspaces/${w}/touchpoints/${other.json.id}/qr-design`, { design: qrDesign });
  expect(notQr.status === 409 && notQr.json?.code === "TOUCHPOINT_NOT_QR", `Otro HTTP ${notQr.status}`);
  await call(owner, "POST", `/v1/workspaces/${w}/touchpoints/${nfc.json.id}/retire`);
});
await step("Diseño del QR: biblioteca de diseños (crear y listar; se borra tras la prueba del viewer)", async () => {
  const base = `/v1/workspaces/${w}/qr-templates`;
  // Leftovers of aborted runs (the E2E organization is test-only).
  const previous = await call(owner, "GET", base);
  for (const item of previous.json ?? []) await call(owner, "DELETE", `${base}/${item.id}`);
  const created = await call(owner, "POST", base, { name: `Mesas ${run}`, design: qrDesign });
  expect(created.status === 201, `crear HTTP ${created.status} ${created.json?.code ?? ""}`);
  qrTemplate = created.json;
  const listed = await call(owner, "GET", base);
  expect(listed.json.some((item) => item.id === qrTemplate.id), "no aparece en la lista");
  const outsider = await call(member, "GET", base);
  expect(outsider.status === 403, `otro usuario HTTP ${outsider.status}`);
  const blank = await call(owner, "POST", base, { name: "   ", design: qrDesign });
  expect(blank.status === 400, `nombre vacío HTTP ${blank.status}`);
  return `${listed.json.length} diseño(s) guardado(s)`;
});

await step("Diseño del QR: biblioteca compartida, diseño del grupo, herencia y control de impresión", async () => {
  const base = `/v1/workspaces/${w}`;
  const tpPath = (id) => `${base}/touchpoints/${id}/qr-design`;
  // tpB follows the library design by reference.
  const applied = await call(owner, "POST", `${base}/qr-templates/${qrTemplate.id}/applications`, {
    touchpointIds: [tpB.id],
    groupIds: [],
  });
  expect(applied.status === 200 && applied.json.touchpoints === 1, `aplicar HTTP ${applied.status} ${applied.json?.code ?? ""}`);
  const linked = await call(owner, "GET", tpPath(tpB.id));
  expect(linked.json.source === "library" && linked.json.template?.id === qrTemplate.id, `origen tpB ${linked.json?.source}`);
  // The group gives the design to its Touchpoints, including new ones.
  const groupDefault = await call(owner, "PUT", `${base}/touchpoint-groups/${group.id}/qr-design`, { templateId: qrTemplate.id });
  expect(groupDefault.status === 204, `diseño de grupo HTTP ${groupDefault.status}`);
  const newcomer = await call(owner, "POST", `${base}/touchpoints`, { operationalName: `Mesa nueva ${run}`, kind: "qr", groupId: group.id });
  expect(newcomer.status === 201, `alta en grupo HTTP ${newcomer.status}`);
  const inherited = await call(owner, "GET", tpPath(newcomer.json.id));
  expect(inherited.json.source === "group" && inherited.json.template?.id === qrTemplate.id, `origen nuevo ${inherited.json?.source}`);
  // Created directly with a design (outside any group).
  const withDesign = await call(owner, "POST", `${base}/touchpoints`, { operationalName: `Cartel ${run}`, kind: "qr", qrTemplateId: qrTemplate.id });
  expect(withDesign.status === 201, `alta con diseño HTTP ${withDesign.status} ${withDesign.json?.code ?? ""}`);
  const nfcWithDesign = await call(owner, "POST", `${base}/touchpoints`, { operationalName: `NFC ${run}`, kind: "nfc", qrTemplateId: qrTemplate.id });
  expect(nfcWithDesign.status === 400, `NFC con diseño HTTP ${nfcWithDesign.status}`);
  // tpA keeps its own design until it goes back to the group's.
  expect((await call(owner, "GET", tpPath(tpA.id))).json.source === "custom", "tpA dejó de tener diseño propio");
  const back = await call(owner, "PUT", tpPath(tpA.id), { inherit: true });
  expect(back.status === 200 && back.json.source === "group", `volver al grupo ${back.json?.source}`);
  // Editing the library design reaches every Touchpoint that uses it.
  const edited = await call(owner, "PATCH", `${base}/qr-templates/${qrTemplate.id}`, { design: { ...qrDesign, quietZone: 6 } });
  expect(edited.status === 200 && edited.json.usage.touchpoints === 2 && edited.json.usage.groups === 1, `editar HTTP ${edited.status} uso ${JSON.stringify(edited.json?.usage)}`);
  expect((await call(owner, "GET", tpPath(newcomer.json.id))).json.design.quietZone === 6, "el cambio no llegó al QR o etiqueta del grupo");
  // Print tracking.
  const fingerprint = "c".repeat(64);
  const recorded = await call(owner, "POST", `${base}/qr-exports`, { format: "sheet", items: [{ touchpointId: tpA.id, fingerprint }, { touchpointId: tpB.id, fingerprint }] });
  expect(recorded.status === 204, `registrar impresión HTTP ${recorded.status}`);
  const printed = await call(owner, "GET", tpPath(tpA.id));
  expect(printed.json.lastExport?.fingerprint === fingerprint && printed.json.lastExport?.format === "sheet", "sin registro de impresión");
  const overview = await call(owner, "GET", `${base}/qr-designs`);
  const row = overview.json.find((item) => item.touchpointId === tpB.id);
  expect(row?.source === "library" && row?.lastExport?.format === "sheet", "resumen sin tpB");
  // A design in use cannot be deleted.
  const blocked = await call(owner, "DELETE", `${base}/qr-templates/${qrTemplate.id}`);
  expect(blocked.status === 409 && blocked.json.code === "QR_TEMPLATE_IN_USE", `borrar en uso HTTP ${blocked.status}`);
  // Clean up: unlink everything so the viewer step can delete it later.
  await call(owner, "PUT", `${base}/touchpoint-groups/${group.id}/qr-design`, { templateId: null });
  await call(owner, "PUT", tpPath(tpB.id), { inherit: true });
  // Leave the group first (no network involved), so later group steps see
  // exactly Mesa A and Mesa B; then retire the extras (retrying once).
  const left = await call(owner, "PATCH", `${base}/touchpoints/${newcomer.json.id}`, {
    operationalName: newcomer.json.operationalName,
    groupId: null,
  });
  expect(left.status === 200, `sacar del grupo HTTP ${left.status}`);
  for (const extra of [newcomer.json.id, withDesign.json.id]) {
    let retired = await call(owner, "POST", `${base}/touchpoints/${extra}/retire`);
    if (retired.status !== 200) retired = await call(owner, "POST", `${base}/touchpoints/${extra}/retire`);
    expect(retired.status === 200, `retirar extra HTTP ${retired.status}`);
  }
  const unused = await call(owner, "GET", `${base}/qr-templates/${qrTemplate.id}`);
  expect(unused.json.template.usage.touchpoints === 0 && unused.json.template.usage.groups === 0, `sigue en uso ${JSON.stringify(unused.json?.template?.usage)}`);
  return "biblioteca → grupo → alta nueva heredada, impresión registrada";
});

await step("QR o etiqueta sin publicar no sirve contenido", async () => {
  const response = await tap(tpA.publicId, "qr");
  expect(response.status === 404, `HTTP ${response.status}`);
});

// --- Content validation ------------------------------------------------------
await step("Rechaza URL javascript: en enlaces", async () => {
  const response = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    targets: { touchpointIds: [tpA.id], groupIds: [] },
    name: "XSS",
    type: "links",
    content: { title: "x", links: [{ id: "x", label: "x", url: "javascript:alert(1)" }] },
  });
  expect(response.status === 400, `HTTP ${response.status}`);
});

// --- Menu for the whole group ----------------------------------------------
const menuTitle = (version) => `Menu E2E ${run} v${version}`;
const menuContent = (version) => ({
  title: menuTitle(version),
  currency: "MXN",
  sections: [{ id: "bebidas", name: "Bebidas", items: [{ id: "latte", name: "Latte", price: 58 + version }] }],
});
let menu;
await step("Crear Menú dirigido al grupo (borrador)", async () => {
  const created = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    targets: { touchpointIds: [], groupIds: [group.id] },
    name: `Menú ${run}`,
    type: "menu",
    content: menuContent(1),
  });
  expect(created.status === 201, `HTTP ${created.status} ${created.json?.code ?? ""}`);
  menu = created.json;
  expect(menu.publicationStatus === "draft", `estado ${menu.publicationStatus}`);
});
await step("Diseñar primero: borrador sin destinos, se asignan al publicar", async () => {
  const created = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    targets: { touchpointIds: [], groupIds: [] },
    name: `Borrador sin destinos ${run}`,
    type: "links",
    content: { title: `Sin destinos ${run}`, links: [{ id: "web", label: "Sitio", url: "https://kardo.example/" }] },
  });
  expect(created.status === 201, `crear HTTP ${created.status} ${created.json?.code ?? ""}`);
  const draftId = created.json.id;
  try {
    const early = await publish(owner, w, draftId);
    expect(early.status === 400 && early.json?.code === "TARGETS_REQUIRED", `publicar sin destinos HTTP ${early.status} ${early.json?.code ?? ""}`);
    const assigned = await call(owner, "PUT", `/v1/workspaces/${w}/experiences/${draftId}/targets`, {
      touchpointIds: [tpA.id],
      groupIds: [],
    });
    expect(assigned.status === 200, `asignar HTTP ${assigned.status} ${assigned.json?.code ?? ""}`);
    const cleared = await call(owner, "PUT", `/v1/workspaces/${w}/experiences/${draftId}/targets`, {
      touchpointIds: [],
      groupIds: [],
    });
    expect(cleared.status === 200, `quitar destinos de un borrador HTTP ${cleared.status} ${cleared.json?.code ?? ""}`);
  } finally {
    await call(owner, "POST", `/v1/workspaces/${w}/experiences/${draftId}/archive`);
  }
});
await step("Guardar borrador no publica nada", async () => {
  const response = await tap(tpA.publicId, "qr");
  expect(response.status === 404, `HTTP ${response.status}`);
});
await step("Publicar Menú → 1 versión, 2 publicaciones (una por mesa)", async () => {
  const batch = await publish(owner, w, menu.id);
  expect(batch.status === 201, `HTTP ${batch.status} ${batch.json?.code ?? ""}`);
  expect(batch.json.publications.length === 2, `${batch.json.publications.length} publicaciones`);
  const seconds = await waitForPublished(owner, w, menu.id, "Menú v1");
  return `publicado en ~${seconds}s`;
});
await step("QR y NFC abren el Menú en ambas mesas", async () => {
  for (const tp of [tpA, tpB]) {
    const qr = await waitForTap(tp.publicId, (r) => r.status === 200 && r.text.includes(menuTitle(1)), tp.operationalName);
    expect(qr.headers.get("content-security-policy")?.includes("default-src 'none'"), "sin CSP estricta");
    const nfc = await tap(tp.publicId, "nfc");
    expect(nfc.status === 200, `NFC HTTP ${nfc.status}`);
  }
});
await step("QR y etiquetas quedan activos", async () => {
  const list = await call(owner, "GET", `/v1/workspaces/${w}/touchpoints`);
  const statuses = list.json.filter((tp) => tp.groupId === group.id).map((tp) => tp.status);
  expect(statuses.length === 2 && statuses.every((status) => status === "active"), statuses.join(","));
});

// --- Republish: same QR/NFC, new content ------------------------------------
await step("Editar y republicar → mismo QR muestra contenido nuevo", async () => {
  const updated = await call(owner, "PATCH", `/v1/workspaces/${w}/experiences/${menu.id}`, {
    name: `Menú ${run}`,
    content: menuContent(2),
  });
  expect(updated.status === 200, `PATCH HTTP ${updated.status} ${updated.json?.code ?? ""}`);
  const stillOld = await tap(tpA.publicId, "qr");
  expect(stillOld.text.includes(menuTitle(1)), "el borrador cambió lo publicado antes de publicar");
  const batch = await publish(owner, w, menu.id);
  expect(batch.status === 201, `publish HTTP ${batch.status}`);
  await waitForPublished(owner, w, menu.id, "Menú v2");
  await waitForTap(tpA.publicId, (r) => r.text.includes(menuTitle(2)), "Mesa A v2");
  await waitForTap(tpB.publicId, (r) => r.text.includes(menuTitle(2)), "Mesa B v2");
});

// --- Rollback -----------------------------------------------------------------
await step("Rollback a la versión 1", async () => {
  const detail = await call(owner, "GET", `/v1/workspaces/${w}/experiences/${menu.id}`);
  expect(detail.status === 200, `detalle HTTP ${detail.status}`);
  expect(detail.json.versions.length >= 2, `${detail.json.versions.length} versiones`);
  expect(detail.json.targets?.length === 2, `destinos resueltos ${detail.json.targets?.length}`);
  const first = [...detail.json.versions].sort((a, b) => a.revision - b.revision)[0];
  const rollback = await call(owner, "POST", `/v1/workspaces/${w}/experiences/${menu.id}/versions/${first.id}/publication-intents`, undefined, {
    "idempotency-key": randomUUID(),
  });
  expect(rollback.status === 201, `HTTP ${rollback.status} ${rollback.json?.code ?? ""}`);
  await waitForPublished(owner, w, menu.id, "Rollback");
  await waitForTap(tpA.publicId, (r) => r.text.includes(menuTitle(1)), "Mesa A rollback");
});

// --- Disponibilidad: live item state, no versions, no publishing --------------
const availabilityStep = "Disponibilidad: agotado, piezas y oculto en vivo, sin versiones";
{
  const availabilityUrl = `/v1/workspaces/${w}/experiences/${menu?.id}/availability`;
  const setLatte = (status, quantity = null) =>
    call(owner, "PUT", availabilityUrl, { items: [{ itemId: "latte", status, quantity }] });
  const listed = menu ? await call(owner, "GET", `/v1/workspaces/${w}/availability`) : null;
  const probe = menu ? await setLatte("sold_out") : null;
  if (probe?.status === 503 && probe.json?.code === "ITEM_AVAILABILITY_UNAVAILABLE") {
    await step("Disponibilidad: lista los artículos en vivo y revierte si el Resolver no confirma", async () => {
      expect(listed?.status === 200, `GET HTTP ${listed?.status}`);
      const entry = listed.json.experiences.find((experience) => experience.experienceId === menu.id);
      expect(entry?.sections?.[0]?.items?.[0]?.id === "latte", "no aparece el Latte");
      const after = await call(owner, "GET", `/v1/workspaces/${w}/availability`);
      const latte = after.json.experiences.find((experience) => experience.experienceId === menu.id)?.sections[0]?.items[0];
      expect(latte?.status === "available", `quedó ${latte?.status} aunque el Resolver no confirmó`);
    });
    pending(availabilityStep, "requiere desplegar el Resolver nuevo");
  } else {
    await step(availabilityStep, async () => {
      expect(listed?.status === 200, `GET HTTP ${listed?.status}`);
      const before = await call(owner, "GET", `/v1/workspaces/${w}/experiences/${menu.id}`);
      expect(probe?.status === 200, `HTTP ${probe?.status} ${probe?.json?.code ?? ""}`);
      expect(probe.json.source === "published", `origen ${probe.json.source}`);
      await waitForTap(tpA.publicId, (r) => r.text.includes("Agotado"), "Mesa A agotado");
      const low = await setLatte("available", 2);
      expect(low.status === 200, `piezas HTTP ${low.status}`);
      await waitForTap(tpB.publicId, (r) => r.text.includes("Quedan 2") && !r.text.includes("Agotado"), "Mesa B quedan 2");
      const hidden = await setLatte("hidden");
      expect(hidden.status === 200, `oculto HTTP ${hidden.status}`);
      await waitForTap(tpA.publicId, (r) => !r.text.includes("Latte"), "Mesa A sin Latte");
      const restored = await setLatte("available");
      expect(restored.status === 200, `restaurar HTTP ${restored.status}`);
      await waitForTap(tpA.publicId, (r) => r.text.includes("Latte") && !r.text.includes("Agotado"), "Mesa A restaurada");
      const after = await call(owner, "GET", `/v1/workspaces/${w}/experiences/${menu.id}`);
      expect(after.json.versions.length === before.json.versions.length, "cambiar la disponibilidad creó una versión");
      const unknown = await call(owner, "PUT", availabilityUrl, { items: [{ itemId: "no-existe", status: "hidden", quantity: null }] });
      expect(unknown.status === 400 && unknown.json?.code === "UNKNOWN_AVAILABILITY_ITEM", `artículo desconocido HTTP ${unknown.status}`);
    });
  }
}

// --- Pause / resume -----------------------------------------------------------
await step("Pausar bloquea el acceso público y reanudar lo restaura", async () => {
  const paused = await call(owner, "PATCH", `/v1/workspaces/${w}/touchpoints/${tpB.id}/status`, { status: "paused" });
  expect(paused.status === 200, `pausar HTTP ${paused.status} ${paused.json?.code ?? ""}`);
  const blocked = await tap(tpB.publicId, "qr");
  expect(blocked.status === 404, `pausado responde ${blocked.status}`);
  const resumed = await call(owner, "PATCH", `/v1/workspaces/${w}/touchpoints/${tpB.id}/status`, { status: "active" });
  expect(resumed.status === 200, `reanudar HTTP ${resumed.status}`);
  await waitForTap(tpB.publicId, (r) => r.status === 200, "Mesa B reanudada");
});

// --- Batch creation: new tables inherit the group's Experience ----------------
let batchTouchpoints = [];
await step("Crear 3 mesas en lote dentro del grupo → reciben el Menú solas", async () => {
  const created = await call(owner, "POST", `/v1/workspaces/${w}/touchpoints/batch`, {
    namePrefix: `Lote ${run}`,
    start: 1,
    count: 3,
    physicalType: "label",
    groupId: group.id,
  });
  expect(created.status === 201, `lote HTTP ${created.status} ${created.json?.code ?? ""}`);
  batchTouchpoints = created.json.touchpoints;
  expect(batchTouchpoints.length === 3, `${batchTouchpoints.length} mesas`);
  expect(created.json.propagatedPublications === 3, `propagadas ${created.json.propagatedPublications}`);
  const startedAt = Date.now();
  for (const tp of batchTouchpoints) {
    await waitForTap(tp.publicId, (r) => r.status === 200 && r.text.includes(menuTitle(1)), tp.operationalName, 90_000);
  }
  return `${batchTouchpoints.map((tp) => tp.operationalName).join(", ")} sirven el Menú en ~${Math.round((Date.now() - startedAt) / 1000)}s`;
});

let menuCopy;
await step("Duplicar, archivar y restaurar una página", async () => {
  const duplicated = await call(owner, "POST", `/v1/workspaces/${w}/experiences/${menu.id}/duplicate`, {});
  expect(duplicated.status === 201, `duplicar HTTP ${duplicated.status} ${duplicated.json?.code ?? ""}`);
  menuCopy = duplicated.json;
  expect(menuCopy.name.endsWith("(copia)"), `nombre ${menuCopy.name}`);
  expect(menuCopy.publicationStatus === "draft", `estado ${menuCopy.publicationStatus}`);
  // A copy is born with no destinations, so publishing it never replaces
  // the original (round 4, B1).
  expect(
    (menuCopy.targets?.touchpointIds.length ?? 0) === 0 &&
      (menuCopy.targets?.groupIds.length ?? 0) === 0,
    "la copia nació con destinos",
  );
  const archived = await call(owner, "POST", `/v1/workspaces/${w}/experiences/${menuCopy.id}/archive`);
  expect(archived.status === 200, `archivar HTTP ${archived.status} ${archived.json?.code ?? ""}`);
  const active = await call(owner, "GET", `/v1/workspaces/${w}/experiences`);
  expect(!active.json.some((item) => item.id === menuCopy.id), "sigue en la lista activa");
  const archivedList = await call(owner, "GET", `/v1/workspaces/${w}/experiences?archived=true`);
  expect(archivedList.json.some((item) => item.id === menuCopy.id), "no aparece en archivadas");
  const restored = await call(owner, "POST", `/v1/workspaces/${w}/experiences/${menuCopy.id}/unarchive`);
  expect(restored.status === 200, `restaurar HTTP ${restored.status}`);
  const again = await call(owner, "POST", `/v1/workspaces/${w}/experiences/${menuCopy.id}/archive`);
  expect(again.status === 200, `re-archivar HTTP ${again.status}`);
});

// --- Lead form (A) and Links (B) published in parallel -----------------------
let form;
let links;
await step("Publicar Formulario en Mesa A y Enlaces en Mesa B", async () => {
  const formCreated = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    targets: { touchpointIds: [tpA.id], groupIds: [] },
    name: `Contacto ${run}`,
    type: "form",
    content: {
      title: `Contacto ${run}`,
      fields: { name: "optional", phone: "optional", message: "optional" },
      submitLabel: "Enviar",
      successMessage: "Gracias E2E",
      consentText: "Acepto que me contacten.",
      // The business's own privacy notice (it controls its leads' data).
      privacyNoticeUrl: `https://example.com/aviso-privacidad-${run}`,
    },
  });
  expect(formCreated.status === 201, `form HTTP ${formCreated.status} ${formCreated.json?.code ?? ""}`);
  form = formCreated.json;
  const linksCreated = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    targets: { touchpointIds: [tpB.id], groupIds: [] },
    name: `Enlaces ${run}`,
    type: "links",
    content: { title: `Enlaces ${run}`, links: [{ id: "sitio", label: "Sitio", url: "https://example.com/kardo-e2e" }] },
  });
  expect(linksCreated.status === 201, `links HTTP ${linksCreated.status} ${linksCreated.json?.code ?? ""}`);
  links = linksCreated.json;
  expect((await publish(owner, w, form.id)).status === 201, "publicar form");
  expect((await publish(owner, w, links.id)).status === 201, "publicar links");
  await waitForPublished(owner, w, form.id, "Formulario");
  await waitForPublished(owner, w, links.id, "Enlaces");
  const formPage = await waitForTap(tpA.publicId, (r) => r.text.includes('name="consent"'), "Mesa A formulario");
  expect(
    formPage.text.includes('class="consent-notice"') &&
      formPage.text.includes(`href="https://example.com/aviso-privacidad-${run}"`),
    "el formulario no muestra el aviso de privacidad del negocio",
  );
  await waitForTap(tpB.publicId, (r) => r.text.includes(`Enlaces ${run}`), "Mesa B enlaces");
});

await step("Republicar el Menú del grupo respeta las asignaciones directas", async () => {
  const detail = await call(owner, "GET", `/v1/workspaces/${w}/experiences/${menu.id}`);
  expect(detail.status === 200, `detalle HTTP ${detail.status}`);
  const overridden = detail.json.targets.filter((target) => target.overridden).map((target) => target.touchpointId).sort();
  expect(overridden.join() === [tpA.id, tpB.id].sort().join(), `anuladas ${overridden.length}`);
  const batch = await publish(owner, w, menu.id);
  expect(batch.status === 201, `HTTP ${batch.status} ${batch.json?.code ?? ""}`);
  expect(batch.json.publications.length === 3, `${batch.json.publications.length} publicaciones`);
  expect(batch.json.skipped?.length === 2, `omitidas ${batch.json.skipped?.length ?? 0}`);
  await waitForPublished(owner, w, menu.id, "Menú v3");
  const a = await tap(tpA.publicId, "qr");
  expect(a.text.includes('name="consent"'), "Mesa A perdió su formulario directo");
  return "Mesa A y B conservan su contenido directo; 3 mesas del lote actualizadas";
});

await step("Clic rastreado redirige al destino y no hay open redirect", async () => {
  const click = await fetch(`${resolver}/t/${tpB.publicId}/go/sitio?src=nfc`, { redirect: "manual" });
  expect(click.status === 302, `clic HTTP ${click.status}`);
  expect(click.headers.get("location") === "https://example.com/kardo-e2e", "destino inesperado");
  const forged = await fetch(`${resolver}/t/${tpB.publicId}/go/x?url=https://evil.example`, { redirect: "manual" });
  expect(forged.status === 404, `id falso HTTP ${forged.status}`);
});

await step("Archivar Enlaces → Mesa B vuelve al Menú del grupo", async () => {
  const archived = await call(owner, "POST", `/v1/workspaces/${w}/experiences/${links.id}/archive`);
  expect(archived.status === 200, `archivar HTTP ${archived.status} ${archived.json?.code ?? ""}`);
  expect(archived.json.fallbackPublications === 1, `respaldos ${archived.json.fallbackPublications}`);
  await waitForTap(tpB.publicId, (r) => r.status === 200 && r.text.includes("Menu E2E"), "Mesa B respaldo", 90_000);
});

const leadEmail = `lead-${run}@example.com`;
await step("Visitante envía el formulario (con consentimiento) y se rechaza sin él", async () => {
  const post = (fields) =>
    fetch(`${resolver}/t/${tpA.publicId}/leads?src=qr`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(fields).toString(),
    });
  const noConsent = await post({ email: leadEmail, website: "" });
  expect(noConsent.status === 400, `sin consentimiento HTTP ${noConsent.status}`);
  const ok = await post({ email: leadEmail, name: "=HYPERLINK(\"https://evil\")", phone: "+52 55 0000 0000", message: "Hola E2E", consent: "yes", website: "" });
  const body = await ok.text();
  expect(ok.status === 200 && body.includes("Gracias E2E"), `envío HTTP ${ok.status}`);
});

await step("El lead aparece en el panel y el CSV neutraliza fórmulas", async () => {
  let found;
  for (let attempt = 0; attempt < 10 && !found; attempt += 1) {
    const page = await call(owner, "GET", `/v1/workspaces/${w}/leads?limit=50`);
    expect(page.status === 200, `leads HTTP ${page.status}`);
    found = page.json.items.find((lead) => lead.email === leadEmail);
    if (!found) await sleep(2_000);
  }
  expect(found, "lead no encontrado");
  const csv = await call(owner, "GET", `/v1/workspaces/${w}/leads/export`);
  expect(csv.status === 200 && csv.text.includes(leadEmail), `CSV HTTP ${csv.status}`);
  expect(!/(^|,)"?=HYPERLINK/m.test(csv.text), "fórmula sin neutralizar en el CSV");
});

await step("Seguimiento de leads: estado, filtro, retención y borrado", async () => {
  const page = await call(owner, "GET", `/v1/workspaces/${w}/leads?limit=50`);
  const lead = page.json.items.find((item) => item.email === leadEmail);
  expect(lead?.status === "new", `estado inicial ${lead?.status}`);
  const contacted = await call(owner, "PATCH", `/v1/workspaces/${w}/leads/${lead.id}`, { status: "contacted" });
  expect(contacted.status === 200 && contacted.json.status === "contacted", `PATCH HTTP ${contacted.status}`);
  const filtered = await call(owner, "GET", `/v1/workspaces/${w}/leads?status=contacted`);
  expect(filtered.json.items.every((item) => item.status === "contacted"), "filtro por estado");
  expect(filtered.json.items.some((item) => item.id === lead.id), "no aparece en contactados");
  const retention = await call(owner, "GET", `/v1/workspaces/${w}/lead-retention`);
  expect(retention.status === 200 && retention.json.days === 365, `retención ${retention.json?.days}`);
  const changed = await call(owner, "PUT", `/v1/workspaces/${w}/lead-retention`, { days: 90 });
  expect(changed.status === 200 && changed.json.days === 90, `PUT HTTP ${changed.status}`);
  await call(owner, "PUT", `/v1/workspaces/${w}/lead-retention`, { days: 365 });
  const extra = await fetch(`${resolver}/t/${tpA.publicId}/leads?src=qr`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: `borrar-${run}@example.com`, consent: "yes", website: "" }).toString(),
  });
  expect(extra.status === 200, `segundo lead HTTP ${extra.status}`);
  let toDelete;
  for (let attempt = 0; attempt < 10 && !toDelete; attempt += 1) {
    const list = await call(owner, "GET", `/v1/workspaces/${w}/leads?limit=50`);
    toDelete = list.json.items.find((item) => item.email === `borrar-${run}@example.com`);
    if (!toDelete) await sleep(2_000);
  }
  expect(toDelete, "segundo lead no llegó");
  const deleted = await call(owner, "DELETE", `/v1/workspaces/${w}/leads/${toDelete.id}`);
  expect(deleted.status === 204, `DELETE HTTP ${deleted.status}`);
  const after = await call(owner, "GET", `/v1/workspaces/${w}/leads?limit=50`);
  expect(!after.json.items.some((item) => item.id === toDelete.id), "el lead borrado sigue visible");
});

await step("Honeypot: un bot que llena el campo oculto no crea leads", async () => {
  const botEmail = `bot-${run}@example.com`;
  const response = await fetch(`${resolver}/t/${tpA.publicId}/leads?src=qr`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ email: botEmail, consent: "yes", website: "https://spam.example" }).toString(),
  });
  expect(response.status === 200, `HTTP ${response.status}`);
  await sleep(4_000);
  const list = await call(owner, "GET", `/v1/workspaces/${w}/leads?limit=50`);
  expect(!list.json.items.some((item) => item.email === botEmail), "el bot creó un lead");
});

await step("Configuración de webhook rechaza destinos inseguros", async () => {
  for (const url of ["http://example.com/hook", "https://127.0.0.1/hook", "https://localhost/hook"]) {
    const response = await call(owner, "PUT", `/v1/workspaces/${w}/lead-delivery`, {
      notifyEmail: false,
      notifyRecipients: [],
      webhookUrl: url,
    });
    expect(response.status === 400, `${url} → HTTP ${response.status}`);
  }
});

// --- Roles: invite member as viewer -------------------------------------------
await step("Viewer invitado: puede ver pero no modificar ni leer leads", async () => {
  const invite = await call(owner, "POST", `/v1/workspaces/${w}/invitations`, { email: member.email, role: "viewer" });
  expect(invite.status === 201, `invitar HTTP ${invite.status} ${invite.json?.code ?? ""}`);
  expect(typeof invite.json.emailSent === "boolean", "sin emailSent");
  const accepted = await call(member, "POST", "/v1/invitations/accept", { token: invite.json.token });
  expect([200, 201].includes(accepted.status), `aceptar HTTP ${accepted.status} ${accepted.json?.code ?? ""}`);
  const read = await call(member, "GET", `/v1/workspaces/${w}/touchpoints`);
  expect(read.status === 200, `leer HTTP ${read.status}`);
  const create = await call(member, "POST", `/v1/workspaces/${w}/touchpoints`, { operationalName: "Intruso", physicalType: "card" });
  expect(create.status === 403, `crear HTTP ${create.status}`);
  const pause = await call(member, "PATCH", `/v1/workspaces/${w}/touchpoints/${tpA.id}/status`, { status: "paused" });
  expect(pause.status === 403, `pausar HTTP ${pause.status}`);
  const stillLive = await tap(tpA.publicId, "qr");
  expect(stillLive.status === 200, "el viewer logró afectar el acceso público");
  const leads = await call(member, "GET", `/v1/workspaces/${w}/leads`);
  expect(leads.status === 403, `leads HTTP ${leads.status}`);
  const retire = await call(member, "POST", `/v1/workspaces/${w}/touchpoints/${tpA.id}/retire`);
  expect(retire.status === 403, `retirar HTTP ${retire.status}`);
  const archive = await call(member, "POST", `/v1/workspaces/${w}/experiences/${form.id}/archive`);
  expect(archive.status === 403, `archivar HTTP ${archive.status}`);
  const publishAttempt = await publish(member, w, menu.id);
  expect(publishAttempt.status === 403, `publicar HTTP ${publishAttempt.status}`);
  const availability = await call(member, "GET", `/v1/workspaces/${w}/availability`);
  expect(availability.status === 200, `ver disponibilidad HTTP ${availability.status}`);
  const soldOut = await call(member, "PUT", `/v1/workspaces/${w}/experiences/${menu.id}/availability`, {
    items: [{ itemId: "latte", status: "sold_out", quantity: null }],
  });
  expect(soldOut.status === 403, `cambiar disponibilidad HTTP ${soldOut.status}`);
  const reused = await call(member, "POST", "/v1/invitations/accept", { token: invite.json.token });
  expect(reused.status === 404, `reusar invitación HTTP ${reused.status}`);
});

await step("Viewer: ve el diseño QR y la biblioteca, pero no los modifica", async () => {
  const qrPath = `/v1/workspaces/${w}/touchpoints/${tpA.id}/qr-design`;
  const read = await call(member, "GET", qrPath);
  expect(read.status === 200 && typeof read.json.source === "string", `leer HTTP ${read.status}`);
  const write = await call(member, "PUT", qrPath, { design: qrDesign });
  expect(write.status === 403, `guardar HTTP ${write.status}`);
  const templates = await call(member, "GET", `/v1/workspaces/${w}/qr-templates`);
  expect(templates.status === 200, `listar HTTP ${templates.status}`);
  const create = await call(member, "POST", `/v1/workspaces/${w}/qr-templates`, { name: "Intruso", design: qrDesign });
  expect(create.status === 403, `crear HTTP ${create.status}`);
  const apply = await call(member, "POST", `/v1/workspaces/${w}/qr-templates/${qrTemplate.id}/applications`, { touchpointIds: [tpA.id], groupIds: [] });
  expect(apply.status === 403, `aplicar HTTP ${apply.status}`);
  const groupDesign = await call(member, "PUT", `/v1/workspaces/${w}/touchpoint-groups/${group.id}/qr-design`, { templateId: qrTemplate.id });
  expect(groupDesign.status === 403, `diseño de grupo HTTP ${groupDesign.status}`);
  const exportRecord = await call(member, "POST", `/v1/workspaces/${w}/qr-exports`, { format: "png", items: [{ touchpointId: tpA.id, fingerprint: "d".repeat(64) }] });
  expect(exportRecord.status === 204, `el viewer también puede registrar su impresión HTTP ${exportRecord.status}`);
  const remove = await call(member, "DELETE", `/v1/workspaces/${w}/qr-templates/${qrTemplate.id}`);
  expect(remove.status === 403, `borrar HTTP ${remove.status}`);
  const ownerRemove = await call(owner, "DELETE", `/v1/workspaces/${w}/qr-templates/${qrTemplate.id}`);
  expect(ownerRemove.status === 204, `el owner no pudo borrar HTTP ${ownerRemove.status}`);
});

await step("Transferir la propiedad y recuperarla", async () => {
  // Two steps since the security review of 2026-10-12: the Owner asks, an
  // Admin accepts. A request is canceled when its recipient stops being an
  // Admin, and the recipient hears about it in the bell (domain audit A2-10).
  const roleOf = (list, subject) => list.find((item) => item.profileId === subject)?.role;
  const setRole = (actor, subject, role) =>
    call(actor, "PATCH", `/v1/workspaces/${w}/members/${subject}`, { role });
  const pendingTransfer = async (actor) =>
    (await call(actor, "GET", `/v1/workspaces/${w}/ownership-transfer`)).json;
  const notAdmin = await call(owner, "POST", `/v1/workspaces/${w}/ownership-transfer`, { profileId: member.subject });
  expect(notAdmin.status === 409, `pedir a un viewer HTTP ${notAdmin.status} ${notAdmin.json?.code ?? ""}`);
  expect((await setRole(owner, member.subject, "admin")).status === 200, "hacer admin al member");
  const asked = await call(owner, "POST", `/v1/workspaces/${w}/ownership-transfer`, { profileId: member.subject });
  expect(asked.status === 201 && asked.json.status === "pending", `pedir HTTP ${asked.status} ${asked.json?.code ?? ""}`);
  const bell = await call(member, "GET", "/v1/notifications");
  const items = bell.json?.items ?? bell.json?.notifications ?? [];
  expect(
    items.some((item) => item.title === "Te quieren pasar una organización"),
    "la campana del member no avisó la transferencia",
  );
  expect((await setRole(owner, member.subject, "editor")).status === 200, "bajar a editor");
  expect((await pendingTransfer(owner)) === null, "la solicitud siguió viva tras bajar al destinatario a editor");
  expect((await setRole(owner, member.subject, "admin")).status === 200, "volver a admin");
  const again = await call(owner, "POST", `/v1/workspaces/${w}/ownership-transfer`, { profileId: member.subject });
  expect(again.status === 201, `pedir otra vez HTTP ${again.status} ${again.json?.code ?? ""}`);
  const accepted = await call(member, "POST", `/v1/ownership-transfers/${again.json.id}/accept`);
  expect(accepted.status === 204, `aceptar HTTP ${accepted.status} ${accepted.json?.code ?? ""}`);
  const members = (await call(owner, "GET", `/v1/workspaces/${w}/members`)).json;
  expect(roleOf(members, member.subject) === "owner", "el member no quedó como owner");
  expect(roleOf(members, owner.subject) === "admin", "el owner original no quedó como admin");
  const denied = await call(owner, "POST", `/v1/workspaces/${w}/ownership-transfer`, { profileId: member.subject });
  expect(denied.status === 403, `un admin transfirió HTTP ${denied.status}`);
  const back = await call(member, "POST", `/v1/workspaces/${w}/ownership-transfer`, { profileId: owner.subject });
  expect(back.status === 201, `devolver HTTP ${back.status} ${back.json?.code ?? ""}`);
  const recovered = await call(owner, "POST", `/v1/ownership-transfers/${back.json.id}/accept`);
  expect(recovered.status === 204, `recuperar HTTP ${recovered.status} ${recovered.json?.code ?? ""}`);
  const after = (await call(owner, "GET", `/v1/workspaces/${w}/members`)).json;
  expect(roleOf(after, owner.subject) === "owner", "no se recuperó la propiedad");
  expect((await setRole(owner, member.subject, "viewer")).status === 200, "regresar al member a viewer");
});
await step("Viewer sale del espacio y pierde el acceso", async () => {
  const leave = await call(member, "DELETE", `/v1/workspaces/${w}/members/${member.subject}`);
  expect(leave.status === 204, `salir HTTP ${leave.status} ${leave.json?.code ?? ""}`);
  const read = await call(member, "GET", `/v1/workspaces/${w}/touchpoints`);
  expect(read.status === 403, `tras salir HTTP ${read.status}`);
});
await step("El último Owner no puede abandonar la organización", async () => {
  const leave = await call(owner, "DELETE", `/v1/workspaces/${w}/members/${owner.subject}`);
  expect(leave.status === 409, `HTTP ${leave.status} ${leave.json?.code ?? ""}`);
});

// --- Retire & archive guard ------------------------------------------------------
let loose;
let looseRedirect;
await step("Archivar una página en vivo sin respaldo se rechaza", async () => {
  const created = await call(owner, "POST", `/v1/workspaces/${w}/touchpoints`, {
    operationalName: `Suelto ${run}`,
    physicalType: "card",
  });
  expect(created.status === 201, `crear HTTP ${created.status}`);
  loose = created;
  const redirect = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    targets: { touchpointIds: [loose.json.id], groupIds: [] },
    name: `Redirect ${run}`,
    type: "redirect",
    content: { destinationUrl: "https://example.com/kardo-e2e-redirect" },
  });
  expect(redirect.status === 201, `redirect HTTP ${redirect.status} ${redirect.json?.code ?? ""}`);
  expect((await publish(owner, w, redirect.json.id)).status === 201, "publicar redirect");
  await waitForPublished(owner, w, redirect.json.id, "Redirect");
  await waitForTap(loose.json.publicId, (r) => r.status === 302, "Suelto redirige");
  looseRedirect = redirect.json;
  const refused = await call(owner, "POST", `/v1/workspaces/${w}/experiences/${redirect.json.id}/archive`);
  expect(refused.status === 409 && refused.json.code === "EXPERIENCE_LIVE", `archivar HTTP ${refused.status} ${refused.json?.code ?? ""}`);
});

if (!resolverHasLifecycle) {
  pending("Retirar es definitivo (410) y libera el archivado", "requiere desplegar el Resolver nuevo");
  pending("Página de marca para un QR o etiqueta pausado", "requiere desplegar el Resolver nuevo");
} else {
await step("Retirar es definitivo (410) y libera el archivado", async () => {
  expect(loose && looseRedirect, "falta el QR o etiqueta suelto del paso anterior");
  const retired = await call(owner, "POST", `/v1/workspaces/${w}/touchpoints/${loose.json.id}/retire`);
  expect(retired.status === 200 && retired.json.status === "retired", `retirar HTTP ${retired.status} ${retired.json?.code ?? ""}`);
  const gone = await tap(loose.json.publicId, "qr");
  expect(gone.status === 410, `retirado HTTP ${gone.status}`);
  expect(gone.text.includes("ya no está activo"), "sin página de marca");
  const resume = await call(owner, "PATCH", `/v1/workspaces/${w}/touchpoints/${loose.json.id}/status`, { status: "active" });
  expect(resume.status === 409 && resume.json.code === "TOUCHPOINT_RETIRED", `reactivar HTTP ${resume.status}`);
  const archived = await call(owner, "POST", `/v1/workspaces/${w}/experiences/${looseRedirect.id}/archive`);
  expect(archived.status === 200, `archivar tras retirar HTTP ${archived.status} ${archived.json?.code ?? ""}`);
});

await step("Página de marca para un QR o etiqueta pausado", async () => {
  const paused = await call(owner, "PATCH", `/v1/workspaces/${w}/touchpoints/${tpB.id}/status`, { status: "paused" });
  expect(paused.status === 200, `pausar HTTP ${paused.status}`);
  const page = await tap(tpB.publicId, "qr");
  expect(page.status === 404 && page.text.includes("Temporalmente no disponible"), `HTTP ${page.status}`);
  expect(page.headers.get("x-robots-tag")?.includes("noindex"), "sin noindex");
  const resumed = await call(owner, "PATCH", `/v1/workspaces/${w}/touchpoints/${tpB.id}/status`, { status: "active" });
  expect(resumed.status === 200, `reanudar HTTP ${resumed.status}`);
});
}

// --- Photos: JPEG with EXIF (GPS) is sanitized, used, protected, deleted --------
function jpegWithExif() {
  const segment = (marker, payload) => {
    const length = payload.length + 2;
    return [0xff, marker, (length >> 8) & 0xff, length & 0xff, ...payload];
  };
  const app0 = segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]);
  const gps = [...Buffer.from("Exif\0\0GPS-19.4326-99.1332", "latin1")];
  const app1 = segment(0xe1, gps);
  const sof = segment(0xc0, [0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00]);
  const sos = segment(0xda, [0x01, 0x01, 0x00, 0x00, 0x3f, 0x00]);
  return Buffer.from([0xff, 0xd8, ...app0, ...app1, ...sof, ...sos, 0xaa, 0xbb, 0xff, 0xd9]);
}
const photoStep = "Foto JPEG: se quitan metadatos GPS, se protege mientras se usa y se borra";
if (!assetsHasImages) pending(photoStep, "requiere desplegar el Assets Worker nuevo");
else await step(photoStep, async () => {
  const bytes = jpegWithExif();
  const authorization = await call(owner, "POST", `/v1/workspaces/${w}/assets/upload-authorizations`, {
    filename: `foto-${run}.jpg`,
    mediaType: "image/jpeg",
    byteSize: bytes.byteLength,
  });
  expect(authorization.status === 201, `autorizar HTTP ${authorization.status} ${authorization.json?.code ?? ""}`);
  const upload = await fetch(authorization.json.uploadUrl, {
    method: "PUT",
    headers: { "content-type": "image/jpeg" },
    body: bytes,
  });
  expect(upload.ok, `subir HTTP ${upload.status}`);
  const finalized = await call(owner, "POST", `/v1/workspaces/${w}/assets/${authorization.json.assetId}/finalizations`);
  expect([200, 201].includes(finalized.status) && finalized.json.status === "validated", `finalizar HTTP ${finalized.status} ${finalized.json?.status ?? finalized.json?.code ?? ""}`);
  expect(finalized.json.byteSize < bytes.byteLength, "no se quitaron los metadatos");
  const image = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    targets: { touchpointIds: [batchTouchpoints[0].id], groupIds: [] },
    name: `Foto ${run}`,
    type: "image",
    content: { assetId: authorization.json.assetId, alt: "Foto de prueba" },
  });
  expect(image.status === 201, `experience HTTP ${image.status} ${image.json?.code ?? ""}`);
  const inUse = await call(owner, "DELETE", `/v1/workspaces/${w}/assets/${authorization.json.assetId}`);
  expect(inUse.status === 409 && inUse.json.code === "ASSET_IN_USE", `en uso HTTP ${inUse.status}`);
  const archived = await call(owner, "POST", `/v1/workspaces/${w}/experiences/${image.json.id}/archive`);
  expect(archived.status === 200, `archivar HTTP ${archived.status}`);
  const deleted = await call(owner, "DELETE", `/v1/workspaces/${w}/assets/${authorization.json.assetId}`);
  expect(deleted.status === 204, `borrar HTTP ${deleted.status} ${deleted.json?.code ?? ""}`);
  const library = await call(owner, "GET", `/v1/workspaces/${w}/assets`);
  expect(!library.json.some((asset) => asset.id === authorization.json.assetId), "sigue en la biblioteca");
});

function tinyPng() {
  // 8×8 teal PNG (valid IHDR/IDAT/IEND with real CRCs).
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGPgyqnAihiGlgQAJKE7geROx/IAAAAASUVORK5CYII=",
    "base64",
  );
}
const logoStep = "Logo de Diseño del QR: lectura firmada y se quita del diseño al borrarlo";
if (!assetsHasReads) pending(logoStep, "requiere desplegar el Assets Worker con /content");
else await step(logoStep, async () => {
  const bytes = tinyPng();
  const authorization = await call(owner, "POST", `/v1/workspaces/${w}/assets/upload-authorizations`, {
    filename: `logo-${run}.png`,
    mediaType: "image/png",
    byteSize: bytes.byteLength,
  });
  expect(authorization.status === 201, `autorizar HTTP ${authorization.status}`);
  const upload = await fetch(authorization.json.uploadUrl, { method: "PUT", headers: { "content-type": "image/png" }, body: bytes });
  expect(upload.ok, `subir HTTP ${upload.status}`);
  const logoId = authorization.json.assetId;
  const finalized = await call(owner, "POST", `/v1/workspaces/${w}/assets/${logoId}/finalizations`);
  expect(finalized.json?.status === "validated", `finalizar ${finalized.json?.status ?? finalized.status}`);
  const read = await call(owner, "POST", `/v1/workspaces/${w}/assets/${logoId}/read-authorizations`);
  expect(read.status === 201 && read.json.mediaType === "image/png", `autorizar lectura HTTP ${read.status}`);
  const image = await fetch(read.json.url, { headers: { origin: "http://localhost:5175" } });
  expect(image.ok && image.headers.get("content-type") === "image/png", `leer HTTP ${image.status}`);
  expect(image.headers.get("access-control-allow-origin") === "http://localhost:5175", "sin CORS para el panel");
  await image.arrayBuffer();
  const tampered = new URL(read.json.url);
  tampered.searchParams.set("expires", String(Number(tampered.searchParams.get("expires")) + 30));
  const forged = await fetch(tampered);
  expect(forged.status === 401, `firma alterada HTTP ${forged.status}`);
  await forged.arrayBuffer();
  const qrPath = `/v1/workspaces/${w}/touchpoints/${tpA.id}/qr-design`;
  const withLogo = { ...qrDesign, logo: { ...qrDesign.logo, source: "asset", assetId: logoId } };
  const saved = await call(owner, "PUT", qrPath, { design: withLogo });
  expect(saved.status === 200, `guardar con logo HTTP ${saved.status} ${saved.json?.code ?? ""}`);
  const deleted = await call(owner, "DELETE", `/v1/workspaces/${w}/assets/${logoId}`);
  expect(deleted.status === 204, `borrar logo HTTP ${deleted.status} ${deleted.json?.code ?? ""}`);
  const after = await call(owner, "GET", qrPath);
  expect(after.json.design.logo === null && after.json.design.frame.icon === "menu", "el diseño no soltó el logo borrado");
});

// --- Links: a separate, shareable product -----------------------------------------
let shareLink;
// Links redesign (owner, 2026-10-04): a Link is one more Touchpoint that
// shows any page at <negocio>/<link>; it is only created through
// POST …/links with its address and its page, never in a group (domain
// audit A9-19). The old «producto aparte» and @handle checks are gone.
const linkPageContent = {
  displayName: `Café E2E ${run}`,
  bio: "Café de especialidad",
  socials: [
    { id: "ig", network: "instagram", value: "https://www.instagram.com/kardo" },
    { id: "mail", network: "email", value: "hola@kardo.test" },
  ],
  links: [{ id: "menu", label: "Ver menú", url: "https://example.com/menu", highlight: true }],
  theme: {
    background: { kind: "gradient", color: "#08293d", colorTo: "#0d637d", angle: 135 },
    surface: "dark",
    accent: "#8ce0dc",
    buttonStyle: "pill",
    font: "serif",
  },
};
let linkPage;
let linkPath;
await step("Links: un link muestra cualquier página, con su dirección y sin grupos", async () => {
  const spaces = (await call(owner, "GET", "/v1/workspaces")).json ?? [];
  let businessSlug = spaces.find((item) => item.id === w)?.slug ?? null;
  if (!businessSlug) {
    const chosen = await call(owner, "PUT", `/v1/workspaces/${w}/slug`, { slug: `e2e-kardo-${run}` });
    expect(chosen.status === 200, `dirección del negocio HTTP ${chosen.status} ${chosen.json?.code ?? ""}`);
    businessSlug = chosen.json.slug;
  }
  const page = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    name: `Página ${run}`,
    type: "linkpage",
    content: linkPageContent,
  });
  expect(page.status === 201, `página HTTP ${page.status} ${page.json?.code ?? ""}`);
  linkPage = { id: page.json.id, name: `Página ${run}`, content: linkPageContent };
  const linkSlug = `e2e-${run}`;
  const created = await call(owner, "POST", `/v1/workspaces/${w}/links`, {
    experienceId: page.json.id,
    slug: linkSlug,
  });
  expect(created.status === 201 && created.json.kind === "link", `crear HTTP ${created.status} ${created.json?.code ?? ""}`);
  shareLink = created.json;
  linkPath = `/${businessSlug}/${linkSlug}`;
  const generic = await call(owner, "POST", `/v1/workspaces/${w}/touchpoints`, {
    operationalName: "Link con grupo",
    kind: "link",
    groupId: group.id,
  });
  expect(generic.status === 400, `link por la ruta de QR HTTP ${generic.status}`);
  const menuOnLink = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    targets: { touchpointIds: [shareLink.id], groupIds: [] },
    name: "Carta en un Link",
    type: "menu",
    content: menuContent(9),
  });
  expect(menuOnLink.status === 201, `carta en un Link HTTP ${menuOnLink.status} ${menuOnLink.json?.code ?? ""}`);
  const badIcon = await call(owner, "POST", `/v1/workspaces/${w}/experiences`, {
    name: "Ícono falso",
    type: "linkpage",
    content: { displayName: "X", socials: [{ id: "ig", network: "instagram", value: "https://evil.example/login" }], links: [] },
  });
  expect(badIcon.status === 400, `ícono a otro dominio HTTP ${badIcon.status}`);
  const switched = await call(owner, "PATCH", `/v1/workspaces/${w}/touchpoints/${shareLink.id}`, {
    operationalName: shareLink.operationalName,
    kind: "qr",
  });
  expect(switched.status === 400, `convertir Link en QR HTTP ${switched.status}`);
});

const linkStep = "Página de enlaces publicada en un link con redes y tema";
if (!resolverHasLinks) pending(linkStep, "requiere desplegar el Resolver y el Publisher nuevos");
else await step(linkStep, async () => {
  expect(linkPage && linkPath, "falta el Link del paso anterior");
  expect((await publish(owner, w, linkPage.id)).status === 201, "publicar página");
  await waitForPublished(owner, w, linkPage.id, "Página de enlaces");
  let served;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${resolver}${linkPath}`, { redirect: "manual" });
    served = { status: response.status, text: await response.text() };
    if (served.status === 200 && served.text.includes(`Café E2E ${run}`)) break;
    await sleep(3_000);
  }
  expect(served.status === 200 && served.text.includes(`Café E2E ${run}`), `link HTTP ${served?.status}`);
  // Socials never carry a raw href: they go through the tracked route, which
  // redirects to mailto:/tel: (the click is counted, no open redirect).
  const mailHref = /href="([^"]*\/go\/mail[^"]*)"/.exec(served.text)?.[1]?.replaceAll("&amp;", "&");
  expect(mailHref, "sin enlace de correo");
  const mail = await fetch(new URL(mailHref, resolver), { redirect: "manual" });
  await mail.body?.cancel();
  expect(
    mail.status === 302 && mail.headers.get("location") === "mailto:hola%40kardo.test",
    `correo HTTP ${mail.status} → ${mail.headers.get("location")}`,
  );
  const unknown = await fetch(`${resolver}${linkPath}-no-existe`);
  await unknown.body?.cancel();
  expect(unknown.status === 404, `link inexistente HTTP ${unknown.status}`);
  return `${resolver}${linkPath}`;
});

// --- Estudio de Experiences: modo HTML (ADR 018, adenda 2026-09-29) ---------------
// The Estudio release serves the OFL fonts at /_fonts/* (older Resolvers 404).
const resolverHasStudio = await (async () => {
  const response = await fetch(`${resolver}/_fonts/geist/Geist-400.woff2`);
  await response.body?.cancel();
  return response.status === 200;
})();
const htmlStep = "Modo HTML: se limpia, se sirve aislado con el pie de Kardo y mide sus enlaces";
if (!resolverHasLinks || !resolverHasStudio) pending(htmlStep, "requiere desplegar el Resolver y el Publisher del Estudio");
else await step(htmlStep, async () => {
  expect(linkPage && linkPath, "falta la Página de enlaces del paso anterior");
  const marker = `HTML propio ${run}`;
  const html = [
    '<main class="pagina">',
    "<kardo-profile></kardo-profile>",
    `<h2 onclick="alert(1)">${marker}</h2>`,
    "<kardo-links></kardo-links>",
    `<p><a href="https://example.com/html-${run}">Sitio</a></p>`,
    '<img src="https://evil.example/x.png" alt="externa">',
    "<script>alert(1)</script>",
    "</main>",
  ].join("");
  const css = `.pagina{font-family:"Playfair Display",serif;background:#fdf6ec}.fija{position:fixed}.bg{background:url(https://evil.example/bg.png)}`;
  const saved = await call(owner, "PATCH", `/v1/workspaces/${w}/experiences/${linkPage.id}`, {
    name: linkPage.name,
    content: { ...linkPage.content, customHtml: { schema: 1, active: true, html, css } },
  });
  expect(saved.status === 200, `guardar HTML HTTP ${saved.status} ${saved.json?.code ?? ""}`);
  expect((await publish(owner, w, linkPage.id)).status === 201, "publicar HTML");
  await waitForPublished(owner, w, linkPage.id, "Página con HTML");
  let served;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${resolver}${linkPath}`, { redirect: "manual" });
    served = { status: response.status, headers: response.headers, text: await response.text() };
    if (served.status === 200 && served.text.includes(marker)) break;
    await sleep(3_000);
  }
  expect(served.status === 200 && served.text.includes(marker), `link HTTP ${served?.status}`);
  const page = served.text;
  expect(page.includes('<template shadowrootmode="open">'), "sin shadow root declarativo");
  expect(!/<script|onclick|evil\.example|position:\s*fixed/i.test(page), "quedó código peligroso en la página");
  const hostAt = page.indexOf('class="kd-custom-host"');
  const footerAt = page.indexOf('<footer class="kd-footer');
  expect(
    hostAt >= 0 && footerAt > hostAt && footerAt > page.lastIndexOf("</template>"),
    "el pie de Kardo no quedó fuera del HTML del cliente",
  );
  expect(page.includes("/_fonts/playfair-display/"), "sin la fuente Playfair servida por Kardo");
  expect(
    (served.headers.get("content-security-policy") ?? "").includes("font-src 'self'"),
    "la CSP no permite las fuentes de Kardo",
  );
  // A hand-written https link is tracked like a button (and normalized).
  const goHref = /href="([^"]*\/go\/h1[^"]*)"/.exec(page)?.[1]?.replaceAll("&amp;", "&");
  expect(goHref, "el enlace del HTML no pasa por /go/");
  const go = await fetch(new URL(goHref, resolver), { redirect: "manual" });
  await go.body?.cancel();
  expect(
    go.status === 302 && go.headers.get("location") === `https://example.com/html-${run}`,
    `enlace HTTP ${go.status} → ${go.headers.get("location")}`,
  );
  const font = await fetch(`${resolver}/_fonts/playfair-display/PlayfairDisplay-400.woff2`);
  await font.body?.cancel();
  expect(font.status === 200, `fuente HTTP ${font.status}`);
  return `${resolver}${linkPath}`;
});

// --- Estudio: lienzo libre y botón de marca (ADR 018, adenda 2) --------------------
// Publishes a schema 2 design (a canvas with a heading, a WhatsApp button and a
// shape) over the same Página de enlaces, with its HTML turned off. An older
// Publisher rejects schema 2, so a failed publication means "not deployed yet".
const canvasStep = "Lienzo libre y botón de marca: se publican, se sirven escalables y miden sus clics";
if (!resolverHasLinks || !resolverHasStudio) pending(canvasStep, "requiere desplegar el Resolver y el Publisher del Estudio");
else {
  const canvasMarker = `Lienzo ${run}`;
  let canvasPublished = false;
  let canvasError = "";
  try {
    expect(linkPage && linkPath, "falta la Página de enlaces del paso anterior");
    const design = {
      schema: 2,
      style: {
        palette: { background: "#fbe9e4", surface: "#ffffff", text: "#4a1f2a", muted: "#7a3a48", accent: "#e0627d" },
        fonts: { heading: "playfair", body: "dm-sans" },
        radius: 16,
        buttonStyle: "solid",
        buttonShape: "pill",
        shadow: "soft",
        background: { kind: "solid", color: "#fbe9e4" },
        maxWidth: 560,
      },
      sections: [
        {
          id: "s1",
          layout: "1",
          columns: [[
            { id: "ph", kind: "profileHeader", layout: "stacked", avatarShape: "circle" },
            { id: "cl", kind: "contentLinks", layout: "list" },
          ]],
          paddingTop: 24,
          paddingBottom: 16,
          gap: 16,
          align: "center",
        },
        {
          id: "c1",
          kind: "canvas",
          height: 420,
          background: { kind: "gradient", color: "#fbe9e4", colorTo: "#f6d5cf", angle: 170 },
          items: [
            { block: { id: "h1", kind: "heading", text: canvasMarker, level: 2 }, x: 24, y: 32, w: 342 },
            { block: { id: "sh1", kind: "shape", shape: "ellipse", fill: "accent" }, x: 250, y: 120, w: 110, h: 110, z: 1 },
            {
              block: { id: "wa1", kind: "brandButton", brand: "whatsapp", label: "Escríbenos", href: "https://wa.me/525512345678", look: "brand" },
              x: 24,
              y: 300,
              w: 342,
              z: 2,
            },
          ],
        },
      ],
    };
    const saved = await call(owner, "PATCH", `/v1/workspaces/${w}/experiences/${linkPage.id}`, {
      name: linkPage.name,
      content: { ...linkPage.content, design },
    });
    expect(saved.status === 200, `guardar diseño HTTP ${saved.status} ${saved.json?.code ?? ""}`);
    expect((await publish(owner, w, linkPage.id)).status === 201, "publicar diseño");
    await waitForPublished(owner, w, linkPage.id, "Página con lienzo");
    canvasPublished = true;
  } catch (error) {
    canvasError = error.message;
  }
  if (!canvasPublished && canvasError.includes("la publicación falló"))
    pending(canvasStep, "requiere desplegar el Resolver y el Publisher del lienzo (diseño esquema 2)");
  else
    await step(canvasStep, async () => {
      if (!canvasPublished) throw new Error(canvasError);
      let served;
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const response = await fetch(`${resolver}${linkPath}`, { redirect: "manual" });
        served = { status: response.status, text: await response.text() };
        if (served.status === 200 && served.text.includes(canvasMarker)) break;
        await sleep(3_000);
      }
      expect(served.status === 200 && served.text.includes(canvasMarker), `link HTTP ${served?.status}`);
      const page = served.text;
      expect(page.includes('class="kd-sec kd-canvas kd-canvas-1"'), "sin la sección lienzo");
      expect(page.includes("--u:calc(100cqw / 390)"), "el lienzo no escala con su ancho");
      // Reading order in the HTML: heading, shape, then the button.
      expect(
        page.indexOf('data-item-id="h1"') < page.indexOf('data-item-id="sh1"') &&
          page.indexOf('data-item-id="sh1"') < page.indexOf('data-item-id="wa1"'),
        "el HTML no sigue el orden de lectura",
      );
      expect(page.includes("kd-brand kd-brand--brand"), "sin el botón de marca");
      const goHref = /href="([^"]*\/go\/wa1[^"]*)"/.exec(page)?.[1]?.replaceAll("&amp;", "&");
      expect(goHref, "el botón de marca no pasa por /go/");
      const go = await fetch(new URL(goHref, resolver), { redirect: "manual" });
      await go.body?.cancel();
      expect(
        go.status === 302 && go.headers.get("location") === "https://wa.me/525512345678",
        `botón de marca HTTP ${go.status} → ${go.headers.get("location")}`,
      );
      return `${resolver}${linkPath}`;
    });
}

// --- Estudio para todas las Experiences (ADR 018, adenda 3) ------------------------
// Designs the group's Menú (a canvas hero with a shape, the menu split in two
// blocks, the blurred backdrop and margins) and checks Mesa B serves it with
// the Kardo logo footer. An older Publisher rejects a design on a Menú, so a
// failed publication means "not deployed yet".
const menuDesignStep = "Menú diseñado en el Estudio: se publica con fondo difuminado, menú partido y logo de Kardo al pie";
if (!resolverHasStudio) pending(menuDesignStep, "requiere desplegar el Resolver y el Publisher del Estudio");
else {
  const designedTitle = `Menu E2E ${run} diseñado`;
  let menuDesigned = false;
  let menuDesignError = "";
  try {
    expect(menu, "falta el Menú del grupo");
    const design = {
      schema: 2,
      style: {
        palette: { background: "#fbf1e6", surface: "#ffffff", text: "#2b1c14", muted: "#8a7362", accent: "#c1481d" },
        fonts: { heading: "playfair", body: "lora" },
        radius: 18,
        buttonStyle: "solid",
        buttonShape: "pill",
        shadow: "soft",
        background: { kind: "solid", color: "#fbf1e6" },
        maxWidth: 640,
        ambient: { kind: "auto", strength: 60 },
        pagePadding: 20,
      },
      sections: [
        {
          id: "hero",
          kind: "canvas",
          height: 240,
          items: [
            { block: { id: "blob", kind: "shape", shape: "blob", fill: "accent", fillTo: "#f4a261", angle: 135 }, x: 230, y: 20, w: 150, h: 150, r: 12 },
            { block: { id: "hero-title", kind: "contentTitle" }, x: 20, y: 70, w: 230 },
          ],
        },
        {
          id: "carta",
          layout: "1",
          columns: [[
            { id: "m-bebidas", kind: "menu", layout: "cards", photos: "small", sectionStyle: "pill", priceStyle: "accent", sectionIds: ["bebidas"] },
          ]],
          paddingTop: 16,
          paddingBottom: 32,
          gap: 16,
          align: "start",
        },
      ],
    };
    const saved = await call(owner, "PATCH", `/v1/workspaces/${w}/experiences/${menu.id}`, {
      name: menu.name,
      content: { ...menuContent(3), title: designedTitle, design },
    });
    expect(saved.status === 200, `guardar diseño HTTP ${saved.status} ${saved.json?.code ?? ""}`);
    expect((await publish(owner, w, menu.id)).status === 201, "publicar diseño");
    await waitForPublished(owner, w, menu.id, "Menú diseñado");
    menuDesigned = true;
  } catch (error) {
    menuDesignError = error.message;
  }
  if (!menuDesigned && menuDesignError.includes("la publicación falló"))
    pending(menuDesignStep, "requiere desplegar el Resolver y el Publisher de la adenda 3 (diseño en Menú)");
  else
    await step(menuDesignStep, async () => {
      if (!menuDesigned) throw new Error(menuDesignError);
      const served = await waitForTap(
        tpB.publicId,
        (r) => r.status === 200 && r.text.includes(designedTitle),
        `${tpB.operationalName} (Menú diseñado)`,
      );
      const page = served.text;
      expect(page.includes('class="kd-menu"'), "sin el bloque de menú");
      expect(page.includes("Latte"), "el menú no muestra sus platillos");
      expect(page.includes("kd-ambient"), "sin el fondo difuminado");
      expect(page.includes("kd-footer"), "sin el pie de Kardo");
      expect(/<footer class="kd-footer[^>]*>[\s\S]*?<path/.test(page), "el pie no lleva el logo en trazos");
      expect(page.includes("--kd-pad"), "sin los márgenes de la página");
      expect(served.headers.get("content-security-policy")?.includes("default-src 'none'"), "sin CSP estricta");
      return `${resolver}/t/${tpB.publicId}`;
    });
}

// --- Analytics ------------------------------------------------------------------
await step("Analítica registra los accesos por canal (Analytics Engine)", async () => {
  let summary;
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const response = await call(owner, "GET", `/v1/workspaces/${w}/analytics/summary?days=7&tz=America%2FMexico_City`);
    expect(response.status === 200, `HTTP ${response.status}`);
    summary = response.json;
    if (summary.source === "analytics_engine" && summary.totals.channels.qr > 0 && summary.totals.clicks > 0) break;
    await sleep(10_000);
  }
  expect(summary.source === "analytics_engine", `fuente ${summary.source}`);
  expect(summary.totals.channels.qr > 0 && summary.totals.channels.nfc > 0, `qr ${summary.totals.channels.qr} nfc ${summary.totals.channels.nfc}`);
  expect(summary.totals.leads >= 1, `leads ${summary.totals.leads}`);
  expect(summary.weekdayHour?.length === 7, "sin mapa día×hora");
  expect(summary.kpis?.taps?.value === summary.totals.taps, "indicadores del servidor ausentes o inconsistentes");
  expect(summary.previousDaily?.length === summary.daily.length, "sin serie diaria del periodo anterior");
  return `accesos ${summary.totals.taps} (NFC ${summary.totals.channels.nfc}, QR ${summary.totals.channels.qr}, URL ${summary.totals.channels.link}), clics ${summary.totals.clicks}, leads ${summary.totals.leads}`;
});

await step("Resumen: tablero personal (guardar, aislado y restablecer)", async () => {
  const base = `/v1/workspaces/${w}/dashboard`;
  const layout = {
    version: 1,
    widgets: [
      { id: "kpi-taps", type: "kpi", x: 0, y: 0, w: 3, h: 2, config: { metric: "taps" } },
      { id: `trend-${run}`, type: "trend", x: 0, y: 2, w: 8, h: 5, config: { metric: "clicks", compare: true } },
    ],
  };
  const saved = await call(owner, "PUT", base, { layout });
  expect(saved.status === 200 && saved.json.layout?.widgets?.length === 2, `PUT HTTP ${saved.status}`);
  const read = await call(owner, "GET", base);
  expect(read.json.layout?.widgets?.[1]?.config?.metric === "clicks", "no se guardaron las opciones del widget");
  const outsider = await call(member, "GET", base);
  expect(outsider.status === 403, `otro usuario lee HTTP ${outsider.status}`);
  const outsiderWrite = await call(member, "PUT", base, { layout });
  expect(outsiderWrite.status === 403, `otro usuario escribe HTTP ${outsiderWrite.status}`);
  const invalid = await call(owner, "PUT", base, { layout: { version: 1, widgets: [{ ...layout.widgets[0], w: 13 }] } });
  expect(invalid.status === 400, `layout inválido HTTP ${invalid.status}`);
  const reset = await call(owner, "DELETE", base);
  expect(reset.status === 204, `DELETE HTTP ${reset.status}`);
  const after = await call(owner, "GET", base);
  expect(after.json.layout === null, "no se restableció el tablero");
});

const failed = results.filter((result) => !result.ok);
const pendingSteps = results.filter((result) => result.pending);
const passed = results.length - failed.length - pendingSteps.length;
console.log(
  `\n${passed}/${results.length} comprobaciones OK${pendingSteps.length ? `, ${pendingSteps.length} pendientes de despliegue` : ""} en ${Math.round((Date.now() - started) / 1000)}s`,
);
fs.writeFileSync(
  path.join(process.env.E2E_REPORT_DIR ?? root, `e2e-report-${run}.json`),
  JSON.stringify({ run, api, resolver, results }, null, 2),
);
process.exit(failed.length ? 1 : 0);
