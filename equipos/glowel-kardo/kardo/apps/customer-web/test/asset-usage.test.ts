import { describe, expect, it } from "vitest";
import { summarizeAssetUsage } from "../src/features/assets/asset-usage.js";
import { versionPlaces } from "../src/features/experiences/VersionHistory.js";

describe("summarizeAssetUsage: «Dónde se usa» (domain audit A2-45)", () => {
  it("names the business profile's uses", () => {
    const summary = summarizeAssetUsage({
      experiences: [],
      profile: ["logo", "cover", "background"],
    });
    expect(summary.extras.map((extra) => extra.text)).toEqual([
      "Logo de tu negocio",
      "Portada",
      "Fondo de tus páginas",
    ]);
    expect(summary.blocksDelete).toBe(true);
    expect(summary.isUnused).toBe(false);
  });

  it("never says it is unused when only the profile or a QR uses it", () => {
    expect(
      summarizeAssetUsage({ experiences: [], profile: ["logo"] }).isUnused,
    ).toBe(false);
    expect(
      summarizeAssetUsage({ experiences: [], qrLogoCount: 2 }).isUnused,
    ).toBe(false);
  });

  it("a QR logo is listed but does not block deleting", () => {
    const summary = summarizeAssetUsage({ experiences: [], qrLogoCount: 1 });
    expect(summary.extras[0]?.text).toBe("Logo de 1 diseño de QR");
    expect(summary.blocksDelete).toBe(false);
    expect(
      summarizeAssetUsage({ experiences: [], qrLogoCount: 3 }).extras[0]?.text,
    ).toBe("Logo de 3 diseños de QR");
  });

  it("a page blocks deleting; an old answer without the new fields is fine", () => {
    const used = summarizeAssetUsage({
      experiences: [
        {
          id: "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01",
          name: "Menú",
          live: true,
        },
      ],
    });
    expect(used.blocksDelete).toBe(true);
    expect(used.extras).toEqual([]);
    expect(summarizeAssetUsage({ experiences: [] }).isUnused).toBe(true);
  });
});

describe("versionPlaces: «En vivo en N», «Falló en M» (domain audit A2-24)", () => {
  it("counts both, so a partial failure is not hidden", () => {
    expect(
      versionPlaces({ liveTouchpointCount: 2, failedTouchpointCount: 1 }, true),
    ).toEqual([
      { label: "En vivo en 2", tone: "success" },
      { label: "Falló en 1", tone: "danger" },
    ]);
  });

  it("shows nothing for a version that is nowhere", () => {
    expect(
      versionPlaces(
        { liveTouchpointCount: 0, failedTouchpointCount: 0 },
        false,
      ),
    ).toEqual([]);
  });

  it("without the counts falls back to the single latest publication", () => {
    expect(versionPlaces({}, true)).toEqual([
      { label: "En vivo", tone: "success" },
    ]);
    expect(versionPlaces({}, false)).toEqual([]);
  });
});
