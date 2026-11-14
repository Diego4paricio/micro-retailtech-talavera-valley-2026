import type {
  AvailabilityExperience,
  AvailabilityItem,
  ItemAvailabilityChange,
} from "@kardo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { allAvailableChanges } from "../src/features/availability/model.js";
import {
  AvailabilitySaveQueue,
  type SaveQueueOptions,
} from "../src/features/availability/save-queue.js";

function item(
  id: string,
  overrides: Partial<AvailabilityItem> = {},
): AvailabilityItem {
  return {
    id,
    name: id,
    status: "available",
    quantity: null,
    updatedAt: null,
    ...overrides,
  };
}

function catalog(items: AvailabilityItem[]): AvailabilityExperience {
  return {
    experienceId: "8a2b6c4d-1e3f-4a5b-8c7d-9e0f1a2b3c72",
    name: "Arreglos del día",
    type: "catalog",
    currency: "MXN",
    source: "published",
    hasUnpublishedChanges: false,
    liveTouchpointCount: 1,
    updatedAt: null,
    sections: [{ id: "catalogo", name: null, items }],
  };
}

/** What the server answers: the same Experience with the changes applied. */
function applied(
  experience: AvailabilityExperience,
  changes: ItemAvailabilityChange[],
): AvailabilityExperience {
  const byId = new Map(changes.map((change) => [change.itemId, change]));
  return {
    ...experience,
    sections: experience.sections.map((section) => ({
      ...section,
      items: section.items.map((entry) => {
        const change = byId.get(entry.id);
        return change
          ? {
              ...entry,
              status: change.status,
              quantity: change.quantity,
              updatedAt: "2026-09-28T12:00:00.000Z",
            }
          : entry;
      }),
    })),
  };
}

type Call = {
  items: ItemAvailabilityChange[];
  resolve: (value: AvailabilityExperience) => void;
  reject: (error: unknown) => void;
};

