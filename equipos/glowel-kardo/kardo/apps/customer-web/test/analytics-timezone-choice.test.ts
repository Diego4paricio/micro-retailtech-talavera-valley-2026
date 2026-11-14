import { describe, expect, it } from "vitest";
import {
  resolveTimeZoneSelection,
  zoneDisplayName,
} from "../src/features/analytics/timezone-choice.js";

describe("zoneDisplayName (A9-25)", () => {
  it("names a familiar zone in plain words", () => {
    expect(zoneDisplayName("America/Mexico_City")).toBe("Ciudad de México");
  });

  it("falls back to the zone id for one Intl cannot name better", () => {
    expect(zoneDisplayName("UTC")).toBe("UTC");
  });

  it("names any other zone by its city, never in a browser's English", () => {
    expect(zoneDisplayName("Europe/Madrid")).toBe("Madrid");
    expect(zoneDisplayName("America/Sao_Paulo")).toBe("Sao Paulo");
  });
});

describe("resolveTimeZoneSelection (A9-25)", () => {
  const browserZone = "America/Mexico_City";

  it("offers no switch when the business has no zone", () => {
    const selection = resolveTimeZoneSelection({
      choice: "business",
      browserZone,
      businessZone: null,
    });
    expect(selection.canToggle).toBe(false);
    expect(selection.choice).toBe("browser");
    expect(selection.zone).toBe(browserZone);
  });

  it("offers no switch when the business zone matches the browser's", () => {
    const selection = resolveTimeZoneSelection({
      choice: "business",
      browserZone,
      businessZone: browserZone,
    });
    expect(selection.canToggle).toBe(false);
    expect(selection.zone).toBe(browserZone);
  });

  it("uses the browser zone by default when a real alternative exists", () => {
    const selection = resolveTimeZoneSelection({
      choice: "browser",
      browserZone,
      businessZone: "Europe/Madrid",
    });
    expect(selection.canToggle).toBe(true);
    expect(selection.choice).toBe("browser");
    expect(selection.zone).toBe(browserZone);
    expect(selection.label).toBe("Ciudad de México");
  });

  it("switches to the business zone once chosen", () => {
    const selection = resolveTimeZoneSelection({
      choice: "business",
      browserZone,
      businessZone: "Europe/Madrid",
    });
    expect(selection.choice).toBe("business");
    expect(selection.zone).toBe("Europe/Madrid");
  });

  it("falls back to the browser zone if the stored choice is business but there is nothing to switch to", () => {
    const selection = resolveTimeZoneSelection({
      choice: "business",
      browserZone,
      businessZone: undefined,
    });
    expect(selection.choice).toBe("browser");
    expect(selection.zone).toBe(browserZone);
  });
});
