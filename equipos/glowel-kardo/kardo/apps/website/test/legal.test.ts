import { afterEach, describe, expect, it } from "vitest";
import {
  isLegalPageVisible,
  legalSlugs,
  loadLegalDocument,
  visibleLegalSlugs,
} from "@/lib/legal";
import {
  missingPlaceholders,
  parseInline,
  parseLegalMarkdown,
  safeHref,
} from "@/lib/legal-markdown";

describe("legal markdown", () => {
  it("reads headings, clause paragraphs, lists and tables", () => {
    const blocks = parseLegalMarkdown(
      [
        "# Título",
        "",
        "## 1. Cómo cancelar",
        "",
        "1.1. **Desde el Panel.** Entra a Configuración.",
        "Sigue en el mismo párrafo.",
        "",
        "- uno",
        "  - dos",
        "",
        "| Dato | Finalidad |",
        "|---|---|",
        "| Correo | Avisos |",
        "",
        "---",
      ].join("\n"),
    );
    expect(blocks.map((block) => block.kind)).toEqual([
      "heading",
      "heading",
      "paragraph",
      "list",
      "table",
      "rule",
    ]);
    const clause = blocks[2];
    expect(
      clause?.kind === "paragraph" && clause.inline[0]?.kind === "text"
        ? clause.inline[0].value
        : "",
    ).toBe("1.1. ");
    const list = blocks[3];
    expect(
      list?.kind === "list" && list.items.map((item) => item.level),
    ).toEqual([0, 1]);
    const table = blocks[4];
    expect(table?.kind === "table" && table.rows.length).toBe(1);
  });

  it("only links https, mailto and internal paths", () => {
    expect(safeHref("https://sat.gob.mx")).toBe("https://sat.gob.mx");
    expect(safeHref("mailto:privacidad@kardo.mx")).toBe(
      "mailto:privacidad@kardo.mx",
    );
    expect(safeHref("/terminos/")).toBe("/terminos/");
    expect(safeHref("javascript:alert(1)")).toBeNull();
    expect(safeHref("http://inseguro.mx")).toBeNull();
    expect(safeHref("//evil.example")).toBeNull();
    const parts = parseInline("[x](javascript:alert(1))");
    expect(parts.some((part) => part.kind === "link")).toBe(false);
  });

  it("marks titular placeholders and lists the missing ones", () => {
    const parts = parseInline("Titular: [NOMBRE DEL TITULAR], RFC [RFC].");
    expect(parts.filter((part) => part.kind === "placeholder")).toHaveLength(2);
    expect(missingPlaceholders("RFC [RFC] y [DOMINIO]")).toEqual([
      "RFC",
      "DOMINIO",
    ]);
    expect(missingPlaceholders("sin marcadores")).toEqual([]);
  });
});

describe("Docs/legal pages", () => {
  const environment = process.env.KARDO_ENV;
  afterEach(() => {
    process.env.KARDO_ENV = environment;
  });

  it("parses the three real documents", () => {
    for (const slug of legalSlugs) {
      const document = loadLegalDocument(slug);
      expect(document.blocks.length).toBeGreaterThan(10);
      expect(document.blocks[0]?.kind).not.toBe(undefined);
    }
  });

  it("never publishes a draft in production, without failing the build", () => {
    const pending = legalSlugs.filter(
      (slug) => loadLegalDocument(slug).missing.length > 0,
    );
    process.env.KARDO_ENV = "development";
    expect(visibleLegalSlugs()).toEqual(legalSlugs);
    process.env.KARDO_ENV = "production";
    for (const slug of pending) {
      expect(isLegalPageVisible(slug)).toBe(false);
      expect(() => loadLegalDocument(slug)).not.toThrow();
    }
    expect(visibleLegalSlugs()).toEqual(
      legalSlugs.filter((slug) => !pending.includes(slug)),
    );
  });
});
