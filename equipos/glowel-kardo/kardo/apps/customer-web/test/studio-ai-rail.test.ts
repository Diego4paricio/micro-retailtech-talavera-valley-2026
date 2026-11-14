import {
  type DesignAiUsage,
  designableExperienceTypes,
} from "@kardo/contracts";
import { afterEach, describe, expect, it } from "vitest";
import {
  aiTypeCopy,
  photoModeOptions,
  readAiDraft,
  saveAiDraft,
  shortcutActive,
  toggleShortcut,
} from "../src/features/studio/ai/ai-brief.js";
import {
  designsLeft,
  usageLine,
} from "../src/features/studio/ai/use-ai-usage.js";

// ---------------------------------------------------------------------------
// "Diseñar con IA" (relevo 29, 2026-10-03): the form by type, the counter
// and the draft that survives a reload.
// ---------------------------------------------------------------------------

describe("the form by type", () => {
  it("covers every type the Estudio designs, in plain Spanish", () => {
    for (const type of designableExperienceTypes) {
      const copy = aiTypeCopy[type];
      expect(copy.question).toMatch(/^¿/);
      expect(copy.examples.length).toBeGreaterThan(0);
      expect(copy.shortcuts.length).toBeGreaterThan(0);
      const text = JSON.stringify(copy);
      expect(text).not.toMatch(/[–—]/);
    }
    // An Imagen is its photo: no photo choice there.
    expect(aiTypeCopy.image.photoChoice).toBe(false);
    expect(aiTypeCopy.menu.photoChoice).toBe(true);
    expect(photoModeOptions.map((option) => option.mode)).toEqual([
      "auto",
      "with",
      "without",
    ]);
  });

  it("adds and removes a shortcut's phrase", () => {
    const shortcut = aiTypeCopy.menu.shortcuts[0];
    if (!shortcut) throw new Error("no shortcut");
    const brief = {
      description: "Un menú sencillo.",
      colors: [],
      imageRefs: [],
      fonts: [],
    };
    const on = toggleShortcut(brief, shortcut, 2_000);
    expect(shortcutActive(on, shortcut)).toBe(true);
    expect(on.description.startsWith("Un menú sencillo. ")).toBe(true);
    const off = toggleShortcut(on, shortcut, 2_000);
    expect(off.description).toBe("Un menú sencillo.");
  });
});

const usage = (over: Partial<DesignAiUsage> = {}): DesignAiUsage => ({
  enabled: true,
  day: { used: 2, limit: 20, remaining: 18 },
  month: { used: 3, limit: 18, remaining: 15 },
  spendCapReached: false,
  ...over,
});

describe("the counter", () => {
  it("says what is left this month, and today when it is less", () => {
    expect(usageLine(usage())).toEqual({
      main: "Te quedan 15 de 18 diseños este mes",
      detail: null,
    });
    expect(
      usageLine(usage({ day: { used: 18, limit: 20, remaining: 2 } })).detail,
    ).toBe("Hoy puedes hacer 2 más.");
    expect(designsLeft(usage())).toBe(15);
    expect(
      designsLeft(usage({ day: { used: 18, limit: 20, remaining: 2 } })),
    ).toBe(2);
  });

  it("has nothing left at the spending cap or without the plan", () => {
    expect(designsLeft(usage({ spendCapReached: true }))).toBe(0);
    expect(usageLine(usage({ spendCapReached: true })).main).toBe(
      "Ya usaste la IA de este mes",
    );
    expect(designsLeft(usage({ enabled: false }))).toBe(0);
  });

  it("counts by day when the plan sets no month", () => {
    const daily = usage({ month: { used: 3, limit: null, remaining: null } });
    expect(usageLine(daily).main).toBe("Te quedan 18 diseños hoy");
    expect(designsLeft(daily)).toBe(18);
  });
});

describe("the draft", () => {
  const original = (globalThis as { window?: unknown }).window;
  afterEach(() => {
    (globalThis as { window?: unknown }).window = original;
  });

  function withStorage(store: Map<string, string>) {
    (globalThis as { window?: unknown }).window = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => store.set(key, value),
      },
    };
  }

  it("keeps the brief and the photo choice per Experience", () => {
    const store = new Map<string, string>();
    withStorage(store);
    saveAiDraft("exp-1", {
      brief: {
        description: "Sin fotos, que se lea rápido",
        colors: [],
        imageRefs: [],
        fonts: [],
      },
      photos: "without",
    });
    expect(readAiDraft("exp-1")).toEqual({
      brief: {
        description: "Sin fotos, que se lea rápido",
        colors: [],
        imageRefs: [],
        fonts: [],
      },
      photos: "without",
    });
    expect(readAiDraft("exp-2")).toBeNull();
  });

  it("ignores a broken draft or a browser without storage", () => {
    const store = new Map([["kardo:ai-draft:exp-1", "{no es json"]]);
    withStorage(store);
    expect(readAiDraft("exp-1")).toBeNull();
    (globalThis as { window?: unknown }).window = undefined;
    expect(readAiDraft("exp-1")).toBeNull();
    expect(() =>
      saveAiDraft("exp-1", {
        brief: { description: "", colors: [], imageRefs: [], fonts: [] },
        photos: "auto",
      }),
    ).not.toThrow();
  });
});
