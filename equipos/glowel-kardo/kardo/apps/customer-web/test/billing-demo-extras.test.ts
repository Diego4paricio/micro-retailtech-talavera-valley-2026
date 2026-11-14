import { afterEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

function browser() {
  vi.stubGlobal("window", {
    location: { search: "", origin: "http://localhost", pathname: "/" },
    sessionStorage: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
      removeItem: (key: string) => void store.delete(key),
    },
  });
}

afterEach(() => {
  store.clear();
  vi.unstubAllGlobals();
  vi.resetModules();
});

async function demo() {
  browser();
  vi.resetModules();
  return import("../src/lib/demo/billing.js");
}

const extrasPath = "/v1/workspaces/x/billing/extras";

describe("demo billing account (ADR 024)", () => {
  it("has the person's account in the trial", async () => {
    const { handleBillingDemo } = await demo();
    const billing = (await handleBillingDemo(
      "/v1/workspaces/x/billing",
      "GET",
      {},
    )) as import("@kardo/contracts").WorkspaceBilling;
    expect(billing.account?.holderName).toBe("Mariana Ríos");
    expect(billing.account?.isHolder).toBe(true);
    expect(billing.account?.organizationsLimit).toBe(3);
    expect(billing.entitlements["organizations.max"]).toBe(3);
    expect(
      billing.account?.extras.map((item) => item.prices[0]?.unitAmount),
    ).toEqual([9900, 4900, 2900]);
  });

  it("refuses extras without a paid plan", async () => {
    const { handleBillingDemo } = await demo();
    await expect(
      handleBillingDemo(extrasPath, "PUT", {
        quantities: { organization: 1 },
        confirm: false,
      }),
    ).rejects.toMatchObject({ status: 409, code: "EXTRAS_NEED_PLAN" });
  });

  it("previews, then adds an extra to the shared limits", async () => {
    const { handleBillingDemo } = await demo();
    handleBillingDemo("/v1/workspaces/x/billing/checkout", "POST", {
      priceId: "price_demoProfesionalMes",
      workspaceId: "x",
    });
    const preview = (await handleBillingDemo(extrasPath, "PUT", {
      quantities: { organization: 1 },
      confirm: false,
    })) as import("@kardo/contracts").BillingChangeResult;
    expect(preview.status).toBe("preview");
    expect(preview.nextAmount).toBe(37900 + 9900);
    expect(preview.amountDueToday).toBeGreaterThan(0);
    expect(preview.amountDueToday).toBeLessThanOrEqual(9900);

    await handleBillingDemo(extrasPath, "PUT", {
      quantities: { organization: 1, touchpoints: 2 },
      confirm: true,
    });
    const billing = handleBillingDemo(
      "/v1/workspaces/x/billing",
      "GET",
      {},
    ) as import("@kardo/contracts").WorkspaceBilling;
    expect(billing.entitlements["organizations.max"]).toBe(4);
    expect(billing.entitlements["touchpoints.max"]).toBe(80);
    expect(billing.account?.organizationsLimit).toBe(4);
    const mine = handleBillingDemo(
      "/v1/billing/account",
      "GET",
      {},
    ) as import("@kardo/contracts").BillingMyAccount;
    expect(mine.canAddExtras).toBe(true);
    expect(
      mine.extras.find((item) => item.code === "touchpoints")?.quantity,
    ).toBe(2);
  });

  it("changes the plan keeping the extras", async () => {
    const { handleBillingDemo } = await demo();
    handleBillingDemo("/v1/workspaces/x/billing/checkout", "POST", {
      priceId: "price_demoEsencialMes",
      workspaceId: "x",
    });
    await handleBillingDemo(extrasPath, "PUT", {
      quantities: { links: 1 },
      confirm: true,
    });
    const planPath = "/v1/workspaces/x/billing/plan-change";
    const preview = (await handleBillingDemo(planPath, "POST", {
      priceId: "price_demoProfesionalMes",
      confirm: false,
    })) as import("@kardo/contracts").BillingChangeResult;
    expect(preview.nextAmount).toBe(37900 + 2900);
    await handleBillingDemo(planPath, "POST", {
      priceId: "price_demoProfesionalMes",
      confirm: true,
    });
    const billing = handleBillingDemo(
      "/v1/workspaces/x/billing",
      "GET",
      {},
    ) as import("@kardo/contracts").WorkspaceBilling;
    expect(billing.plan?.name).toBe("Profesional");
    expect(billing.entitlements["links.max"]).toBe(15);
  });
});
