import { describe, expect, it } from "vitest";
import {
  allAssetRefs,
  findLinkableUrl,
  type PublishedSnapshot,
  publishCommand,
  publishedSnapshot,
} from "../src/snapshot.js";

const publicId = "kardotesttouchpoint01";

describe("publishCommand: redirect", () => {
  it("accepts the experience-shaped redirect command the Publisher sends (regression for the 400 bug)", () => {
    const command = publishCommand({
      publicId,
      revision: 1,
      experience: {
        type: "redirect",
        destinationUrl: "https://kardo.test/bienvenida",
      },
    });
    expect(command).toEqual({
      publicId,
      revision: 1,
      experience: {
        type: "redirect",
        destinationUrl: "https://kardo.test/bienvenida",
      },
    });
  });

  it("still accepts a legacy top-level destinationUrl snapshot with no experience field", () => {
    const command = publishCommand({
      publicId,
      revision: 1,
      destinationUrl: "https://kardo.test/legacy",
    });
    expect(command).toEqual({
      publicId,
      revision: 1,
      destinationUrl: "https://kardo.test/legacy",
    });
  });

  it("still accepts a legacy asset-only snapshot with no experience field", () => {
    const command = publishCommand({
      publicId,
      revision: 1,
      asset: { sha256: "a".repeat(64), mediaType: "image/png", title: "Foto" },
    });
    expect(command?.asset).toEqual({
      sha256: "a".repeat(64),
      mediaType: "image/png",
      title: "Foto",
    });
  });

  it.each([
    "image/png",
    "image/jpeg",
    "image/webp",
    "application/pdf",
  ] as const)(
    "accepts %s as a valid asset media type in the assets array",
    (mediaType) => {
      const command = publishCommand({
        publicId,
        revision: 1,
        experience: { type: "image", alt: "Foto" },
        assets: [{ sha256: "a".repeat(64), mediaType }],
      });
      expect(command?.assets).toEqual([{ sha256: "a".repeat(64), mediaType }]);
    },
  );

  it("rejects an unsupported asset media type", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "image", alt: "Foto" },
        assets: [{ sha256: "a".repeat(64), mediaType: "image/gif" }],
      }),
    ).toBeNull();
  });

  it("rejects a non-HTTPS destination", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "redirect", destinationUrl: "http://kardo.test" },
      }),
    ).toBeNull();
  });

  it("rejects a destination that is not already stored in its normalized form", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "redirect", destinationUrl: "https://kardo.test" },
      }),
    ).toBeNull();
  });

  it("rejects a command with neither an experience nor a legacy field", () => {
    expect(publishCommand({ publicId, revision: 1 })).toBeNull();
  });
});

describe("publishCommand: links and profile", () => {
  it("accepts a links experience and rejects an empty link list", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "links",
          title: "Enlaces",
          links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
        },
      }),
    ).not.toBeNull();
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "links", title: "Enlaces", links: [] },
      }),
    ).toBeNull();
  });

  it("rejects more than 12 links", () => {
    const links = Array.from({ length: 13 }, (_, i) => ({
      id: `l${i}`,
      label: `Enlace ${i}`,
      url: "https://kardo.test/",
    }));
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "links", title: "Enlaces", links },
      }),
    ).toBeNull();
  });

  it("accepts a profile with zero links, a biography, and an avatarSha256", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "profile",
          displayName: "Estudio Kardo",
          biography: "Diseño y branding.",
          avatarSha256: "b".repeat(64),
          links: [],
        },
      }),
    ).not.toBeNull();
  });

  it("rejects a profile with a malformed avatarSha256", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "profile",
          displayName: "Estudio Kardo",
          avatarSha256: "not-a-hash",
          links: [],
        },
      }),
    ).toBeNull();
  });
});

describe("publishCommand: image and document", () => {
  it("accepts image content with only alt text (regression for the buildSnapshot title bug)", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "image", alt: "Escaparate de la tienda" },
      }),
    ).toEqual({
      publicId,
      revision: 1,
      experience: { type: "image", alt: "Escaparate de la tienda" },
    });
  });

  it("rejects image alt text over 250 characters", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "image", alt: "a".repeat(251) },
      }),
    ).toBeNull();
  });

  it("requires a title for document content", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "document" },
      }),
    ).toBeNull();
  });
});

