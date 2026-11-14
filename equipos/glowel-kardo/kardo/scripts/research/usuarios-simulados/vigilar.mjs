// Watches a round while the agents run (relevo 35 §5) and prints one line per
// event worth the coordinator's attention: a task closed, a tool error, a
// blocked payment, a persona quiet for 5 minutes and an AI turn nobody took.
//
//   node scripts/research/usuarios-simulados/vigilar.mjs <sesion> <persona…>
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const [session, ...keys] = process.argv.slice(2);
const bridge = path.join(here, ".out/puente");
const seen = Object.fromEntries(keys.map((key) => [key, 0]));
const quietWarned = {};
const turnWarned = new Set();

function tick() {
  const now = Date.now();
  for (const key of keys) {
    const file = path.join(here, ".out", session, key, "registro.jsonl");
    if (!fs.existsSync(file)) continue;
    const lines = fs.readFileSync(file, "utf8").split("\n").filter(Boolean);
    for (const line of lines.slice(seen[key])) {
      const entry = JSON.parse(line);
      if (entry.kind === "task-end")
        console.log(`${key}: tarea ${entry.task} ${entry.outcome}${entry.nota ? ` — ${String(entry.nota).slice(0, 110)}` : ""}`);
      else if (entry.kind === "tool-error") console.log(`${key}: ERROR DE HERRAMIENTA ${entry.cmd}: ${String(entry.message).slice(0, 120)}`);
      else if (entry.kind === "payment-blocked") console.log(`${key}: llegó a la página de pago (bloqueada)`);
    }
    seen[key] = lines.length;
    const last = lines.length ? Date.parse(JSON.parse(lines.at(-1)).t) : fs.statSync(file).mtimeMs;
    const quiet = Math.floor((now - last) / 60000);
    if (quiet >= 5 && quietWarned[key] !== quiet && quiet % 5 === 0) {
      quietWarned[key] = quiet;
      console.log(`${key}: sin acciones desde hace ${quiet} min`);
    }
  }
  const pending = fs.existsSync(path.join(bridge, "pending"))
    ? fs.readdirSync(path.join(bridge, "pending")).filter((name) => /\.turn\d+\.json$/.test(name))
    : [];
  for (const name of pending) {
    const id = name.replace(/\.json$/, "");
    const age = (now - fs.statSync(path.join(bridge, "pending", name)).mtimeMs) / 60000;
    const taken = fs.existsSync(path.join(bridge, "working", id));
    const flag = `${id}:${taken ? "w" : "q"}:${age > 10 ? 10 : age > 3 ? 3 : 0}`;
    if (age > 3 && !turnWarned.has(flag)) {
      turnWarned.add(flag);
      console.log(`puente: ${id} lleva ${age.toFixed(0)} min ${taken ? "en manos del diseñador" : "SIN diseñador"}`);
    }
  }
}
setInterval(tick, 20_000);
tick();
