import { describe, expect, it } from "vitest";
import {
  brandLinkKind,
  buildPlainLink,
  buildProfileLink,
  buildWhatsAppLink,
  isProfileHandleBrand,
  normalizeWhatsAppPhone,
  parseProfileLink,
  parseWhatsAppLink,
  profileHandleBrands,
} from "../src/features/studio/model/brand-links.js";

describe("normalizeWhatsAppPhone", () => {
  it("prepends Mexico's 52 to a bare 10-digit number", () => {
    expect(normalizeWhatsAppPhone("5555555555")).toBe("525555555555");
  });

  it("accepts formatted input (spaces, dashes, parens)", () => {
    expect(normalizeWhatsAppPhone("(55) 5555-5555")).toBe("525555555555");
  });

  it("leaves a number that already starts with 52 alone", () => {
    expect(normalizeWhatsAppPhone("525555555555")).toBe("525555555555");
  });

  it("honors an explicit + country code instead of Mexico's default", () => {
    expect(normalizeWhatsAppPhone("+1 310 555 1234")).toBe("13105551234");
  });

  it("returns an empty string for input with no digits", () => {
    expect(normalizeWhatsAppPhone("   ")).toBe("");
  });
});

describe("buildWhatsAppLink", () => {
  it("builds a wa.me link from a bare Mexican number", () => {
    expect(buildWhatsAppLink({ phone: "5555555555" })).toBe(
      "https://wa.me/525555555555",
    );
  });

  it("appends an encoded prefilled message", () => {
    expect(
      buildWhatsAppLink({
        phone: "5555555555",
        message: "Hola, quiero reservar una mesa",
      }),
    ).toBe(
      "https://wa.me/525555555555?text=Hola%2C%20quiero%20reservar%20una%20mesa",
    );
  });

  it("ignores a blank message", () => {
    expect(buildWhatsAppLink({ phone: "5555555555", message: "   " })).toBe(
      "https://wa.me/525555555555",
    );
  });

  it("returns an empty string without a phone number", () => {
    expect(buildWhatsAppLink({ phone: "" })).toBe("");
  });
});

describe("parseWhatsAppLink", () => {
  it("recovers the phone and message from a built link", () => {
    expect(
      parseWhatsAppLink(
        "https://wa.me/525555555555?text=Hola%2C%20quiero%20reservar",
      ),
    ).toEqual({ phone: "525555555555", message: "Hola, quiero reservar" });
  });

  it("recovers a bare phone with no message", () => {
    expect(parseWhatsAppLink("https://wa.me/525555555555")).toEqual({
      phone: "525555555555",
      message: "",
    });
  });

  it("round-trips through buildWhatsAppLink", () => {
    const href = buildWhatsAppLink({
      phone: "5555555555",
      message: "Hola!",
    });
    expect(parseWhatsAppLink(href)).toEqual({
      phone: "525555555555",
      message: "Hola!",
    });
  });

  it("returns blank fields for a URL that isn't its own shape", () => {
    expect(parseWhatsAppLink("https://instagram.com/elsol")).toEqual({
      phone: "",
      message: "",
    });
    expect(parseWhatsAppLink("")).toEqual({ phone: "", message: "" });
  });
});

describe("parseProfileLink", () => {
  it("recovers the bare handle from each brand's own URL shape", () => {
    expect(parseProfileLink("instagram", "https://instagram.com/elsol")).toBe(
      "elsol",
    );
    expect(parseProfileLink("tiktok", "https://www.tiktok.com/@elsol")).toBe(
      "elsol",
    );
    expect(parseProfileLink("x", "https://x.com/elsol")).toBe("elsol");
    expect(parseProfileLink("threads", "https://www.threads.net/@elsol")).toBe(
      "elsol",
    );
    expect(parseProfileLink("facebook", "https://facebook.com/elsol")).toBe(
      "elsol",
    );
    expect(parseProfileLink("youtube", "https://www.youtube.com/@elsol")).toBe(
      "elsol",
    );
    expect(parseProfileLink("telegram", "https://t.me/elsol")).toBe("elsol");
  });

  it("falls back to the raw href when it doesn't match the brand's shape", () => {
    expect(parseProfileLink("instagram", "https://example.com/x")).toBe(
      "https://example.com/x",
    );
  });

  it("round-trips through buildProfileLink", () => {
    const href = buildProfileLink("instagram", "@elsol");
    expect(parseProfileLink("instagram", href)).toBe("elsol");
  });

  it("returns an empty string for empty input", () => {
    expect(parseProfileLink("instagram", "")).toBe("");
  });
});

