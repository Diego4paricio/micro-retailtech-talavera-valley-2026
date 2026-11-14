import type { ExperienceContent, Touchpoint } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  conflictingTouchpoints,
  defaultPickMode,
  isUnpublishedPage,
  keptDestinationLine,
  newDestinationTargets,
  onlyDestinationKind,
  replaceWarningText,
  shareKind,
  shareOptions,
  takenNameNote,
} from "../src/features/experiences/publish-model.js";
import { emptyPageReason } from "../src/features/experiences/sample-content.js";
import { planPublication } from "../src/features/experiences/targets.js";
import { suggestedDestinationNameChips } from "../src/features/touchpoints/naming.js";

function touchpoint(
  id: string,
  overrides: Partial<Touchpoint> = {},
): Touchpoint {
  return {
    id,
    publicId: id.padEnd(16, "0"),
    operationalName: "Mesas",
    physicalType: "card",
    kind: "qr",
    status: "active",
    groupId: null,
    live: null,
    ...overrides,
  } as Touchpoint;
}

const live = (experienceId: string, experienceName: string) => ({
  experienceId,
  experienceName,
  experienceType: "menu",
  revision: 1,
  publishedAt: "2026-10-07T10:00:00.000Z",
});

const thisPage = "a0000000-0000-4000-8000-000000000001";
const otherPage = "b0000000-0000-4000-8000-000000000002";

describe("relevo 37, B2 — a new page defaults to a new destination", () => {
  it("is unpublished without a live Touchpoint anywhere", () => {
    expect(isUnpublishedPage(null)).toBe(true);
    expect(isUnpublishedPage({ liveTouchpointCount: 0 })).toBe(true);
    expect(isUnpublishedPage({ liveTouchpointCount: 1 })).toBe(false);
  });

  it("finds the Touchpoint already showing a different page (Lucía's «Mesas»)", () => {
    const mesas = touchpoint("mesas", {
      operationalName: "Mesas",
      live: live(otherPage, "Menú"),
    });
    const conflicts = conflictingTouchpoints([mesas], thisPage);
    expect(conflicts).toEqual([
      {
        touchpointId: "mesas",
        name: "Mesas",
        liveExperienceName: "Menú",
        kind: "qr",
      },
    ]);
  });

  it("a Touchpoint already showing this same page is not a conflict", () => {
    const mesas = touchpoint("mesas", { live: live(thisPage, "Bebidas") });
    expect(conflictingTouchpoints([mesas], thisPage)).toEqual([]);
  });

  it("a retired Touchpoint never conflicts", () => {
    const old = touchpoint("old", {
      status: "retired",
      live: live(otherPage, "Menú"),
    });
    expect(conflictingTouchpoints([old], thisPage)).toEqual([]);
  });

  it("defaults to a new destination only when unpublished and something would be replaced", () => {
    expect(defaultPickMode({ isUnpublished: true, hasConflict: true })).toBe(
      "new",
    );
    expect(defaultPickMode({ isUnpublished: true, hasConflict: false })).toBe(
      "existing",
    );
    expect(defaultPickMode({ isUnpublished: false, hasConflict: true })).toBe(
      "existing",
    );
  });

  it("marking the conflicting QR asks for a clear confirmation", () => {
    const mesas = touchpoint("mesas", { live: live(otherPage, "Menú") });
    const plan = planPublication({
      experienceId: thisPage,
      targets: { touchpointIds: ["mesas"], groupIds: [] },
      touchpoints: [mesas],
      experiences: [],
    });
    const replaced = plan.publishable.filter((entry) => entry.replacing);
    expect(replaced).toHaveLength(1);
    expect(replaceWarningText(replaced)).toBe(
      "Tus clientes ya no verán «Menú» en «Mesas».",
    );
  });

  it("does not replace anything when a fresh Touchpoint is chosen instead", () => {
    const fresh = touchpoint("fresh", { live: null });
    const plan = planPublication({
      experienceId: thisPage,
      targets: { touchpointIds: ["fresh"], groupIds: [] },
      touchpoints: [fresh],
      experiences: [],
    });
    expect(plan.publishable[0]?.replacing).toBeNull();
  });
});

describe("relevo 37, E3 — a page already on a link does not need a QR", () => {
  it("counts as the only destination when it is a Link", () => {
    const link = touchpoint("link1", { kind: "link", slug: "mi-link" });
    const plan = planPublication({
      experienceId: thisPage,
      targets: { touchpointIds: ["link1"], groupIds: [] },
      touchpoints: [link],
      experiences: [],
    });
    expect(onlyDestinationKind(plan.publishable, "link")).toBe(true);
  });

  it("is false with a QR, or with more than one destination", () => {
    const qr = touchpoint("qr1", { kind: "qr" });
    const link = touchpoint("link1", { kind: "link" });
    expect(onlyDestinationKind([{ touchpoint: qr }], "link")).toBe(false);
    expect(
      onlyDestinationKind([{ touchpoint: link }, { touchpoint: qr }], "link"),
    ).toBe(false);
  });
});

describe("relevo 37, C9b — suggestions by giro and type", () => {
  it("a confident giro leads the chips; a food truck never gets «Mesas»", () => {
    expect(suggestedDestinationNameChips("qr", "menu", "restaurante")[0]).toBe(
      "Mesas",
    );
    const chips = suggestedDestinationNameChips(
      "qr",
      "menu",
      null,
      "Food Truck La Güera Paty",
    );
    expect(chips[0]).toBe("Camión");
    expect(chips).not.toContain("Mesas");
  });
});

