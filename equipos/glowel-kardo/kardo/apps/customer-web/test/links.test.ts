import { describe, expect, it } from "vitest";
import { linkAddressLabel, linkPublicUrl } from "../src/api/links.js";
import { helpGuides } from "../src/features/help/guides.js";
import { linksEmptyStateCopy } from "../src/features/links/link-experience.js";
import {
  dayAndMonth,
  linksBaseLabel,
  linksBaseUrl,
  nextAddressChange,
} from "../src/lib/business-address.js";
import { tapResolverUrl } from "../src/supabase.js";

describe("linkPublicUrl", () => {
  it("uses <base>/<negocio>/<link> once both addresses exist", () => {
    expect(
      linkPublicUrl(
        { slug: "menu", handle: "cafe", publicId: "abc123" },
        "cafe-nube",
      ),
    ).toBe(`${linksBaseUrl}/cafe-nube/menu`);
  });

  it("uses the Resolver's own address when no links domain is set (development)", () => {
    // Production sets VITE_LINKS_BASE_URL=https://kardo.com.mx.
    expect(linksBaseUrl).toBe(tapResolverUrl);
  });

  it("keeps the older handle route while the link or the business has no address", () => {
    expect(
      linkPublicUrl(
        { slug: "menu", handle: "cafe-nube", publicId: "abc123" },
        null,
      ),
    ).toContain("/@cafe-nube");
    expect(
      linkPublicUrl({ handle: "cafe-nube", publicId: "abc123" }, "cafe-nube"),
    ).toContain("/@cafe-nube");
  });

  it("falls back to the public-id route with neither", () => {
    expect(linkPublicUrl({ handle: null, publicId: "abc123" })).toContain(
      "/t/abc123",
    );
  });
});

describe("linkAddressLabel", () => {
  it("reads like the address, with a stand-in before the business has one", () => {
    expect(linkAddressLabel("cafe-nube", "menu")).toBe(
      `${linksBaseLabel}cafe-nube/menu`,
    );
    expect(linkAddressLabel(null, "menu")).toBe(
      `${linksBaseLabel}tu-negocio/menu`,
    );
  });
});

describe("the 7 days between address changes", () => {
  const now = new Date("2026-10-04T18:00:00.000Z");

  it("lets an address that never changed change now", () => {
    expect(nextAddressChange(null, now)).toBeNull();
    expect(nextAddressChange(undefined, now)).toBeNull();
  });

  it("says the day it can change again, 7 days after the last change", () => {
    const next = nextAddressChange("2026-10-02T18:00:00.000Z", now);
    expect(next?.toISOString()).toBe("2026-10-09T18:00:00.000Z");
    expect(dayAndMonth(next as Date)).toBe("9 de octubre");
  });

  it("frees it once the 7 days are over", () => {
    expect(nextAddressChange("2026-09-20T18:00:00.000Z", now)).toBeNull();
  });
});

describe("the «Aún no tienes links» empty state (C7b, C7c)", () => {
  it("explains what a link is and offers «Nuevo link» once there is an address", () => {
    const copy = linksEmptyStateCopy(true);
    expect(copy.offersNewLink).toBe(true);
    expect(copy.description).toBe(
      "Una dirección para compartir tu página por WhatsApp o Instagram. Tu página ya se ve en tu QR.",
    );
  });

  it("asks for the business address first, and never offers a silently disabled «Nuevo link»", () => {
    const copy = linksEmptyStateCopy(false);
    expect(copy.offersNewLink).toBe(false);
    expect(copy.description).toBe("Primero elige tu link en Kardo.");
  });
});

describe("the Links help names the address in use", () => {
  it("never writes a fixed domain", () => {
    const guide = helpGuides.links;
    const text = JSON.stringify(guide);
    expect(guide.summary).toContain(`${linksBaseLabel}tu-negocio/menu`);
    if (!linksBaseLabel.startsWith("kardo.com.mx"))
      expect(text).not.toContain("kardo.com.mx");
  });
});
