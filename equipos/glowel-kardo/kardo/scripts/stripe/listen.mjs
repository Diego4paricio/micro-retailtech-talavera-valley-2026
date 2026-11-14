// Local Stripe webhooks for the Customer API (ADR 019, runbook 16).
//
//   node scripts/stripe/listen.mjs [--port=3001] [--tax-rate=txr_…]
//
// Uses STRIPE_SECRET_KEY from the repo .env (so it listens on the same
// account or sandbox the API uses, whatever `stripe login` points to), writes
// STRIPE_WEBHOOK_SECRET (and STRIPE_TAX_RATE_ID when given) into .env without
// printing them, then forwards events until stopped. Test keys only.
import { execFileSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const envPath = path.join(root, ".env");
const flags = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map((arg) => [arg.slice(2, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]),
);
const port = Number(flags.port ?? 3001);

function readEnv() {
  return Object.fromEntries(
    fs
      .readFileSync(envPath, "utf8")
      .split("\n")
      .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
      .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
  );
}

/** Sets or replaces `KEY=value` lines in .env, keeping everything else. */
function writeEnv(updates) {
  let text = fs.readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\n?$/, "\n")}${line}\n`;
  }
  fs.writeFileSync(envPath, text);
}

const key = readEnv().STRIPE_SECRET_KEY;
if (!key) throw new Error("STRIPE_SECRET_KEY is missing in .env.");
if (!/^(sk|rk)_test_/.test(key)) throw new Error("Only test keys are allowed here.");

const secret = execFileSync("stripe", ["listen", "--api-key", key, "--print-secret"], {
  encoding: "utf8",
}).trim();
if (!/^whsec_[A-Za-z0-9]+$/.test(secret)) throw new Error("Stripe CLI did not return a webhook secret.");
const updates = { STRIPE_WEBHOOK_SECRET: secret };
if (flags["tax-rate"]) {
  if (!/^txr_[A-Za-z0-9]+$/.test(flags["tax-rate"])) throw new Error("Invalid --tax-rate.");
  updates.STRIPE_TAX_RATE_ID = flags["tax-rate"];
}
writeEnv(updates);
console.log(`.env actualizado: ${Object.keys(updates).join(", ")} (valores no mostrados).`);
console.log(`Reenviando eventos a http://localhost:${port}/v1/billing/stripe/webhook (Ctrl+C para detener).`);

const child = spawn(
  "stripe",
  ["listen", "--api-key", key, "--forward-to", `localhost:${port}/v1/billing/stripe/webhook`],
  { stdio: ["ignore", "inherit", "inherit"] },
);
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => child.kill(signal));
child.on("exit", (code) => process.exit(code ?? 0));
