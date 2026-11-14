import {
  WORKSPACE_PROFILE_HOURS_MAX,
  whatsappUrlFromPhone,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  BREAK_DEFAULT,
  dayAfter,
  defaultRow,
  formatHours,
  hoursProblem,
  MON_FRI,
  MON_SAT,
  openDays,
  parseHours,
  withDistinctDay,
  withTemplate,
} from "../src/features/profile-fields/hours.js";
import {
  isKnownCity,
  mxCities,
  searchCities,
} from "../src/features/profile-fields/mx-cities.js";
import {
  formatPhone,
  isPhoneComplete,
  phoneDigits,
  phoneForProfile,
  phoneProblem,
} from "../src/features/profile-fields/phone.js";

describe("WhatsApp, numbers only (owner, 2026-10-03)", () => {
  it("keeps the 10 digits of a Mexican number however it was written", () => {
    expect(phoneDigits("222-123-4567")).toBe("2221234567");
    expect(phoneDigits("+52 222 123 4567")).toBe("2221234567");
    expect(phoneDigits("+52 1 222 123 4567")).toBe("2221234567");
    expect(phoneDigits("tel. 222 123 45678 9")).toBe("2221234567");
    expect(phoneDigits("abc")).toBe("");
  });

  it("writes it the way people read it and WhatsApp opens it", () => {
    expect(formatPhone("2221")).toBe("222 1");
    expect(formatPhone("2221234567")).toBe("222 123 4567");
    const saved = phoneForProfile("2221234567");
    expect(saved).toBe("222 123 4567");
    expect(whatsappUrlFromPhone(saved)).toBe("https://wa.me/522221234567");
    expect(phoneForProfile("")).toBe("");
    expect(formatPhone("5512345678")).toBe("55 1234 5678");
    expect(formatPhone("3312")).toBe("33 12");
  });

  it("says how many numbers are missing", () => {
    expect(phoneProblem("222 123 45")).toBe("Faltan 2 números.");
    expect(phoneProblem("222 123 456")).toBe("Falta 1 número.");
    expect(phoneProblem("222 123 4567")).toBeNull();
    expect(phoneProblem("")).toBeNull();
    expect(isPhoneComplete("")).toBe(false);
    expect(isPhoneComplete("+52 222 123 4567")).toBe(true);
  });

  it("keeps the country code outside Mexico", () => {
    const saved = phoneForProfile(phoneDigits("+34 612 345 678", "ES"), "ES");
    expect(saved).toBe("+34 612 345 678");
    expect(whatsappUrlFromPhone(saved, "ES")).toBe("https://wa.me/34612345678");
    expect(isPhoneComplete("+34 6", "ES")).toBe(false);
    // The same rule that builds the link decides when it is complete (A2-29):
    // fewer than 11 digits is not a number WhatsApp can open.
    expect(isPhoneComplete("+34 612 345", "ES")).toBe(false);
    expect(phoneProblem("+34 612 345", "ES")).toBe(
      "Escribe el número con la clave de tu país.",
    );
    expect(phoneProblem("+34 612 345 678", "ES")).toBeNull();
  });
});

