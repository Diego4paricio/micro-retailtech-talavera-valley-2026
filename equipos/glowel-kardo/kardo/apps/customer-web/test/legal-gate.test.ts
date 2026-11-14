import { legalVersions } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { buildLegalLinks } from "../src/features/legal/legal-links.js";
import {
  isPendingMarkCurrent,
  needsTermsAcceptance,
  termsGateTitle,
} from "../src/features/legal/terms-model.js";

const current = {
  termsVersion: legalVersions.terms,
  privacyVersion: legalVersions.privacy,
};

describe("needsTermsAcceptance", () => {
  it("is false only when both versions are current", () => {
    expect(needsTermsAcceptance(current)).toBe(false);
    expect(needsTermsAcceptance({})).toBe(true);
    expect(needsTermsAcceptance({ ...current, termsVersion: "0.9" })).toBe(
      true,
    );
    expect(needsTermsAcceptance({ ...current, privacyVersion: null })).toBe(
      true,
    );
  });
  it("titles first time vs update", () => {
    expect(termsGateTitle({ termsAcceptedAt: null })).toBe(
      "Antes de continuar",
    );
    expect(termsGateTitle({ termsAcceptedAt: "2026-01-01T00:00:00Z" })).toBe(
      "Actualizamos nuestros Términos",
    );
  });
});

describe("isPendingMarkCurrent", () => {
  it("accepts only the current versions", () => {
    const ok = JSON.stringify({
      terms: legalVersions.terms,
      privacy: legalVersions.privacy,
    });
    expect(isPendingMarkCurrent(ok)).toBe(true);
    expect(isPendingMarkCurrent(null)).toBe(false);
    expect(isPendingMarkCurrent("nope")).toBe(false);
    expect(isPendingMarkCurrent('{"terms":"0.1","privacy":"1.0"}')).toBe(false);
  });
});

describe("buildLegalLinks", () => {
  it("prefers the configured website", () => {
    const links = buildLegalLinks({
      configured: "https://kardo.mx/",
      location: new URL("https://app.otro.com/x"),
    });
    expect(links.terms).toBe("https://kardo.mx/terminos");
    expect(links.cancellation).toBe(
      "https://kardo.mx/cancelacion-y-reembolsos",
    );
  });
  it("uses the local website on localhost", () => {
    const links = buildLegalLinks({
      location: new URL("http://localhost:5174/"),
    });
    expect(links.privacy).toBe("http://localhost:5177/privacidad");
  });
  it("strips the app. prefix in production", () => {
    const links = buildLegalLinks({
      location: new URL("https://app.kardo.mx/inicio"),
    });
    expect(links.terms).toBe("https://kardo.mx/terminos");
  });
});
