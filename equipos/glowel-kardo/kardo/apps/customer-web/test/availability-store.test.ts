import type {
  AvailabilityExperience,
  AvailabilityItem,
  AvailabilityOverview,
  SaveItemAvailability,
} from "@kardo/contracts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  type AvailabilityApi,
  AvailabilityStore,
} from "../src/features/availability/store.js";

const menuId = "3f7d2c1a-8b4e-4f6a-9c0d-2e1f3a4b5c61";
const catalogId = "8a2b6c4d-1e3f-4a5b-8c7d-9e0f1a2b3c72";

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

function experience(
  experienceId: string,
  items: AvailabilityItem[],
): AvailabilityExperience {
  return {
    experienceId,
    name: experienceId === menuId ? "Menú Terraza" : "Arreglos del día",
    type: experienceId === menuId ? "menu" : "catalog",
    currency: "MXN",
    source: "published",
    hasUnpublishedChanges: false,
    liveTouchpointCount: 1,
    updatedAt: null,
    sections: [
      { id: "s1", name: experienceId === menuId ? "Postres" : null, items },
    ],
  };
}

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
};
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

function setup(
  options: { requiresRefresh?: (error: unknown) => boolean } = {},
) {
  const loads: Deferred<AvailabilityOverview>[] = [];
  const saves: {
    experienceId: string;
    body: SaveItemAvailability;
    reply: Deferred<AvailabilityExperience>;
  }[] = [];
  const api: AvailabilityApi = {
    load: () => {
      const reply = deferred<AvailabilityOverview>();
      loads.push(reply);
      return reply.promise;
    },
    save: (experienceId, body) => {
      const reply = deferred<AvailabilityExperience>();
      saves.push({ experienceId, body, reply });
      return reply.promise;
    },
  };
  const store = new AvailabilityStore(api, {
    describeError: (error) =>
      error instanceof Error ? error.message : "Error desconocido",
    requiresRefresh: options.requiresRefresh,
  });
  const stateOf = (experienceId: string, itemId: string) => {
    const found = store
      .getSnapshot()
      .experiences.find(
        (entry) => entry.experience.experienceId === experienceId,
      )
      ?.experience.sections.flatMap((section) => section.items)
      .find((entry) => entry.id === itemId);
    return found ? { status: found.status, quantity: found.quantity } : null;
  };
  return { store, loads, saves, stateOf };
}

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

describe("loading the list", () => {
  it("shows every Menu and Catalog in the server's order", async () => {
    const { store, loads } = setup();
    const listener = vi.fn();
    store.subscribe(listener);
    expect(store.getSnapshot().status).toBe("loading");
    const done = store.refresh();
    loads[0]?.resolve({
      experiences: [
        experience(menuId, [item("flan")]),
        experience(catalogId, [item("rosas")]),
      ],
    });
    await done;
    const snapshot = store.getSnapshot();
    expect(snapshot.status).toBe("ready");
    expect(
      snapshot.experiences.map((entry) => entry.experience.experienceId),
    ).toEqual([menuId, catalogId]);
    expect(listener).toHaveBeenCalled();
  });

  it("reuses a refresh already on its way", () => {
    const { store, loads } = setup();
    void store.refresh();
    void store.refresh();
    expect(loads).toHaveLength(1);
  });

  it("reports a failed first load, and keeps the data on a failed refresh", async () => {
    const { store, loads } = setup();
    const first = store.refresh();
    loads[0]?.reject(new Error("Sin conexión."));
    await first;
    expect(store.getSnapshot()).toMatchObject({
      status: "error",
      error: "Sin conexión.",
    });

    const second = store.refresh();
    expect(store.getSnapshot().status).toBe("loading");
    loads[1]?.resolve({ experiences: [experience(menuId, [item("flan")])] });
    await second;
    const third = store.refresh();
    loads[2]?.reject(new Error("Sin conexión."));
    await third;
    expect(store.getSnapshot().status).toBe("ready");
    expect(store.getSnapshot().experiences).toHaveLength(1);
  });
});