describe("publishCommand: visor de PDF (display/pages/allowDownload)", () => {
  const pageSha256 = "1".repeat(64);
  const assets = [{ sha256: pageSha256, mediaType: "image/png" as const }];
  const validPage = { sha256: pageSha256, width: 800, height: 1000 };

  it("accepts a viewer document with at least one page and allowDownload", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "document",
          title: "Menú",
          display: "viewer",
          pages: [validPage],
          allowDownload: true,
        },
        assets,
      }),
    ).not.toBeNull();
  });

  it("accepts a document with no display/pages at all (download, unchanged)", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "document", title: "Menú" },
      }),
    ).not.toBeNull();
  });

  it("rejects an unknown display value", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "document", title: "Menú", display: "embed" },
      }),
    ).toBeNull();
  });

  it("rejects a viewer document with no pages", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "document", title: "Menú", display: "viewer" },
      }),
    ).toBeNull();
  });

  it("rejects a viewer document with more than the max pages", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "document",
          title: "Menú",
          display: "viewer",
          pages: Array.from({ length: 41 }, () => validPage),
        },
        assets,
      }),
    ).toBeNull();
  });

  it("rejects a page whose hash is absent from the snapshot's assets", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "document",
          title: "Menú",
          display: "viewer",
          pages: [validPage],
        },
        // No `assets` supplied: the page's hash cannot be verified.
      }),
    ).toBeNull();
  });

  it("rejects a page whose hash matches an asset of a non-image media type", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "document",
          title: "Menú",
          display: "viewer",
          pages: [validPage],
        },
        assets: [{ sha256: pageSha256, mediaType: "application/pdf" }],
      }),
    ).toBeNull();
  });

  it("rejects a page with a non-integer or out-of-range width/height", () => {
    for (const page of [
      { sha256: pageSha256, width: 0, height: 1000 },
      { sha256: pageSha256, width: 800.5, height: 1000 },
      { sha256: pageSha256, width: 800, height: 10_001 },
    ]) {
      expect(
        publishCommand({
          publicId,
          revision: 1,
          experience: {
            type: "document",
            title: "Menú",
            display: "viewer",
            pages: [page],
          },
          assets,
        }),
      ).toBeNull();
    }
  });

  it("rejects a non-boolean allowDownload", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "document",
          title: "Menú",
          allowDownload: "yes",
        },
      }),
    ).toBeNull();
  });
});

describe("publishCommand: menu", () => {
  const validSection = {
    id: "s1",
    name: "Bebidas",
    items: [{ id: "i1", name: "Café", price: 45 }],
  };

  it("accepts a valid menu", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "menu",
          title: "Carta",
          currency: "MXN",
          sections: [validSection],
        },
      }),
    ).not.toBeNull();
  });

  it("accepts a dish with choices and rejects malformed ones (relevo 37, D1)", () => {
    const withChoices = (item: Record<string, unknown>) =>
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "menu",
          title: "Doña Rosa",
          currency: "MXN",
          sections: [{ id: "s1", name: "Comida corrida", items: [item] }],
        },
      });
    const dish = { id: "corrida", name: "Comida corrida", price: 90 };
    expect(
      withChoices({
        ...dish,
        choicesLabel: "Elige tu guisado",
        choices: [{ id: "mole", name: "Mole" }],
      }),
    ).not.toBeNull();
    expect(withChoices({ ...dish, choices: [] })).toBeNull();
    expect(withChoices({ ...dish, choices: [{ id: "bad id", name: "x" }] })).toBeNull();
    expect(
      withChoices({ ...dish, choices: [{ id: "m", name: "Mole" }], choicesLabel: "" }),
    ).toBeNull();
  });

  it("rejects an invalid currency", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "menu",
          title: "Carta",
          currency: "pesos",
          sections: [validSection],
        },
      }),
    ).toBeNull();
  });

  it("rejects a menu exceeding 150 items in total", () => {
    const bigSection = (id: string) => ({
      id,
      name: "Sección",
      items: Array.from({ length: 30 }, (_, i) => ({
        id: `${id}-${i}`,
        name: `Platillo ${i}`,
      })),
    });
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "menu",
          title: "Carta",
          currency: "MXN",
          sections: Array.from({ length: 6 }, (_, i) => bigSection(`s${i}`)),
        },
      }),
    ).toBeNull();
  });

  it("rejects more than 10 sections", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "menu",
          title: "Carta",
          currency: "MXN",
          sections: Array.from({ length: 11 }, (_, i) => ({
            ...validSection,
            id: `s${i}`,
          })),
        },
      }),
    ).toBeNull();
  });
});

