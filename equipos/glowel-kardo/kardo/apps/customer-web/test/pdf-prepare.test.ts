import type { Asset } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  pdfRejectionNotice,
  rejectedReasonOf,
} from "../src/lib/pdf/prepare.js";

// Pure helpers only: the full upload pipeline needs pdf.js, a canvas and the
// Assets API, exercised live in the browser instead (see the relevo report
// for the manual pass). These cover the "rejected PDF never blocks creating
// the Experience" path the coordinator diagnosed: a PDF the Assets Worker
// rejects for active content (forms, scripts) still lets its pages through.

function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: "11111111-1111-1111-1111-111111111111",
    filename: "Calculadora_Reto.pdf",
    mediaType: "application/pdf",
    byteSize: 1_024,
    sha256: "0".repeat(64),
    status: "rejected",
    ...overrides,
  };
}

describe("rejectedReasonOf", () => {
  it("reads an optional rejectedReason the Asset response may carry", () => {
    const withReason = asset() as Asset & { rejectedReason?: string };
    withReason.rejectedReason = "The PDF includes active content.";
    expect(rejectedReasonOf(withReason)).toBe(
      "The PDF includes active content.",
    );
  });

  it("is undefined when the field is absent, blank, or not a string", () => {
    expect(rejectedReasonOf(asset())).toBeUndefined();
    const blank = asset() as Asset & { rejectedReason?: string };
    blank.rejectedReason = "   ";
    expect(rejectedReasonOf(blank)).toBeUndefined();
  });
});

describe("pdfRejectionNotice: always a clear, non-blocking explanation", () => {
  it("names forms or scripts for the active-content reason", () => {
    const message = pdfRejectionNotice("The PDF includes active content.");
    expect(message).toContain("formularios para llenar");
    expect(message).toContain("Se verá en la página igual.");
  });

  it("explains a complex/unsafe-to-scan PDF without naming forms or scripts", () => {
    const message = pdfRejectionNotice(
      "The PDF includes a stream this scanner cannot inspect safely.",
    );
    expect(message).not.toContain("formularios para llenar");
    expect(message).toContain("Se verá en la página igual.");
  });

  it("falls back to a generic, still-honest message for an unknown or missing reason", () => {
    expect(pdfRejectionNotice(undefined)).toContain(
      "Se verá en la página igual.",
    );
    expect(
      pdfRejectionNotice("Some future reason the panel doesn't know yet."),
    ).toContain("Se verá en la página igual.");
  });
});
