const UTF8_BOM = "﻿";
/** Leading characters that spreadsheet software (Excel, Sheets, Numbers)
 * treats as the start of a formula when a cell opens with them. */
const FORMULA_PREFIX_PATTERN = /^[=+\-@\t\r]/;

/**
 * Escapes one CSV field per RFC 4180 and neutralizes CSV/formula injection:
 * a value that would be interpreted as a spreadsheet formula (starts with
 * `=`, `+`, `-`, `@`, a tab or a carriage return) gets a leading `'`
 * prepended *before* quoting, matching the standard mitigation for
 * CSV-export XSS/RCE ("Excel formula injection").
 */
/** A phone number with its country code («+52 55 1234 5678»): only digits,
 * spaces, parentheses and hyphens after the `+`, which no spreadsheet can
 * run as a formula. Kept as written so Excel shows the number, not
 * «'+52…» (domain audit A2-53). */
const PHONE_PATTERN = /^\+[0-9][0-9 ()-]{5,39}$/;

export function csvField(value: string): string {
  const guarded =
    FORMULA_PREFIX_PATTERN.test(value) && !PHONE_PATTERN.test(value)
      ? `'${value}`
      : value;
  if (/[",\n\r]/.test(guarded)) {
    return `"${guarded.replaceAll('"', '""')}"`;
  }
  return guarded;
}

export function csvRow(values: readonly string[]): string {
  return values.map(csvField).join(",");
}

/** Builds a complete CSV document, including the UTF-8 BOM Excel needs to
 * detect encoding correctly, and CRLF line endings per RFC 4180. */
export function buildCsvDocument(
  header: readonly string[],
  rows: readonly (readonly string[])[],
): string {
  const lines = [csvRow(header), ...rows.map(csvRow)];
  return `${UTF8_BOM}${lines.join("\r\n")}\r\n`;
}
