/**
 * "Pega aquí lo que te dio la IA": whatever an AI answers (a full document,
 * a fragment, markdown with code fences, separate HTML and CSS blocks) is
 * split into the two panes of the editor. Pure string work so it runs the
 * same in the panel and in the tests. Nothing is sanitized here: the
 * sanitizer reports what cannot be published once it is in the editor.
 */

export type PastedCode = {
  html: string;
  css: string;
  /** Short notes about what was separated or dropped, in Spanish. */
  notes: string[];
};

type Fence = { lang: string; body: string };

const fencePattern = /```[ \t]*([\w+-]*)[^\n]*\n([\s\S]*?)(?:\n[ \t]*```|$)/g;

function fencedBlocks(text: string): Fence[] {
  const blocks: Fence[] = [];
  for (const match of text.matchAll(fencePattern))
    blocks.push({
      lang: (match[1] ?? "").toLowerCase(),
      body: match[2] ?? "",
    });
  return blocks;
}

const cssLangs = new Set(["css", "scss", "less"]);
const htmlLangs = new Set(["html", "htm", "xml", "svg", "xhtml", "vue", ""]);
const scriptLangs = new Set(["js", "javascript", "ts", "typescript", "jsx"]);

function looksLikeCss(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("<")) return false;
  return /[^{}]+\{[^{}]*:[^{}]*\}/.test(trimmed);
}

/** Removes a tag pair wrapper (`<html …>`, `</html>`) keeping its inside. */
function stripTags(text: string, tag: string): string {
  return text
    .replace(new RegExp(`<${tag}(?:\\s[^>]*)?>`, "gi"), "")
    .replace(new RegExp(`</${tag}\\s*>`, "gi"), "");
}

function dedent(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  while (lines.length && !lines[0]?.trim()) lines.shift();
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  const indents = lines
    .filter((line) => line.trim())
    .map((line) => /^[ \t]*/.exec(line)?.[0].length ?? 0);
  const common = indents.length ? Math.min(...indents) : 0;
  return lines.map((line) => line.slice(common)).join("\n");
}

/** Splits HTML source into its markup and the CSS of its `<style>` blocks. */
function splitDocument(source: string, notes: string[]) {
  let text = source.replace(/\r\n?/g, "\n");
  const styles: string[] = [];

  // Head: keep its <style> blocks, drop the rest (meta, title, links,
  // scripts): Kardo writes the page's head itself.
  const head = /<head(?:\s[^>]*)?>([\s\S]*?)<\/head\s*>/i.exec(text);
  if (head) {
    for (const style of head[1]?.matchAll(
      /<style(?:\s[^>]*)?>([\s\S]*?)<\/style\s*>/gi,
    ) ?? [])
      styles.push(style[1] ?? "");
    text = text.replace(head[0], "");
    if (/<(link|script|meta)\b/i.test(head[1] ?? ""))
      notes.push(
        "Quitamos el encabezado del documento (<head>): Kardo pone el título, las fuentes y los metadatos.",
      );
  }

  text = text.replace(
    /<style(?:\s[^>]*)?>([\s\S]*?)<\/style\s*>/gi,
    (_m, css) => {
      styles.push(css as string);
      return "";
    },
  );

  const hadWrapper = /<!doctype|<html\b|<body\b/i.test(text);
  text = text.replace(/<!doctype[^>]*>/gi, "");
  text = stripTags(text, "html");
  text = stripTags(text, "body");
  if (hadWrapper && !head)
    notes.push("Quitamos las etiquetas <html> y <body>: Kardo las pone.");
  if (styles.length)
    notes.push(
      styles.length === 1
        ? "Pasamos el bloque <style> a la pestaña CSS."
        : `Pasamos ${styles.length} bloques <style> a la pestaña CSS.`,
    );
  return {
    html: text,
    css: styles.map((style) => dedent(style)).join("\n\n"),
  };
}

const jsonNote = "Leímos el HTML y el CSS de la respuesta en JSON.";

/** `{ "html": "…", "css": "…" }` (Kardo's AI format, or an AI that used it). */
function fromJson(text: string): { html: string; css: string } | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") || !trimmed.endsWith("}")) return null;
  try {
    const value = JSON.parse(trimmed) as unknown;
    if (!value || typeof value !== "object") return null;
    const { html, css } = value as { html?: unknown; css?: unknown };
    return typeof html === "string" && typeof css === "string"
      ? { html, css }
      : null;
  } catch {
    return null;
  }
}

export function splitPastedCode(input: string): PastedCode {
  const notes: string[] = [];
  // Blank lines around go; the first line keeps its indentation (dedent).
  const text = input
    .replace(/\r\n?/g, "\n")
    .replace(/^(?:[ \t]*\n)+/, "")
    .trimEnd();
  if (!text.trim()) return { html: "", css: "", notes };

  const json =
    fromJson(text) ??
    fencedBlocks(text)
      .filter((fence) => fence.lang === "json" || fence.lang === "")
      .map((fence) => fromJson(fence.body))
      .find((value) => value !== null) ??
    null;
  if (json)
    return {
      html: dedent(json.html),
      css: dedent(json.css),
      notes: [jsonNote],
    };

  const fences = fencedBlocks(text);
  let htmlParts: string[] = [];
  let cssParts: string[] = [];

  if (fences.length) {
    const hasTextOutside = text.replace(fencePattern, "").trim().length > 0;
    let droppedScripts = 0;
    for (const fence of fences) {
      if (scriptLangs.has(fence.lang)) {
        droppedScripts += 1;
        continue;
      }
      if (cssLangs.has(fence.lang) || (!fence.lang && looksLikeCss(fence.body)))
        cssParts.push(fence.body);
      else if (htmlLangs.has(fence.lang) || fence.body.trim().startsWith("<"))
        htmlParts.push(fence.body);
    }
    if (hasTextOutside)
      notes.push("Quitamos las explicaciones que venían fuera del código.");
    if (droppedScripts)
      notes.push(
        droppedScripts === 1
          ? "Dejamos fuera un bloque de JavaScript: las páginas de Kardo no ejecutan scripts."
          : `Dejamos fuera ${droppedScripts} bloques de JavaScript: las páginas de Kardo no ejecutan scripts.`,
      );
  } else if (looksLikeCss(text)) {
    cssParts = [text];
  } else {
    htmlParts = [text];
  }

  const splitted = htmlParts.map((part) => splitDocument(part, notes));
  const html = dedent(
    splitted
      .map((part) => part.html)
      .filter((part) => part.trim())
      .join("\n\n"),
  );
  const css = [
    ...splitted.map((part) => part.css),
    ...cssParts.map((part) => dedent(part)),
  ]
    .filter((part) => part.trim())
    .join("\n\n");
  return { html, css, notes: [...new Set(notes)] };
}
