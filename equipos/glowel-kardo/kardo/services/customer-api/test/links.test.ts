import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { helpSystemPrompt } from "../src/help/knowledge.js";
import {
  createPostgresLinkRepository,
  type LinkRepository,
} from "../src/repositories/links.js";
import { authHeader, subjectId, verifierFor, workspaceId } from "./helpers.js";

const experienceId = "3f7d2c1a-8b4e-4f6a-9c0d-2e1f3a4b5c61";
const linkId = "9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d";

/** A fake postgres.js transaction: the member is «owner» with an active
 * plan; `taken` lists this business's link addresses, `businessSlug` is the
 * business's address and `set_link_slug` raises what `raise` says. */
const businessRoutes = {
  slug: "cafe-nube",
  previousSlugs: [],
  mainPublicId: "tp123",
  links: [{ slug: "menu-terraza", publicId: "tp123" }],
  linkRedirects: [],
};

function fakeSql(
  options: {
    taken?: string[];
    raise?: string;
    businessSlug?: string | null;
  } = {},
) {
  const queries: { text: string; values: unknown[] }[] = [];
  const tx = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      queries.push({ text, values });
      if (text.includes("workspace_memberships"))
        return Promise.resolve([{ role: "owner" }]);
      if (text.includes("kardo_billing.workspace_access"))
        return Promise.resolve([{ state: "active" }]);
      if (text.includes("entitlement") || text.includes("plan_limits"))
        return Promise.resolve([]);
      if (text.includes("link_slug_available")) {
        const slug = String(values[1]).replaceAll("-", "");
        const taken = (options.taken ?? []).map((item) =>
          item.replaceAll("-", ""),
        );
        return Promise.resolve([{ available: !taken.includes(slug) }]);
      }
      if (text.includes("select slug from kardo_core.workspaces"))
        return Promise.resolve([
          {
            slug:
              options.businessSlug === undefined
                ? "cafe-nube"
                : options.businessSlug,
          },
        ]);
      if (text.includes("from kardo_core.experiences"))
        return Promise.resolve([{ id: experienceId, name: "Menú Terraza" }]);
      if (text.includes("insert into kardo_core.touchpoints"))
        return Promise.resolve([{ id: linkId, public_id: "tp123" }]);
      if (text.includes("set_link_slug")) {
        if (options.raise) return Promise.reject(new Error(options.raise));
        return Promise.resolve([{ slug: values[1] }]);
      }
      if (text.includes("business_link_routes"))
        return Promise.resolve([{ routes: businessRoutes }]);
      if (text.includes("select id from kardo_core.touchpoints"))
        return Promise.resolve([{ id: linkId }]);
      // The shared Touchpoint read: its select is a nested fragment.
      if (text.includes("where t.id ="))
        return Promise.resolve([
          {
            id: linkId,
            public_id: "tp123",
            operational_name: "Menú Terraza",
            physical_type: "other",
            kind: "link",
            handle: null,
            slug: "menu-terraza",
            slug_changed_at: "2026-10-02T12:00:00.000Z",
            status: "assigned",
            group_id: null,
            created_at: "2026-10-04T12:00:00.000Z",
            suspended: false,
            plan_excluded: false,
            publishing: false,
            live_experience_id: null,
          },
        ]);
      return Promise.resolve([]);
    },
    { json: (value: unknown) => value },
  );
  const sql = Object.assign(tx, {
    begin: (action: (transaction: unknown) => Promise<unknown>) => action(tx),
  }) as unknown as Sql;
  return { sql, queries };
}

const identity = { subject: subjectId, email: "owner@kardo.test" };

