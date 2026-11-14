import { describe, expect, it } from "vitest";
import { detailLabel, findNavLocation } from "../src/workspace/navigation.js";

describe("the breadcrumb for one Touchpoint's own QR design (A9-28)", () => {
  it("lights up «QR y etiquetas», not the separate «Diseño del QR» entry", () => {
    const location = findNavLocation("qr-studio");
    expect(location?.item.label).toBe("QR y etiquetas");
  });

  it("never repeats «Diseño del QR» as the trailing crumb", () => {
    const detail = detailLabel({ name: "qr-studio", id: "tp1" });
    expect(detail).toBe("Diseño");
    // The separate nav entry («qr», matched by "qr"/"qr-design") still owns
    // that name: the two must stay distinguishable in the breadcrumb.
    const designLocation = findNavLocation("qr-design");
    expect(designLocation?.item.label).toBe("Diseño del QR");
  });
});
