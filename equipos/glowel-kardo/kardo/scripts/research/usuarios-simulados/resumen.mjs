// Metrics from the personas' logs (not from what the agents say):
//
//   node scripts/research/usuarios-simulados/resumen.mjs [sesion] [persona…] [--acciones]
//
// Per task: outcome, actions, minutes, failed actions (⚠), back/reload
// actions, the ease rating, and the API errors and page errors seen.
// `--acciones` also prints every action with its thought (for the report).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const verbose = args.includes("--acciones");
const [session = "primera", ...only] = args.filter((arg) => !arg.startsWith("--"));
const base = path.join(here, ".out", session);
const keys = only.length ? only : fs.existsSync(base) ? fs.readdirSync(base) : [];

for (const key of keys) {
  const file = path.join(base, key, "registro.jsonl");
  if (!fs.existsSync(file)) continue;
  const entries = fs
    .readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const tasks = new Map();
  const get = (id) => {
    const name = id ?? "fuera de tarea";
    if (!tasks.has(name))
      tasks.set(name, { actions: 0, failed: 0, back: 0, start: null, end: null, outcome: "sin cerrar", ease: null, http: [], errors: [], notes: [] });
    return tasks.get(name);
  };
  let lastTask = null;
  for (const entry of entries) {
    if (entry.kind === "task-start") {
      const task = get(entry.task);
      task.start ??= entry.t;
      lastTask = entry.task;
    } else if (entry.kind === "task-end") {
      const task = get(entry.task);
      task.end = entry.t;
      task.outcome = `${entry.outcome}${entry.nota ? `: ${entry.nota}` : ""}`;
    } else if (entry.kind === "rating") {
      // Ratings come right after task-end, when task is already null.
      get(entry.task ?? lastTask).ease = `${entry.ease}${entry.nota ? ` (${entry.nota})` : ""}`;
    } else if (entry.kind === "action") {
      const task = get(entry.task);
      task.actions += 1;
      if (!entry.ok) task.failed += 1;
      if (["atras", "recargar"].includes(entry.cmd)) task.back += 1;
      task.start ??= entry.t;
      task.last = entry.t;
    } else if (entry.kind === "http") get(entry.task).http.push(`${entry.status} ${entry.url}`);
    else if (entry.kind === "pageerror") get(entry.task).errors.push(entry.message);
    else if (entry.kind === "note") get(entry.task).notes.push(entry.nota);
  }
  console.log(`\n## ${key} (${session})`);
  console.log("| Tarea | Resultado | Acciones | Fallidas | Atrás | Min | Facilidad |");
  console.log("|---|---|---|---|---|---|---|");
  for (const [id, task] of tasks) {
    const end = task.end ?? task.last;
    const minutes = task.start && end ? ((Date.parse(end) - Date.parse(task.start)) / 60000).toFixed(1) : "–";
    console.log(`| ${id} | ${task.outcome.replace(/\|/g, "/").slice(0, 140)} | ${task.actions} | ${task.failed} | ${task.back} | ${minutes} | ${task.ease ?? "–"} |`);
  }
  for (const [id, task] of tasks) {
    const http = [...new Set(task.http)];
    if (http.length) console.log(`- Tarea ${id}, errores del API: ${http.slice(0, 8).join(" · ")}`);
    if (task.errors.length) console.log(`- Tarea ${id}, errores de la página: ${[...new Set(task.errors)].slice(0, 3).join(" · ")}`);
    for (const note of task.notes) console.log(`- Tarea ${id}, nota: «${note}»`);
  }
  if (verbose)
    for (const entry of entries.filter((item) => item.kind === "action"))
      console.log(
        `  #${entry.step} [t${entry.task ?? "-"}] ${entry.ok ? "" : "⚠ "}${entry.cmd} ${entry.args.map((arg) => JSON.stringify(arg)).join(" ")} → ${entry.heading ?? ""} ${entry.path ?? ""}${entry.piensa ? `\n      «${entry.piensa}»` : ""}`,
      );
}