describe("publishCommand: menu item images", () => {
  const imageAsset = {
    sha256: "e".repeat(64),
    mediaType: "image/png",
  } as const;
  const menuWithImage = (imageSha256: string) => ({
    type: "menu",
    title: "Carta",
    currency: "MXN",
    sections: [
      {
        id: "s1",
        name: "Bebidas",
        items: [{ id: "i1", name: "Café", imageSha256 }],
      },
    ],
  });

  it("accepts a menu item imageSha256 that matches an image asset in the snapshot", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: menuWithImage(imageAsset.sha256),
        assets: [imageAsset],
      }),
    ).not.toBeNull();
  });

  it("rejects a menu item imageSha256 absent from the snapshot's assets (unlike catalog, this is checked)", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: menuWithImage("f".repeat(64)),
        assets: [imageAsset],
      }),
    ).toBeNull();
    // With no assets at all, it is likewise rejected.
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: menuWithImage(imageAsset.sha256),
      }),
    ).toBeNull();
  });

  it("rejects a menu item imageSha256 that matches an asset of a non-image media type", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: menuWithImage(imageAsset.sha256),
        assets: [{ sha256: imageAsset.sha256, mediaType: "application/pdf" }],
      }),
    ).toBeNull();
  });

  it("rejects a malformed menu item imageSha256", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: menuWithImage("not-a-hash"),
      }),
    ).toBeNull();
  });
});

describe("publishCommand: experienceId", () => {
  const linksExperience = {
    type: "links",
    title: "Enlaces",
    links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
  };

  it("accepts a valid canonical uuid experienceId and carries it on the parsed command", () => {
    const command = publishCommand({
      publicId,
      revision: 1,
      experience: linksExperience,
      experienceId: "9f7a4dc0-0bb7-450e-91c6-342045d779e9",
    });
    expect(command?.experienceId).toBe("9f7a4dc0-0bb7-450e-91c6-342045d779e9");
  });

  it("rejects a malformed experienceId (uppercase, wrong shape, not a string)", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience,
        experienceId: "not-a-uuid",
      }),
    ).toBeNull();
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience,
        experienceId: "9F7A4DC0-0BB7-450E-91C6-342045D779E9",
      }),
    ).toBeNull();
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience,
        experienceId: 12345,
      }),
    ).toBeNull();
  });

  it("stays valid with no experienceId at all — old snapshots keep working", () => {
    const command = publishCommand({
      publicId,
      revision: 1,
      experience: linksExperience,
    });
    expect(command).not.toBeNull();
    expect(command).not.toHaveProperty("experienceId");
  });
});

describe("publishCommand: catalog", () => {
  it("accepts a catalog item with a price, an https url, and an imageSha256", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "catalog",
          title: "Productos",
          currency: "MXN",
          items: [
            {
              id: "p1",
              name: "Vela",
              price: 199,
              url: "https://kardo.test/vela",
              imageSha256: "c".repeat(64),
            },
          ],
        },
      }),
    ).not.toBeNull();
  });

  it("rejects a catalog item url that is not HTTPS", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "catalog",
          title: "Productos",
          currency: "MXN",
          items: [{ id: "p1", name: "Vela", url: "http://kardo.test/vela" }],
        },
      }),
    ).toBeNull();
  });

  it("rejects more than 48 items", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "catalog",
          title: "Productos",
          currency: "MXN",
          items: Array.from({ length: 49 }, (_, i) => ({
            id: `p${i}`,
            name: `Producto ${i}`,
          })),
        },
      }),
    ).toBeNull();
  });
});

