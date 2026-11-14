// Adds the two keys of the status Worker (ADR 022) to the git-ignored .env,
// once, without printing them:
//   STATUS_COMMAND_KEY  Staff API → status Worker (/internal/*)
//   STATUS_PROBE_KEY    status Worker → Customer API (GET /health/ready)
// Existing values are kept. Then load them into the Worker with
// `wrangler secret put` (commands in Docs/engineering/26-relevo-notificaciones-y-estado.md).
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const envPath = path.join(root, ".env");
let text = fs.readFileSync(envPath, "utf8");
const added = [];
for (const key of ["STATUS_COMMAND_KEY", "STATUS_PROBE_KEY"]) {
  if (new RegExp(`^${key}=.+$`, "m").test(text)) continue;
  const value = `${key}=${randomBytes(32).toString("hex")}`;
  // Fill the empty line copied from .env.example instead of repeating the key.
  const empty = new RegExp(`^${key}=[ \\t]*$`, "m");
  if (empty.test(text)) {
    text = text.replace(empty, value);
  } else {
    if (!text.endsWith("\n")) text += "\n";
    text += `${value}\n`;
  }
  added.push(key);
}
fs.writeFileSync(envPath, text, { mode: 0o600 });
console.log(
  added.length
    ? `Agregadas a .env: ${added.join(", ")} (sin mostrarlas).`
    : "Las dos claves ya estaban en .env; no cambié nada.",
);
