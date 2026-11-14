import { describe, expect, it } from "vitest";
import { buildStaffApi } from "../src/app.js";
import { staffIdentity, staffMemberListFixture } from "./fixtures.js";

describe("GET /v1/staff/staff-members", () => {
  it("returns the staff directory", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: {
        getActiveStaffSession: async () => ({
          ...staffIdentity,
          displayName: "Staff",
          permissions: ["staff.roles.manage"],
        }),
        readDiagnostics: async () => {
          throw new Error("not used");
        },
      },
      staffMemberRepository: {
        listStaffMembers: async () => staffMemberListFixture(),
      },
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/staff/staff-members",
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    expect(response.json()[0].email).toBe(staffIdentity.email);
    await app.close();
  });
});
