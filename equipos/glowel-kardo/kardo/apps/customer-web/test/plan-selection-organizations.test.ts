import type { PlanSelection, PlanSelectionCandidate } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import {
  initialKeep,
  keepIdsToSave,
  keptCount,
  mostVisitedId,
  organizationDetail,
  organizationsBannerText,
  overForPlan,
  overWords,
  selectionHeadline,
  selectionStateOf,
  toggleOrganization,
  visibleItems,
} from "../src/features/billing/plan-overage-model.js";

const ws = (n: number) => `00000000-0000-4000-8000-00000000000${n}`;

const org = (
  n: number,
  visits: number | null,
  excluded = false,
): PlanSelectionCandidate => ({
  id: ws(n),
  publicId: `org${n}`,
  kind: "organization",
  workspaceId: ws(n),
  format: "organization",
  name: `Negocio ${n}`,
  excluded,
  visits,
});

const code = (
  id: string,
  workspace: number,
  kind: "touchpoint" | "link",
  visits: number,
): PlanSelectionCandidate => ({
  id,
  publicId: `pub${id}`,
  kind,
  workspaceId: ws(workspace),
  format: kind === "link" ? "link" : "qr",
  name: `Código ${id}`,
  excluded: false,
  visits,
});

const overage = {
  planCode: "esencial",
  planName: "Esencial",
  chooseBy: "2026-10-22T18:00:00.000Z",
  chosenAt: null,
  appliedAt: null,
  resolved: false,
};

const selection = (organizations: number | null = 1): PlanSelection => ({
  overage,
  limits: { organizations, touchpoints: 2, links: 1 },
  candidates: [
    org(1, 412),
    org(2, 268),
    org(3, 95),
    code("t1", 1, "touchpoint", 50),
    code("t2", 1, "touchpoint", 40),
    code("t3", 1, "touchpoint", 5),
    code("t4", 2, "touchpoint", 30),
    code("l1", 1, "link", 9),
    code("l2", 2, "link", 20),
  ],
});

describe("downgrade selection with organizations", () => {
  it("counts the organizations a smaller plan leaves out", () => {
    const over = overForPlan(
      { "organizations.max": 3, "touchpoints.max": 10 },
      { "organizations.max": 1, "touchpoints.max": 15 },
    );
    expect(over).toEqual({ organizations: 2, touchpoints: 0, links: 0 });
    expect(overWords(over)).toBe("2 Organizaciones");
  });

  it("says which one stays, in the banner", () => {
    const state = selectionStateOf(selection(1));
    expect(selectionHeadline(state)).toBe(
      "Con Esencial te queda 1 organización. Elige cuál sigue antes del 22 oct 2026.",
    );
    expect(organizationsBannerText("Profesional", 3, overage.chooseBy)).toBe(
      "Con Profesional te quedan 3 organizaciones. Elige cuáles siguen antes del 22 oct 2026.",
    );
  });

  it("keeps the old text when only codes are over", () => {
    const only: PlanSelection = {
      ...selection(null),
      candidates: selection(null).candidates.filter(
        (item) => item.kind !== "organization",
      ),
    };
    expect(selectionHeadline(selectionStateOf(only))).toContain(
      "de más. Elige antes del",
    );
  });

  it("preselects the most visited organization and its best codes", () => {
    const keep = initialKeep(selection(1));
    expect([...keep].sort()).toEqual([ws(1), "l1", "t1", "t2"].sort());
  });

  it("tags the most visited organization", () => {
    const orgs = selection(1).candidates.filter(
      (item) => item.kind === "organization",
    );
    expect(mostVisitedId(orgs)).toBe(ws(1));
    expect(mostVisitedId(orgs.slice(0, 1))).toBeNull();
    expect(organizationDetail(org(1, 412))).toBe("412 visitas en 30 días");
    expect(organizationDetail(org(1, 1))).toBe("1 visita en 30 días");
    expect(organizationDetail(org(1, null))).toBe("Organización");
  });

  it("shows codes only for the organizations kept", () => {
    const keep = initialKeep(selection(1));
    expect(
      visibleItems(selection(1), keep, "touchpoint").map((item) => item.id),
    ).toEqual(["t1", "t2", "t3"]);
    expect(keptCount(selection(1), keep, "touchpoint")).toBe(2);
    expect(keptCount(selection(1), keep, "organization")).toBe(1);
  });

  it("switching the organization replaces it and brings its own codes", () => {
    const next = toggleOrganization(
      selection(1),
      initialKeep(selection(1)),
      ws(2),
    );
    expect([...next].sort()).toEqual([ws(2), "l2", "t4"].sort());
  });

  it("with room for several, ticking adds and unticking takes away", () => {
    const base = selection(2);
    const keep = initialKeep(base);
    expect(keptCount(base, keep, "organization")).toBe(2);
    const without = toggleOrganization(base, keep, ws(1));
    expect(without.has(ws(1))).toBe(false);
    expect(without.has("t1")).toBe(false);
    expect(without.has(ws(2))).toBe(true);
  });

  it("saves the kept organizations and only their kept codes", () => {
    const base = selection(1);
    const keep = new Set([ws(1), "t1", "t4", "l1"]);
    expect(keepIdsToSave(base, keep).sort()).toEqual(
      [ws(1), "l1", "t1"].sort(),
    );
  });

  it("after choosing, starts from what is active", () => {
    const chosen: PlanSelection = {
      ...selection(1),
      overage: { ...overage, appliedAt: "2026-10-04T10:00:00.000Z" },
      candidates: selection(1).candidates.map((item) =>
        item.kind === "organization" && item.id !== ws(2)
          ? { ...item, excluded: true }
          : item,
      ),
    };
    const keep = initialKeep(chosen);
    expect(keep.has(ws(2))).toBe(true);
    expect(keep.has(ws(1))).toBe(false);
    expect(selectionStateOf(chosen).kind).toBe("out");
    expect(selectionHeadline(selectionStateOf(chosen))).toContain(
      "2 Organizaciones están fuera de tu plan",
    );
  });
});
