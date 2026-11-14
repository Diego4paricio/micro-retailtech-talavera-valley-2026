// Serves the static export (`out/`) the way the host will: `/ruta/` resolves
// to `/ruta/index.html`, unknown paths get `404.html` with status 404, and the
// headers from `out/_headers` are applied. Local verification only.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../out",
);
const port = Number(process.env.PORT ?? 5177);
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".xml": "application/xml; charset=utf-8",
  ".json": "application/json",
  ".webmanifest": "application/manifest+json",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
};

const rules = parseHeaders(readIfExists(path.join(root, "_headers")) ?? "");

http
  .createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    let pathname = decodeURIComponent(url.pathname);
    let file = path.join(root, pathname);
    if (!file.startsWith(root)) {
      response.writeHead(400).end();
      return;
    }
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) {
      if (!pathname.endsWith("/")) {
        response
          .writeHead(301, { Location: `${pathname}/${url.search}` })
          .end();
        return;
      }
      file = path.join(file, "index.html");
    }
    let status = 200;
    if (!fs.existsSync(file)) {
      status = 404;
      file = path.join(root, "404.html");
      pathname = "/404.html";
    }
    const headers = {
      "Content-Type": types[path.extname(file)] ?? "application/octet-stream",
    };
    for (const rule of rules)
      if (rule.matches(pathname)) Object.assign(headers, rule.headers);

    if (file.endsWith(".html") && fs.existsSync(file)) {
      let html = fs.readFileSync(file, "utf8");
      // Strip upgrade-insecure-requests in local HTTP preview so WebKit/Safari loads CSS and assets over HTTP
      html = html.replace(/;\s*upgrade-insecure-requests/g, "");
      headers["Content-Length"] = Buffer.byteLength(html);
      response.writeHead(status, headers);
      response.end(html);
      return;
    }

    response.writeHead(status, headers);
    fs.createReadStream(file).pipe(response);
  })
  .listen(port, () =>
    console.log(`Kardo Website (out/) en http://localhost:${port}`),
  );

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

/** Minimal `_headers` reader: path lines followed by indented `Name: value`. */
function parseHeaders(text) {
  const parsed = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) {
      const pattern = line.trim();
      const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : null;
      parsed.push({
        headers: {},
        matches: (value) =>
          prefix === null ? value === pattern : value.startsWith(prefix),
      });
      continue;
    }
    const current = parsed.at(-1);
    const separator = line.indexOf(":");
    if (current && separator > 0) {
      current.headers[line.slice(0, separator).trim()] = line
        .slice(separator + 1)
        .trim();
    }
  }
  return parsed;
}
