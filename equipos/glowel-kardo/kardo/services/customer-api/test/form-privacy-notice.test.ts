import { describe, expect, it } from "vitest";
import { ContentValidationError } from "../src/errors.js";
import { validateExperienceContent } from "../src/validation/experience-content.js";

const form = {
  title: "Pide informes",
  fields: { name: "required", phone: "optional", message: "optional" },
  submitLabel: "Enviar",
  successMessage: "Gracias, te contactamos pronto.",
  consentText:
    "Acepto que Florería Lila use mis datos para responder a mi solicitud, según su aviso de privacidad.",
};

describe("form privacy notice (the business is the data controller)", () => {
  it("is optional", () => {
    const { content } = validateExperienceContent("form", form);
    expect(content).not.toHaveProperty("privacyNoticeUrl");
  });

  it("keeps a normalized https link", () => {
    const { content } = validateExperienceContent("form", {
      ...form,
      privacyNoticeUrl: "https://florerialila.mx/privacidad",
    });
    expect((content as { privacyNoticeUrl?: string }).privacyNoticeUrl).toBe(
      "https://florerialila.mx/privacidad",
    );
  });

  it("rejects script, plain http and credentials", () => {
    for (const privacyNoticeUrl of [
      "javascript:alert(1)",
      "http://florerialila.mx/privacidad",
      "https://user:pass@florerialila.mx/privacidad",
    ]) {
      expect(() =>
        validateExperienceContent("form", { ...form, privacyNoticeUrl }),
      ).toThrow(ContentValidationError);
    }
  });
});
