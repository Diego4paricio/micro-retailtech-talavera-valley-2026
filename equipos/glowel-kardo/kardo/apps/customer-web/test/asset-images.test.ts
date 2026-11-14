import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { authorizeMock } = vi.hoisted(() => ({ authorizeMock: vi.fn() }));

vi.mock("../src/lib/demo.js", () => ({ isDemoMode: false }));
vi.mock("../src/api/assets.js", () => ({
  assetReadApi: { authorize: authorizeMock },
}));

import {
  cachedAssetImage,
  loadAssetImage,
  markAssetValidated,
} from "../src/lib/asset-images.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

function auth(
  mediaType: "image/png" | "image/jpeg" | "image/webp" = "image/png",
) {
  return {
    url: "https://cdn.example.test/read",
    mediaType,
    expiresAt: new Date().toISOString(),
  };
}

function okResponse(mediaType = "image/png") {
  return {
    ok: true,
    status: 200,
    blob: async () => new Blob(["fake-bytes"], { type: mediaType }),
  };
}

beforeEach(() => {
  authorizeMock.mockReset();
  fetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Runs first, while the module's shared cache is still empty, so the eviction
// count below is exact (later tests populate the same process-wide cache).
describe("LRU cache eviction", () => {
  it("evicts the oldest cached image and revokes its blob URL past the cache limit", async () => {
    authorizeMock.mockImplementation(async () => auth());
    fetchMock.mockImplementation(async () => okResponse());
    const revokeSpy = vi.spyOn(URL, "revokeObjectURL");

    // One past the loader's cap (300 distinct asset+size entries).
    const total = 301;
    for (let index = 0; index < total; index++) {
      await loadAssetImage("ws-1", `asset-lru-${index}`, "thumb");
    }

    expect(cachedAssetImage("asset-lru-0", "thumb")).toBeNull();
    expect(cachedAssetImage("asset-lru-1", "thumb")).not.toBeNull();
    expect(cachedAssetImage(`asset-lru-${total - 1}`, "thumb")).not.toBeNull();
    expect(revokeSpy).toHaveBeenCalledTimes(1);
  }, 15_000);
});

describe("loadAssetImage / cachedAssetImage", () => {
  it("dedupes concurrent reads for the same asset and size", async () => {
    authorizeMock.mockResolvedValue(auth());
    fetchMock.mockResolvedValue(okResponse());

    const [first, second] = await Promise.all([
      loadAssetImage("ws-1", "asset-dedupe", "thumb"),
      loadAssetImage("ws-1", "asset-dedupe", "thumb"),
    ]);

    expect(first).toBe(second);
    expect(authorizeMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("caches a resolved image per asset+size and skips the network on the next read", async () => {
    authorizeMock.mockResolvedValue(auth());
    fetchMock.mockResolvedValue(okResponse());

    const url = await loadAssetImage("ws-1", "asset-cache", "thumb");
    expect(cachedAssetImage("asset-cache", "thumb")).toBe(url);
    expect(cachedAssetImage("asset-cache", "full")).toBeNull();

    const again = await loadAssetImage("ws-1", "asset-cache", "thumb");
    expect(again).toBe(url);
    expect(authorizeMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("rejects once the quick retries are exhausted", async () => {
    vi.useFakeTimers();
    try {
      authorizeMock.mockResolvedValue(auth());
      fetchMock.mockResolvedValue({ ok: false, status: 404 });

      const assertion = expect(
        loadAssetImage("ws-1", "asset-broken", "thumb"),
      ).rejects.toThrow("read 404");
      // 1s, 2s and 4s quick retries, then the rejection.
      await vi.runAllTimersAsync();
      await assertion;
      expect(fetchMock).toHaveBeenCalledTimes(4);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("retry schedule for a not-yet-validated asset", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("retries quickly (roughly 1s, 2s, 4s) before succeeding", async () => {
    authorizeMock
      .mockRejectedValueOnce(new Error("read 404"))
      .mockRejectedValueOnce(new Error("read 404"))
      .mockResolvedValueOnce(auth());
    fetchMock.mockResolvedValue(okResponse());

    const promise = loadAssetImage("ws-1", "asset-retry", "thumb");

    // First attempt fails immediately; the 1s and 2s quick retries follow.
    await vi.advanceTimersByTimeAsync(1_000);
    await vi.advanceTimersByTimeAsync(2_000);

    const url = await promise;
    expect(typeof url).toBe("string");
    expect(authorizeMock).toHaveBeenCalledTimes(3);
  });

  it("gives up after the quick retries, then cools down before trying again", async () => {
    authorizeMock.mockRejectedValue(new Error("read 404"));

    const observed = loadAssetImage("ws-1", "asset-cooldown", "thumb").catch(
      (error: unknown) => error,
    );
    // 1s + 2s + 4s of quick retries (4 attempts total) before giving up.
    await vi.advanceTimersByTimeAsync(1_000 + 2_000 + 4_000);
    await expect(observed).resolves.toBeInstanceOf(Error);
    expect(authorizeMock).toHaveBeenCalledTimes(4);

    // Still inside the long cool-down: a new call rejects without asking again.
    authorizeMock.mockClear();
    await expect(
      loadAssetImage("ws-1", "asset-cooldown", "thumb"),
    ).rejects.toThrow();
    expect(authorizeMock).not.toHaveBeenCalled();

    // Past the cool-down, a fresh attempt is made.
    authorizeMock.mockResolvedValueOnce(auth());
    fetchMock.mockResolvedValue(okResponse());
    await vi.advanceTimersByTimeAsync(60_000);
    const url = await loadAssetImage("ws-1", "asset-cooldown", "thumb");
    expect(typeof url).toBe("string");
    expect(authorizeMock).toHaveBeenCalledTimes(1);
  });

  it("markAssetValidated clears the cool-down so a retry doesn't have to wait", async () => {
    authorizeMock.mockRejectedValue(new Error("read 404"));

    const observed = loadAssetImage("ws-1", "asset-validated", "thumb").catch(
      (error: unknown) => error,
    );
    await vi.advanceTimersByTimeAsync(1_000 + 2_000 + 4_000);
    await expect(observed).resolves.toBeInstanceOf(Error);

    authorizeMock.mockClear();
    markAssetValidated("asset-validated");
    authorizeMock.mockResolvedValueOnce(auth());
    fetchMock.mockResolvedValue(okResponse());

    // No time advance needed: the cool-down was cleared, not merely shortened.
    const url = await loadAssetImage("ws-1", "asset-validated", "thumb");
    expect(typeof url).toBe("string");
    expect(authorizeMock).toHaveBeenCalledTimes(1);
  });
});

describe("demo mode", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("never reads the library and reports no cached image", async () => {
    vi.resetModules();
    const demoAuthorize = vi.fn();
    vi.doMock("../src/lib/demo.js", () => ({ isDemoMode: true }));
    vi.doMock("../src/api/assets.js", () => ({
      assetReadApi: { authorize: demoAuthorize },
    }));

    const demoModule = await import("../src/lib/asset-images.js");

    await expect(
      demoModule.loadAssetImage("ws-demo", "asset-demo", "thumb"),
    ).rejects.toThrow(/demo/i);
    expect(demoModule.cachedAssetImage("asset-demo", "thumb")).toBeNull();
    expect(demoAuthorize).not.toHaveBeenCalled();
  });
});
