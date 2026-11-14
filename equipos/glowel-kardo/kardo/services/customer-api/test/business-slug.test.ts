import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import {
  type BusinessSlugRepository,
  createPostgresBusinessSlugRepository,
} from "../src/repositories/business-slug.js";
import { authHeader, subjectId, verifierFor, workspaceId } from "./helpers.js";

/** A fake postgres.js transaction: membership is «owner», the access state
 * is limited (no plan), `taken` lists the addresses other businesses have,
 * and `set_workspace_slug` raises what `raise` says. */
function fakeSql(options: { taken?: string[]; raise?: string } = {}) {
  const queries: string[] = [];
  const tx = Object.assign(
    (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      queries.push(text);
      if (text.includes("workspace_memberships"))
        return Promise.resolve([{ role: "owner" }]);
      if (text.includes("kardo_billing.workspace_access"))
        return Promise.resolve([{ state: "limited" }]);
      if (text.includes("workspace_slug_available")) {
        const slug = String(values[0]).replaceAll("-", "");
        const taken = (options.taken ?? []).map((item) =>
          item.replaceAll("-", ""),
        );
        return Promise.resolve([{ available: !taken.includes(slug) }]);
      }
      if (text.includes("set_workspace_slug")) {
        if (options.raise) return Promise.reject(new Error(options.raise));
        return Promise.resolve([{ slug: values[1] }]);
      }
      if (text.includes("business_link_routes"))
        return Promise.resolve([
          {
            routes: {
              slug: "cafe-nube",
              previousSlugs: ["cafenube-roma"],
              mainPublicId: null,
              links: [],
              linkRedirects: [],
            },
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

describe("business address repository (Links redesign, 2026-10-04)", () => {
  it("recommends the first free address, with the city before the giro", async () => {
    const { sql } = fakeSql({ taken: ["cafenube"] });
    const repository = createPostgresBusinessSlugRepository(sql);
    await expect(
      repository.suggest(identity, workspaceId, {
        name: "Café Nube",
        city: "Coyoacán",
        industry: "cafeteria",
      }),
    ).resolves.toBe("cafe-nube-coyoacan");
  });

  it("says why an address is not free, and offers one that is", async () => {
    const { sql } = fakeSql({ taken: ["cafe-nube"] });
    const repository = createPostgresBusinessSlugRepository(sql);
    const context = { name: "Café Nube", city: "Puebla" };
    await expect(
      repository.check(identity, workspaceId, "cafenube", context),
    ).resolves.toEqual({
      available: false,
      reason: "taken",
      suggestion: "cafe-nube-puebla",
    });
    await expect(
      repository.check(identity, workspaceId, "precios", context),
    ).resolves.toMatchObject({ available: false, reason: "reserved" });
    await expect(
      repository.check(identity, workspaceId, "Café", context),
    ).resolves.toEqual({ available: false, reason: "format" });
    await expect(
      repository.check(identity, workspaceId, "nube-cafe", context),
    ).resolves.toEqual({ available: true });
  });

  it("saves without a plan and records it", async () => {
    const { sql, queries } = fakeSql();
    const repository = createPostgresBusinessSlugRepository(sql);
    await expect(
      repository.set(identity, workspaceId, "cafe-nube"),
    ).resolves.toBe("cafe-nube");
    expect(queries.some((q) => q.includes("workspace_access"))).toBe(false);
    expect(
      queries.some((q) => q.includes("insert into kardo_audit.events")),
    ).toBe(true);
  });

  it("sends the new address to the Resolver, with the old one", async () => {
    const setBusiness = vi.fn(async () => undefined);
    const repository = createPostgresBusinessSlugRepository(fakeSql().sql, {
      resolver: { setBusiness },
    });
    await repository.set(identity, workspaceId, "cafe-nube");
    expect(setBusiness).toHaveBeenCalledWith(
      expect.objectContaining({
        slug: "cafe-nube",
        previousSlugs: ["cafenube-roma"],
      }),
    );
  });

  it("turns the database's refusals into clear errors", async () => {
    const cases: [string, number, string][] = [
      ["SLUG_TAKEN", 409, "SLUG_TAKEN"],
      ["SLUG_CHANGE_TOO_SOON", 429, "SLUG_CHANGE_TOO_SOON"],
      ["SLUG_INVALID", 400, "SLUG_INVALID"],
    ];
    for (const [raise, statusCode, code] of cases) {
      const repository = createPostgresBusinessSlugRepository(
        fakeSql({ raise }).sql,
      );
      await expect(
        repository.set(identity, workspaceId, "cafe-nube"),
      ).rejects.toMatchObject({
        statusCode,
        code,
      });
    }
    const repository = createPostgresBusinessSlugRepository(fakeSql().sql);
    await expect(
      repository.set(identity, workspaceId, "kardo-cafe"),
    ).rejects.toMatchObject({
      statusCode: 400,
      code: "SLUG_RESERVED",
    });
  });
});

describe("business address routes", () => {
  function app(repository: Partial<BusinessSlugRepository>) {
    return buildCustomerApi({
      sessionVerifier: verifierFor(),
      businessSlugRepository: {
        suggest: vi.fn(async () => null),
        check: vi.fn(async () => ({ available: true })),
        set: vi.fn(async (_identity, _workspace, slug: string) => slug),
        ...repository,
      },
    });
  }

  it("passes the business as written to the recommendation", async () => {
    const suggest = vi.fn(async () => "cafe-nube");
    const server = app({ suggest });
    const response = await server.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/slug/suggestion?name=Caf%C3%A9%20Nube&city=Puebla&industry=cafeteria`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slug: "cafe-nube" });
    expect(suggest).toHaveBeenCalledWith(expect.anything(), workspaceId, {
      name: "Café Nube",
      city: "Puebla",
      industry: "cafeteria",
    });
    await server.close();
  });

  it("saves the address and answers with it", async () => {
    const server = app({});
    const response = await server.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/slug`,
      headers: authHeader,
      payload: { slug: "cafe-nube" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ slug: "cafe-nube" });
    await server.close();
  });
});