describe("relevo 37, B4 — an empty page is detected before it publishes", () => {
  it("a Perfil with no real name and no contact is empty", () => {
    const content = {
      displayName: "",
      links: [],
    } as unknown as ExperienceContent;
    expect(emptyPageReason("profile", content)).toEqual({
      kind: "profile-missing",
    });
  });

  it("a Perfil with a real name, or any contact, is not empty", () => {
    const named = {
      displayName: "Taller Mecánico Quintero",
      links: [],
    } as unknown as ExperienceContent;
    expect(emptyPageReason("profile", named)).toBeNull();
    const contacted = {
      displayName: "",
      links: [
        { id: "a", label: "WhatsApp", url: "https://wa.me/5219981234567" },
      ],
    } as unknown as ExperienceContent;
    expect(emptyPageReason("profile", contacted)).toBeNull();
  });

  it("a Menú with only «Sección 1 / Platillo 1» is empty", () => {
    const content = {
      title: "Menú",
      currency: "MXN",
      sections: [
        {
          id: "s1",
          name: "Sección 1",
          items: [{ id: "i1", name: "Platillo 1" }],
        },
      ],
    } as unknown as ExperienceContent;
    const reason = emptyPageReason("menu", content);
    expect(reason?.kind).toBe("all-sample");
  });

  it("a Menú with at least one real platillo is not empty", () => {
    const content = {
      title: "Menú",
      currency: "MXN",
      sections: [
        {
          id: "s1",
          name: "Sección 1",
          items: [
            { id: "i1", name: "Platillo 1" },
            { id: "i2", name: "Chilaquiles verdes" },
          ],
        },
      ],
    } as unknown as ExperienceContent;
    expect(emptyPageReason("menu", content)).toBeNull();
  });
});

describe("ronda 4, P2 — «¿Dónde lo vas a compartir?»", () => {
  it("asks where first: social gets a link, the local a QR, an NFC its tag", () => {
    expect(shareOptions.map((option) => option.value)).toEqual([
      "social",
      "printed",
      "nfc",
    ]);
    expect(shareKind("social")).toBe("link");
    expect(shareKind("printed")).toBe("qr");
    expect(shareKind("nfc")).toBe("nfc");
  });

  it("says what stays, naming the destination of the same kind (Sofía's /productos)", () => {
    const productos = touchpoint("productos", {
      kind: "link",
      operationalName: "/productos",
      live: live(otherPage, "Productos"),
    });
    const mostrador = touchpoint("mostrador", {
      operationalName: "Mostrador",
      live: live(otherPage, "Paquetes"),
    });
    const conflicts = conflictingTouchpoints([productos, mostrador], thisPage);
    expect(keptDestinationLine("social", conflicts)).toBe(
      "«Productos» sigue en /productos.",
    );
    expect(keptDestinationLine("printed", conflicts)).toBe(
      "«Mostrador» sigue mostrando «Paquetes».",
    );
  });

  it("several of the same kind read as one general line; nothing live, nothing to say", () => {
    const a = touchpoint("a", { live: live(otherPage, "Menú") });
    const b = touchpoint("b", { live: live(otherPage, "Bebidas") });
    expect(
      keptDestinationLine("printed", conflictingTouchpoints([a, b], thisPage)),
    ).toBe("Tus QR, etiquetas y links de hoy siguen mostrando lo mismo.");
    expect(keptDestinationLine("social", [])).toBeNull();
  });

  it("explains why the usual name is not offered (Ana's second «Mostrador»)", () => {
    const mostrador = touchpoint("mostrador", {
      operationalName: "Mostrador",
      live: live(otherPage, "Paquetes"),
    });
    expect(takenNameNote("Mostrador", [mostrador])).toBe(
      "«Mostrador» ya es tu QR de «Paquetes»: no lo repetimos.",
    );
    expect(takenNameNote("mostrador", [{ ...mostrador, live: null }])).toBe(
      "«Mostrador» ya es uno de tus QR: no lo repetimos.",
    );
    expect(takenNameNote("Recepción", [mostrador])).toBeNull();
    expect(
      takenNameNote("Mostrador", [{ ...mostrador, status: "retired" }]),
    ).toBeNull();
  });

  it("a page that never went live goes only to its new destination (round 4, B1)", () => {
    const current = { touchpointIds: ["productos"], groupIds: ["g1"] };
    expect(
      newDestinationTargets({
        isUnpublished: true,
        current,
        touchpointId: "buen-fin",
      }),
    ).toEqual({ touchpointIds: ["buen-fin"], groupIds: [] });
  });

  it("a live page keeps what it shows and adds the new destination", () => {
    const current = { touchpointIds: ["nails"], groupIds: ["g1"] };
    expect(
      newDestinationTargets({
        isUnpublished: false,
        current,
        touchpointId: "espejo",
      }),
    ).toEqual({ touchpointIds: ["nails", "espejo"], groupIds: ["g1"] });
    expect(
      newDestinationTargets({
        isUnpublished: false,
        current,
        touchpointId: "nails",
      }).touchpointIds,
    ).toEqual(["nails"]);
  });
});