describe("publishCommand: form", () => {
  const base = {
    title: "Contáctanos",
    fields: { name: "optional", phone: "hidden", message: "required" },
    submitLabel: "Enviar",
    successMessage: "Gracias por tu mensaje.",
    consentText: "Acepto ser contactado.",
  };

  it("accepts a valid form", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "form", ...base },
      }),
    ).not.toBeNull();
  });

  it("accepts an https privacy notice and rejects anything else", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "form",
          ...base,
          privacyNoticeUrl: "https://florerialila.mx/privacidad",
        },
      }),
    ).not.toBeNull();
    for (const privacyNoticeUrl of [
      "javascript:alert(1)",
      "http://x.mx/p",
      42,
    ]) {
      expect(
        publishCommand({
          publicId,
          revision: 1,
          experience: { type: "form", ...base, privacyNoticeUrl },
        }),
      ).toBeNull();
    }
  });

  it("rejects an invalid field setting", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "form",
          ...base,
          fields: { ...base.fields, message: "sometimes" },
        },
      }),
    ).toBeNull();
  });

  it("rejects a submitLabel over 40 characters", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: { type: "form", ...base, submitLabel: "a".repeat(41) },
      }),
    ).toBeNull();
  });
});

describe("asset references", () => {
  it("collects both the legacy asset and the assets array for hash lookups", () => {
    const snapshot: PublishedSnapshot = {
      schemaVersion: 1,
      status: "active",
      publicId,
      revision: 1,
      experience: { type: "image", alt: "Foto" },
      asset: { sha256: "a".repeat(64), mediaType: "image/png", title: "Foto" },
      assets: [{ sha256: "b".repeat(64), mediaType: "image/png" }],
    };
    expect(allAssetRefs(snapshot)).toEqual([
      { sha256: "a".repeat(64), mediaType: "image/png", title: "Foto" },
      { sha256: "b".repeat(64), mediaType: "image/png" },
    ]);
  });

  it("only serves a hash the snapshot actually lists (checked by the caller against this list)", () => {
    const snapshot: PublishedSnapshot = {
      schemaVersion: 1,
      status: "active",
      publicId,
      revision: 1,
      experience: { type: "image", alt: "Foto" },
      assets: [{ sha256: "b".repeat(64), mediaType: "image/png" }],
    };
    const hashes = allAssetRefs(snapshot).map((asset) => asset.sha256);
    expect(hashes).not.toContain("c".repeat(64));
  });
});

describe("findLinkableUrl: no open redirect", () => {
  const linksSnapshot: PublishedSnapshot = {
    schemaVersion: 1,
    status: "active",
    publicId,
    revision: 1,
    experience: {
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
    },
  };

  it("resolves a known id to the snapshot's own url", () => {
    expect(findLinkableUrl(linksSnapshot, "l1")).toBe("https://kardo.test/");
  });

  it("returns null for an unknown id instead of accepting an arbitrary destination", () => {
    expect(findLinkableUrl(linksSnapshot, "https://evil.test")).toBeNull();
    expect(findLinkableUrl(linksSnapshot, "unknown-id")).toBeNull();
  });

  it("returns null for experience types with nothing linkable", () => {
    const menuSnapshot: PublishedSnapshot = {
      schemaVersion: 1,
      status: "active",
      publicId,
      revision: 1,
      experience: {
        type: "menu",
        title: "Carta",
        currency: "MXN",
        sections: [
          { id: "s1", name: "Bebidas", items: [{ id: "i1", name: "Café" }] },
        ],
      },
    };
    expect(findLinkableUrl(menuSnapshot, "i1")).toBeNull();
  });
});

