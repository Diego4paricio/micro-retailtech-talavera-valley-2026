// Builds the full prompt of one simulated user: their sheet (fichas/<persona>.md)
// plus the shared instructions, with the account filled in. Writes
// .out/prompts/<persona>-<sesion>.md (gitignored: it carries the password).
//
//   node scripts/research/usuarios-simulados/prompt.mjs <persona> [sesion]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PANEL_URL, persona } from "./personas.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const [key, session = "primera"] = process.argv.slice(2);
const who = persona(key);
const accounts = JSON.parse(fs.readFileSync(path.join(here, ".out/cuentas.json"), "utf8"));
const account = accounts[key];
if (!account) throw new Error(`Abre primero el navegador de ${key} (crea su cuenta).`);
const sheetName = session === "primera" ? `${key}.md` : `${key}-${session}.md`;
const sheet = fs.readFileSync(path.join(here, "fichas", sheetName), "utf8");
const shared = fs
  .readFileSync(path.join(here, "instrucciones.md"), "utf8")
  .split("\n---\n")
  .slice(1)
  .join("\n---\n");
const device = who.device === "celular" ? "Tu celular" : "Tu computadora";
const text = `${sheet}\n---\n${shared}`
  .replaceAll("{{correo}}", account.email)
  .replaceAll("{{contrasena}}", account.password)
  .replaceAll("{{registro}}", `${PANEL_URL}/registro`)
  .replaceAll("{{panel}}", PANEL_URL)
  .replaceAll("<tu-clave>", key)
  .replaceAll(
    "Eres una persona usando Kardo por primera vez.",
    session === "primera"
      ? "Eres una persona usando Kardo por primera vez."
      : "Eres una persona que ya usó Kardo una vez, hace días, y no recuerda bien dónde está cada cosa.",
  )
  .replaceAll("Tu celular o computadora se maneja", `${device} se maneja`)
  .replaceAll(
    "node scripts/research/usuarios-simulados/k.mjs",
    "node /Users/angelcolorado/Dev/Glowel/Kardo/scripts/research/usuarios-simulados/k.mjs",
  )
  .replaceAll("`k.mjs ", "`node /Users/angelcolorado/Dev/Glowel/Kardo/scripts/research/usuarios-simulados/k.mjs ");
const out = path.join(here, ".out/prompts");
fs.mkdirSync(out, { recursive: true });
const file = path.join(out, `${key}-${session}.md`);
fs.writeFileSync(file, text, { mode: 0o600 });
console.log(file);
