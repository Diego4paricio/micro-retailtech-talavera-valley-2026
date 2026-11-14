// Deploys Customer API and Staff API as two separate Cloud Run services
// (ADR 009/010/011): separate service accounts, separate secrets, separate
// CORS origins. Secret values are read from the git-ignored .env and passed
// to gcloud through stdin only — never as arguments, never printed.
//
// Usage:
//   node scripts/deploy/cloud-run.mjs --project <gcp-project-id> \
//     [--region us-east4] [--suffix dev] \
//     [--app-origin https://kardo-app-dev.pages.dev] \
//     [--ops-origin https://kardo-ops-dev.pages.dev] \
//     [--only customer-api|staff-api] [--dry-run]
//
// Requires: gcloud (authenticated: `gcloud auth login`) and a project with
// billing enabled. Cloud Run scales to zero (min instances 0).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const args = parseArgs(process.argv.slice(2));
const project = args.project;
if (!project) fail("Falta --project <id del proyecto de Google Cloud>.");
const region = args.region ?? "us-east4";
const suffix = args.suffix ?? "dev";
const appOrigin = args["app-origin"] ?? `https://kardo-app-${suffix}.pages.dev`;
const opsOrigin = args["ops-origin"] ?? `https://kardo-ops-${suffix}.pages.dev`;
const dryRun = Boolean(args["dry-run"]);
const only = args.only;

const env = readEnv();
if (env.KARDO_ENV === "production" && suffix !== "prod") {
  fail("El .env apunta a producción pero el sufijo no es prod: revisa antes de desplegar.");
}

/** Non-secret settings shared by both services. */
const common = {
  // "production" only for the prod suffix: it hides the Customer API's
  // /openapi.json (security review 2026-10). TAP_ANALYTICS_ENVIRONMENT is
  // sent on its own below, so the analytics rows do not depend on this.
  KARDO_ENV: suffix === "prod" ? "production" : "test",
  LOG_LEVEL: "info",
  // Cloud Run's front end appends the real client IP (rate limits).
  TRUST_PROXY_HOPS: "1",
  SUPABASE_JWT_ISSUER: required("SUPABASE_JWT_ISSUER"),
  SUPABASE_JWT_AUDIENCE: env.SUPABASE_JWT_AUDIENCE ?? "authenticated",
  TAP_RESOLVER_URL: required("TAP_RESOLVER_URL"),
  PUBLISHER_URL: required("PUBLISHER_URL"),
  CLOUDFLARE_ACCOUNT_ID: required("CLOUDFLARE_ACCOUNT_ID"),
  TAP_ANALYTICS_DATASET: required("TAP_ANALYTICS_DATASET"),
  TAP_ANALYTICS_ENVIRONMENT: required("TAP_ANALYTICS_ENVIRONMENT"),
  // Optional: where Links live (production: https://kardo.com.mx).
  ...(env.LINKS_BASE_URL ? { LINKS_BASE_URL: env.LINKS_BASE_URL } : {}),
};

/** Optional settings: only the ones present in .env are sent. */
const pick = (keys) =>
  Object.fromEntries(keys.filter((key) => env[key]).map((key) => [key, env[key]]));

// Suscripciones (ADR 019/020). Nothing billing-related is sent when .env has
// no STRIPE_SECRET_KEY: the endpoints then answer 503 BILLING_UNAVAILABLE.
// BILLING_DELETE_ENABLED stays "false": the deletion job exists (ADR 020,
// addendum of 2026-10-01) but turning it on is the owner's decision, after
// the lawyer ("dry-run" first, then "true").
const billingEnv = env.STRIPE_SECRET_KEY
  ? {
      BILLING_DELETE_ENABLED: "false",
      ...pick([
        "STRIPE_TAX_RATE_ID",
        "STRIPE_REQUIRE_TERMS_CONSENT",
        "STRIPE_BRAND_LOGO_FILE_ID",
        "STRIPE_BRAND_ICON_FILE_ID",
        "BILLING_EMAIL_FROM",
        "BILLING_TERMS_URL",
        "BILLING_TRIAL_DAYS",
        "BILLING_TRIAL_PLAN",
      ]),
    }
  : {};
const optionalSecrets = (keys) => keys.filter((key) => env[key]);

// IA de Kardo (ADR 018) and «Pregúntale a Kardo»: only with an API key. The
// development bridge (CUSTOM_HTML_AI_PROVIDER=dev-bridge, KARDO_AI_BRIDGE_DIR)
// never leaves this machine.
if (env.CUSTOM_HTML_AI_PROVIDER === "dev-bridge") {
  console.log("Aviso: CUSTOM_HTML_AI_PROVIDER=dev-bridge no se despliega; la nube usa la API key.");
}
const aiEnv = env.ANTHROPIC_API_KEY
  ? pick([
      "CUSTOM_HTML_AI_MODEL",
      "CUSTOM_HTML_AI_ENABLED",
      "CUSTOM_HTML_AI_DAILY_BUDGET_USD",
      "HELP_ASSISTANT_MODEL",
    ])
  : {};