describe("publishCommand: theme", () => {
  const solidTheme = {
    background: { kind: "solid", color: "#112233" },
    surface: "light",
    accent: "#0a6c78",
    buttonStyle: "pill",
    font: "sans",
  };
  const linksExperience = (theme: unknown) => ({
    type: "links",
    title: "Enlaces",
    links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
    theme,
  });

  it("accepts a valid solid theme", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience(solidTheme),
      }),
    ).not.toBeNull();
  });

  it("accepts a gradient theme with an integer angle and colorTo", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience({
          ...solidTheme,
          background: {
            kind: "gradient",
            color: "#112233",
            colorTo: "#445566",
            angle: 45,
          },
        }),
      }),
    ).not.toBeNull();
  });

  it("rejects a gradient theme missing colorTo", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience({
          ...solidTheme,
          background: { kind: "gradient", color: "#112233" },
        }),
      }),
    ).toBeNull();
  });

  it("rejects a non #rrggbb color", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience({
          ...solidTheme,
          background: { kind: "solid", color: "red" },
        }),
      }),
    ).toBeNull();
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience({ ...solidTheme, accent: "#fff" }),
      }),
    ).toBeNull();
  });

  it.each(["kind", "surface", "buttonStyle", "font"])(
    "rejects an unknown %s enum value",
    (field) => {
      const theme =
        field === "kind"
          ? {
              ...solidTheme,
              background: { ...solidTheme.background, kind: "sparkle" },
            }
          : { ...solidTheme, [field]: "sparkle" };
      expect(
        publishCommand({
          publicId,
          revision: 1,
          experience: linksExperience(theme),
        }),
      ).toBeNull();
    },
  );

  it.each([-1, 361, 45.5])(
    "rejects an out-of-range or non-integer angle (%s)",
    (angle) => {
      expect(
        publishCommand({
          publicId,
          revision: 1,
          experience: linksExperience({
            ...solidTheme,
            background: {
              kind: "gradient",
              color: "#112233",
              colorTo: "#445566",
              angle,
            },
          }),
        }),
      ).toBeNull();
    },
  );

  it.each([-1, 81, 10.5])(
    "rejects an out-of-range or non-integer overlay (%s)",
    (overlay) => {
      expect(
        publishCommand({
          publicId,
          revision: 1,
          experience: linksExperience({
            ...solidTheme,
            background: {
              kind: "image",
              color: "#112233",
              imageSha256: "a".repeat(64),
              overlay,
            },
          }),
          assets: [{ sha256: "a".repeat(64), mediaType: "image/png" }],
        }),
      ).toBeNull();
    },
  );

  it("accepts an image background whose hash matches an image asset in the snapshot", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience({
          ...solidTheme,
          background: {
            kind: "image",
            color: "#112233",
            imageSha256: "a".repeat(64),
            overlay: 30,
          },
        }),
        assets: [{ sha256: "a".repeat(64), mediaType: "image/png" }],
      }),
    ).not.toBeNull();
  });

  it("rejects an image background hash absent from assets", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience({
          ...solidTheme,
          background: {
            kind: "image",
            color: "#112233",
            imageSha256: "b".repeat(64),
          },
        }),
        assets: [{ sha256: "a".repeat(64), mediaType: "image/png" }],
      }),
    ).toBeNull();
  });

  it("rejects an image background hash that matches an asset with a non-image media type", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: linksExperience({
          ...solidTheme,
          background: {
            kind: "image",
            color: "#112233",
            imageSha256: "a".repeat(64),
          },
        }),
        assets: [{ sha256: "a".repeat(64), mediaType: "application/pdf" }],
      }),
    ).toBeNull();
  });
});