function setup(
  items: AvailabilityItem[] = [
    item("rosas"),
    item("girasoles"),
    item("tulipanes"),
  ],
  options: Partial<SaveQueueOptions> = {},
) {
  let server = catalog(items);
  const calls: Call[] = [];
  const queue = new AvailabilitySaveQueue(server, {
    send: (changes) =>
      new Promise<AvailabilityExperience>((resolve, reject) => {
        calls.push({ items: changes, resolve, reject });
      }),
    describeError: (error) =>
      error instanceof Error ? error.message : "Error desconocido",
    ...options,
  });
  /** Answers the oldest open request as the server would. */
  const succeed = async (index = calls.length - 1) => {
    const call = calls[index];
    if (!call) throw new Error("no request");
    server = applied(server, call.items);
    call.resolve(server);
    await vi.advanceTimersByTimeAsync(0);
  };
  const fail = async (message: string, index = calls.length - 1) => {
    calls[index]?.reject(new Error(message));
    await vi.advanceTimersByTimeAsync(0);
  };
  const stateOf = (id: string) => {
    const found = queue.snapshot.experience.sections
      .flatMap((section) => section.items)
      .find((entry) => entry.id === id);
    return found ? { status: found.status, quantity: found.quantity } : null;
  };
  return { queue, calls, succeed, fail, stateOf };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("optimistic changes", () => {
  it("shows a change at once and keeps untouched items as they were", () => {
    const { queue, stateOf } = setup();
    const before = queue.snapshot.experience.sections[0]?.items[1];
    queue.change([{ itemId: "rosas", status: "sold_out", quantity: null }]);
    expect(stateOf("rosas")).toEqual({ status: "sold_out", quantity: null });
    expect(queue.snapshot.phase).toBe("saving");
    expect(queue.snapshot.unsaved).toBe(1);
    expect(queue.snapshot.experience.sections[0]?.items[1]).toBe(before);
  });

  it("ignores items that are not in the Experience", () => {
    const { queue, calls } = setup();
    queue.change([{ itemId: "nope", status: "hidden", quantity: null }]);
    expect(queue.snapshot.phase).toBe("idle");
    expect(queue.hasUnsaved()).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("batching", () => {
  it("sends rapid changes together, once, after the debounce", async () => {
    const { queue, calls, succeed, stateOf } = setup();
    queue.change([{ itemId: "rosas", status: "sold_out", quantity: null }]);
    await vi.advanceTimersByTimeAsync(150);
    queue.change([{ itemId: "girasoles", status: "available", quantity: 3 }]);
    await vi.advanceTimersByTimeAsync(300);
    queue.change([{ itemId: "tulipanes", status: "hidden", quantity: null }]);
    await vi.advanceTimersByTimeAsync(399);
    expect(calls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.items).toEqual([
      { itemId: "rosas", status: "sold_out", quantity: null },
      { itemId: "girasoles", status: "available", quantity: 3 },
      { itemId: "tulipanes", status: "hidden", quantity: null },
    ]);
    await succeed();
    expect(queue.snapshot.phase).toBe("saved");
    expect(queue.snapshot.unsaved).toBe(0);
    expect(stateOf("girasoles")).toEqual({ status: "available", quantity: 3 });
  });

  it("sends only the latest value of an item changed several times", async () => {
    const { queue, calls } = setup();
    queue.change([{ itemId: "rosas", status: "available", quantity: 3 }]);
    queue.change([{ itemId: "rosas", status: "available", quantity: 2 }]);
    queue.change([{ itemId: "rosas", status: "available", quantity: 1 }]);
    await vi.advanceTimersByTimeAsync(400);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.items).toEqual([
      { itemId: "rosas", status: "available", quantity: 1 },
    ]);
  });

  it("sends nothing when a change is undone before the debounce", async () => {
    const { queue, calls } = setup();
    queue.change([{ itemId: "rosas", status: "hidden", quantity: null }]);
    queue.change([{ itemId: "rosas", status: "available", quantity: null }]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toHaveLength(0);
    expect(queue.snapshot.phase).toBe("idle");
  });

  it("skips the debounce for bulk actions", async () => {
    const { queue, calls } = setup([
      item("rosas", { status: "sold_out" }),
      item("girasoles", { quantity: 1 }),
      item("tulipanes"),
    ]);
    queue.change(allAvailableChanges(queue.snapshot.experience), {
      immediate: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.items).toEqual([
      { itemId: "rosas", status: "available", quantity: null },
      { itemId: "girasoles", status: "available", quantity: null },
    ]);
  });

  it("splits more items than a request allows", async () => {
    const { queue, calls, succeed } = setup(undefined, { maxBatch: 2 });
    queue.change([
      { itemId: "rosas", status: "hidden", quantity: null },
      { itemId: "girasoles", status: "hidden", quantity: null },
      { itemId: "tulipanes", status: "hidden", quantity: null },
    ]);
    await vi.advanceTimersByTimeAsync(400);
    expect(calls.map((call) => call.items.length)).toEqual([2]);
    await succeed();
    expect(calls.map((call) => call.items.length)).toEqual([2, 1]);
    await succeed();
    expect(queue.hasUnsaved()).toBe(false);
  });
});

describe("changes during a save", () => {
  it("queues them and sends them right after, one request at a time", async () => {
    const { queue, calls, succeed, stateOf } = setup();
    queue.change([{ itemId: "rosas", status: "sold_out", quantity: null }]);
    await vi.advanceTimersByTimeAsync(400);
    expect(calls).toHaveLength(1);

    // While the first request is still open.
    queue.change([{ itemId: "girasoles", status: "hidden", quantity: null }]);
    queue.change([{ itemId: "rosas", status: "available", quantity: 4 }]);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(calls).toHaveLength(1);
    expect(stateOf("rosas")).toEqual({ status: "available", quantity: 4 });

    await succeed(0);
    // The older response never overwrites the newer, unsent change.
    expect(stateOf("rosas")).toEqual({ status: "available", quantity: 4 });
    expect(calls).toHaveLength(2);
    expect(calls[1]?.items).toEqual([
      { itemId: "girasoles", status: "hidden", quantity: null },
      { itemId: "rosas", status: "available", quantity: 4 },
    ]);
    await succeed(1);
    expect(queue.snapshot.phase).toBe("saved");
    expect(stateOf("girasoles")).toEqual({ status: "hidden", quantity: null });
  });
});

describe("failures", () => {
  it("rolls back to the confirmed state and explains why", async () => {
    const { queue, fail, stateOf } = setup();
    queue.change([{ itemId: "rosas", status: "sold_out", quantity: null }]);
    await vi.advanceTimersByTimeAsync(400);
    await fail("No pudimos confirmar el cambio.");
    expect(stateOf("rosas")).toEqual({ status: "available", quantity: null });
    expect(queue.snapshot.phase).toBe("error");
    expect(queue.snapshot.error).toBe("No pudimos confirmar el cambio.");
    expect([...queue.snapshot.failedIds]).toEqual(["rosas"]);
    expect(queue.hasUnsaved()).toBe(false);
  });

  it("keeps a newer change made while the failing request was open", async () => {
    const { queue, calls, fail, stateOf } = setup();
    queue.change([
      { itemId: "rosas", status: "sold_out", quantity: null },
      { itemId: "girasoles", status: "sold_out", quantity: null },
    ]);
    await vi.advanceTimersByTimeAsync(400);
    queue.change([{ itemId: "rosas", status: "hidden", quantity: null }]);
    await fail("Sin conexión.");
    expect(stateOf("rosas")).toEqual({ status: "hidden", quantity: null });
    expect(stateOf("girasoles")).toEqual({
      status: "available",
      quantity: null,
    });
    expect([...queue.snapshot.failedIds]).toEqual(["girasoles"]);
    expect(calls[1]?.items).toEqual([
      { itemId: "rosas", status: "hidden", quantity: null },
    ]);
  });

  it("retries the rolled-back changes", async () => {
    const { queue, calls, fail, succeed, stateOf } = setup();
    queue.change([{ itemId: "rosas", status: "sold_out", quantity: null }]);
    await vi.advanceTimersByTimeAsync(400);
    await fail("Sin conexión.");
    queue.retry();
    expect(stateOf("rosas")).toEqual({ status: "sold_out", quantity: null });
    expect(queue.snapshot.error).toBeNull();
    await vi.advanceTimersByTimeAsync(0);
    expect(calls).toHaveLength(2);
    expect(calls[1]?.items).toEqual([
      { itemId: "rosas", status: "sold_out", quantity: null },
    ]);
    await succeed();
    expect(queue.snapshot.phase).toBe("saved");
    expect(queue.snapshot.failedIds.size).toBe(0);
  });

  it("a new change to the failed item replaces the failure", async () => {
    const { queue, fail } = setup();
    queue.change([{ itemId: "rosas", status: "sold_out", quantity: null }]);
    await vi.advanceTimersByTimeAsync(400);
    await fail("Sin conexión.");
    queue.change([{ itemId: "rosas", status: "hidden", quantity: null }]);
    expect(queue.snapshot.error).toBeNull();
    expect(queue.snapshot.failedIds.size).toBe(0);
    expect(queue.snapshot.phase).toBe("saving");
  });

  it("dismissing keeps the rollback and clears the message", async () => {
    const { queue, fail, stateOf } = setup();
    queue.change([{ itemId: "rosas", status: "sold_out", quantity: null }]);
    await vi.advanceTimersByTimeAsync(400);
    await fail("Sin conexión.");
    queue.dismissError();
    expect(queue.snapshot.error).toBeNull();
    expect(queue.snapshot.phase).toBe("idle");
    expect(stateOf("rosas")).toEqual({ status: "available", quantity: null });
  });

  it("reports whether the saves since a moment succeeded", async () => {
    const { queue, succeed, fail } = setup();
    queue.change([{ itemId: "rosas", status: "hidden", quantity: null }], {
      immediate: true,
    });
    const first = queue.whenSettled();
    await vi.advanceTimersByTimeAsync(0);
    await succeed();
    await expect(first).resolves.toBe(true);

    queue.change([{ itemId: "rosas", status: "available", quantity: null }], {
      immediate: true,
    });
    const second = queue.whenSettled();
    await vi.advanceTimersByTimeAsync(0);
    await fail("Sin conexión.");
    await expect(second).resolves.toBe(false);
    await expect(queue.whenSettled()).resolves.toBe(true);
  });
});

describe("refreshes", () => {
  it("adopts fresher server data under unsaved changes", async () => {
    const { queue, stateOf } = setup();
    queue.change([{ itemId: "rosas", status: "sold_out", quantity: null }]);
    const fresher = catalog([
      item("rosas"),
      item("girasoles", { status: "hidden" }),
      item("tulipanes"),
    ]);
    expect(queue.replaceBase(fresher, queue.version)).toBe(true);
    expect(stateOf("girasoles")).toEqual({ status: "hidden", quantity: null });
    expect(stateOf("rosas")).toEqual({ status: "sold_out", quantity: null });
  });

  it("drops a refresh that started before a save landed", async () => {
    const { queue, succeed, stateOf } = setup();
    const versionAtStart = queue.version;
    queue.change([{ itemId: "rosas", status: "sold_out", quantity: null }], {
      immediate: true,
    });
    await vi.advanceTimersByTimeAsync(0);
    // While saving, a refresh cannot replace anything.
    expect(queue.replaceBase(catalog([item("rosas")]), queue.version)).toBe(
      false,
    );
    await succeed();
    expect(queue.replaceBase(catalog([item("rosas")]), versionAtStart)).toBe(
      false,
    );
    expect(stateOf("rosas")).toEqual({ status: "sold_out", quantity: null });
  });
});