describe("isProfileHandleBrand / profileHandleBrands", () => {
  it("lists exactly the seven handle-or-URL brands", () => {
    expect([...profileHandleBrands].sort()).toEqual(
      [
        "facebook",
        "instagram",
        "telegram",
        "threads",
        "tiktok",
        "x",
        "youtube",
      ].sort(),
    );
  });

  it("excludes brands with no handle shorthand", () => {
    expect(isProfileHandleBrand("whatsapp")).toBe(false);
    expect(isProfileHandleBrand("ubereats")).toBe(false);
    expect(isProfileHandleBrand("spotify")).toBe(false);
  });
});

describe("buildProfileLink", () => {
  it("builds each brand's profile URL from a bare handle", () => {
    expect(buildProfileLink("instagram", "elsol")).toBe(
      "https://instagram.com/elsol",
    );
    expect(buildProfileLink("tiktok", "elsol")).toBe(
      "https://www.tiktok.com/@elsol",
    );
    expect(buildProfileLink("x", "elsol")).toBe("https://x.com/elsol");
    expect(buildProfileLink("threads", "elsol")).toBe(
      "https://www.threads.net/@elsol",
    );
    expect(buildProfileLink("facebook", "elsol")).toBe(
      "https://facebook.com/elsol",
    );
    expect(buildProfileLink("youtube", "elsol")).toBe(
      "https://www.youtube.com/@elsol",
    );
    expect(buildProfileLink("telegram", "elsol")).toBe("https://t.me/elsol");
  });

  it("strips a leading @ from the handle", () => {
    expect(buildProfileLink("instagram", "@elsol")).toBe(
      "https://instagram.com/elsol",
    );
  });

  it("passes a full https URL through unchanged", () => {
    expect(
      buildProfileLink("instagram", "https://instagram.com/panaderiaelsol"),
    ).toBe("https://instagram.com/panaderiaelsol");
  });

  it("upgrades a pasted http URL to https", () => {
    expect(buildProfileLink("facebook", "http://facebook.com/elsol")).toBe(
      "https://facebook.com/elsol",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(buildProfileLink("x", "  elsol  ")).toBe("https://x.com/elsol");
  });

  it("returns an empty string for blank input", () => {
    expect(buildProfileLink("instagram", "   ")).toBe("");
  });
});

describe("buildPlainLink", () => {
  it("trims and upgrades http to https", () => {
    expect(buildPlainLink("  http://maps.example.com/x  ")).toBe(
      "https://maps.example.com/x",
    );
  });

  it("passes an https URL through unchanged", () => {
    expect(buildPlainLink("https://ubereats.com/x")).toBe(
      "https://ubereats.com/x",
    );
  });

  it("returns an empty string for blank input", () => {
    expect(buildPlainLink("")).toBe("");
  });
});

describe("brandLinkKind", () => {
  it("routes whatsapp to its own kind", () => {
    expect(brandLinkKind("whatsapp")).toBe("whatsapp");
  });

  it("routes the handle brands to 'profile'", () => {
    for (const brand of profileHandleBrands) {
      expect(brandLinkKind(brand)).toBe("profile");
    }
  });

  it("routes everything else to a plain URL", () => {
    for (const brand of [
      "messenger",
      "pinterest",
      "spotify",
      "waze",
      "ubereats",
      "mercadopago",
      "tripadvisor",
      "booking",
      "calendly",
    ] as const) {
      expect(brandLinkKind(brand)).toBe("url");
    }
  });
});
