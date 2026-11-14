import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import type { AssetRepository, AssetWorkerClient } from "../src/assets.js";
import { ConflictError } from "../src/errors.js";
import {
  createResendInvitationMailer,
  emailSafeName,
  type InvitationMailer,
  renderInvitationEmail,
} from "../src/invitation-mailer.js";
import type { ExperienceRepository } from "../src/repositories/experiences.js";
import { duplicateName } from "../src/repositories/experiences.js";
import type { LeadRepository } from "../src/repositories/leads.js";
import type { MemberRepository } from "../src/repositories/members.js";
import {
  batchTouchpointNames,
  type TouchpointRepository,
} from "../src/repositories/touchpoints.js";
import type { TouchpointAvailabilityClient } from "../src/resolver-clients/touchpoint-availability.js";
import {
  assetId,
  authHeader,
  experienceId,
  invitationId,
  profileId,
  subjectId,
  touchpointId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

const leadId = "5e6f7081-92a3-4b4c-8d5e-6f708192a3b4";

const touchpoint = {
  id: touchpointId,
  publicId: "c2fc661f2bdf4d5092c3112db0bcc3ef",
  operationalName: "Mesa 1",
  physicalType: "label" as const,
  status: "assigned" as const,
  groupId: null,
  createdAt: "2026-09-01T00:00:00.000Z",
  suspended: false,
  publishing: true,
  live: null,
};

function fake<T>(value: Partial<T>): T {
  return value as T;
}

const noAvailability: TouchpointAvailabilityClient = {
  setAvailability: async () => {},
};

describe("pure helpers", () => {
  it("numbers batch Touchpoints from the requested start", () => {
    expect(
      batchTouchpointNames({ namePrefix: " Mesa ", start: 7, count: 3 }),
    ).toEqual(["Mesa 7", "Mesa 8", "Mesa 9"]);
  });

  it("names duplicates without piling up suffixes", () => {
    expect(duplicateName("Menú")).toBe("Menú (copia)");
    expect(duplicateName("Menú (copia)")).toBe("Menú (copia 2)");
    expect(duplicateName("Menú (copia 2)")).toBe("Menú (copia 3)");
  });

  it("escapes invitation email content and keeps the token in the fragment", () => {
    const rendered = renderInvitationEmail({
      to: "ana@example.com",
      workspaceName: '<script>alert("x")</script>',
      inviterName: "Ana & Co",
      role: "editor",
      acceptUrl: "https://app.kardo.test/invite#token=abc",
      expiresAt: "2026-10-01T00:00:00.000Z",
    });
    expect(rendered.html).not.toContain("<script>");
    expect(rendered.html).toContain("&lt;script&gt;");
    expect(rendered.html).toContain("Ana &amp; Co");
    expect(rendered.text).toContain("https://app.kardo.test/invite#token=abc");
  });

  it("keeps customer-written names on one short line in the email", () => {
    const rendered = renderInvitationEmail({
      to: "ana@example.com",
      workspaceName: "Mi negocio\r\nBcc: victima@example.com",
      inviterName: `Soporte\u2028Kardo ${"x".repeat(200)}`,
      role: "viewer",
      acceptUrl: "https://app.kardo.test/invite#token=abc",
      expiresAt: "2026-10-01T00:00:00.000Z",
    });
    expect(rendered.subject).not.toMatch(/[\r\n\u2028]/);
    expect(rendered.subject).toContain("Mi negocio Bcc: victima@example.com");
    expect(rendered.subject.length).toBeLessThan(200);
    expect(emailSafeName("  a\tb  ")).toBe("a b");
  });

  it("reports Resend failures as not sent instead of throwing", async () => {
    const ok = createResendInvitationMailer({
      apiKey: "re_test_key_123",
      from: "Kardo <hola@kardo.test>",
      fetchFn: vi.fn(async () => new Response("{}", { status: 200 })),
    });
    const failing = createResendInvitationMailer({
      apiKey: "re_test_key_123",
      from: "Kardo <hola@kardo.test>",
      fetchFn: vi.fn(async () => {
        throw new Error("network");
      }),
    });
    const email = {
      to: "ana@cafecentral.mx",
      workspaceName: "Café",
      inviterName: null,
      role: "viewer" as const,
      acceptUrl: "https://app.kardo.test/invite#token=abc",
      expiresAt: "2026-10-01T00:00:00.000Z",
    };
    await expect(ok.send(email)).resolves.toBe(true);
    await expect(failing.send(email)).resolves.toBe(false);
  });

  it("never emails reserved test domains", async () => {
    const fetchFn = vi.fn(async () => new Response("{}", { status: 200 }));
    const mailer = createResendInvitationMailer({
      apiKey: "re_test_key_123",
      from: "Kardo <hola@kardo.test>",
      fetchFn,
    });
    for (const to of [
      "e2e-member@kardo.test",
      "a@example.com",
      "b@x.invalid",
    ]) {
      await expect(
        mailer.send({
          to,
          workspaceName: "Café",
          inviterName: null,
          role: "viewer",
          acceptUrl: "https://app.kardo.test/invite#token=abc",
          expiresAt: "2026-10-01T00:00:00.000Z",
        }),
      ).resolves.toBe(false);
    }
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("touchpoint lifecycle routes", () => {
  it("creates numbered Touchpoints in bulk and wakes the Publisher when a group Experience propagated", async () => {
    const publisherKick = vi.fn();
    const createTouchpointBatch = vi.fn(async () => ({
      touchpoints: [touchpoint],
      propagatedPublications: 1,
    }));
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      publisherKick,
      touchpointRepository: fake<TouchpointRepository>({
        createTouchpointBatch,
      }),
    });
    const tooMany = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/batch`,
      headers: authHeader,
      payload: {
        namePrefix: "Mesa",
        start: 1,
        count: 101,
        physicalType: "label",
      },
    });
    expect(tooMany.statusCode).toBe(400);

    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/batch`,
      headers: authHeader,
      payload: {
        namePrefix: "Mesa",
        start: 1,
        count: 20,
        physicalType: "label",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ propagatedPublications: 1 });
    expect(createTouchpointBatch).toHaveBeenCalledWith(
      expect.objectContaining({ subject: subjectId }),
      workspaceId,
      { namePrefix: "Mesa", start: 1, count: 20, physicalType: "label" },
    );
    expect(publisherKick).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("wakes the Publisher when a single Touchpoint joins a group that serves content", async () => {
    const publisherKick = vi.fn();
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      publisherKick,
      touchpointRepository: fake<TouchpointRepository>({
        createTouchpoint: async () => touchpoint,
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints`,
      headers: authHeader,
      payload: {
        operationalName: "Mesa 1",
        physicalType: "label",
        groupId: "6f708192-a3b4-4c5d-9e6f-708192a3b4c5",
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ publishing: true });
    expect(publisherKick).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it("retires through the availability service and fails closed without it", async () => {
    const retireTouchpoint = vi.fn(async () => ({
      ...touchpoint,
      status: "retired" as const,
      publishing: false,
    }));
    const unconfigured = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointRepository: fake<TouchpointRepository>({ retireTouchpoint }),
    });
    const unavailable = await unconfigured.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}/retire`,
      headers: authHeader,
    });
    expect(unavailable.statusCode).toBe(503);
    expect(retireTouchpoint).not.toHaveBeenCalled();
    await unconfigured.close();

    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointAvailability: noAvailability,
      touchpointRepository: fake<TouchpointRepository>({ retireTouchpoint }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}/retire`,
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ status: "retired" });
    expect(retireTouchpoint).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      touchpointId,
      noAvailability,
    );
    await app.close();
  });

  it("reports a retired Touchpoint as a conflict", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      touchpointRepository: fake<TouchpointRepository>({
        updateTouchpoint: async () => {
          throw new ConflictError(
            "TOUCHPOINT_RETIRED",
            "A retired Touchpoint can no longer be changed.",
          );
        },
      }),
    });
    const response = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/touchpoints/${touchpointId}`,
      headers: authHeader,
      payload: { operationalName: "Mesa 1" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ code: "TOUCHPOINT_RETIRED" });
    await app.close();
  });
});

describe("experience lifecycle routes", () => {
  it("lists archived Experiences only when asked", async () => {
    const listExperiences = vi.fn(async () => []);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: fake<ExperienceRepository>({ listExperiences }),
    });
    await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/experiences`,
      headers: authHeader,
    });
    await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/experiences?archived=true`,
      headers: authHeader,
    });
    expect(listExperiences).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      workspaceId,
      { archived: false },
    );
    expect(listExperiences).toHaveBeenNthCalledWith(
      2,
      expect.anything(),
      workspaceId,
      { archived: true },
    );
    await app.close();
  });

  it("archives with group fallback, and refuses when a Touchpoint would be orphaned", async () => {
    const publisherKick = vi.fn();
    let orphaned = false;
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      publisherKick,
      experienceRepository: fake<ExperienceRepository>({
        archiveExperience: async () => {
          if (orphaned) {
            throw new ConflictError(
              "EXPERIENCE_LIVE",
              "This Experience is live on 1 Touchpoint(s).",
            );
          }
          return {
            experienceId,
            archivedAt: "2026-09-25T00:00:00.000Z",
            fallbackPublications: 2,
          };
        },
      }),
    });
    const archived = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/archive`,
      headers: authHeader,
    });
    expect(archived.statusCode).toBe(200);
    expect(archived.json()).toMatchObject({ fallbackPublications: 2 });
    expect(publisherKick).toHaveBeenCalledTimes(1);

    orphaned = true;
    const refused = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/archive`,
      headers: authHeader,
    });
    expect(refused.statusCode).toBe(409);
    expect(refused.json()).toMatchObject({ code: "EXPERIENCE_LIVE" });
    await app.close();
  });

  it("duplicates with an optional name", async () => {
    const duplicateExperience = vi.fn(async () => ({
      id: experienceId,
      touchpointId: null,
      targets: { touchpointIds: [], groupIds: [] },
      name: "Menú (copia)",
      type: "redirect" as const,
      content: { destinationUrl: "https://example.com" },
      publicationStatus: "draft" as const,
    }));
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      experienceRepository: fake<ExperienceRepository>({
        duplicateExperience,
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/experiences/${experienceId}/duplicate`,
      headers: authHeader,
      payload: {},
    });
    expect(response.statusCode).toBe(201);
    expect(duplicateExperience).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      experienceId,
      undefined,
    );
    await app.close();
  });
});

describe("lead management routes", () => {
  const lead = {
    id: leadId,
    touchpointId,
    touchpointName: "Mesa 1",
    email: "ana@example.com",
    name: "Ana",
    phone: null,
    message: null,
    revision: 1,
    status: "contacted" as const,
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-02T00:00:00.000Z",
  };

  it("filters by status, updates status, deletes and validates retention", async () => {
    const listLeads = vi.fn(async () => ({ items: [], nextCursor: null }));
    const updateLeadStatus = vi.fn(async () => lead);
    const deleteLead = vi.fn(async () => {});
    const setLeadRetention = vi.fn(async (_i, _w, retention) => retention);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      leadRepository: fake<LeadRepository>({
        listLeads,
        updateLeadStatus,
        deleteLead,
        setLeadRetention,
      }),
    });

    await app.inject({
      method: "GET",
      url: `/v1/workspaces/${workspaceId}/leads?status=new`,
      headers: authHeader,
    });
    expect(listLeads).toHaveBeenCalledWith(expect.anything(), workspaceId, {
      status: "new",
      limit: 50,
    });

    const badStatus = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/leads/${leadId}`,
      headers: authHeader,
      payload: { status: "won" },
    });
    expect(badStatus.statusCode).toBe(400);

    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/workspaces/${workspaceId}/leads/${leadId}`,
      headers: authHeader,
      payload: { status: "contacted" },
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json()).toMatchObject({ status: "contacted" });

    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/leads/${leadId}`,
      headers: authHeader,
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleteLead).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      leadId,
    );

    const badRetention = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/lead-retention`,
      headers: authHeader,
      payload: { days: 45 },
    });
    expect(badRetention.statusCode).toBe(400);

    const forever = await app.inject({
      method: "PUT",
      url: `/v1/workspaces/${workspaceId}/lead-retention`,
      headers: authHeader,
      payload: { days: null },
    });
    expect(forever.statusCode).toBe(200);
    expect(forever.json()).toEqual({ days: null });
    await app.close();
  });
});

describe("organization routes", () => {
  const createdInvitation = {
    invitation: {
      id: invitationId,
      email: "ana@example.com",
      role: "editor" as const,
      status: "pending" as const,
      expiresAt: "2026-10-01T00:00:00.000Z",
      createdAt: "2026-09-24T00:00:00.000Z",
    },
    token: "a".repeat(43),
    workspaceName: "Café Central",
    inviterName: "Owner",
  };

  it("emails the invitation link when email is configured, without leaking internals", async () => {
    const send = vi.fn(async () => true);
    const mailer: InvitationMailer = { enabled: true, send };
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      invitationMailer: mailer,
      memberRepository: fake<MemberRepository>({
        createInvitation: async () => createdInvitation,
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/invitations`,
      headers: authHeader,
      payload: { email: "ana@example.com", role: "editor" },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.emailSent).toBe(true);
    expect(body).not.toHaveProperty("workspaceName");
    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "ana@example.com",
        workspaceName: "Café Central",
        acceptUrl: expect.stringMatching(/\/invite#token=a{43}$/),
      }),
    );
    await app.close();
  });

  it("reports emailSent=false when email is not configured", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: fake<MemberRepository>({
        createInvitation: async () => createdInvitation,
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/invitations`,
      headers: authHeader,
      payload: { email: "ana@example.com", role: "editor" },
    });
    expect(response.json()).toMatchObject({ emailSent: false });
    await app.close();
  });

  it("requests an ownership transfer (two-step: the recipient must accept)", async () => {
    const transfer = {
      id: "7a7a7a7a-0000-4000-8000-000000000001",
      workspaceId,
      workspaceName: "Café Central",
      fromProfileId: "f0f0f0f0-0000-4000-8000-000000000001",
      fromName: "Yo",
      toProfileId: profileId,
      toName: "Ana",
      status: "pending" as const,
      createdAt: "2026-10-12T00:00:00.000Z",
      isRecipient: false,
    };
    const transferOwnership = vi.fn(async () => transfer);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: fake<MemberRepository>({ transferOwnership }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/ownership-transfer`,
      headers: authHeader,
      payload: { profileId },
    });
    // Nothing is transferred yet: it is a pending request (201), not a member
    // list.
    expect(response.statusCode).toBe(201);
    expect(response.json().status).toBe("pending");
    expect(transferOwnership).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      profileId,
    );
    await app.close();
  });

  it("the recipient accepts a transfer by its id", async () => {
    const acceptOwnershipTransfer = vi.fn(async () => undefined);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: fake<MemberRepository>({ acceptOwnershipTransfer }),
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/ownership-transfers/7a7a7a7a-0000-4000-8000-000000000001/accept",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(204);
    expect(acceptOwnershipTransfer).toHaveBeenCalledWith(
      expect.anything(),
      "7a7a7a7a-0000-4000-8000-000000000001",
    );
    await app.close();
  });

  it("lists the transfers waiting for the current person", async () => {
    const incomingTransfers = vi.fn(async () => []);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      memberRepository: fake<MemberRepository>({ incomingTransfers }),
    });
    const response = await app.inject({
      method: "GET",
      url: "/v1/ownership-transfers",
      headers: authHeader,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
    await app.close();
  });
});

