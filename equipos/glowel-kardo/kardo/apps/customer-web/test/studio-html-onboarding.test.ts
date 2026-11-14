import type { ConceptBrief } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  objectiveActive,
  objectives,
  toggleObjective,
} from "../src/features/studio/html/objectives.js";
import {
  conceptRecap,
  nextOnboardStep,
  previousOnboardStep,
} from "../src/features/studio/html/onboarding.js";

function brief(overrides: Partial<ConceptBrief> = {}): ConceptBrief {
  return {
    description: "",
    colors: [],
    imageRefs: [],
    fonts: [],
    ...overrides,
  };
}

describe("objective chips compose the description", () => {
  const orders = objectives.find((item) => item.id === "orders");
  if (!orders) throw new Error("missing fixture objective");

  it("appends the objective's phrase the first time it is chosen", () => {
    const next = toggleObjective(brief(), orders);
    expect(next.description).toBe(orders.phrase);
    expect(objectiveActive(next, orders)).toBe(true);
  });

  it("adds after existing text, and removes only its own phrase on toggle", () => {
    const withText = brief({ description: "Una página para mi cafetería." });
    const added = toggleObjective(withText, orders);
    expect(added.description).toBe(
      `Una página para mi cafetería. ${orders.phrase}`,
    );
    const removed = toggleObjective(added, orders);
    expect(removed.description).toBe("Una página para mi cafetería.");
    expect(objectiveActive(removed, orders)).toBe(false);
  });

  it("never changes tone, colors, images or fonts", () => {
    const withBrand = brief({
      tone: "cálido",
      colors: ["#112233"],
      imageRefs: ["a"],
      fonts: ["lora"],
    });
    const next = toggleObjective(withBrand, orders);
    expect(next.tone).toBe("cálido");
    expect(next.colors).toEqual(["#112233"]);
    expect(next.imageRefs).toEqual(["a"]);
    expect(next.fonts).toEqual(["lora"]);
  });

  it("keeps every objective's id, label and icon distinct", () => {
    const ids = objectives.map((item) => item.id);
    expect(new Set(ids).size).toBe(objectives.length);
  });
});

describe("onboarding step navigation", () => {
  it("moves forward and back, clamped to the first and last step", () => {
    expect(nextOnboardStep(1)).toBe(2);
    expect(nextOnboardStep(2)).toBe(3);
    expect(nextOnboardStep(3)).toBe(3);
    expect(previousOnboardStep(3)).toBe(2);
    expect(previousOnboardStep(2)).toBe(1);
    expect(previousOnboardStep(1)).toBe(1);
  });
});

describe("conceptRecap", () => {
  it("is empty until something has been chosen", () => {
    expect(conceptRecap(brief())).toEqual([]);
  });

  it("lists the chosen objectives, tone, and how many colors and images", () => {
    const orders = objectives.find((item) => item.id === "orders");
    const reservations = objectives.find((item) => item.id === "reservations");
    if (!orders || !reservations) throw new Error("missing fixture objective");
    const withBoth = toggleObjective(
      toggleObjective(brief(), orders),
      reservations,
    );
    const recap = conceptRecap({
      ...withBoth,
      tone: "cálido",
      colors: ["#112233", "#445566"],
      imageRefs: ["a"],
    });
    expect(recap).toEqual([
      "Pedidos, Reservas",
      "cálido",
      "2 colores",
      "1 imagen",
    ]);
  });

  it("uses the singular for exactly one color or image", () => {
    expect(
      conceptRecap(brief({ colors: ["#112233"], imageRefs: ["a", "b"] })),
    ).toEqual(["1 color", "2 imágenes"]);
  });
});