describe("saving through the store", () => {
  async function ready() {
    const context = setup();
    const done = context.store.refresh();
    context.loads[0]?.resolve({
      experiences: [
        experience(menuId, [item("flan"), item("churros")]),
        experience(catalogId, [item("rosas")]),
      ],
    });
    await done;
    return context;
  }

  it("saves each Experience with its own request", async () => {
    const { store, saves, stateOf } = await ready();
    store.change(menuId, [
      { itemId: "flan", status: "sold_out", quantity: null },
    ]);
    store.change(catalogId, [
      { itemId: "rosas", status: "available", quantity: 3 },
    ]);
    expect(stateOf(menuId, "flan")).toEqual({
      status: "sold_out",
      quantity: null,
    });
    expect(store.hasUnsaved()).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(saves.map((save) => [save.experienceId, save.body])).toEqual([
      [
        menuId,
        { items: [{ itemId: "flan", status: "sold_out", quantity: null }] },
      ],
      [
        catalogId,
        { items: [{ itemId: "rosas", status: "available", quantity: 3 }] },
      ],
    ]);
  });

  it("sends what is waiting at once when the page goes away", async () => {
    const { store, saves } = await ready();
    store.change(menuId, [
      { itemId: "flan", status: "hidden", quantity: null },
    ]);
    store.flushAll();
    await vi.advanceTimersByTimeAsync(0);
    expect(saves).toHaveLength(1);
  });

  it("keeps unsaved changes over a refresh", async () => {
    const { store, loads, stateOf } = await ready();
    store.change(menuId, [
      { itemId: "flan", status: "sold_out", quantity: null },
    ]);
    const refreshed = store.refresh();
    loads[1]?.resolve({
      experiences: [
        experience(menuId, [
          item("flan"),
          item("churros", { status: "hidden" }),
        ]),
        experience(catalogId, [item("rosas")]),
      ],
    });
    await refreshed;
    expect(stateOf(menuId, "flan")).toEqual({
      status: "sold_out",
      quantity: null,
    });
    expect(stateOf(menuId, "churros")).toEqual({
      status: "hidden",
      quantity: null,
    });
  });

  it("ignores a refresh that is older than a save that landed meanwhile", async () => {
    const { store, loads, saves, stateOf } = await ready();
    const refreshed = store.refresh();
    store.change(
      menuId,
      [{ itemId: "flan", status: "sold_out", quantity: null }],
      {
        immediate: true,
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    saves[0]?.reply.resolve(
      experience(menuId, [
        item("flan", { status: "sold_out" }),
        item("churros"),
      ]),
    );
    await vi.advanceTimersByTimeAsync(0);
    // The list was read before the save: it still says "available".
    loads[1]?.resolve({
      experiences: [
        experience(menuId, [item("flan"), item("churros")]),
        experience(catalogId, [item("rosas")]),
      ],
    });
    await refreshed;
    expect(stateOf(menuId, "flan")).toEqual({
      status: "sold_out",
      quantity: null,
    });
  });

  it("forgets Experiences that left the list once nothing is pending", async () => {
    const { store, loads } = await ready();
    const refreshed = store.refresh();
    loads[1]?.resolve({
      experiences: [experience(catalogId, [item("rosas")])],
    });
    await refreshed;
    expect(
      store
        .getSnapshot()
        .experiences.map((entry) => entry.experience.experienceId),
    ).toEqual([catalogId]);
    store.change(menuId, [
      { itemId: "flan", status: "hidden", quantity: null },
    ]);
    expect(store.hasUnsaved()).toBe(false);
  });
});

describe("errors that change the list", () => {
  it("reloads the list after an archived Experience refuses a change", async () => {
    const archived = new Error("archived");
    const { store, loads, saves } = setup({
      requiresRefresh: (error) => error === archived,
    });
    const done = store.refresh();
    loads[0]?.resolve({ experiences: [experience(menuId, [item("flan")])] });
    await done;
    store.change(
      menuId,
      [{ itemId: "flan", status: "hidden", quantity: null }],
      {
        immediate: true,
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    saves[0]?.reply.reject(archived);
    await vi.advanceTimersByTimeAsync(0);
    expect(loads).toHaveLength(2);
  });
});