describe("hours, picked instead of typed", () => {
  it("writes days in a row as a range and the rest by name", () => {
    expect(
      formatHours([{ days: [0, 1, 2, 3, 4], open: "09:00", close: "18:00" }]),
    ).toBe("Lunes a viernes, de 9:00 a 18:00");
    expect(
      formatHours([{ days: [0, 2, 4], open: "10:30", close: "20:00" }]),
    ).toBe("Lunes, miércoles y viernes, de 10:30 a 20:00");
    expect(
      formatHours([
        { days: [0, 1, 2, 3, 4, 5, 6], open: "08:00", close: "22:00" },
      ]),
    ).toBe("Todos los días, de 8:00 a 22:00");
    expect(
      formatHours([
        { days: [0, 1, 2, 3, 4, 6], open: "09:00", close: "18:00" },
      ]),
    ).toBe("Lunes a viernes y domingo, de 9:00 a 18:00");
  });

  it("joins other days with other hours, and leaves out rows without days", () => {
    expect(
      formatHours([
        { days: [0, 1, 2, 3, 4], open: "09:00", close: "18:00" },
        { days: [5], open: "09:00", close: "14:00" },
        defaultRow(),
      ]),
    ).toBe("Lunes a viernes, de 9:00 a 18:00; sábado, de 9:00 a 14:00");
    expect(formatHours([defaultRow()])).toBe("");
  });

  it("crosses midnight for a bar", () => {
    expect(
      formatHours([{ days: [3, 4, 5], open: "20:00", close: "02:00" }]),
    ).toBe("Jueves a sábado, de 20:00 a 2:00");
  });

  it("never passes the profile limit", () => {
    const text = formatHours([
      { days: [0, 2, 4], open: "10:30", close: "20:30" },
      { days: [1, 3], open: "10:30", close: "14:30" },
      { days: [5, 6], open: "09:30", close: "15:30" },
    ]);
    expect(text.length).toBeLessThanOrEqual(120);
  });

  it("reads back what it wrote, and the short way people write it", () => {
    const rows = [
      { days: [0, 1, 2, 3, 4], open: "09:00", close: "18:00" },
      { days: [5, 6], open: "10:00", close: "14:30" },
    ];
    expect(parseHours(formatHours(rows))).toEqual(rows);
    expect(parseHours("Lun a sáb, 8:00 a 17:00")).toEqual([
      { days: [0, 1, 2, 3, 4, 5], open: "08:00", close: "17:00" },
    ]);
    expect(parseHours("")).toEqual([]);
  });

  it("does not guess a text it cannot read", () => {
    expect(parseHours("Abrimos casi siempre")).toBeNull();
    expect(parseHours("Lunes a viernes, de 9 a 6")).toBeNull();
    expect(parseHours("Lunes, de 9:15 a 18:00")).toBeNull();
  });

  describe("«Cierro a mediodía» (relevo 37 C1a)", () => {
    it("writes the two ranges a midday break makes", () => {
      expect(
        formatHours([
          {
            days: [0, 1, 2, 3, 4],
            open: "09:00",
            close: "20:00",
            breakStart: "14:00",
            breakEnd: "16:00",
          },
        ]),
      ).toBe("Lunes a viernes, de 9:00 a 14:00 y de 16:00 a 20:00");
    });

    it("reads the break back, and still reads a text written before it existed", () => {
      const withBreak = [
        {
          days: [0, 1, 2, 3, 4],
          open: "09:00",
          close: "20:00",
          breakStart: "14:00",
          breakEnd: "16:00",
        },
      ];
      expect(parseHours(formatHours(withBreak))).toEqual(withBreak);
      // The shorter text written before the midday break existed (no "y
      // de …"): still a single range, no breakStart/breakEnd.
      expect(parseHours("Lunes a viernes, de 9:00 a 18:00")).toEqual([
        { days: [0, 1, 2, 3, 4], open: "09:00", close: "18:00" },
      ]);
    });

    it("never passes the profile limit even with a break on every row", () => {
      const text = formatHours([
        {
          days: [0, 1, 2],
          open: "09:00",
          close: "21:00",
          breakStart: "14:00",
          breakEnd: "16:30",
        },
        {
          days: [3, 4],
          open: "09:00",
          close: "21:00",
          breakStart: "14:00",
          breakEnd: "16:30",
        },
        { days: [5, 6], open: "09:30", close: "15:30" },
      ]);
      expect(text.length).toBeLessThanOrEqual(WORKSPACE_PROFILE_HOURS_MAX);
    });
  });

  describe("the Dra. Paola's schedule, one tap at a time (relevo 37 C1a)", () => {
    it("reaches «L a V 9 a 14 y 16 a 20, sábado 9 a 14» in 4 taps (5 or fewer)", () => {
      // Each step below is one tap on HoursPicker, in order:
      //   1. chip «Lunes a viernes»      → rows[0].days
      //   2. chip «Cierro a mediodía»    → rows[0].breakStart/breakEnd
      //   3. the «Cierra» select, 20:00  → rows[0].close
      //   4. link «Un día distinto»      → a second row, guessed day and
      //      hours (no 5th tap needed: the guess is already right)
      let rows = [defaultRow()];
      // Tap 1.
      rows = rows.map((row, index) =>
        index === 0 ? { ...row, days: [...MON_FRI] } : row,
      );
      // Tap 2.
      rows = rows.map((row, index) =>
        index === 0
          ? {
              ...row,
              breakStart: BREAK_DEFAULT.start,
              breakEnd: BREAK_DEFAULT.end,
            }
          : row,
      );
      // Tap 3.
      rows = rows.map((row, index) =>
        index === 0 ? { ...row, close: "20:00" } : row,
      );
      // Tap 4: «Un día distinto» guesses the day right after the main
      // group, and copies its morning hours (open to the break).
      const main = rows[0];
      expect(main).toBeDefined();
      rows = [
        ...rows,
        {
          days: [dayAfter(main?.days ?? [])],
          open: main?.open ?? "09:00",
          close: main?.breakStart ?? main?.close ?? "18:00",
        },
      ];

      const text = formatHours(rows);
      expect(text).toBe(
        "Lunes a viernes, de 9:00 a 14:00 y de 16:00 a 20:00; sábado, de 9:00 a 14:00",
      );
      // And it reads back into the same rows (editing it again works).
      expect(parseHours(text)).toEqual(rows);
    });
  });
});

