// Creates (or reuses) the test QR the status Worker scans every minute
// (ADR 022 §4): a QR Touchpoint "Prueba de estado de Kardo" showing a links
// page whose title is the marker the Worker looks for. Run it once per
// environment with a Kardo-owned account, then mark that organization as
// internal in Operations so billing never pauses it.
//
//   read -s STATUS_PROBE_PASSWORD; export STATUS_PROBE_PASSWORD
//   STATUS_PROBE_EMAIL=estado@tu-dominio STATUS_PROBE_WORKSPACE="Kardo interno" \
//     node scripts/dev/status-probe-touchpoint.mjs
//
// Prints only the two values for the Worker (public id and marker); never the
// password or the session.
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
const env = Object.fromEntries(
  Object.entries(rawEnv).map(([key, value]) => [
    key,
    value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => rawEnv[name] ?? ""),
  ]),
);
const supabaseUrl = env.VITE_SUPABASE_URL;
const publishableKey = env.VITE_SUPABASE_PUBLISHABLE_KEY;
const api = (process.env.STATUS_PROBE_API_URL ?? env.VITE_CUSTOMER_API_URL ?? "http://localhost:3001").replace(/\/$/, "");
const resolver = (env.TAP_RESOLVER_URL ?? env.VITE_TAP_RESOLVER_URL).replace(/\/$/, "");
const email = process.env.STATUS_PROBE_EMAIL;
const password = process.env.STATUS_PROBE_PASSWORD;
const workspaceName = process.env.STATUS_PROBE_WORKSPACE;

const NAME = "Prueba de estado de Kardo";
const MARKER = "Kardo estado OK";

if (!email || !password) {
  console.error("Faltan STATUS_PROBE_EMAIL y STATUS_PROBE_PASSWORD (en el entorno, no en .env).");
  process.exit(1);
}

async function call(token, method, route, body, headers = {}) {
  const response = await fetch(`${api}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
}

const session = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: publishableKey, "content-type": "application/json" },
  body: JSON.stringify({ email, password }),
});
if (!session.ok) {
  console.error(`No se pudo iniciar sesión (HTTP ${session.status}).`);
  process.exit(1);
}
const token = (await session.json()).access_token;

const workspaces = (await call(token, "GET", "/v1/workspaces")).json ?? [];
const workspace = workspaceName
  ? workspaces.find((item) => item.name === workspaceName)
  : workspaces.find((item) => item.kind === "organization" && item.role === "owner");
if (!workspace) {
  console.error("No encontré la organización (STATUS_PROBE_WORKSPACE) donde eres Owner.");
  process.exit(1);
}
const base = `/v1/workspaces/${workspace.id}`;

const touchpoints = (await call(token, "GET", `${base}/touchpoints`)).json;
const list = Array.isArray(touchpoints) ? touchpoints : (touchpoints?.items ?? []);
let touchpoint = list.find((item) => item.operationalName === NAME && item.status !== "retired");
if (!touchpoint) {
  const created = await call(token, "POST", `${base}/touchpoints`, { operationalName: NAME, kind: "qr" });
  if (created.status !== 201) {
    console.error(`No se pudo crear el Touchpoint (HTTP ${created.status} ${created.json?.code ?? ""}).`);
    process.exit(1);
  }
  touchpoint = created.json;
}

const experiences = (await call(token, "GET", `${base}/experiences`)).json ?? [];
let experience = experiences.find((item) => item.name === NAME);
if (!experience) {
  const created = await call(token, "POST", `${base}/experiences`, {
    name: NAME,
    type: "links",
    targets: { touchpointIds: [touchpoint.id], groupIds: [] },
    content: {
      title: MARKER,
      links: [{ id: "kardo", label: "Kardo", url: "https://kardo.mx/" }],
    },
  });
  if (created.status !== 201) {
    console.error(`No se pudo crear la Experience (HTTP ${created.status} ${created.json?.code ?? ""}).`);
    process.exit(1);
  }
  experience = created.json;
}

if (experience.publicationStatus !== "published") {
  const intent = await call(token, "POST", `${base}/experiences/${experience.id}/publication-intents`, undefined, {
    "idempotency-key": randomUUID(),
  });
  if (intent.status !== 201) {
    console.error(`No se pudo publicar (HTTP ${intent.status} ${intent.json?.code ?? ""}).`);
    process.exit(1);
  }
}

// The Resolver should answer with the marker within a few minutes.
const deadline = Date.now() + 240_000;
let found = false;
while (Date.now() < deadline) {
  const page = await fetch(`${resolver}/t/${touchpoint.publicId}?src=qr`, {
    headers: { "user-agent": "KardoStatusBot/1.0" },
  });
  if (page.status === 200 && (await page.text()).includes(MARKER)) {
    found = true;
    break;
  }
  await new Promise((resolve) => setTimeout(resolve, 5_000));
}
if (!found) {
  console.error("El Resolver todavía no muestra la página de prueba. Revisa la publicación en el panel.");
  process.exit(1);
}

console.log(`Listo. En wrangler.jsonc del status-worker (vars):
  "STATUS_PROBE_PUBLIC_ID": "${touchpoint.publicId}",
  "STATUS_PROBE_MARKER": "${MARKER}"
Después marca la organización «${workspace.name}» como interna en Operations para que el cobro nunca la pause.`);
