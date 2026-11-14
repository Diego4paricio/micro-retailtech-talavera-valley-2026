import type { PlanSelection } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  downgradePreview,
  initialKeep,
  overForPlan,
  selectionHeadline,
  selectionStateOf,
} from "../src/features/billing/plan-overage-model.js";

const candidate = (
  id: string,
  kind: "touchpoint" | "link",
  visits: number | null,
  excluded = false,
) => ({
  id,
  workspaceId: "00000000-0000-4000-8000-000000000001",
  publicId: `pub${id.padStart(16, "0")}`,
  kind,
  format: kind === "link" ? "link" : "qr",
  name: `Mesa ${id}`,
  excluded,
  visits,
});

const overage = {
  planCode: "esencial",
  planName: "Esencial",
  chooseBy: "2026-10-17T18:00:00.000Z",
  chosenAt: null,
  appliedAt: null,
  resolved: false,
};

const base: PlanSelection = {
  overage,
  limits: { organizations: null, touchpoints: 2, links: 1 },
  candidates: [
    candidate("1", "touchpoint", 5),
    candidate("2", "touchpoint", 90),
    candidate("3", "touchpoint", 40),
    candidate("4", "link", 1),
    candidate("5", "link", 7),
  ],
};

describe("downgrade in the panel (ADR 023)", () => {
  it("adds the extras the person already pays to the plan's limits", () => {
    const extras = [
      {
        entitlementKey: "touchpoints.max",
        quantity: 1,
        unitsPerQuantity: 10,
      },
      { entitlementKey: "links.max", quantity: 1, unitsPerQuantity: 5 },
    ];
    // 17 QR against 15 + 10, 3 links against 2 + 5: nothing is left out.
    expect(
      overForPlan(
        { "touchpoints.max": 17, "links.max": 3 },
        { "touchpoints.max": 15, "links.max": 2 },
        extras,
      ),
    ).toEqual({ organizations: 0, touchpoints: 0, links: 0 });
    // 30 QR against 25: 5 left out.
    expect(
      overForPlan({ "touchpoints.max": 30 }, { "touchpoints.max": 15 }, extras)
        .touchpoints,
    ).toBe(5);
    // An extra organization counts for organizations only.
    expect(
      overForPlan({ "organizations.max": 3 }, { "organizations.max": 1 }, [
        {
          entitlementKey: "organizations.max",
          quantity: 2,
          unitsPerQuantity: 1,
        },
      ]).organizations,
    ).toBe(0);
  });

  it("previews what a smaller plan would leave out", () => {
    const over = overForPlan(
      { "touchpoints.max": 17, "links.max": 3 },
      { "touchpoints.max": 15, "links.max": 2 },
    );
    expect(over).toEqual({ organizations: 0, touchpoints: 2, links: 1 });
    expect(downgradePreview(over, "Esencial")).toBe(
      "Con Esencial quedarían fuera 2 Touchpoints y 1 Link. Tendrás 14 días para elegir cuáles siguen activos; si no eliges, quedan los más visitados. Nada se borra.",
    );
    expect(
      downgradePreview(overForPlan({ "touchpoints.max": 3 }, {}), "Negocio"),
    ).toBeNull();
  });

  it("asks to choose while the window is open", () => {
    const state = selectionStateOf(base);
    expect(state).toMatchObject({
      kind: "choose",
      over: { touchpoints: 1, links: 1 },
    });
    expect(selectionHeadline(state)).toContain("1 Touchpoint y 1 Link de más");
  });

  it("starts the chooser with the most visited, up to each limit", () => {
    expect([...initialKeep(base)].sort()).toEqual(["2", "3", "5"]);
  });

  it("after choosing, starts from what is active and says what is out", () => {
    const chosen: PlanSelection = {
      ...base,
      overage: { ...overage, appliedAt: "2026-10-04T10:00:00.000Z" },
      candidates: base.candidates.map((item) =>
        ["1", "4"].includes(item.id) ? { ...item, excluded: true } : item,
      ),
    };
    expect([...initialKeep(chosen)].sort()).toEqual(["2", "3", "5"]);
    const state = selectionStateOf(chosen);
    expect(state.kind).toBe("out");
    expect(selectionHeadline(state)).toContain(
      "1 Touchpoint y 1 Link están fuera de tu plan",
    );
  });

  it("says nothing when everything fits", () => {
    expect(
      selectionStateOf({
        ...base,
        overage: null,
        limits: { organizations: null, touchpoints: null, links: null },
      }),
    ).toEqual({ kind: "none" });
  });
});
