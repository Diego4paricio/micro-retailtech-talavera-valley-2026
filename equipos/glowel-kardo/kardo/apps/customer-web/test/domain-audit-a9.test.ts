import type { Touchpoint } from "@kardo/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const publish = vi.fn(async () => ({
  versionId: "v",
  versionRevision: 2,
  publications: [],
}));
const setTargets = vi.fn(async () => ({}));

vi.mock("../src/api/experiences.js", () => ({
  experiencesApi: {
    publish: (...args: unknown[]) => publish(...(args as [])),
    setTargets: (...args: unknown[]) => setTargets(...(args as [])),
  },
}));

const { republishIfLive, republishInPlace, showExperienceOn } = await import(
  "../src/features/experiences/assign.js"
);
const { experiencePlaces } = await import(
  "../src/features/experiences/targets.js"
);
const { suggestTouchpointName, suggestTouchpointNames } = await import(
  "../src/features/touchpoints/naming.js"
);

const workspaceId = "11111111-1111-4111-8111-111111111111";
const mesa = "22222222-2222-4222-8222-222222222222";
const barra = "33333333-3333-4333-8333-333333333333";

describe("one way to put a page on a QR (A9-7, A9-8)", () => {
  beforeEach(() => {
    publish.mockClear();
    setTargets.mockClear();
  });

  it("adds the place, keeps the others and only takes over that one", async () => {
    await showExperienceOn(
      workspaceId,
      { id: "page", targets: { touchpointIds: [barra], groupIds: ["g"] } },
      mesa,
    );
    expect(setTargets).toHaveBeenCalledWith(workspaceId, "page", {
      touchpointIds: [barra, mesa],
      groupIds: ["g"],
    });
    expect(publish).toHaveBeenCalledWith(workspaceId, "page", undefined, {
      replaceTargets: [mesa],
    });
  });

  it("does not rewrite the targets when the place is already one", async () => {
    await showExperienceOn(
      workspaceId,
      { id: "page", targets: { touchpointIds: [mesa], groupIds: [] } },
      mesa,
    );
    expect(setTargets).not.toHaveBeenCalled();
    expect(publish).toHaveBeenCalledTimes(1);
  });

  it("republishes in place without taking any QR from another page", async () => {
    await republishInPlace(workspaceId, "page");
    expect(publish).toHaveBeenCalledWith(workspaceId, "page", undefined, {
      replaceTargets: [],
    });
    expect(
      await republishIfLive(workspaceId, {
        id: "page",
        liveTouchpointCount: 0,
      }),
    ).toBe(false);
    expect(publish).toHaveBeenCalledTimes(1);
  });
});

describe("where each page shows (A9-8)", () => {
  const place = (
    over: Partial<Touchpoint> & Pick<Touchpoint, "operationalName">,
  ) =>
    ({
      kind: "qr",
      slug: null,
      status: "active",
      live: null,
      ...over,
    }) as Touchpoint;
  const live = (experienceId: string) => ({
    experienceId,
    experienceName: "x",
    experienceType: "menu",
    revision: 1,
    publishedAt: "2026-10-13T00:00:00.000Z",
  });

  it("names a link by its address and a QR by its name, with how many more", () => {
    const places = experiencePlaces([
      place({ operationalName: "Mesa 1", live: live("menu") }),
      place({
        operationalName: "/menu",
        kind: "link",
        slug: "menu",
        live: live("menu"),
      }),
      place({ operationalName: "Mesa 2", live: live("menu") }),
      place({
        operationalName: "Caja",
        live: live("promo"),
        status: "retired",
      }),
      place({ operationalName: "Barra", live: live("bebidas") }),
    ]);
    expect(places.get("menu")).toBe("Mesa 1 y 2 más");
    expect(places.get("bebidas")).toBe("Barra");
    expect(places.has("promo")).toBe(false);
  });
});

describe("one naming rule for a new QR or tag (A9-9)", () => {
  it("gives a tag a tag's name, never a QR's", () => {
    const name = suggestTouchpointName({ kind: "nfc", pageType: "profile" });
    expect(name).not.toBe("Mi QR");
    expect(
      suggestTouchpointNames({ kind: "nfc", pageType: "menu" }),
    ).not.toContain("Mesas");
  });

  it("reads the business's name: a food truck is a «Camión»", () => {
    expect(
      suggestTouchpointName({
        kind: "qr",
        pageType: "menu",
        businessName: "Food Truck La Güera",
      }),
    ).toBe("Camión");
  });

  it("never repeats a name, numbering it when every suggestion is taken", () => {
    const chips = suggestTouchpointNames({
      kind: "qr",
      pageType: "catalog",
      industry: "retail",
    });
    const name = suggestTouchpointName({
      kind: "qr",
      pageType: "catalog",
      industry: "retail",
      existingNames: chips,
    });
    expect(chips).not.toContain(name);
    expect(name).toMatch(/ \d+$/);
  });
});
