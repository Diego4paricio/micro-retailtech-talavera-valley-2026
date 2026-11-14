import { describe, expect, it } from "vitest";
import {
  normalizeSocialValue,
  validateSocialValue,
} from "../src/features/experiences/social-networks.js";

describe("validateSocialValue", () => {
  it("accepts each network's own domain, including alternates", () => {
    expect(
      validateSocialValue("whatsapp", "https://wa.me/521234567890"),
    ).toBeNull();
    expect(validateSocialValue("x", "https://twitter.com/kardo")).toBeNull();
    expect(
      validateSocialValue("youtube", "https://youtu.be/abc123"),
    ).toBeNull();
  });

  it("rejects a URL pointing to the wrong network's domain", () => {
    expect(
      validateSocialValue("whatsapp", "https://instagram.com/kardo"),
    ).toContain("WhatsApp");
  });

  it("accepts any safe https URL for the generic website network", () => {
    expect(
      validateSocialValue("website", "https://mi-negocio.example"),
    ).toBeNull();
  });

  it("rejects non-HTTPS or credentialed URLs for every URL-based network", () => {
    expect(validateSocialValue("website", "http://example.com")).toBeTruthy();
    expect(
      validateSocialValue("website", "https://user:pass@example.com"),
    ).toBeTruthy();
  });

  it("validates email by format", () => {
    expect(validateSocialValue("email", "hola@kardo.mx")).toBeNull();
    expect(validateSocialValue("email", "no-es-un-correo")).toBeTruthy();
  });

  it("validates phone as 6-15 digits, tolerating spaces/dashes/parens", () => {
    expect(validateSocialValue("phone", "+52 55 1234 5678")).toBeNull();
    expect(validateSocialValue("phone", "123")).toBeTruthy();
  });

  it("requires a value", () => {
    expect(validateSocialValue("website", "")).toBeTruthy();
  });
});

describe("normalizeSocialValue", () => {
  it("lowercases email addresses", () => {
    expect(normalizeSocialValue("email", " Hola@Kardo.MX ")).toBe(
      "hola@kardo.mx",
    );
  });

  it("strips spaces, dashes and parentheses from phone numbers", () => {
    expect(normalizeSocialValue("phone", "+52 (55) 1234-5678")).toBe(
      "+525512345678",
    );
  });

  it("normalizes URL-based networks through the shared HTTPS rule", () => {
    expect(normalizeSocialValue("website", "https://Example.com")).toBe(
      "https://example.com/",
    );
  });
});

describe("the rules come from @kardo/contracts (domain audit A2-29)", () => {
  it("accepts and rejects with the contract's table and patterns", async () => {
    const { socialNetworkDomains } = await import("@kardo/contracts");
    expect(socialNetworkDomains.instagram).toContain("instagram.com");
    expect(
      validateSocialValue("instagram", "https://instagram.com/mi_negocio"),
    ).toBeNull();
    expect(
      validateSocialValue("instagram", "https://facebook.com/mi_negocio"),
    ).toContain("instagram.com");
    expect(validateSocialValue("email", "hola@mi-negocio.mx")).toBeNull();
    expect(validateSocialValue("phone", "+52 55 1234 5678")).toBeNull();
  });
});
