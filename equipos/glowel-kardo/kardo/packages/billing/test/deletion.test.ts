import { describe, expect, it, vi } from "vitest";
import { type AccessRow, toMirroredAccess } from "../src/access.js";
import {
  createResolverRetireClient,
  deletionModeOf,
  isDeletionDue,
  ResolverRetireError,
} from "../src/retention.js";

const DAY = 86_400_000;
const now = Date.parse("2027-01-20T18:00:00.000Z");
const at = (days: number) => new Date(now + days * DAY);

function row(overrides: Partial<AccessRow>): AccessRow {
  return {
    state: "paused",
    source: "trial",
    plan_code: "profesional",
    plan_name: "Profesional",
    ends_at: null,
    lapsed_at: at(-91),
    grace_ends_at: at(-84),
    delete_at: at(-1),
    offer_until: null,
    ...overrides,
  };
}

describe("deletion 90 days after the end (ADR 020, addendum 2026-10-01)", () => {
  it("is off unless BILLING_DELETE_ENABLED says true or dry-run", () => {
    expect(deletionModeOf(undefined)).toBe("off");
    expect(deletionModeOf("")).toBe("off");
    expect(deletionModeOf("false")).toBe("off");
    expect(deletionModeOf("yes")).toBe("off");
    expect(deletionModeOf("true")).toBe("on");
    expect(deletionModeOf(" TRUE ")).toBe("on");
    expect(deletionModeOf("dry-run")).toBe("dry-run");
  });

  it("is due only when paused and past its date", () => {
    expect(isDeletionDue(row({}), now)).toBe(true);
    expect(isDeletionDue(row({ delete_at: at(1) }), now)).toBe(false);
    expect(isDeletionDue(row({ delete_at: null }), now)).toBe(false);
    for (const state of [
      "limited",
      "active",
      "trial",
      "internal",
      "legacy",
      "deleted",
    ] as const)
      expect(isDeletionDue(row({ state }), now)).toBe(false);
  });

  it("a deleted organization never announces another deletion", () => {
    const mirrored = toMirroredAccess(
      row({
        state: "deleted",
        source: "none",
        lapsed_at: null,
        grace_ends_at: null,
        delete_at: at(-2),
      }),
      { deletionEnabled: true, now },
    );
    expect(mirrored.state).toBe("deleted");
    expect(mirrored.deletionSoon).toBe(false);
    expect(mirrored.deleteAt).toBe(at(-2).toISOString());
  });
});

describe("Resolver retirement client", () => {
  it("retires with the publish key and asks to purge the snapshots", async () => {
    const fetchFn = vi.fn(async () => new Response(null, { status: 200 }));
    const retire = createResolverRetireClient({
      resolverUrl: "https://tap.kardo.mx",
      commandKey: "publish-key-123456",
      fetchFn,
    });
    await retire("AbCdEfGhIjKlMnOpQr");
    const [url, init] = fetchFn.mock.calls[0] as unknown as [URL, RequestInit];
    expect(String(url)).toBe("https://tap.kardo.mx/internal/availability");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer publish-key-123456",
    );
    expect(JSON.parse(String(init.body))).toEqual({
      publicId: "AbCdEfGhIjKlMnOpQr",
      status: "retired",
      purge: true,
    });
  });

  it("fails on any answer but 2xx, so the item stays pending", async () => {
    const retire = createResolverRetireClient({
      resolverUrl: "https://tap.kardo.mx",
      commandKey: "publish-key-123456",
      fetchFn: async () => new Response("nope", { status: 401 }),
    });
    await expect(retire("AbCdEfGhIjKlMnOpQr")).rejects.toThrow(
      ResolverRetireError,
    );
  });

  it("needs HTTPS except a local wrangler dev", () => {
    expect(() =>
      createResolverRetireClient({
        resolverUrl: "http://tap.kardo.mx",
        commandKey: "publish-key-123456",
      }),
    ).toThrow(ResolverRetireError);
    expect(() =>
      createResolverRetireClient({
        resolverUrl: "http://localhost:8787",
        commandKey: "publish-key-123456",
      }),
    ).not.toThrow();
  });
});
