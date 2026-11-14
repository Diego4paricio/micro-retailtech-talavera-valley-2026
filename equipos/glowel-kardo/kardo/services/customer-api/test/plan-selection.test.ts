import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { PlanSelectionRepository } from "../src/billing/plan-selection.js";
import { authHeader, verifierFor, workspaceId } from "./helpers.js";

const keep = ["31f7a4dc-0bb7-450e-91c6-342045d779e9"];

function appWith(repository: Partial<PlanSelectionRepository>) {
  return buildCustomerApi({
    sessionVerifier: verifierFor(),
    planSelection: repository as PlanSelectionRepository,
  });
}

describe("plan selection routes (ADR 023, option B)", () => {
  it("reads the window, the limits and the candidates", async () => {
    const read = vi.fn(async () => ({
      overage: {
        planCode: "esencial",
        planName: "Esencial",
        chooseBy: "2026-10-17T18:00:00.000Z",
        chosenAt: null,
        appliedAt: null,
        resolved: false,
      },
      limits: { organizations: 1, touchpoints: 15, links: 2 },
      candidates: [
        {
          id: workspaceId,
          publicId: "wsflorerialila0001",
          kind: "organization" as const,
          format: "organization",
          name: "Florería Lila",
          excluded: false,
          visits: 42,
          workspaceId,
        },
        {
          id: keep[0] as string,
          publicId: "tpflorerialila0001",
          kind: "touchpoint" as const,
          format: "qr",
          name: "Mostrador",
          excluded: false,
          visits: 42,
          workspaceId,
        },
      ],
    }));
    const app = appWith({ read });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/plan-selection`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().limits).toEqual({
      organizations: 1,
      touchpoints: 15,
      links: 2,
    });
    expect(response.json().candidates[0].kind).toBe("organization");
    expect(read).toHaveBeenCalledWith(
      expect.objectContaining({ email: "customer@kardo.test" }),
      workspaceId,
    );
    await app.close();
  });

  it("passes the choice through and returns what changed", async () => {
    const save = vi.fn(async () => ({ excluded: 3, included: 0 }));
    const app = appWith({ save });
    const response = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/plan-selection`,
      headers: authHeader,
      payload: { keep },
    });
    expect(response.json()).toEqual({ excluded: 3, included: 0 });
    expect(save).toHaveBeenCalledWith(expect.anything(), workspaceId, keep);
    await app.close();
  });

  it("refuses ids that are not uuids and repeated ids", async () => {
    const app = appWith({ save: vi.fn() });
    for (const payload of [
      { keep: ["mesa-1"] },
      { keep: [keep[0], keep[0]] },
    ]) {
      const response = await app.inject({
        method: "PUT",
        url: `/v1/workspaces/${workspaceId}/plan-selection`,
        headers: authHeader,
        payload,
      });
      expect(response.statusCode).toBe(400);
    }
    await app.close();
  });
});
