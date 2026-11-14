import type { QrDesign, QrTemplate } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  copyName,
  longest,
  printState,
  resolveOverview,
  usageCount,
  usageText,
  usedByText,
} from "../src/features/touchpoints/qr/library/model.js";
import { defaultQrDesign } from "../src/features/touchpoints/qr/qr-design.js";

const tp = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;
const tealDesign: QrDesign = {
  ...defaultQrDesign,
  modules: {
    ...defaultQrDesign.modules,
    fill: { kind: "solid", color: "#0a6c78" },
  },
};
const ownDesign: QrDesign = {
  ...defaultQrDesign,
  modules: {
    ...defaultQrDesign.modules,
    fill: { kind: "solid", color: "#000000" },
  },
};
const template: QrTemplate = {
  id: "10000000-0000-4000-8000-000000000001",
  name: "Mesas terraza",
  design: tealDesign,
  createdAt: "2026-09-27T10:00:00.000Z",
  updatedAt: "2026-09-27T10:00:00.000Z",
  usage: { touchpoints: 1, groups: 1 },
};

describe("Estudio QR library model", () => {
  it("resolves the design a new print uses for every source", () => {
    const resolved = resolveOverview(
      [
        {
          touchpointId: tp(1),
          source: "custom",
          templateId: null,
          design: ownDesign,
          lastExport: null,
        },
        {
          touchpointId: tp(2),
          source: "library",
          templateId: template.id,
          design: null,
          lastExport: null,
        },
        {
          touchpointId: tp(3),
          source: "group",
          templateId: template.id,
          design: null,
          lastExport: null,
        },
        {
          touchpointId: tp(4),
          source: "default",
          templateId: null,
          design: null,
          lastExport: null,
        },
        // A library design deleted meanwhile falls back to Kardo's design.
        {
          touchpointId: tp(5),
          source: "library",
          templateId: "10000000-0000-4000-8000-000000000009",
          design: null,
          lastExport: null,
        },
      ],
      [template],
      defaultQrDesign,
    );
    expect(resolved.get(tp(1))?.design).toBe(ownDesign);
    expect(resolved.get(tp(2))?.design).toBe(tealDesign);
    expect(resolved.get(tp(2))?.templateName).toBe("Mesas terraza");
    expect(resolved.get(tp(3))?.source).toBe("group");
    expect(resolved.get(tp(4))?.design).toBe(defaultQrDesign);
    expect(resolved.get(tp(5))?.design).toBe(defaultQrDesign);
    expect(resolved.get(tp(5))?.templateName).toBeNull();
  });

  it("compares the last print with the current design", () => {
    const last = { fingerprint: "a".repeat(64) };
    expect(printState(null, "a".repeat(64))).toBe("never");
    expect(printState(last, undefined)).toBe("checking");
    expect(printState(last, "a".repeat(64))).toBe("current");
    expect(printState(last, "b".repeat(64))).toBe("changed");
  });

  it("describes usage in plain Spanish", () => {
    expect(usageText({ touchpoints: 0, groups: 0 })).toBe("Sin usar todavía");
    expect(usageText({ touchpoints: 12, groups: 2 })).toBe(
      "En 12 QR y 2 grupos",
    );
    expect(usageCount({ touchpoints: 1, groups: 0 })).toBe("1 QR");
    expect(usedByText({ touchpoints: 0, groups: 1 })).toBe("lo usa 1 grupo");
    expect(usedByText({ touchpoints: 3, groups: 0 })).toBe("lo usan 3 QR");
  });

  it("picks the worst case and names copies within the limit", () => {
    expect(longest(["https://a/t/1", "https://a/t/12345"], "x")).toBe(
      "https://a/t/12345",
    );
    expect(longest([], "fallback")).toBe("fallback");
    expect(copyName("Terraza")).toBe("Copia de Terraza");
    expect(copyName("x".repeat(60))).toHaveLength(60);
  });
});
