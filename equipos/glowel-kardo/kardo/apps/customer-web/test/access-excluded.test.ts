import type { WorkspaceAccess } from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { bannerFor } from "../src/features/billing/access-model.js";

const access = (overrides: Partial<WorkspaceAccess>): WorkspaceAccess => ({
  state: "trial",
  source: "trial",
  planCode: "profesional",
  planName: "Profesional",
  endsAt: null,
  daysLeft: 11,
  lapsedAt: null,
  graceEndsAt: null,
  deleteAt: null,
  deletionSoon: false,
  canManage: true,
  offer: null,
  ...overrides,
});

describe("access strip for the new billing (ADR 024)", () => {
  it("tells every role the trial ends without a charge, with «Ver planes»", () => {
    for (const canManage of [true, false]) {
      const banner = bannerFor(access({ canManage }), { canExport: false });
      expect(banner?.text).toBe(
        "Te quedan 11 días de prueba de Profesional. Al terminar no se cobra nada si no eliges un plan.",
      );
      expect(banner?.viewPlans).toBe(true);
      expect(banner?.choosePlan).toBe(false);
    }
  });

  it("says an organization left out of the plan is paused", () => {
    const owner = bannerFor(
      access({ state: "paused", source: "excluded", daysLeft: null }),
      { canExport: true },
    );
    expect(owner?.text).toBe(
      "Esta organización quedó fuera de tu plan: sus páginas están en pausa. Nada se borra.",
    );
    expect(owner?.tone).toBe("warning");
    expect(owner?.chooseExcluded).toBe(true);
    expect(owner?.choosePlan).toBe(false);
  });

  it("offers nothing to who cannot manage billing", () => {
    const editor = bannerFor(
      access({
        state: "paused",
        source: "excluded",
        daysLeft: null,
        canManage: false,
      }),
      { canExport: false },
    );
    expect(editor?.chooseExcluded).toBe(false);
    expect(editor?.choosePlan).toBe(false);
  });
});
