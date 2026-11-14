import type {
  AvailabilityExperience,
  ItemAvailabilityChange,
} from "@kardo/contracts";
import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { WorkspaceAccessError } from "../src/errors.js";
import {
  availabilitySections,
  buildAvailabilityExperience,
  dedupeChanges,
  type ItemAvailabilityRepository,
  knownItemIds,
  resolverItems,
} from "../src/repositories/item-availability.js";
import { TouchpointAvailabilityError } from "../src/resolver-clients/http.js";
import { createResolverItemAvailabilityClient } from "../src/resolver-clients/item-availability.js";
import { validateExperienceContent } from "../src/validation/experience-content.js";
import {
  assetId,
  authHeader,
  experienceId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

const menu = {
  title: "Menú Terraza",
  currency: "MXN",
  sections: [
    {
      id: "entradas",
      name: "Entradas",
      items: [
        {
          id: "guacamole",
          name: "Guacamole",
          price: 120,
          imageAssetId: assetId,
        },
        { id: "sopa", name: "Sopa de tortilla", description: "Con aguacate" },
      ],
    },
    { id: "postres", name: "Postres", items: [{ id: "flan", name: "Flan" }] },
  ],
};

function row(overrides: Partial<Parameters<typeof knownItemIds>[0]> = {}) {
  return {
    id: experienceId,
    name: "Menú Terraza",
    type: "menu",
    draft_content: menu,
    archived_at: null,
    published_content: menu,
    has_unpublished_changes: false,
    live_touchpoint_count: 4,
    ...overrides,
  };
}

const experience: AvailabilityExperience = buildAvailabilityExperience(
  row(),
  [],
);

function memoryRepository(): ItemAvailabilityRepository & {
  saved: ItemAvailabilityChange[][];
} {
  const saved: ItemAvailabilityChange[][] = [];
  return {
    saved,
    listAvailability: async () => ({ experiences: [experience] }),
    saveAvailability: async (_identity, _workspace, _experience, changes) => {
      saved.push([...changes]);
      return experience;
    },
  };
}

describe("item availability routes", () => {
  const url = `/v1/workspaces/${workspaceId}/experiences/${experienceId}/availability`;

  it("lists every Menu and Catalog with its items", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      itemAvailabilityRepository: memoryRepository(),
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/availability`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.experiences[0].sections[0].items[0]).toMatchObject({
      id: "guacamole",
      status: "available",
      quantity: null,
      imageAssetId: assetId,
    });
  });

  it("passes valid changes to the repository", async () => {
    const repository = memoryRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      itemAvailabilityRepository: repository,
    });
    const response = await app.inject({
      method: "PUT",
      url,
      headers: authHeader,
      payload: {
        items: [
          { itemId: "guacamole", status: "sold_out", quantity: null },
          { itemId: "flan", status: "available", quantity: 3 },
        ],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(repository.saved[0]).toHaveLength(2);
  });

  it.each([
    ["no items", { items: [] }],
    [
      "an unknown status",
      { items: [{ itemId: "flan", status: "gone", quantity: null }] },
    ],
    [
      "too many units",
      { items: [{ itemId: "flan", status: "available", quantity: 10_000 }] },
    ],
    [
      "negative units",
      { items: [{ itemId: "flan", status: "available", quantity: -1 }] },
    ],
    [
      "a missing quantity",
      { items: [{ itemId: "flan", status: "available" }] },
    ],
    [
      "an unsafe item id",
      { items: [{ itemId: "../x", status: "hidden", quantity: null }] },
    ],
  ])("rejects a body with %s", async (_label, payload) => {
    const repository = memoryRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      itemAvailabilityRepository: repository,
    });
    const response = await app.inject({
      method: "PUT",
      url,
      headers: authHeader,
      payload,
    });
    expect(response.statusCode).toBe(400);
    expect(repository.saved).toHaveLength(0);
  });

  it("drops unknown fields before they reach the repository", async () => {
    const repository = memoryRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      itemAvailabilityRepository: repository,
    });
    const response = await app.inject({
      method: "PUT",
      url,
      headers: authHeader,
      payload: {
        items: [{ itemId: "flan", status: "hidden", quantity: null, price: 1 }],
      },
    });
    expect(response.statusCode).toBe(200);
    expect(repository.saved[0]).toEqual([
      { itemId: "flan", status: "hidden", quantity: null },
    ]);
  });

  it("keeps null, zero and counts exactly as sent", async () => {
    const repository = memoryRepository();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      itemAvailabilityRepository: repository,
    });
    const items = [
      { itemId: "guacamole", status: "available", quantity: null },
      { itemId: "sopa", status: "available", quantity: 0 },
      { itemId: "flan", status: "sold_out", quantity: 5 },
    ];
    const response = await app.inject({
      method: "PUT",
      url,
      headers: authHeader,
      payload: { items },
    });
    expect(response.statusCode).toBe(200);
    expect(repository.saved[0]).toEqual(items);
  });

  it("surfaces a denied permission", async () => {
    const repository = memoryRepository();
    repository.saveAvailability = async () => {
      throw new WorkspaceAccessError();
    };
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      itemAvailabilityRepository: repository,
    });
    const denied = await app.inject({
      method: "PUT",
      url,
      headers: authHeader,
      payload: {
        items: [{ itemId: "flan", status: "hidden", quantity: null }],
      },
    });
    expect(denied.statusCode).toBe(403);
  });
});

describe("item availability model", () => {
  it("reads menu sections and a catalog as one unnamed list, skipping malformed items", () => {
    expect(
      availabilitySections("menu", menu).map((section) => section.items.length),
    ).toEqual([2, 1]);
    const catalog = availabilitySections("catalog", {
      items: [
        { id: "ramo", name: "Ramo de rosas", price: 650 },
        { id: "", name: "x" },
        "bad",
      ],
    });
    expect(catalog).toEqual([
      {
        id: "catalog",
        name: null,
        items: [{ id: "ramo", name: "Ramo de rosas", price: 650 }],
      },
    ]);
    expect(availabilitySections("menu", null)).toEqual([]);
  });

  it("lists each choice of a dish right after it, to sell it out on its own (D1)", () => {
    const sections = availabilitySections("menu", {
      sections: [
        {
          id: "comidas",
          name: "Comida corrida",
          items: [
            {
              id: "corrida",
              name: "Comida corrida",
              price: 90,
              choices: [
                { id: "mole", name: "Mole poblano" },
                { id: "", name: "x" },
                { id: "chicharron", name: "Chicharrón" },
              ],
            },
          ],
        },
      ],
    });
    expect(sections[0]?.items).toEqual([
      { id: "corrida", name: "Comida corrida", price: 90 },
      { id: "mole", name: "Mole poblano", choiceOf: "corrida" },
      { id: "chicharron", name: "Chicharrón", choiceOf: "corrida" },
    ]);
    expect(
      knownItemIds(
        row({
          draft_content: { title: "x", currency: "MXN", sections: [] },
          published_content: {
            title: "x",
            currency: "MXN",
            sections: [
              {
                id: "s",
                name: "S",
                items: [
                  {
                    id: "corrida",
                    name: "C",
                    choices: [{ id: "mole", name: "Mole" }],
                  },
                ],
              },
            ],
          },
        }),
      ).has("mole"),
    ).toBe(true);
  });

  it("knows the ids of the draft, the latest version and every live version", () => {
    const known = knownItemIds(
      row({
        draft_content: {
          ...menu,
          sections: [
            {
              id: "nuevo",
              name: "Nuevo",
              items: [{ id: "tacos", name: "Tacos" }],
            },
          ],
        },
        live_contents: [
          {
            ...menu,
            sections: [
              {
                id: "viejo",
                name: "Viejo",
                items: [{ id: "pozole", name: "Pozole" }],
              },
            ],
          },
        ],
      }),
    );
    expect([...known].sort()).toEqual([
      "flan",
      "guacamole",
      "pozole",
      "sopa",
      "tacos",
    ]);
  });

  it("shows published items with their live state and defaults", () => {
    const built = buildAvailabilityExperience(
      row({ has_unpublished_changes: true }),
      [
        {
          experience_id: experienceId,
          item_id: "sopa",
          status: "sold_out",
          quantity: null,
          updated_at: "2026-09-28T18:00:00.000Z",
        },
        {
          experience_id: experienceId,
          item_id: "flan",
          status: "available",
          quantity: 2,
          updated_at: "2026-09-28T19:30:00.000Z",
        },
      ],
    );
    expect(built.source).toBe("published");
    expect(built.hasUnpublishedChanges).toBe(true);
    expect(built.updatedAt).toBe("2026-09-28T19:30:00.000Z");
    expect(built.sections[0]?.items[1]).toMatchObject({
      id: "sopa",
      status: "sold_out",
      quantity: null,
    });
    expect(built.sections[1]?.items[0]).toMatchObject({
      id: "flan",
      status: "available",
      quantity: 2,
    });
    expect(built.sections[0]?.items[0]).toMatchObject({
      status: "available",
      quantity: null,
      updatedAt: null,
    });
  });

  it("falls back to the draft before the first publication", () => {
    const built = buildAvailabilityExperience(
      row({
        published_content: null,
        has_unpublished_changes: true,
        live_touchpoint_count: 0,
      }),
      [],
    );
    expect(built.source).toBe("draft");
    expect(built.hasUnpublishedChanges).toBe(false);
    expect(built.currency).toBe("MXN");
  });

  it("keeps the last change per item and pushes only non-default states", () => {
    expect(
      dedupeChanges([
        { itemId: "flan", status: "hidden", quantity: null },
        { itemId: "flan", status: "available", quantity: 1 },
      ]),
    ).toEqual([{ itemId: "flan", status: "available", quantity: 1 }]);
    expect(
      resolverItems([
        { item_id: "a", status: "available", quantity: null },
        { item_id: "b", status: "available", quantity: 0 },
        { item_id: "c", status: "hidden", quantity: null },
      ]),
    ).toEqual([
      { id: "b", status: "available", quantity: 0 },
      { id: "c", status: "hidden", quantity: null },
    ]);
  });
});

describe("Resolver item availability client", () => {
  it("posts the full state to the internal command with the publish key", async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const client = createResolverItemAvailabilityClient({
      resolverUrl: "https://tap.example",
      commandKey: "secret",
      fetchFn: async (input, init) => {
        calls.push({ url: String(input), init: init ?? {} });
        return new Response(JSON.stringify({ result: "applied", version: 7 }));
      },
    });
    await client.replace({
      experienceId,
      version: 7,
      items: [{ id: "flan", status: "sold_out", quantity: null }],
    });
    expect(calls[0]?.url).toBe(
      "https://tap.example/internal/item-availability",
    );
    expect(new Headers(calls[0]?.init.headers).get("authorization")).toBe(
      "Bearer secret",
    );
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      experienceId,
      version: 7,
      items: [{ id: "flan", status: "sold_out", quantity: null }],
    });
  });

  it("fails when the Resolver does not confirm, and refuses plain HTTP", async () => {
    const client = createResolverItemAvailabilityClient({
      resolverUrl: "https://tap.example",
      commandKey: "secret",
      fetchFn: async () => new Response("no", { status: 404 }),
    });
    await expect(
      client.replace({ experienceId, version: 1, items: [] }),
    ).rejects.toBeInstanceOf(TouchpointAvailabilityError);
    expect(() =>
      createResolverItemAvailabilityClient({
        resolverUrl: "http://tap.example",
        commandKey: "k",
      }),
    ).toThrow(TouchpointAvailabilityError);
  });
});

describe("menu photos", () => {
  it("asks for a workspace image check for every dish photo", () => {
    const result = validateExperienceContent("menu", menu);
    expect(result.assetReferences).toEqual([
      { assetId, purpose: "menu-image", expectedMediaType: "image/*" },
    ]);
  });
});
