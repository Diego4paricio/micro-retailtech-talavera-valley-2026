import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const signOut = vi.fn(async () => ({ error: null }));

vi.mock("../src/supabase.js", () => ({
  customerApiUrl: "http://api.kardo.test",
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: { access_token: "aal1-token" } },
      }),
      signOut,
    },
  },
}));

const { apiRequest } = await import("../src/lib/api.js");
const { SECOND_FACTOR_REQUIRED_EVENT } = await import(
  "../src/lib/second-factor.js"
);

function answer(status: number, code: string) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify({ code }), { status })),
  );
}

let events: string[];

beforeEach(() => {
  events = [];
  signOut.mockClear();
  vi.stubGlobal("window", {
    dispatchEvent: (event: Event) => {
      events.push(event.type);
      return true;
    },
  });
});

afterEach(() => vi.unstubAllGlobals());

describe("401 from the Customer API", () => {
  it("asks for the second factor instead of signing out on MFA_REQUIRED", async () => {
    answer(401, "MFA_REQUIRED");
    await expect(apiRequest("/v1/me")).rejects.toMatchObject({
      status: 401,
      code: "MFA_REQUIRED",
    });
    expect(events).toEqual([SECOND_FACTOR_REQUIRED_EVENT]);
    expect(signOut).not.toHaveBeenCalled();
  });

  it("still signs out on an expired or revoked session", async () => {
    answer(401, "AUTH_REQUIRED");
    await expect(apiRequest("/v1/me")).rejects.toMatchObject({ status: 401 });
    expect(events).not.toContain(SECOND_FACTOR_REQUIRED_EVENT);
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
