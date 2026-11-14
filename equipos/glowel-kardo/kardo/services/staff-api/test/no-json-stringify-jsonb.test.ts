import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * postgres.js double-encodes `${JSON.stringify(x)}::jsonb` (it JSON-encodes
 * the interpolated string parameter *again*), so every jsonb write in this
 * service must go through `sql.json(...)`/`tx.json(...)` instead (see
 * `insertStaffAuditEvent` and `replaceEntitlements`). This scans the whole
 * `src` tree for the forbidden pattern so a future change cannot reintroduce
 * it silently.
 */
const FORBIDDEN_PATTERN = /JSON\.stringify\([^)]*\)\s*\}::jsonb/;

function listTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      files.push(...listTsFiles(fullPath));
    } else if (entry.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("no JSON.stringify(...)::jsonb in src", () => {
  const srcDir = join(import.meta.dirname, "..", "src");
  const files = listTsFiles(srcDir);

  it("scans at least the repository and http modules", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(files)("does not use the forbidden pattern in %s", (file) => {
    const content = readFileSync(file, "utf8");
    // Strip comments first: several modules deliberately document this
    // anti-pattern in prose (e.g. `insertStaffAuditEvent`'s doc comment) to
    // explain why `sql.json`/`tx.json` is required instead — that mention
    // must not itself trip the scanner.
    const withoutComments = content
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/(^|\s)\/\/.*$/gm, "");
    expect(FORBIDDEN_PATTERN.test(withoutComments)).toBe(false);
  });
});
