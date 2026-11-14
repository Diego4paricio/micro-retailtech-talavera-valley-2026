import { staffAccessFilters } from "@kardo/contracts";
import { beforeAll, describe, expect, it, vi } from "vitest";

type Demo = typeof import("../src/lib/demo.js");
let request: Demo["demoRequest"];

beforeAll(async () => {
  vi.stubGlobal("window", globalThis);
  request = (await import("../src/lib/demo.js")).demoRequest;
});

const ask = <T>(path: string, method = "GET", body?: unknown) =>
  request<T>(path, { method, body });

describe("demo data follows ADR 020", () => {
  it("has no free plan and the four new plans", async () => {
    const plans =
      await ask<{ code: string; prices: unknown[] }[]>("/v1/staff/plans");
    expect(plans.map((plan) => plan.code)).toEqual([
      "esencial",
      "profesional",
      "negocio",
      "corporativo",
    ]);
    expect(plans.at(-1)?.prices).toEqual([]);
  });

  it("seeds one organization per access state and a matching overview", async () => {
    const overview = await ask<{ access: Record<string, number> }>(
      "/v1/staff/billing/overview",
    );
    expect(overview.access.kardoTrials).toBe(1);
    expect(overview.access.limited).toBe(1);
    expect(overview.access.paused).toBe(2);
    expect(overview.access.internal).toBe(1);
    expect(overview.access.pendingDeletion).toBe(1);
    expect(overview.access.deleted).toBe(1);
    expect(overview.access.deletionMode).toBe("dry-run");
    for (const filter of staffAccessFilters) {
      const rows = await ask<unknown[]>(
        `/v1/staff/billing/access?state=${filter}`,
      );
      expect(rows.length).toBeGreaterThan(0);
    }
  });

  it("shows a deleted organization with its record, kept invoices and 409s", async () => {
    const id = "20000000-0000-4000-8000-000000000016";
    const deleted = await ask<
      {
        workspaceName: string;
        deleteAt: string;
      }[]
    >("/v1/staff/billing/access?state=deleted");
    expect(deleted.map((row) => row.workspaceName)).toEqual([
      "Florería Eliminada",
    ]);
    const pending = await ask<{ workspaceName: string }[]>(
      "/v1/staff/billing/access?state=deletion",
    );
    expect(pending.map((row) => row.workspaceName)).not.toContain(
      "Florería Eliminada",
    );
    const detail = await ask<{
      access: {
        state: string;
        deletion: { counts: Record<string, number>; cleanupPending: number };
      };
      invoices: unknown[];
    }>(`/v1/staff/workspaces/${id}/billing`);
    expect(detail.access.state).toBe("deleted");
    expect(detail.access.deletion.counts.invoicesKept).toBe(2);
    expect(detail.access.deletion.cleanupPending).toBe(2);
    expect(detail.invoices).toHaveLength(2);
    await expect(async () =>
      ask(`/v1/staff/workspaces/${id}/internal`, "PUT", {
        internal: true,
        reason: "Prueba",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(async () =>
      ask(`/v1/staff/workspaces/${id}/kardo-trial/extend`, "POST", {
        days: 7,
        reason: "Prueba",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("marks and unmarks an organization as internal, and extends a trial", async () => {
    const id = "20000000-0000-4000-8000-000000000003";
    const marked = await ask<{ access: { state: string } }>(
      `/v1/staff/workspaces/${id}/internal`,
      "PUT",
      { internal: true, reason: "Prueba" },
    );
    expect(marked.access.state).toBe("internal");
    const back = await ask<{ access: { internal: unknown } }>(
      `/v1/staff/workspaces/${id}/internal`,
      "PUT",
      { internal: false, reason: "Prueba" },
    );
    expect(back.access.internal).toBeNull();

    const trialId = "20000000-0000-4000-8000-000000000005";
    const before = await ask<{ trial: { endsAt: string } }>(
      `/v1/staff/workspaces/${trialId}/billing`,
    );
    const after = await ask<{ trial: { endsAt: string } }>(
      `/v1/staff/workspaces/${trialId}/kardo-trial/extend`,
      "POST",
      { days: 7, reason: "Pidió más tiempo" },
    );
    expect(new Date(after.trial.endsAt).getTime()).toBeGreaterThan(
      new Date(before.trial.endsAt).getTime(),
    );
  });
});
