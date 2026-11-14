import { describe, expect, it } from "vitest";
import { resolveErrorMessage } from "../src/lib/api.js";

describe("resolveErrorMessage", () => {
  it("uses the server's own message for dynamic, per-instance errors", () => {
    expect(
      resolveErrorMessage(
        409,
        "EXPERIENCE_LIVE",
        "«Mesa 4» se quedaría sin nada que mostrar.",
      ),
    ).toBe("«Mesa 4» se quedaría sin nada que mostrar.");
    expect(
      resolveErrorMessage(
        409,
        "ASSET_IN_USE",
        "Lo usan las Experiences «Menú» y «Catálogo».",
      ),
    ).toBe("Lo usan las Experiences «Menú» y «Catálogo».");
    expect(
      resolveErrorMessage(
        409,
        "TARGETS_OVERRIDDEN",
        "Todos los touchpoints ya muestran otra Experience.",
      ),
    ).toBe("Todos los touchpoints ya muestran otra Experience.");
  });

  it("falls back to a generic, friendly message when the server sends none", () => {
    expect(resolveErrorMessage(409, "EXPERIENCE_LIVE", null)).toMatch(
      /QR o etiqueta/i,
    );
    expect(resolveErrorMessage(409, "ASSET_IN_USE", null)).toMatch(/página/i);
  });

  it("keeps the static, curated wording for known non-dynamic codes", () => {
    expect(
      resolveErrorMessage(409, "GROUP_NAME_TAKEN", "raw server text"),
    ).toBe("Ya existe un grupo con ese nombre en ese mismo lugar.");
  });

  it("falls back to a status-based message for unknown codes", () => {
    expect(resolveErrorMessage(404, null, null)).toContain("No encontramos");
    expect(resolveErrorMessage(500, "SOMETHING_ELSE", "raw text")).toBe(
      "No pudimos completar esta acción. Intenta de nuevo.",
    );
  });
});
