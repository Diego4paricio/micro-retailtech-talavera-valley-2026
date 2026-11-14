import { describe, expect, it } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import {
  ConflictError,
  InvitationInvalidError,
  WorkspaceAccessError,
} from "../src/errors.js";
import {
  INVITATION_RESEND_COOLDOWN_MS,
  INVITATIONS_PER_DAY,
  invitationThrottle,
} from "../src/repositories/members.js";
import {
  authHeader,
  invitationId,
  profileId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

describe("member routes", () => {
  it("lets any member list the workspace's members", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: {
        listMembers: async () => [
          {
            profileId,
            displayName: "Ana",
            email: "ana@example.com",
            role: "viewer",
            joinedAt: "2026-09-01T00:00:00.000Z",
            isCurrentUser: false,
          },
        ],
        updateMemberRole: async () => {
          throw new Error("not used");
        },
        removeMember: async () => {
          throw new Error("not used");
        },
        listInvitations: async () => {
          throw new Error("not used");
        },
        createInvitation: async () => {
          throw new Error("not used");
        },
        revokeInvitation: async () => {
          throw new Error("not used");
        },
        acceptInvitation: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/members`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
    await app.close();
  });

  it("rejects an admin trying to change an owner's role (canManageMember)", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: {
        listMembers: async () => {
          throw new Error("not used");
        },
        updateMemberRole: async () => {
          throw new WorkspaceAccessError();
        },
        removeMember: async () => {
          throw new Error("not used");
        },
        listInvitations: async () => {
          throw new Error("not used");
        },
        createInvitation: async () => {
          throw new Error("not used");
        },
        revokeInvitation: async () => {
          throw new Error("not used");
        },
        acceptInvitation: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/members/${profileId}`,
      headers: authHeader,
      payload: { role: "editor" },
    });
    expect(response.statusCode).toBe(403);
    await app.close();
  });

  it("returns 409 LAST_OWNER when removing the workspace's only owner", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: {
        listMembers: async () => {
          throw new Error("not used");
        },
        updateMemberRole: async () => {
          throw new Error("not used");
        },
        removeMember: async () => {
          throw new ConflictError(
            "LAST_OWNER",
            "A workspace must always keep at least one owner.",
          );
        },
        listInvitations: async () => {
          throw new Error("not used");
        },
        createInvitation: async () => {
          throw new Error("not used");
        },
        revokeInvitation: async () => {
          throw new Error("not used");
        },
        acceptInvitation: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/members/${profileId}`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("LAST_OWNER");
    await app.close();
  });

  it("returns 204 when a member leaves the workspace themselves", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: {
        listMembers: async () => {
          throw new Error("not used");
        },
        updateMemberRole: async () => {
          throw new Error("not used");
        },
        removeMember: async () => undefined,
        listInvitations: async () => {
          throw new Error("not used");
        },
        createInvitation: async () => {
          throw new Error("not used");
        },
        revokeInvitation: async () => {
          throw new Error("not used");
        },
        acceptInvitation: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/members/${profileId}`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(204);
    await app.close();
  });

  it("returns 409 ORGANIZATION_REQUIRED for invitations on a personal workspace", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: {
        listMembers: async () => {
          throw new Error("not used");
        },
        updateMemberRole: async () => {
          throw new Error("not used");
        },
        removeMember: async () => {
          throw new Error("not used");
        },
        listInvitations: async () => {
          throw new ConflictError(
            "ORGANIZATION_REQUIRED",
            "Members and invitations require an organization workspace.",
          );
        },
        createInvitation: async () => {
          throw new Error("not used");
        },
        revokeInvitation: async () => {
          throw new Error("not used");
        },
        acceptInvitation: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/invitations`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("ORGANIZATION_REQUIRED");
    await app.close();
  });

  it("enforces the sensitive rate limit on creating invitations", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      rateLimit: { sensitive: { limit: 1, windowMs: 60_000 } },
      memberRepository: {
        listMembers: async () => {
          throw new Error("not used");
        },
        updateMemberRole: async () => {
          throw new Error("not used");
        },
        removeMember: async () => {
          throw new Error("not used");
        },
        listInvitations: async () => {
          throw new Error("not used");
        },
        createInvitation: async () => ({
          invitation: {
            id: invitationId,
            email: "nueva@example.com",
            role: "editor",
            status: "pending",
            expiresAt: "2026-10-01T00:00:00.000Z",
            createdAt: "2026-09-24T00:00:00.000Z",
          },
          token: "a".repeat(43),
        }),
        revokeInvitation: async () => {
          throw new Error("not used");
        },
        acceptInvitation: async () => {
          throw new Error("not used");
        },
      },
    });
    const payload = { email: "nueva@example.com", role: "editor" };
    const url = `/v1/workspaces/${workspaceId}/invitations`;
    const first = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload,
    });
    const second = await app.inject({
      method: "POST",
      url,
      headers: authHeader,
      payload,
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(429);
    await app.close();
  });

  it("never distinguishes why an invitation token failed to redeem", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: {
        listMembers: async () => {
          throw new Error("not used");
        },
        updateMemberRole: async () => {
          throw new Error("not used");
        },
        removeMember: async () => {
          throw new Error("not used");
        },
        listInvitations: async () => {
          throw new Error("not used");
        },
        createInvitation: async () => {
          throw new Error("not used");
        },
        revokeInvitation: async () => {
          throw new Error("not used");
        },
        acceptInvitation: async () => {
          throw new InvitationInvalidError();
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/invitations/accept",
      headers: authHeader,
      payload: { token: "b".repeat(43) },
    });
    expect(response.statusCode).toBe(404);
    expect(response.json().code).toBe("INVITATION_INVALID");
    await app.close();
  });
});

describe("invitation throttle (security review 2026-10, V8)", () => {
  const now = new Date("2026-10-02T18:00:00.000Z");
  it("waits 10 minutes before inviting the same address again", () => {
    expect(
      invitationThrottle({ lastPendingAt: null, sentLastDay: 0, now }),
    ).toBeNull();
    expect(
      invitationThrottle({
        lastPendingAt: new Date(now.getTime() - 60_000),
        sentLastDay: 1,
        now,
      }),
    ).toBe(540);
    expect(
      invitationThrottle({
        lastPendingAt: new Date(now.getTime() - INVITATION_RESEND_COOLDOWN_MS),
        sentLastDay: 1,
        now,
      }),
    ).toBeNull();
  });

  it("caps the invitations of one organization per day", () => {
    expect(
      invitationThrottle({
        lastPendingAt: null,
        sentLastDay: INVITATIONS_PER_DAY,
        now,
      }),
    ).toBe(3600);
    expect(
      invitationThrottle({
        lastPendingAt: null,
        sentLastDay: INVITATIONS_PER_DAY - 1,
        now,
      }),
    ).toBeNull();
  });
});