describe("asset deletion route", () => {
  it("requires the Assets Worker, and surfaces assets still in use", async () => {
    let inUse = false;
    const deleteAsset = vi.fn(async () => {
      if (inUse) {
        throw new ConflictError("ASSET_IN_USE", "This file is used by: Menú.");
      }
    });
    const repository = fake<AssetRepository>({ deleteAsset });
    const unconfigured = buildCustomerApi({
      sessionVerifier: verifierFor(),
      assetRepository: repository,
    });
    const unavailable = await unconfigured.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/assets/${assetId}`,
      headers: authHeader,
    });
    expect(unavailable.statusCode).toBe(503);
    await unconfigured.close();

    const worker = fake<AssetWorkerClient>({});
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      assetRepository: repository,
      assetWorker: worker,
    });
    const deleted = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/assets/${assetId}`,
      headers: authHeader,
    });
    expect(deleted.statusCode).toBe(204);
    expect(deleteAsset).toHaveBeenCalledWith(
      expect.anything(),
      workspaceId,
      assetId,
      worker,
    );

    inUse = true;
    const conflict = await app.inject({
      method: "DELETE",
      url: `/v1/workspaces/${workspaceId}/assets/${assetId}`,
      headers: authHeader,
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toMatchObject({ code: "ASSET_IN_USE" });
    await app.close();
  });
});