describe("publishCommand: linkpage", () => {
  const validLink = { id: "l1", label: "Sitio", url: "https://kardo.test/" };
  const validSocial = {
    id: "s1",
    network: "instagram",
    value: "https://instagram.com/kardo",
  };

  it("accepts a linkpage with links and socials", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          bio: "Diseño y branding.",
          links: [validLink],
          socials: [validSocial],
        },
      }),
    ).not.toBeNull();
  });

  it("accepts links-only or socials-only, but rejects both empty", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [validLink],
          socials: [],
        },
      }),
    ).not.toBeNull();
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [],
          socials: [validSocial],
        },
      }),
    ).not.toBeNull();
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [],
          socials: [],
        },
      }),
    ).toBeNull();
  });

  it("rejects a duplicate id shared between a link and a social", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [{ ...validLink, id: "dup" }],
          socials: [{ ...validSocial, id: "dup" }],
        },
      }),
    ).toBeNull();
  });

  it("accepts a highlighted link", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [{ ...validLink, highlight: true }],
          socials: [],
        },
      }),
    ).not.toBeNull();
  });

  it("accepts a valid email social and rejects an invalid one", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [],
          socials: [{ id: "s1", network: "email", value: "hola@kardo.test" }],
        },
      }),
    ).not.toBeNull();
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [],
          socials: [{ id: "s1", network: "email", value: "not-an-email" }],
        },
      }),
    ).toBeNull();
  });

  it("accepts a valid phone social and rejects an invalid one", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [],
          socials: [{ id: "s1", network: "phone", value: "+525512345678" }],
        },
      }),
    ).not.toBeNull();
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [],
          socials: [{ id: "s1", network: "phone", value: "abc" }],
        },
      }),
    ).toBeNull();
  });

  it("rejects an unknown social network", () => {
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [],
          socials: [
            { id: "s1", network: "myspace", value: "https://kardo.test" },
          ],
        },
      }),
    ).toBeNull();
  });

  it("rejects more than 20 links or 12 socials", () => {
    const links = Array.from({ length: 21 }, (_, i) => ({
      id: `l${i}`,
      label: `Enlace ${i}`,
      url: "https://kardo.test/",
    }));
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links,
          socials: [],
        },
      }),
    ).toBeNull();

    const socials = Array.from({ length: 13 }, (_, i) => ({
      id: `s${i}`,
      network: "instagram",
      value: "https://instagram.com/kardo",
    }));
    expect(
      publishCommand({
        publicId,
        revision: 1,
        experience: {
          type: "linkpage",
          displayName: "Estudio Kardo",
          links: [],
          socials,
        },
      }),
    ).toBeNull();
  });
});

describe("findLinkableUrl: linkpage resolves links and socials by id (no open redirect)", () => {
  const linkPageSnapshot: PublishedSnapshot = {
    schemaVersion: 1,
    status: "active",
    publicId,
    revision: 1,
    experience: {
      type: "linkpage",
      displayName: "Estudio Kardo",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      socials: [
        {
          id: "ig",
          network: "instagram",
          value: "https://instagram.com/kardo",
        },
        { id: "mail", network: "email", value: "hola@kardo.test" },
        { id: "tel", network: "phone", value: "+52 55 1234 5678" },
      ],
    },
  };

  it("resolves a link id to its url", () => {
    expect(findLinkableUrl(linkPageSnapshot, "l1")).toBe("https://kardo.test/");
  });

  it("resolves an https social id to its url", () => {
    expect(findLinkableUrl(linkPageSnapshot, "ig")).toBe(
      "https://instagram.com/kardo",
    );
  });

  it("resolves an email social id to an encoded mailto: href", () => {
    expect(findLinkableUrl(linkPageSnapshot, "mail")).toBe(
      "mailto:hola%40kardo.test",
    );
  });

  it("resolves a phone social id to a tel:+digits href, stripping formatting", () => {
    expect(findLinkableUrl(linkPageSnapshot, "tel")).toBe("tel:+525512345678");
  });

  it("returns null for an unknown id", () => {
    expect(findLinkableUrl(linkPageSnapshot, "unknown")).toBeNull();
  });
});

describe("publishedSnapshot", () => {
  it("requires schemaVersion 1 and status active on top of a valid command", () => {
    expect(
      publishedSnapshot({
        schemaVersion: 1,
        status: "active",
        publicId,
        revision: 1,
        experience: { type: "redirect", destinationUrl: "https://kardo.test/" },
      }),
    ).not.toBeNull();
    expect(
      publishedSnapshot({
        schemaVersion: 2,
        status: "active",
        publicId,
        revision: 1,
        experience: { type: "redirect", destinationUrl: "https://kardo.test/" },
      }),
    ).toBeNull();
  });
});
