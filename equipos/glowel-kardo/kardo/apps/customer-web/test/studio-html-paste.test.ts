import { describe, expect, it } from "vitest";
import { splitPastedCode } from "../src/features/studio/html/paste.js";

describe("splitPastedCode", () => {
  it("keeps a plain fragment as HTML", () => {
    const result = splitPastedCode(
      '<section class="hero">\n  <h1>Hola</h1>\n</section>',
    );
    expect(result.html).toBe(
      '<section class="hero">\n  <h1>Hola</h1>\n</section>',
    );
    expect(result.css).toBe("");
    expect(result.notes).toEqual([]);
  });

  it("splits a full document: <style> to CSS, wrappers and head dropped", () => {
    const result = splitPastedCode(`<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Café</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lora">
  <style>
    body { margin: 0; }
    .hero { color: #333; }
  </style>
</head>
<body>
  <main class="hero">
    <h1>Café Nube</h1>
  </main>
</body>
</html>`);
    expect(result.html).toBe(
      '<main class="hero">\n  <h1>Café Nube</h1>\n</main>',
    );
    expect(result.css).toBe("body { margin: 0; }\n.hero { color: #333; }");
    expect(result.html).not.toMatch(/<html|<head|<body|<title|<meta/i);
    expect(result.notes.join(" ")).toMatch(/<head>/);
    expect(result.notes.join(" ")).toMatch(/CSS/);
  });

  it("moves inline <style> blocks of a fragment to CSS", () => {
    const result = splitPastedCode(
      '<style>.a{color:red}</style>\n<div class="a">Hola</div>\n<style>.b{color:blue}</style>',
    );
    expect(result.html).toBe('<div class="a">Hola</div>');
    expect(result.css).toBe(".a{color:red}\n\n.b{color:blue}");
    expect(result.notes).toContain(
      "Pasamos 2 bloques <style> a la pestaña CSS.",
    );
  });

  it("reads markdown fences and drops the explanations around them", () => {
    const result = splitPastedCode(`¡Claro! Aquí está tu página:

\`\`\`html
<div class="card">Hola</div>
\`\`\`

Y los estilos:

\`\`\`css
.card { padding: 24px; }
\`\`\`

Espero que te guste.`);
    expect(result.html).toBe('<div class="card">Hola</div>');
    expect(result.css).toBe(".card { padding: 24px; }");
    expect(result.notes).toContain(
      "Quitamos las explicaciones que venían fuera del código.",
    );
  });

  it("splits a fenced full document too", () => {
    const result = splitPastedCode(
      "```html\n<html><head><style>h1{font-size:40px}</style></head><body><h1>Hola</h1></body></html>\n```",
    );
    expect(result.html).toBe("<h1>Hola</h1>");
    expect(result.css).toBe("h1{font-size:40px}");
  });

  it("leaves JavaScript fences out and says why", () => {
    const result = splitPastedCode(
      "```html\n<p>Hola</p>\n```\n```js\nalert('x')\n```",
    );
    expect(result.html).toBe("<p>Hola</p>");
    expect(result.css).toBe("");
    expect(result.notes.join(" ")).toMatch(/JavaScript/);
  });

  it("recognizes pasted CSS alone", () => {
    const result = splitPastedCode(".hero {\n  color: #123456;\n}");
    expect(result.html).toBe("");
    expect(result.css).toBe(".hero {\n  color: #123456;\n}");
  });

  it("recognizes an unlabeled CSS fence", () => {
    const result = splitPastedCode("```\n.a { color: red; }\n```");
    expect(result.css).toBe(".a { color: red; }");
    expect(result.html).toBe("");
  });

  it("handles an unclosed fence (a truncated answer)", () => {
    const result = splitPastedCode("```html\n<div>Hola</div>\n<p>Más");
    expect(result.html).toBe("<div>Hola</div>\n<p>Más");
  });

  it("reads a JSON answer with html and css", () => {
    const result = splitPastedCode(
      JSON.stringify({
        html: '<section class="a">Hola</section>',
        css: ".a { color: red; }",
        notes: "Listo",
      }),
    );
    expect(result).toEqual({
      html: '<section class="a">Hola</section>',
      css: ".a { color: red; }",
      notes: ["Leímos el HTML y el CSS de la respuesta en JSON."],
    });
  });

  it("reads a JSON answer inside a json fence, with text around", () => {
    const result = splitPastedCode(
      'Aquí está:\n```json\n{"html":"<p>Hola</p>","css":"p{margin:0}"}\n```\nSaludos.',
    );
    expect(result.html).toBe("<p>Hola</p>");
    expect(result.css).toBe("p{margin:0}");
    expect(result.notes).toEqual([
      "Leímos el HTML y el CSS de la respuesta en JSON.",
    ]);
  });

  it("ignores JSON without html and css strings", () => {
    const result = splitPastedCode('{"html": 1}');
    expect(result.notes).not.toContain(
      "Leímos el HTML y el CSS de la respuesta en JSON.",
    );
  });

  it("returns nothing for empty input", () => {
    expect(splitPastedCode("   \n ")).toEqual({ html: "", css: "", notes: [] });
  });

  it("normalizes Windows line endings and common indentation", () => {
    const result = splitPastedCode(
      "    <div>\r\n      <p>Hola</p>\r\n    </div>",
    );
    expect(result.html).toBe("<div>\n  <p>Hola</p>\n</div>");
  });
});
