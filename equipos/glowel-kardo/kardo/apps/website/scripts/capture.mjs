// Local tool, not part of the build: a screenshot from headless Chrome over
// the DevTools protocol, with real device emulation (a Chrome window cannot
// go below ~500 px) and every console error, CSP violations included.
//
//   node scripts/capture.mjs <url> <width> <height> <dpr> <out.png> [options]
//   options: --mobile  --reduced (prefers-reduced-motion)  --nojs  --wait=ms
//            --scroll=px  --css="selector{...}" (injected before the shot)
//
// It prints the page's scrollWidth x clientWidth (they must match: no
// horizontal scroll) and the console errors, if any.
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const [url, width, height, scale, out, ...rest] = process.argv.slice(2);
if (!out) {
  console.error(
    "Uso: node scripts/capture.mjs <url> <ancho> <alto> <dpr> <salida.png> [opciones]",
  );
  process.exit(1);
}
const flags = Object.fromEntries(
  rest.map((argument) => {
    const body = argument.replace(/^--/, "");
    const cut = body.indexOf("=");
    return cut < 0 ? [body, true] : [body.slice(0, cut), body.slice(cut + 1)];
  }),
);

const profile = mkdtempSync(path.join(tmpdir(), "kardo-capture-"));
const port = 9300 + Math.floor(Math.random() * 500);
const chrome = spawn(
  CHROME,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${port}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function pageSocket() {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      const targets = await (
        await fetch(`http://127.0.0.1:${port}/json`)
      ).json();
      const page = targets.find((target) => target.type === "page");
      if (page) return page.webSocketDebuggerUrl;
    } catch {}
    await sleep(250);
  }
  throw new Error("Chrome no respondió");
}

try {
  const socket = new WebSocket(await pageSocket());
  await new Promise((resolve) => socket.addEventListener("open", resolve));
  let lastId = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      pending.get(message.id)(message);
      pending.delete(message.id);
    } else if (message.method) events.push(message);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = ++lastId;
      pending.set(id, (message) =>
        message.error
          ? reject(new Error(`${method}: ${message.error.message}`))
          : resolve(message.result),
      );
      socket.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) =>
    (await send("Runtime.evaluate", { expression, returnByValue: true })).result
      .value;

  await send("Page.enable");
  await send("Runtime.enable");
  await send("Log.enable");
  await send("Emulation.setDeviceMetricsOverride", {
    width: Number(width),
    height: Number(height),
    deviceScaleFactor: Number(scale),
    mobile: Boolean(flags.mobile),
  });
  if (flags.mobile)
    await send("Emulation.setTouchEmulationEnabled", { enabled: true });
  if (flags.nojs)
    await send("Emulation.setScriptExecutionDisabled", { value: true });
  if (flags.reduced)
    await send("Emulation.setEmulatedMedia", {
      features: [{ name: "prefers-reduced-motion", value: "reduce" }],
    });
  await send("Page.navigate", { url });
  for (let attempt = 0; attempt < 80; attempt++) {
    if (events.some((event) => event.method === "Page.loadEventFired")) break;
    await sleep(250);
  }
  if (flags.scroll) await evaluate(`scrollTo(0, ${Number(flags.scroll)})`);
  if (flags.css)
    await evaluate(
      `document.head.append(Object.assign(document.createElement("style"), { textContent: ${JSON.stringify(flags.css)} }))`,
    );
  await sleep(Number(flags.wait ?? 2500));

  const shot = await send("Page.captureScreenshot", { format: "png" });
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  const widths = await evaluate(
    'document.documentElement.scrollWidth + " x " + document.documentElement.clientWidth',
  );
  const errors = events
    .map((event) => {
      if (event.method === "Runtime.exceptionThrown")
        return event.params.exceptionDetails?.exception?.description;
      if (
        event.method === "Log.entryAdded" &&
        event.params.entry.level === "error"
      )
        return event.params.entry.text;
      if (
        event.method === "Runtime.consoleAPICalled" &&
        event.params.type === "error"
      )
        return event.params.args
          ?.map((argument) => argument.value ?? argument.description)
          .join(" ");
      return null;
    })
    .filter(Boolean);
  console.log(
    `Listo: ${out} (${width}x${height} @${scale}x), scrollWidth x clientWidth = ${widths}`,
  );
  if (errors.length > 0)
    console.log(`Errores en consola:\n${errors.join("\n")}`);
  socket.close();
} finally {
  chrome.kill("SIGKILL");
  await sleep(300);
  rmSync(profile, { recursive: true, force: true });
}
