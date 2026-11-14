import { describe, expect, it } from "vitest";
import { parseRoute, routePath } from "../src/lib/router.js";

describe("router", () => {
  it("round-trips every section", () => {
    const id = "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01";
    for (const route of [
      { name: "overview" },
      { name: "customers" },
      { name: "customer", id },
      { name: "touchpoints" },
      { name: "touchpoint", id },
      { name: "publications" },
      { name: "audit" },
      { name: "plans" },
      { name: "billing" },
      { name: "billing-workspace", id },
      { name: "billing-events" },
      { name: "notifications" },
      { name: "notification-new" },
      { name: "notification", id },
      { name: "status" },
      { name: "pieces" },
      { name: "piece-batch", id },
      { name: "staff" },
    ] as const) {
      const [pathname, search = ""] = routePath(route).split("?");
      expect(
        parseRoute({
          pathname: pathname ?? "/",
          search: search ? `?${search}` : "",
        }),
      ).toEqual(route);
    }
  });

  it("falls back to not-found for malformed ids or unknown paths", () => {
    expect(parseRoute({ pathname: "/clientes/../../etc", search: "" })).toEqual(
      {
        name: "not-found",
      },
    );
    expect(parseRoute({ pathname: "/no-existe", search: "" })).toEqual({
      name: "not-found",
    });
  });

  it("strips a trailing slash before matching", () => {
    expect(parseRoute({ pathname: "/planes/", search: "" })).toEqual({
      name: "plans",
    });
  });
});
