// Helpers for the agent that answers the dev AI bridge during the study
// (relevo 35 §7). The bridge protocol itself is scripts/dev/ai-bridge/README.md.
//
//   node puente-turno.mjs esperar [segundos=540]
//     Blocks until a pending turn nobody took, claims it (working/ marker,
//     created exclusively so two designers never take the same turn), keeps a
//     copy of the question and its images in .out/puente-archivo/ and prints
//     «TURNO <pending file>». Prints «NADA» on timeout and «ALTO» once
//     .out/puente/ALTO exists (the coordinator's stop signal).
//
//   node puente-turno.mjs entregar <jobId.turnN> <answer.json>
//     Writes done/<jobId.turnN>.json in one step (temp file + rename) and keeps
//     a copy next to the question. <answer.json> is the done shape
//     ({ "text": "..." }) or the bare answer object, which gets wrapped.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const bridge = path.join(here, ".out/puente");
const archive = path.join(here, ".out/puente-archivo");
for (const sub of ["pending", "working", "done"])
  fs.mkdirSync(path.join(bridge, sub), { recursive: true });
fs.mkdirSync(archive, { recursive: true });
const [command, ...args] = process.argv.slice(2);

function claim() {
  const turns = fs
    .readdirSync(path.join(bridge, "pending"))
    .filter((name) => /\.turn\d+\.json$/.test(name))
    .map((name) => ({ name, at: fs.statSync(path.join(bridge, "pending", name)).mtimeMs }))
    .sort((a, b) => a.at - b.at);
  for (const { name } of turns) {
    const id = name.replace(/\.json$/, "");
    if (fs.existsSync(path.join(bridge, "done", name))) continue;
    try {
      fs.closeSync(fs.openSync(path.join(bridge, "working", id), "wx"));
    } catch {
      continue; // someone else has it
    }
    const pending = path.join(bridge, "pending", name);
    fs.copyFileSync(pending, path.join(archive, name));
    const job = id.split(".")[0];
    for (const image of fs.readdirSync(path.join(bridge, "pending")))
      if (image.startsWith(`${job}.img`)) fs.copyFileSync(path.join(bridge, "pending", image), path.join(archive, image));
    return pending;
  }
  return null;
}

if (command === "esperar") {
  const limit = Date.now() + (Number(args[0]) || 540) * 1000;
  for (;;) {
    if (fs.existsSync(path.join(bridge, "ALTO"))) {
      console.log("ALTO");
      break;
    }
    const pending = claim();
    if (pending) {
      console.log(`TURNO ${pending}`);
      break;
    }
    if (Date.now() > limit) {
      console.log("NADA");
      break;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
} else if (command === "entregar") {
  const [id, answerFile] = args;
  if (!/^[0-9a-f-]+\.turn\d+$/.test(id ?? "") || !answerFile) {
    console.error("Uso: puente-turno.mjs entregar <jobId.turnN> <respuesta.json>");
    process.exit(2);
  }
  const raw = JSON.parse(fs.readFileSync(answerFile, "utf8"));
  const done = typeof raw.text === "string" ? raw : { text: JSON.stringify(raw) };
  JSON.parse(done.text); // must be the model's JSON answer
  const target = path.join(bridge, "done", `${id}.json`);
  fs.writeFileSync(`${target}.tmp`, JSON.stringify(done));
  fs.renameSync(`${target}.tmp`, target);
  fs.writeFileSync(path.join(archive, `${id}.respuesta.json`), JSON.stringify(done, null, 2));
  console.log(`Entregado: ${target}`);
} else {
  console.error("Uso: puente-turno.mjs esperar [segundos] | entregar <jobId.turnN> <respuesta.json>");
  process.exit(2);
}