const services = [
  {
    name: "customer-api",
    service: `kardo-customer-api-${suffix}`,
    account: `kardo-customer-api-${suffix}`,
    // IA de Kardo (relevo 29, 2026-10-03): a design takes from under a
    // minute to a few (adaptive thinking, up to 3 turns) and keeps running
    // when the customer reloads or leaves the Estudio, so the request may
    // last longer than 60 s and the work must keep its CPU after the
    // browser goes away (instance-based billing).
    timeoutSeconds: 300,
    cpuAlwaysAllocated: true,
    env: {
      ...common,
      CUSTOMER_API_HOST: "0.0.0.0",
      CUSTOMER_API_PORT: "8080",
      CUSTOMER_APP_ORIGIN: appOrigin,
      ASSET_WORKER_URL: required("ASSET_WORKER_URL"),
      LEAD_EMAIL_AVAILABLE: env.LEAD_EMAIL_AVAILABLE ?? "false",
      ...(env.INVITATION_EMAIL_FROM ? { INVITATION_EMAIL_FROM: env.INVITATION_EMAIL_FROM } : {}),
      ...billingEnv,
      ...aiEnv,
    },
    secrets: [
      "SUPABASE_DATABASE_URL",
      "ASSET_UPLOAD_SIGNING_KEY",
      "PUBLISH_COMMAND_KEY",
      "CLOUDFLARE_ANALYTICS_API_TOKEN",
      "LEAD_WEBHOOK_KEY",
      ...(env.RESEND_API_KEY ? ["RESEND_API_KEY"] : []),
      // IA de Kardo and the service status Worker's readiness probe (ADR 022).
      ...optionalSecrets(["ANTHROPIC_API_KEY", "STATUS_PROBE_KEY"]),
      // The webhook secret must be the one of the Stripe endpoint of this
      // environment, never the `stripe listen` one from local development.
      ...(env.STRIPE_SECRET_KEY
        ? optionalSecrets([
            "STRIPE_SECRET_KEY",
            "STRIPE_WEBHOOK_SECRET",
            "BILLING_CRON_KEY",
            "BILLING_COMMAND_KEY",
            // ADR 020 §6, phase 2: downloads of CFDI issued with Facturapi.
            "FACTURAPI_KEY",
          ])
        : []),
    ],
  },
  {
    name: "staff-api",
    service: `kardo-staff-api-${suffix}`,
    account: `kardo-staff-api-${suffix}`,
    env: {
      ...common,
      STAFF_API_HOST: "0.0.0.0",
      STAFF_API_PORT: "8080",
      OPERATIONS_APP_ORIGIN: opsOrigin,
      ...(env.STRIPE_SECRET_KEY ? { BILLING_DELETE_ENABLED: "false" } : {}),
      // Service status (ADR 022): the Worker's address, with its key below.
      ...(env.STATUS_URL && env.STATUS_COMMAND_KEY ? { STATUS_URL: env.STATUS_URL } : {}),
      // Kardo pieces (ADR 026): the activation card's QR goes to the site's
      // /activar/. The same site address the panel builds with.
      ...((env.WEBSITE_URL ?? env.VITE_WEBSITE_URL)
        ? { WEBSITE_URL: env.WEBSITE_URL ?? env.VITE_WEBSITE_URL }
        : {}),
    },
    secrets: [
      "STAFF_DATABASE_URL",
      "SUSPENSION_COMMAND_KEY",
      "PUBLISH_COMMAND_KEY",
      "CLOUDFLARE_ANALYTICS_API_TOKEN",
      ...(env.STATUS_URL ? optionalSecrets(["STATUS_COMMAND_KEY"]) : []),
      // Its own restricted Stripe key in production (runbook 16); resuming
      // paused pages after a courtesy or the internal mark needs the billing
      // pause key too.
      ...(env.STRIPE_SECRET_KEY
        ? optionalSecrets(["STRIPE_SECRET_KEY", "BILLING_COMMAND_KEY", "FACTURAPI_KEY"])
        : []),
    ],
  },
].filter((item) => !only || item.name === only);

// Guard: the Customer API must never receive a staff-only secret.
const customer = services.find((item) => item.name === "customer-api");
if (
  customer?.secrets.some((key) =>
    ["STAFF_DATABASE_URL", "SUSPENSION_COMMAND_KEY", "STATUS_COMMAND_KEY"].includes(key),
  )
) {
  fail("La Customer API no puede recibir secretos de staff.");
}

console.log(`Proyecto ${project} · región ${region} · sufijo ${suffix}${dryRun ? " · SIMULACIÓN" : ""}`);
console.log(`Orígenes: panel ${appOrigin} · Operations ${opsOrigin}\n`);

step("Habilitar APIs de Google Cloud", () =>
  gcloud([
    "services", "enable",
    "run.googleapis.com", "cloudbuild.googleapis.com",
    "artifactregistry.googleapis.com", "secretmanager.googleapis.com",
  ]),
);

