// Links, phase 3b (relevo 34): sends the Resolver the addresses of every
// business that already has one, so kardo.com.mx/<negocio>/<link> (or, in
// development, <Resolver>/<negocio>/<link>) opens for the links created
// before the Resolver knew about them. From then on the Customer API sends
// each business again after every change; run this once after deploying
// the Resolver, or whenever one fell out of step.
//
// Reads .env without printing it: SUPABASE_ADMIN_DATABASE_URL,
// TAP_RESOLVER_URL and PUBLISH_COMMAND_KEY. Development only.
//
// Usage:  cd services/customer-api && node ../../scripts/dev/sync-business-links.mjs
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
  throw new Error("This script only runs outside production.");
for (const name of ["SUPABASE_ADMIN_DATABASE_URL", "TAP_RESOLVER_URL", "PUBLISH_COMMAND_KEY"])
  if (!env[name]) throw new Error(`Falta ${name} en .env.`);

const postgres = createRequire(path.join(root, "services/customer-api/package.json"))("postgres");
const admin = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
const resolver = new URL("/internal/business", env.TAP_RESOLVER_URL);

let sent = 0;
let failed = 0;
try {
  const businesses = await admin`
    select id, slug, kardo_core.business_link_routes(id) as routes
    from kardo_core.workspaces
    where slug is not null and deleted_at is null
    order by slug
  `;
  for (const business of businesses) {
    if (!business.routes) continue;
    const response = await fetch(resolver, {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.PUBLISH_COMMAND_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(business.routes),
    });
    await response.body?.cancel();
    const links = business.routes.links.length;
    if (response.ok) {
      sent += 1;
      console.log(`OK    ${business.slug} (${links} link${links === 1 ? "" : "s"})`);
    } else {
      failed += 1;
      console.log(`FALLA ${business.slug}: el Resolver respondió ${response.status}`);
    }
  }
} finally {
  await admin.end();
}
console.log(`\n${sent} negocios enviados${failed ? `, ${failed} con falla` : ""}.`);
process.exit(failed ? 1 : 0);
