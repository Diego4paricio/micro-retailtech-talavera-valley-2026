import { describe, expect, it } from "vitest";
import { heroBusinesses } from "@/components/hero/businesses";

// The hero speaks to many trades (the owner, 2026-09-28: "no muestres un
// caso único") and its panel shows only what the panel really has.

describe("hero businesses", () => {
  it("covers several trades, not only restaurants", () => {
    const words = heroBusinesses.map((business) => business.word);
    expect(new Set(words).size).toBe(words.length);
    expect(words.length).toBeGreaterThanOrEqual(4);
    expect(words[0]).not.toBe("restaurante");
  });

  it("shows a different kind of page for each trade", () => {
    const types = heroBusinesses.map((business) => business.pageKind);
    expect(new Set(types).size).toBe(types.length);
  });

  it("splits visits between NFC, QR and URL directa", () => {
    for (const business of heroBusinesses)
      expect(
        business.channels.reduce((total, share) => total + share, 0),
        business.id,
      ).toBe(100);
  });

  it("only shows leads for a business whose page is a form", () => {
    for (const business of heroBusinesses)
      if (business.section?.kind === "leads")
        expect(business.pageKind, business.id).toBe("form");
  });

  it("only shows availability for a Menú or a Catálogo", () => {
    for (const business of heroBusinesses)
      if (business.section?.kind === "availability")
        expect(["menu", "catalog"], business.id).toContain(business.pageKind);
  });

  it("draws 14 days on every sparkline", () => {
    for (const business of heroBusinesses) {
      expect(business.visitSeries).toHaveLength(14);
      expect(business.clickSeries).toHaveLength(14);
    }
  });
});
