import { describe, expect, it } from "vitest";
import {
  confirmContactedQuestion,
  leadContactLinks,
  leadMailUrl,
  leadPhoneCountryUnknown,
  leadTelUrl,
  leadWhatsAppGreeting,
  leadWhatsAppUrl,
  shouldAskIfAttended,
} from "../src/features/leads/lead-contact.js";

const business = "Consultorio Dental Sonrisa Maya";

describe("leadWhatsAppGreeting", () => {
  it("greets by name", () => {
    expect(leadWhatsAppGreeting("Mariana Pech", business)).toBe(
      "Hola Mariana Pech, te escribo de Consultorio Dental Sonrisa Maya por tu solicitud",
    );
  });

  it("drops the name when there is none", () => {
    expect(leadWhatsAppGreeting(null, business)).toBe(
      "Hola, te escribo de Consultorio Dental Sonrisa Maya por tu solicitud",
    );
    expect(leadWhatsAppGreeting("   ", business)).toBe(
      "Hola, te escribo de Consultorio Dental Sonrisa Maya por tu solicitud",
    );
  });
});

describe("leadWhatsAppUrl (C3a: número mexicano normalizado)", () => {
  it("builds wa.me from a bare 10-digit Mexican number", () => {
    const url = leadWhatsAppUrl("9994552301", "Jorge Méndez", business);
    expect(url).toMatch(/^https:\/\/wa\.me\/529994552301\?text=/);
  });

  it("builds wa.me from a number already carrying +52", () => {
    const url = leadWhatsAppUrl("+52 999 455 2301", "Jorge Méndez", business);
    expect(url).toMatch(/^https:\/\/wa\.me\/529994552301\?text=/);
  });

  it("builds wa.me from a number written with spaces, with no country code lost", () => {
    const url = leadWhatsAppUrl("999 455 2301", "Jorge Méndez", business);
    expect(url).toMatch(/^https:\/\/wa\.me\/529994552301\?text=/);
  });

  it("includes the greeting, URL-encoded, with the person's name", () => {
    const url = leadWhatsAppUrl("9994552301", "Jorge Méndez", business);
    expect(url).toContain(encodeURIComponent("Hola Jorge Méndez"));
    expect(url).toContain(
      encodeURIComponent(`de ${business} por tu solicitud`),
    );
  });

  it("is undefined without a phone", () => {
    expect(leadWhatsAppUrl(null, "Jorge Méndez", business)).toBeUndefined();
    expect(
      leadWhatsAppUrl(undefined, "Jorge Méndez", business),
    ).toBeUndefined();
  });

  it("is undefined for a number too short to be a phone", () => {
    expect(leadWhatsAppUrl("12345", "Jorge Méndez", business)).toBeUndefined();
  });
});

describe("leadTelUrl", () => {
  it("keeps only digits and a leading plus", () => {
    expect(leadTelUrl("999 455 2301")).toBe("tel:9994552301");
    expect(leadTelUrl("+52 (999) 455-2301")).toBe("tel:+529994552301");
  });

  it("is undefined without a phone", () => {
    expect(leadTelUrl(null)).toBeUndefined();
    expect(leadTelUrl("   ")).toBeUndefined();
  });
});

describe("leadMailUrl", () => {
  it("adds a short subject naming the business", () => {
    const url = leadMailUrl("mariana@example.com", business);
    expect(url).toBe(
      `mailto:mariana%40example.com?subject=${encodeURIComponent(
        `Tu solicitud a ${business}`,
      )}`,
    );
  });
});

describe("leadContactLinks", () => {
  it("includes whatsapp and tel only when the phone normalizes", () => {
    const links = leadContactLinks(
      { name: "Mariana Pech", phone: "9994552301", email: "m@example.com" },
      business,
    );
    expect(links.whatsapp).toMatch(/^https:\/\/wa\.me\/529994552301/);
    expect(links.tel).toBe("tel:9994552301");
    expect(links.mailto).toContain("mailto:m%40example.com");
  });

  it("drops whatsapp and tel without a phone, keeping mailto", () => {
    const links = leadContactLinks(
      { name: "Mariana Pech", phone: null, email: "m@example.com" },
      business,
    );
    expect(links.whatsapp).toBeUndefined();
    expect(links.tel).toBeUndefined();
    expect(links.mailto).toContain("mailto:m%40example.com");
  });
});

describe("confirmContactedQuestion (C3b)", () => {
  it("asks by name", () => {
    expect(confirmContactedQuestion("Mariana Pech")).toBe(
      "¿Ya atendiste a Mariana Pech?",
    );
  });

  it("falls back without a name", () => {
    expect(confirmContactedQuestion(null)).toBe(
      "¿Ya atendiste esta solicitud?",
    );
    expect(confirmContactedQuestion(undefined)).toBe(
      "¿Ya atendiste esta solicitud?",
    );
  });
});

describe("leadWhatsAppUrl (A2-53 c: no adivinar el país)", () => {
  it("keeps the country code a number already carries", () => {
    expect(leadWhatsAppUrl("+1 415 555 2671", null, business)).toMatch(
      /^https:\/\/wa\.me\/14155552671\?/,
    );
    expect(leadWhatsAppUrl("+34 912 345 678", null, business)).toMatch(
      /^https:\/\/wa\.me\/34912345678\?/,
    );
    expect(leadWhatsAppUrl("0034 912 345 678", null, business)).toMatch(
      /^https:\/\/wa\.me\/34912345678\?/,
    );
  });

  it("adds 52 to 10 digits only for a Mexican business", () => {
    expect(leadWhatsAppUrl("9994552301", null, business, "MX")).toMatch(
      /wa\.me\/529994552301/,
    );
    expect(leadWhatsAppUrl("9994552301", null, business, "CO")).toBeUndefined();
    expect(leadPhoneCountryUnknown("9994552301", "CO")).toBe(true);
    expect(leadPhoneCountryUnknown("9994552301", "MX")).toBe(false);
  });

  it("does not warn when there is no phone", () => {
    expect(leadPhoneCountryUnknown(null)).toBe(false);
    expect(leadPhoneCountryUnknown("  ")).toBe(false);
  });
});

describe("shouldAskIfAttended (A2-53 a)", () => {
  it("asks only for a request still «Por atender»", () => {
    expect(shouldAskIfAttended("new")).toBe(true);
    expect(shouldAskIfAttended(undefined)).toBe(true);
    expect(shouldAskIfAttended("contacted")).toBe(false);
    expect(shouldAskIfAttended("closed")).toBe(false);
  });
});
