// Command line for a simulated user (README.md here):
//
//   node scripts/research/usuarios-simulados/k.mjs <persona> <comando> [argumentos…] [-p "lo que piensas"]
//
// Sends one command to the persona's browser (navegador.mjs) and prints what
// the persona sees: the result, the screen in words and the screenshot path.
import { persona } from "./personas.mjs";

const [key, command = "ver", ...rest] = process.argv.slice(2);
const who = persona(key);
const args = [];
let thought = null;
for (let i = 0; i < rest.length; i += 1) {
  if (rest[i] === "-p" || rest[i] === "--piensa") {
    thought = rest[i + 1] ?? null;
    i += 1;
  } else args.push(rest[i]);
}
try {
  const response = await fetch(`http://127.0.0.1:${who.port}/`, {
    method: "POST",
    body: JSON.stringify({ command, args, thought }),
    signal: AbortSignal.timeout(150_000),
  });
  console.log(await response.text());
} catch (error) {
  console.log(
    `El navegador de ${who.short} no responde (${error.cause?.code ?? error.name}). Avísale al coordinador del estudio.`,
  );
  process.exit(1);
}
