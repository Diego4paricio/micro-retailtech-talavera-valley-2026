// Builds and deploys the two static frontends as separate Cloudflare Pages
// projects (ADR 009): the customer panel and Kardo Operations. Only public
// VITE_* values are compiled in; demo mode is refused for these builds.
//
// Usage:
//   node scripts/deploy/pages.mjs \
//     --customer-api-url https://kardo-customer-api-dev-….run.app \
//     --staff-api-url https://kardo-staff-api-dev-….run.app \
//     [--suffix dev] [--only app|ops] [--dry-run]
//
// Requires: wrangler logged in to the Cloudflare account (`wrangler login`).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const args = parseArgs(process.argv.slice(2));
const suffix = args.suffix ?? "dev";
const dryRun = Boolean(args["dry-run"]);
const env = readEnv();

const publicSupabase = {
  VITE_SUPABASE_URL: required("VITE_SUPABASE_URL"),
  VITE_SUPABASE_PUBLISHABLE_KEY: required("VITE_SUPABASE_PUBLISHABLE_KEY"),
};

// Security headers the <meta> CSP cannot express (frame-ancestors, HSTS).
const baseHeaders = [
  "X-Content-Type-Options: nosniff",
  "Referrer-Policy: strict-origin-when-cross-origin",
  "X-Frame-Options: DENY",
  "Content-Security-Policy: frame-ancestors 'none'",
  "Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()",
  "Strict-Transport-Security: max-age=31536000; includeSubDomains",
];

const sites = [
  {
    key: "app",
    project: `kardo-app-${suffix}`,
    dir: "apps/customer-web",
    vars: {
      ...publicSupabase,
      VITE_CUSTOMER_API_URL: httpsUrl("customer-api-url"),
      VITE_TAP_RESOLVER_URL:
        env.VITE_TAP_RESOLVER_URL || required("TAP_RESOLVER_URL"),
      VITE_ASSET_UPLOAD_ORIGIN: new URL(required("ASSET_WORKER_URL")).origin,
      // Optional: service status (ADR 022) and the public website for links.
      ...(env.VITE_STATUS_URL ? { VITE_STATUS_URL: env.VITE_STATUS_URL } : {}),
      ...(env.VITE_WEBSITE_URL ? { VITE_WEBSITE_URL: env.VITE_WEBSITE_URL } : {}),
      // Optional: where Links live (production: https://kardo.com.mx). Unset,
      // the panel shows them on the Resolver's own address, which also works.
      ...(env.VITE_LINKS_BASE_URL
        ? { VITE_LINKS_BASE_URL: env.VITE_LINKS_BASE_URL }
        : {}),
    },
    headers: baseHeaders,
  },
  {
    key: "ops",
    project: `kardo-ops-${suffix}`,
    dir: "apps/operations-web",
    vars: { ...publicSupabase, VITE_STAFF_API_URL: httpsUrl("staff-api-url") },
    // Internal tool: never indexed.
    headers: [...baseHeaders, "X-Robots-Tag: noindex, nofollow"],
  },
].filter((site) => !args.only || site.key === args.only);

// Owner decision (2026-10-01): the panel sends customers to Stripe's hosted
// Checkout, branded in the Dashboard. The embedded one ships only with
// VITE_STRIPE_EMBEDDED_CHECKOUT=true and a publishable key (public;
// vite.config.ts reads VITE_STRIPE_PUBLISHABLE_KEY or STRIPE_PUBLISHABLE_KEY).
const embeddedCheckout =
  (process.env.VITE_STRIPE_EMBEDDED_CHECKOUT ??
    env.VITE_STRIPE_EMBEDDED_CHECKOUT) === "true";
const stripeKey =
  env.VITE_STRIPE_PUBLISHABLE_KEY || env.STRIPE_PUBLISHABLE_KEY || "";
if (sites.some((site) => site.key === "app")) {
  console.log(
    embeddedCheckout && stripeKey
      ? `Checkout integrado: sí (${stripeKey.startsWith("pk_live_") ? "modo vivo" : "modo prueba"})`
      : embeddedCheckout
        ? "Checkout integrado pedido, pero falta STRIPE_PUBLISHABLE_KEY: el panel usa la página de Stripe"
        : "Checkout: la página de Stripe (alojada, con la marca del Dashboard)",
  );
}

for (const site of sites) {
  console.log(`\n• ${site.project} (${site.dir})`);
  const buildEnv = { ...process.env, ...site.vars, VITE_DEMO_MODE: "false" };
  run("pnpm", ["--filter", `./${site.dir}`, "build"], buildEnv);
  const dist = path.join(root, site.dir, "dist");
  const headersFile = `/*\n${site.headers.map((line) => `  ${line}`).join("\n")}\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n`;
  if (dryRun) console.log(`  escribir ${path.relative(root, dist)}/_headers`);
  else fs.writeFileSync(path.join(dist, "_headers"), headersFile);

  const listed = dryRun
    ? ""
    : run(
        "pnpm",
        ["exec", "wrangler", "pages", "project", "list"],
        process.env,
        true,
      );
  if (!listed.includes(site.project)) {
    run("pnpm", [
      "exec",
      "wrangler",
      "pages",
      "project",
      "create",
      site.project,
      "--production-branch=main",
    ]);
  }
  run("pnpm", [
    "exec",
    "wrangler",
    "pages",
    "deploy",
    dist,
    `--project-name=${site.project}`,
    "--branch=main",
    "--commit-dirty=true",
  ]);
  console.log(
    `→ https://${site.project}.pages.dev (si el nombre ya existía en Pages, usa la URL que muestre wrangler)`,
  );
}

// ---------------------------------------------------------------------------

function run(command, argv, runEnv = process.env, capture = false) {
  if (dryRun) {
    console.log(`  ${command} ${argv.join(" ")}`);
    return "";
  }
  return execFileSync(command, argv, {
    cwd: root,
    env: runEnv,
    stdio: ["ignore", capture ? "pipe" : "inherit", "inherit"],
    encoding: "utf8",
  });
}

function httpsUrl(flag) {
  const value = args[flag];
  if (typeof value !== "string" || !value.startsWith("https://")) {
    console.error(
      `Falta --${flag} con una URL https (la que imprimió cloud-run.mjs).`,
    );
    process.exit(1);
  }
  return value.replace(/\/$/, "");
}

function required(key) {
  const value = env[key];
  if (!value) {
    console.error(`Falta ${key} en .env.`);
    process.exit(1);
  }
  return value;
}

function readEnv() {
  const raw = Object.fromEntries(
    fs
      .readFileSync(path.join(root, ".env"), "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => [
        line.slice(0, line.indexOf("=")).trim(),
        line.slice(line.indexOf("=") + 1).trim(),
      ]),
  );
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => raw[name] ?? ""),
    ]),
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
