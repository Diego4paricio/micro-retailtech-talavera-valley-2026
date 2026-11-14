import { describe, expect, it } from "vitest";
import { canStaff } from "./index.js";

describe("canStaff", () => {
  it("requires active staff, MFA and a server-side permission", () => {
    expect(
      canStaff(
        {
          subject: "staff",
          status: "active",
          aal: "aal2",
          permissions: ["operations.read"],
        },
        "operations.read",
      ),
    ).toBe(true);
    expect(
      canStaff(
        {
          subject: "staff",
          status: "active",
          aal: "aal1",
          permissions: ["operations.read"],
        },
        "operations.read",
      ),
    ).toBe(false);
    expect(
      canStaff(
        {
          subject: "customer",
          status: "revoked",
          aal: "aal2",
          permissions: ["operations.read"],
        },
        "operations.read",
      ),
    ).toBe(false);
  });
});
