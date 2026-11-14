import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// postgres.js infers `jsonb` for `${value}::jsonb` and serializes the value
// itself. A pre-stringified value is therefore stored as a JSON *string*
// (found by the end-to-end run against kardo-dev). Always pass objects via
// `sql.json(value)`.
const services = path.resolve(__dirname, "../..");
function sources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const full = path.join(directory, entry);
    if (statSync(full).isDirectory()) return sources(full);
    return full.endsWith(".ts") ? [full] : [];
  });
}

describe("jsonb parameters", () => {
  it("never pass pre-stringified JSON to a jsonb parameter", () => {
    const offenders = ["customer-api", "publisher", "analytics-worker"]
      .flatMap((service) => sources(path.join(services, service, "src")))
      .filter((file) =>
        /JSON\.stringify\([^`]*\)\}::jsonb/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(services, file));
    expect(offenders).toEqual([]);
  });
});

// `publication_status` is an enum without a `draft` label, so
// `coalesce(pub.status, 'draft')` fails at runtime with 22P02 (also found by
// the end-to-end run). Cast to text before falling back to `draft`.
describe("publication status fallbacks", () => {
  it("cast the enum to text before coalescing to 'draft'", () => {
    const offenders = sources(path.join(services, "customer-api", "src"))
      .filter((file) =>
        /coalesce\(\s*[\w.]+status\s*,\s*'draft'\s*\)/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => path.relative(services, file));
    expect(offenders).toEqual([]);
  });
});

// `bool_or` over rows where the compared column is null yields NULL, not
// false, and `not NULL` is NULL: that silently disabled the direct-target
// precedence rule (found by the end-to-end run). Always coalesce it.
describe("boolean aggregates", () => {
  it("coalesce bool_or to false", () => {
    const offenders = sources(path.join(services, "customer-api", "src"))
      .filter((file) =>
        /(?<!coalesce\()bool_or\(/.test(readFileSync(file, "utf8")),
      )
      .map((file) => path.relative(services, file));
    expect(offenders).toEqual([]);
  });
});
