import { describe, expect, it } from "vitest";
import {
  cleanDisplayName,
  formatDayRange,
  greetingFor,
  periodLabels,
  supportLine,
} from "../src/features/overview/dashboard/header-model.js";

const day = (key: string) => new Date(`${key}T00:00:00Z`);

describe("greetingFor", () => {
  it("greets by the time of day", () => {
    expect(greetingFor(5)).toBe("Buenos días");
    expect(greetingFor(11)).toBe("Buenos días");
    expect(greetingFor(12)).toBe("Buenas tardes");
    expect(greetingFor(18)).toBe("Buenas tardes");
    expect(greetingFor(19)).toBe("Buenas noches");
    expect(greetingFor(23)).toBe("Buenas noches");
    expect(greetingFor(0)).toBe("Buenas noches");
    expect(greetingFor(4)).toBe("Buenas noches");
  });
});

describe("cleanDisplayName", () => {
  it("keeps the whole name, tidied", () => {
    expect(cleanDisplayName("  María   José ")).toBe("María José");
    expect(cleanDisplayName("Ana")).toBe("Ana");
  });

  it("has no name to show when it is missing or blank", () => {
    expect(cleanDisplayName(null)).toBeNull();
    expect(cleanDisplayName(undefined)).toBeNull();
    expect(cleanDisplayName("   ")).toBeNull();
  });
});

describe("supportLine", () => {
  it("names the organization", () => {
    expect(supportLine({ name: " Café  Nube ", kind: "organization" })).toBe(
      "Así se mueven tus QR y etiquetas en Café Nube.",
    );
  });

  it("stays generic for a personal space or a blank name", () => {
    expect(supportLine({ name: "Juan", kind: "personal" })).toBe(
      "Así se mueven tus QR y etiquetas.",
    );
    expect(supportLine({ name: " ", kind: "organization" })).toBe(
      "Así se mueven tus QR y etiquetas.",
    );
  });
});

describe("formatDayRange", () => {
  it("writes the month once within a month", () => {
    expect(formatDayRange(day("2026-09-22"), day("2026-09-28"))).toBe(
      "22 – 28 sep 2026",
    );
    expect(formatDayRange(day("2026-09-15"), day("2026-09-21"), false)).toBe(
      "15 – 21 sep",
    );
  });

  it("writes both months across months", () => {
    expect(formatDayRange(day("2026-08-30"), day("2026-09-28"))).toBe(
      "30 ago – 28 sep 2026",
    );
    expect(formatDayRange(day("2026-07-01"), day("2026-09-28"), false)).toBe(
      "1 jul – 28 sep",
    );
  });

  it("writes both years across years, even when asked not to", () => {
    expect(formatDayRange(day("2025-12-15"), day("2026-01-12"), false)).toBe(
      "15 dic 2025 – 12 ene 2026",
    );
  });

  it("writes a single day once", () => {
    expect(formatDayRange(day("2026-09-28"), day("2026-09-28"))).toBe(
      "28 sep 2026",
    );
  });
});

describe("periodLabels", () => {
  it("shows the week and the one before it", () => {
    expect(periodLabels(7, "2026-09-22", "2026-09-28")).toEqual({
      current: "22 – 28 sep 2026",
      previous: "vs. 15 – 21 sep",
      spoken:
        "Del 22 al 28 de septiembre, comparado con el periodo del 15 al 21 de septiembre.",
    });
  });

  it("compares 30 and 90 days with as many days right before", () => {
    const month = periodLabels(30, "2026-08-30", "2026-09-28");
    expect(month.current).toBe("30 ago – 28 sep 2026");
    expect(month.previous).toBe("vs. 31 jul – 29 ago");

    const quarter = periodLabels(90, "2026-07-01", "2026-09-28");
    expect(quarter.current).toBe("1 jul – 28 sep 2026");
    expect(quarter.previous).toBe("vs. 2 abr – 30 jun");
  });

  it("gives the comparison its year when it falls in another one", () => {
    expect(periodLabels(7, "2027-01-01", "2027-01-07").previous).toBe(
      "vs. 25 – 31 dic 2026",
    );
    expect(periodLabels(7, "2027-01-03", "2027-01-09").previous).toBe(
      "vs. 27 dic 2026 – 2 ene 2027",
    );
  });

  it("names the period by its length while its days load", () => {
    expect(periodLabels(30, undefined, undefined)).toEqual({
      current: "Últimos 30 días",
      previous: "vs. 30 días anteriores",
      spoken: "Últimos 30 días, comparado con los 30 días anteriores.",
    });
    expect(periodLabels(7, "2026-09-28", "2026-09-22").current).toBe(
      "Últimos 7 días",
    );
    expect(periodLabels(7, "no-es-fecha", "2026-09-22").current).toBe(
      "Últimos 7 días",
    );
  });
});
