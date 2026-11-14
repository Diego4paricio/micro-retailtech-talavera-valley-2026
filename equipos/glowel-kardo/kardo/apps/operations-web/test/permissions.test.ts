import { describe, expect, it } from "vitest";
import {
  filterByPermission,
  hasPermission,
  permissionAreas,
  staffPermissions,
} from "../src/lib/permissions.js";

describe("hasPermission", () => {
  it("checks membership in the session's permission list", () => {
    const permissions = [staffPermissions.customersRead];
    expect(hasPermission(permissions, staffPermissions.customersRead)).toBe(
      true,
    );
    expect(hasPermission(permissions, staffPermissions.plansWrite)).toBe(false);
  });
});

describe("filterByPermission", () => {
  const items = [
    { id: "overview", permission: staffPermissions.metricsRead },
    { id: "plans", permission: staffPermissions.plansRead },
    { id: "publications" },
  ] as const;

  it("keeps items whose permission is present, and any item without one", () => {
    const visible = filterByPermission(items, [staffPermissions.metricsRead]);
    expect(visible.map((item) => item.id)).toEqual([
      "overview",
      "publications",
    ]);
  });

  it("keeps everything when the session has every permission", () => {
    const visible = filterByPermission(items, Object.values(staffPermissions));
    expect(visible).toHaveLength(items.length);
  });
});

describe("permissionAreas", () => {
  it("returns a unique, ordered label per known permission held", () => {
    const areas = permissionAreas([
      staffPermissions.plansWrite,
      staffPermissions.plansRead,
      staffPermissions.metricsRead,
      "some.unknown.permission",
    ]);
    expect(areas).toEqual(["Métricas", "Planes", "Planes (gestión)"]);
  });

  it("returns an empty list for a session with no known permissions", () => {
    expect(permissionAreas([])).toEqual([]);
  });
});