describe("link addresses (Links redesign, phase 2)", () => {
  it("recommends the first free address inside the business", async () => {
    const repository = createPostgresLinkRepository(
      fakeSql({ taken: ["menu-terraza"] }).sql,
    );
    await expect(
      repository.suggestSlug(identity, workspaceId, {
        name: "Menú Terraza",
        type: "menu",
      }),
    ).resolves.toBe("menu");
  });

  it("checks before creating, and offers a free one when it is taken", async () => {
    const repository = createPostgresLinkRepository(
      fakeSql({ taken: ["menu-terraza"] }).sql,
    );
    await expect(
      repository.checkSlug(identity, workspaceId, "menuterraza", {
        name: "Menú Terraza",
        type: "menu",
      }),
    ).resolves.toEqual({
      available: false,
      reason: "taken",
      suggestion: "menu",
    });
    await expect(
      repository.checkSlug(identity, workspaceId, "Menú", {}),
    ).resolves.toEqual({ available: false, reason: "format" });
    await expect(
      repository.checkSlug(identity, workspaceId, "carta", {}),
    ).resolves.toEqual({ available: true });
  });

  it("creates the link with its address, among the Experience's destinations", async () => {
    const { sql, queries } = fakeSql();
    const repository = createPostgresLinkRepository(sql);
    const link = await repository.createLink(identity, workspaceId, {
      experienceId,
      slug: "menu-terraza",
    });
    expect(link).toMatchObject({
      id: linkId,
      kind: "link",
      slug: "menu-terraza",
      slugChangedAt: "2026-10-02T12:00:00.000Z",
    });
    // A link is named by its address, never by the Experience it shows.
    const insert = queries.find((q) =>
      q.text.includes("insert into kardo_core.touchpoints"),
    );
    expect(insert?.values).toContain("/menu-terraza");
    expect(insert?.values).not.toContain("Menú Terraza");
    expect(
      queries.some((q) =>
        q.text.includes("insert into kardo_core.experience_targets"),
      ),
    ).toBe(true);
  });

  it("renames the link after its new address", async () => {
    const { sql, queries } = fakeSql();
    const repository = createPostgresLinkRepository(sql);
    await repository.setSlug(identity, workspaceId, linkId, "carta");
    const rename = queries.find((q) => q.text.includes("set operational_name"));
    expect(rename?.values).toEqual(["/carta", linkId]);
  });

  it("sends the business's addresses to the Resolver after each change", async () => {
    const setBusiness = vi.fn(async () => undefined);
    const repository = createPostgresLinkRepository(fakeSql().sql, {
      resolver: { setBusiness },
    });
    await repository.createLink(identity, workspaceId, {
      experienceId,
      slug: "menu-terraza",
    });
    await repository.setSlug(identity, workspaceId, linkId, "carta");
    await repository.setMainLink(identity, workspaceId, linkId);
    expect(setBusiness).toHaveBeenCalledTimes(3);
    expect(setBusiness).toHaveBeenLastCalledWith(businessRoutes);
  });

  it("keeps the change when the Resolver does not answer", async () => {
    const setBusiness = vi.fn(async () => {
      throw new Error("down");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const repository = createPostgresLinkRepository(fakeSql().sql, {
      resolver: { setBusiness },
    });
    await expect(
      repository.createLink(identity, workspaceId, {
        experienceId,
        slug: "menu-terraza",
      }),
    ).resolves.toMatchObject({ slug: "menu-terraza" });
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("asks for the business address first", async () => {
    const repository = createPostgresLinkRepository(
      fakeSql({ businessSlug: null }).sql,
    );
    await expect(
      repository.createLink(identity, workspaceId, {
        experienceId,
        slug: "menu",
      }),
    ).rejects.toMatchObject({
      statusCode: 409,
      code: "BUSINESS_SLUG_REQUIRED",
    });
  });

  it("turns the database's refusals into clear errors", async () => {
    const cases: [string, number][] = [
      ["SLUG_TAKEN", 409],
      ["SLUG_CHANGE_TOO_SOON", 429],
      ["NOT_A_LINK", 400],
    ];
    for (const [raise, statusCode] of cases) {
      const repository = createPostgresLinkRepository(fakeSql({ raise }).sql);
      await expect(
        repository.setSlug(identity, workspaceId, linkId, "carta"),
      ).rejects.toMatchObject({ statusCode, code: raise });
    }
  });
});

describe("link routes", () => {
  function app(repository: Partial<LinkRepository>) {
    return buildCustomerApi({
      sessionVerifier: verifierFor(),
      linkRepository: {
        suggestSlug: vi.fn(async () => null),
        checkSlug: vi.fn(async () => ({ available: true })),
        createLink: vi.fn(),
        setSlug: vi.fn(),
        setMainLink: vi.fn(async () => undefined),
        ...repository,
      },
    });
  }

  it("creates a link that shows an Experience", async () => {
    const createLink = vi.fn(async () => ({
      id: linkId,
      publicId: "tp1234567890abcdef",
      operationalName: "Menú Terraza",
      physicalType: "other" as const,
      kind: "link" as const,
      slug: "menu-terraza",
      status: "assigned" as const,
    }));
    const server = app({ createLink });
    const response = await server.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/links`,
      headers: authHeader,
      payload: { experienceId, slug: "menu-terraza" },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ slug: "menu-terraza" });
    expect(createLink).toHaveBeenCalledWith(expect.anything(), workspaceId, {
      experienceId,
      slug: "menu-terraza",
    });
    await server.close();
  });

  it("refuses an address with accents before reaching the database", async () => {
    const server = app({});
    const response = await server.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/links`,
      headers: authHeader,
      payload: { experienceId, slug: "menú" },
    });
    expect(response.statusCode).toBe(400);
    await server.close();
  });

  it("chooses the main link", async () => {
    const setMainLink = vi.fn(async () => undefined);
    const server = app({ setMainLink });
    const response = await server.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/main-link`,
      headers: authHeader,
      payload: { touchpointId: linkId },
    });
    expect(response.statusCode).toBe(204);
    expect(setMainLink).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      linkId,
    );
    await server.close();
  });
});

describe("the help assistant names the address in use, never a fixed domain", () => {
  it("uses LINKS_BASE_URL or the Resolver's address", () => {
    const dev = helpSystemPrompt(
      "links",
      "https://kardo-poa-test-resolver.glowel-dev.workers.dev",
    );
    expect(dev).toContain(
      "kardo-poa-test-resolver.glowel-dev.workers.dev/negocio/link",
    );
    expect(dev).not.toContain("kardo.com.mx");
    expect(helpSystemPrompt("links", "https://kardo.com.mx/")).toContain(
      "kardo.com.mx/negocio/link",
    );
    expect(helpSystemPrompt("links")).not.toContain("{links}");
  });
});