for (const item of services) {
  const accountEmail = `${item.account}@${project}.iam.gserviceaccount.com`;
  step(`Cuenta de servicio ${item.account}`, () => {
    if (!exists(["iam", "service-accounts", "describe", accountEmail])) {
      gcloud(["iam", "service-accounts", "create", item.account, `--display-name=Kardo ${item.name} (${suffix})`]);
    }
  });

  for (const key of item.secrets) {
    const secretName = `kardo-${suffix}-${item.name}-${key.toLowerCase().replaceAll("_", "-")}`;
    step(`Secreto ${secretName}`, () => {
      const value = key.endsWith("DATABASE_URL") ? transactionPooler(required(key)) : required(key);
      if (!exists(["secrets", "describe", secretName])) {
        gcloud(["secrets", "create", secretName, "--replication-policy=automatic"]);
      }
      gcloud(["secrets", "versions", "add", secretName, "--data-file=-"], value);
      gcloud([
        "secrets", "add-iam-policy-binding", secretName,
        `--member=serviceAccount:${accountEmail}`,
        "--role=roles/secretmanager.secretAccessor",
        "--condition=None",
      ]);
    });
  }

  step(`Empaquetar ${item.name}`, () => {
    if (dryRun) return console.log(`  node scripts/deploy/bundle-api.mjs ${item.name}`);
    execFileSync("node", [path.join(root, "scripts/deploy/bundle-api.mjs"), item.name], { stdio: "inherit" });
  });

  step(`Desplegar ${item.service} en Cloud Run`, () => {
    // `^@^` switches gcloud's list delimiter so values may contain commas.
    const envVars = `^@^${Object.entries(item.env).map(([key, value]) => `${key}=${value}`).join("@")}`;
    const secrets = item.secrets
      .map((key) => `${key}=kardo-${suffix}-${item.name}-${key.toLowerCase().replaceAll("_", "-")}:latest`)
      .join(",");
    gcloud([
      "run", "deploy", item.service,
      `--source=${path.join(root, "services", item.name, ".deploy")}`,
      `--region=${region}`,
      `--service-account=${accountEmail}`,
      "--allow-unauthenticated",
      "--port=8080",
      "--cpu=1",
      "--memory=512Mi",
      "--min-instances=0",
      "--max-instances=3",
      "--concurrency=80",
      `--timeout=${item.timeoutSeconds ?? 60}`,
      item.cpuAlwaysAllocated ? "--no-cpu-throttling" : "--cpu-throttling",
      "--cpu-boost",
      `--set-env-vars=${envVars}`,
      `--set-secrets=${secrets}`,
      `--labels=app=kardo,service=${item.name},env=${suffix}`,
    ]);
  });

  if (!dryRun) {
    const url = gcloud(["run", "services", "describe", item.service, `--region=${region}`, "--format=value(status.url)"], undefined, true).trim();
    console.log(`\n→ ${item.service}: ${url}\n`);
  }
}

console.log("\nListo. Siguiente paso: node scripts/deploy/pages.mjs con las URLs de arriba.");

// ---------------------------------------------------------------------------

function gcloud(argv, input, capture = false) {
  const full = [...argv, `--project=${project}`, "--quiet"];
  if (dryRun) {
    console.log(`  gcloud ${full.map((part) => (/\s/.test(part) ? JSON.stringify(part) : part)).join(" ")}${input === undefined ? "" : "  < (valor desde .env, oculto)"}`);
    return "";
  }
  return execFileSync("gcloud", full, {
    input,
    stdio: [input === undefined ? "ignore" : "pipe", capture ? "pipe" : "inherit", "inherit"],
    encoding: "utf8",
  });
}

function exists(argv) {
  if (dryRun) return true;
  try {
    execFileSync("gcloud", [...argv, `--project=${project}`, "--quiet"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/** Cloud Run instances come and go: use Supavisor's transaction mode (6543)
 * instead of session mode (5432) so short-lived instances never exhaust the
 * pooler. Safe here: every query runs in a transaction with `set local`
 * settings and postgres.js uses `prepare: false` (verified end to end). */
function transactionPooler(value) {
  const url = new URL(value);
  if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432") url.port = "6543";
  return url.toString();
}

function step(label, fn) {
  console.log(`• ${label}`);
  fn();
}

function required(key) {
  const value = env[key];
  if (!value) fail(`Falta ${key} en .env.`);
  return value;
}

function readEnv() {
  const raw = Object.fromEntries(
    fs
      .readFileSync(path.join(root, ".env"), "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => {
        const value = line.slice(line.indexOf("=") + 1).trim();
        return [line.slice(0, line.indexOf("=")).trim(), value.replace(/^"(.*)"$/, "$1")];
      }),
  );
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => raw[name] ?? "")]),
  );
}

function parseArgs(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next === undefined || next.startsWith("--")) result[key] = true;
    else {
      result[key] = next;
      index += 1;
    }
  }
  return result;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