describe("city search", () => {
  it("finds a city without accents or capitals, with its state", () => {
    expect(searchCities("queretaro")[0]?.value).toBe("Querétaro");
    expect(searchCities("san pedro g")[0]?.value).toBe(
      "San Pedro Garza García, Nuevo León",
    );
    expect(searchCities("TOLU")[0]?.value).toBe("Toluca, Estado de México");
  });

  it("puts the names that start with it first", () => {
    const names = searchCities("pue").map((city) => city.name);
    expect(names[0]).toBe("Puebla");
    expect(names).toContain("Puerto Vallarta");
  });

  it("tells apart cities with the same name by state", () => {
    const guadalupe = searchCities("guadalupe").map((city) => city.value);
    expect(guadalupe).toContain("Guadalupe, Nuevo León");
    expect(guadalupe).toContain("Guadalupe, Zacatecas");
  });

  it("knows the cities it offers and has no repeats", () => {
    expect(isKnownCity("Cancún, Quintana Roo")).toBe(true);
    expect(isKnownCity("Mi rancho")).toBe(false);
    const values = mxCities.map((city) => city.value);
    expect(new Set(values).size).toBe(values.length);
    expect(searchCities("")).toEqual([]);
  });
});

describe("a schedule that does not make sense says so (relevo 37, round 3)", () => {
  it("flags closing before opening and a lunch break outside the day", () => {
    expect(
      hoursProblem([
        {
          days: [0, 1, 2, 3, 4],
          open: "09:00",
          close: "13:00",
          breakStart: "14:00",
          breakEnd: "16:00",
        },
      ]),
    ).toBe(
      "Revisa lunes a viernes: la comida va entre la hora de abrir y la de cerrar.",
    );
    expect(hoursProblem([{ days: [5], open: "14:00", close: "09:00" }])).toBe(
      "Revisa sábado: cierras antes de abrir.",
    );
    expect(
      hoursProblem([
        {
          days: [0, 1, 2, 3, 4],
          open: "09:00",
          close: "20:00",
          breakStart: "14:00",
          breakEnd: "16:00",
        },
        { days: [5], open: "09:00", close: "13:00" },
      ]),
    ).toBeNull();
  });
});

describe("a day is never in two schedules (relevo 37, round 3, second pass)", () => {
  const week = {
    days: MON_SAT,
    open: "09:00",
    close: "20:00",
    breakStart: "14:00",
    breakEnd: "16:00",
  };

  it("«Lunes a sábado», then «Un día distinto: sábado» moves Saturday out", () => {
    const rows = withDistinctDay(
      [week, { days: [6], open: "09:00", close: "14:00" }],
      1,
      5,
    );
    expect(rows.map((row) => row.days)).toEqual([MON_FRI, [5]]);
    expect(
      formatHours(
        rows.map((row, index) =>
          index === 1 ? { ...row, close: "13:00" } : row,
        ),
      ),
    ).toBe(
      "Lunes a viernes, de 9:00 a 14:00 y de 16:00 a 20:00; sábado, de 9:00 a 13:00",
    );
    expect(openDays(rows)).toEqual(MON_SAT);
  });

  it("a template keeps the days with their own hours and drops the rest", () => {
    const rows = [
      { ...week, days: MON_FRI },
      { days: [5], open: "09:00", close: "13:00" },
    ];
    expect(withTemplate(rows, MON_SAT).map((row) => row.days)).toEqual([
      MON_FRI,
      [5],
    ]);
    // «Lunes a viernes»: closed on Saturday.
    expect(withTemplate(rows, MON_FRI).map((row) => row.days)).toEqual([
      MON_FRI,
    ]);
  });

  it("says so when a text read back has a day twice", () => {
    expect(
      hoursProblem(
        parseHours(
          "Lunes a sábado, de 9:00 a 14:00 y de 16:00 a 20:00; sábado, de 9:00 a 13:00",
        ) ?? [],
      ),
    ).toBe("El sábado aparece dos veces. Déjalo en un solo horario.");
  });
});
