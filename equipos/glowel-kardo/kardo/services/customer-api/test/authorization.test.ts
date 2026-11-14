import { canManageMember } from "@kardo/domain";
import { describe, expect, it } from "vitest";
import { WorkspaceAccessError } from "../src/errors.js";
import { requirePermission } from "../src/repositories/context.js";

describe("requirePermission", () => {
  it("lets an editor manage Touchpoints", () => {
    expect(() =>
      requirePermission("editor", "touchpoints.manage"),
    ).not.toThrow();
  });

  it("blocks a viewer from managing Touchpoints — the pause/resume fix", () => {
    expect(() => requirePermission("viewer", "touchpoints.manage")).toThrow(
      WorkspaceAccessError,
    );
  });

  it("blocks a viewer from renaming a workspace — the onboarding fix", () => {
    expect(() => requirePermission("viewer", "workspace.manage")).toThrow(
      WorkspaceAccessError,
    );
  });

  it("blocks an editor from renaming a workspace (editors lack workspace.manage)", () => {
    expect(() => requirePermission("editor", "workspace.manage")).toThrow(
      WorkspaceAccessError,
    );
  });

  it("blocks an editor from reading leads (editors lack leads.read)", () => {
    expect(() => requirePermission("editor", "leads.read")).toThrow(
      WorkspaceAccessError,
    );
  });

  it("lets an owner do everything an admin can, and manage members", () => {
    expect(() => requirePermission("owner", "members.manage")).not.toThrow();
    expect(() => requirePermission("admin", "members.manage")).not.toThrow();
  });
});

describe("canManageMember", () => {
  it("lets an owner manage another owner", () => {
    expect(canManageMember("owner", "owner")).toBe(true);
  });

  it("blocks an admin from managing an owner", () => {
    expect(canManageMember("admin", "owner")).toBe(false);
  });

  it("lets an admin manage an editor or viewer", () => {
    expect(canManageMember("admin", "editor")).toBe(true);
    expect(canManageMember("admin", "viewer")).toBe(true);
  });

  it("blocks a viewer or editor from managing anyone", () => {
    expect(canManageMember("viewer", "viewer")).toBe(false);
    expect(canManageMember("editor", "viewer")).toBe(false);
  });
});
