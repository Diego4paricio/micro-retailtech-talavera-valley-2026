import { describe, expect, it } from "vitest";
import { buildCsvDocument, csvField } from "../src/csv.js";

describe("csvField", () => {
  it.each(["=cmd", "+1+1", "-1+1", "@SUM(A1)", "\ttab", "\rcarriage"])(
    "prefixes a formula-like value with a quote: %s",
    (value) => {
      const escaped = csvField(value);
      expect(escaped.startsWith("'") || escaped.startsWith("\"'")).toBe(true);
    },
  );

  it("quotes and escapes a value containing a comma or quote", () => {
    expect(csvField('Café, "Nube"')).toBe('"Café, ""Nube"""');
  });

  it("leaves an ordinary value untouched", () => {
    expect(csvField("Café Nube")).toBe("Café Nube");
  });

  it("keeps a phone number with its country code as written (A2-53)", () => {
    expect(csvField("+52 55 1234 5678")).toBe("+52 55 1234 5678");
    expect(csvField("+1 (415) 555-0100")).toBe("+1 (415) 555-0100");
    // Anything else after the + is still neutralized.
    expect(csvField("+52+cmd|' /C calc'!A0").startsWith("'")).toBe(true);
  });
});

describe("buildCsvDocument", () => {
  it("prefixes the document with a UTF-8 BOM and uses CRLF line endings", () => {
    const csv = buildCsvDocument(["a", "b"], [["1", "2"]]);
    expect(csv.startsWith("﻿")).toBe(true);
    expect(csv).toContain("a,b\r\n1,2\r\n");
  });

  it("neutralizes a formula-injection attempt in a lead field", () => {
    const csv = buildCsvDocument(
      ["fecha", "touchpoint", "nombre", "email", "telefono", "mensaje"],
      [
        [
          "2026-09-24T00:00:00.000Z",
          "Mostrador",
          '=HYPERLINK("http://evil.example")',
          "attacker@evil.example",
          "",
          "@SUM(1+1)",
        ],
      ],
    );
    expect(csv).not.toContain(',=HYPERLINK("http://evil.example")');
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'@SUM(1+1)");
  });
});
