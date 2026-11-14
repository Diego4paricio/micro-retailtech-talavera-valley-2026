import { industries } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  countries,
  countryLabel,
  industryLabels,
  listTimeZones,
} from "../src/features/business-profile/options.js";

describe("industryLabels", () => {
  it("has a Spanish label for every industry the contract allows", () => {
    for (const industry of industries) {
      expect(industryLabels[industry]).toBeTypeOf("string");
      expect(industryLabels[industry].length).toBeGreaterThan(0);
    }
  });
});

describe("countryLabel", () => {
  it("returns the Spanish name for a known ISO2 code", () => {
    expect(countryLabel("MX")).toBe("México");
  });

  it("falls back to the raw code for an unknown country", () => {
    expect(countryLabel("ZZ")).toBe("ZZ");
  });

  it("returns null when no code is given", () => {
    expect(countryLabel(undefined)).toBeNull();
  });

  it("lists at least the markets Kardo supports today, without duplicates", () => {
    const codes = countries.map((country) => country.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain("MX");
  });
});

describe("listTimeZones", () => {
  it("includes Kardo's default time zone", () => {
    expect(listTimeZones()).toContain("America/Mexico_City");
  });
});
