// Own local stack for the study, away from the owner's (3001/5175) and
// kardo-a2's (3011/5185) ports. Reads .env without printing any value.
//
//   node scripts/research/usuarios-simulados/servidores.mjs api      # Customer API on 3031
//   node scripts/research/usuarios-simulados/servidores.mjs panel    # vite build + preview on 5196
//   node scripts/research/usuarios-simulados/servidores.mjs sitio    # public website (next dev) on 5197
//
// The API uses the transaction pooler (6543), like production, so it does
// not take session-mode slots from the other local APIs, and answers AI
// requests through the dev bridge (.out/puente; someone answers the turns
// with the kardo-disenador skill, see README.md).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { API_URL, PANEL_URL, SITE_URL } from "./personas.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const out = path.join(here, ".out");
const which = process.argv[2];

const env = { ...process.env };
const fileEnv = {};
for (const line of fs.readFileSync(path.join(root, ".env"), "utf8").split("\n")) {
  const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
  if (match) fileEnv[match[1]] = match[2].replace(/^"|"$/g, "");
}

function run(command, args, options) {
  const child = spawn(command, args, { stdio: "inherit", ...options });
  child.on("exit", (code) => process.exit(code ?? 0));
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () => child.kill(signal));
}

if (which === "api") {
  for (const [name, value] of Object.entries(fileEnv))
    if (env[name] === undefined) env[name] = value;
  for (const name of ["SUPABASE_DATABASE_URL", "DATABASE_URL"]) {
    if (!env[name]) continue;
    const url = new URL(env[name]);
    if (url.hostname.endsWith(".pooler.supabase.com") && url.port === "5432")
      url.port = "6543";
    env[name] = url.toString();
  }
  const bridge = path.join(out, "puente");
  fs.mkdirSync(bridge, { recursive: true });
  Object.assign(env, {
    CUSTOMER_API_PORT: new URL(API_URL).port,
    CUSTOMER_APP_ORIGIN: new URL(PANEL_URL).origin,
    CUSTOM_HTML_AI_PROVIDER: "dev-bridge",
    KARDO_AI_BRIDGE_DIR: bridge,
    KARDO_AI_BRIDGE_TIMEOUT_MS: "900000",
  });
  run("node", ["--import", "tsx", "src/index.ts"], {
    cwd: path.join(root, "services/customer-api"),
    env,
  });
} else if (which === "panel") {
  const dist = path.join(out, "panel");
  const viteEnv = {
    ...env,
    VITE_CUSTOMER_API_URL: API_URL,
    VITE_TAP_RESOLVER_URL: fileEnv.TAP_RESOLVER_URL,
    VITE_DEMO_MODE: "false",
    VITE_WEBSITE_URL: SITE_URL,
  };
  const cwd = path.join(root, "apps/customer-web");
  const build = spawn("pnpm", ["exec", "vite", "build", "--outDir", dist, "--emptyOutDir"], {
    cwd,
    env: viteEnv,
    stdio: "inherit",
  });
  build.on("exit", (code) => {
    if (code) process.exit(code);
    run(
      "pnpm",
      ["exec", "vite", "preview", "--outDir", dist, "--port", new URL(PANEL_URL).port, "--strictPort"],
      { cwd, env: viteEnv },
    );
  });
} else if (which === "sitio") {
  run("pnpm", ["exec", "next", "dev", "--port", new URL(SITE_URL).port], {
    cwd: path.join(root, "apps/website"),
    env: { ...env, PUBLIC_CUSTOMER_APP_URL: PANEL_URL },
  });
} else {
  console.error("Uso: servidores.mjs api|panel|sitio");
  process.exit(1);
}
