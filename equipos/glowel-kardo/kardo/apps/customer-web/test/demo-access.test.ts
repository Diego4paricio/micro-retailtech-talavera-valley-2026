import { afterEach, describe, expect, it, vi } from "vitest";

const store = new Map<string, string>();

function browser(search = "") {
  vi.stubGlobal("window", {
    location: { search, origin: "http://localhost", pathname: "/" },
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
  vi.resetModules();
  return import("../src/lib/demo/billing.js");
}

describe("demo access", () => {
  it("starts in the trial, like the demo billing", async () => {
    browser();
    const { handleAccessDemo } = await demo();
    const access = handleAccessDemo();
    expect(access.state).toBe("trial");
    expect(access.source).toBe("trial");
    expect(access.planName).toBe("Profesional");
    expect(access.daysLeft).toBe(11);
    expect(access.canManage).toBe(true);
  });

  it("becomes active after choosing a plan", async () => {
    browser();
    const { handleAccessDemo, handleBillingDemo } = await demo();
    handleBillingDemo("/v1/workspaces/x/billing/checkout", "POST", {
      priceId: "price_demoEsencialMes",
      workspaceId: "x",
    });
    const access = handleAccessDemo();
    expect(access.state).toBe("active");
    expect(access.source).toBe("subscription");
    expect(access.planName).toBe("Esencial");
  });

  it("can show the lapsed states for review", async () => {
    browser("?acceso=pausada");
    const { handleAccessDemo } = await demo();
    expect(handleAccessDemo().state).toBe("paused");
    browser("");
    // The choice is kept for the session until it is cleared.
    expect(handleAccessDemo().state).toBe("paused");
    browser("?acceso=");
    expect(handleAccessDemo().state).toBe("trial");
  });

  it("exports a JSON file", async () => {
    browser();
    const { handleExportDemo } = await demo();
    const file = handleExportDemo("abc");
    expect(file.type).toBe("application/json");
    expect(JSON.parse(await file.text()).workspaceId).toBe("abc");
  });
});
