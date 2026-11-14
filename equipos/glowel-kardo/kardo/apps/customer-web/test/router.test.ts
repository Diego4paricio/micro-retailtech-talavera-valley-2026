import { describe, expect, it } from "vitest";
import { entryIntent, parseRoute, routePath } from "../src/lib/router.js";

describe("router", () => {
  it("round-trips every section", () => {
    const id = "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01";
    for (const route of [
      { name: "overview" },
      { name: "touchpoints" },
      { name: "touchpoint", id },
      { name: "qr-studio", id },
      { name: "qr-studio", id, download: true },
      { name: "qr" },
      { name: "qr-design", id },
      { name: "experiences" },
      { name: "experience", id },
      { name: "experience", id, view: "destinos" },
      { name: "experience", id, view: "historial" },
      { name: "experience-new", touchpointId: id },
      { name: "experience-new", touchpointId: null, groupId: id },
      { name: "experience-new", touchpointId: null, type: "document" },
      {
        name: "experience-new",
        touchpointId: id,
        groupId: id,
        type: "redirect",
      },
      { name: "assets" },
      { name: "analytics" },
      { name: "leads" },
      { name: "organization" },
      { name: "settings" },
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

  it("opens the link for the old «Estudio de Link» address (A9-18)", () => {
    const id = "5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01";
    expect(
      parseRoute({ pathname: `/links/${id}/estudio`, search: "" }),
    ).toEqual({ name: "link", id });
  });

  it("ignores malformed ids and query values", () => {
    expect(
      parseRoute({ pathname: "/touchpoints/../../etc", search: "" }),
    ).toEqual({ name: "not-found" });
    expect(
      parseRoute({
        pathname: "/experiences/new",
        search: "?touchpoint=<script>",
      }),
    ).toEqual({
      name: "experience-new",
      touchpointId: null,
    });
    expect(
      parseRoute({ pathname: "/experiences/new", search: "?type=bogus" }),
    ).toEqual({ name: "experience-new", touchpointId: null });
  });

  it("reads the Website entry point and shows the normal route", () => {
    expect(entryIntent("/registro")).toBe("sign-up");
    expect(entryIntent("/registro/")).toBe("sign-up");
    expect(entryIntent("/")).toBeNull();
    expect(entryIntent("/toString")).toBeNull();
    expect(parseRoute({ pathname: "/registro", search: "" })).toEqual({
      name: "overview",
    });
  });
});
