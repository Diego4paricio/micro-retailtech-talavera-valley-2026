// Local Resolver for the videos (`wrangler dev` on 8787), development only.
//
//   node scripts/video/resolver-local.mjs /ruta/privada/video.env
//
// The publish key is the one in .env (PUBLISH_COMMAND_KEY): the Customer API
// copy retires deleted pages with it (ADR 020, addendum of 2026-10-01), and
// the video publishes its demo page with it. The billing and suspension keys
// are local and random, from a private file outside the repo
// (LOCAL_BILLING_KEY, LOCAL_SUSPENSION_KEY; see scripts/video/README.md).
// No key is printed; they only travel as `--var` arguments to wrangler.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { readEnv, root } from "./lib.mjs";

const keysFile = process.argv[2];
if (!keysFile) {
  console.error(
    "Uso: node scripts/video/resolver-local.mjs <archivo de llaves locales>",
  );
  process.exit(1);
}
const local = Object.fromEntries(
  fs
    .readFileSync(keysFile, "utf8")
    .split("\n")
    .map((line) => line.replace(/^export\s+/, ""))
    .filter((line) => line.includes("="))
    .map((line) => [
      line.slice(0, line.indexOf("=")),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);
const env = readEnv();
const keys = {
  PUBLISH_COMMAND_KEY: env.PUBLISH_COMMAND_KEY,
  BILLING_COMMAND_KEY: local.LOCAL_BILLING_KEY,
  SUSPENSION_COMMAND_KEY: local.LOCAL_SUSPENSION_KEY,
};
for (const [name, value] of Object.entries(keys)) {
  if (!value || value.length < 16) throw new Error(`Falta ${name}.`);
}
if (new Set(Object.values(keys)).size !== 3)
  throw new Error("Las tres llaves deben ser distintas.");

const state = path.join(path.dirname(keysFile), "wrangler-state");
const child = spawn(
  "pnpm",
  [
    "exec",
    "wrangler",
    "dev",
    "--port",
    "8787",
    "--ip",
    "127.0.0.1",
    ...Object.entries(keys).flatMap(([name, value]) => [
      "--var",
      `${name}:${value}`,
    ]),
    "--persist-to",
    state,
  ],
  {
    cwd: path.join(root, "services/resolver"),
    stdio: ["ignore", "inherit", "inherit"],
  },
);
child.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
