import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { buildStaffApi } from "../src/app.js";
import { StaffConflictError, StaffNotFoundError } from "../src/http/errors.js";
import { publicationRowFixture, staffIdentity } from "./fixtures.js";

function sessionRepository() {
  return {
    getActiveStaffSession: async () => ({
      ...staffIdentity,
      displayName: "Staff",
      permissions: ["publications.retry"],
    }),
    readDiagnostics: async () => {
      throw new Error("not used");
    },
  };
}

describe("GET /v1/staff/publications", () => {
  it("filters by status and workspaceId", async () => {
    const listPublications = vi.fn().mockResolvedValue({
      items: [publicationRowFixture()],
      nextCursor: null,
    });
    const workspaceId = randomUUID();
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      publicationRepository: {
        listPublications,
        retryPublication: async () => {
          throw new Error("not used");
        },
      },
    });
    const response = await app.inject({
      method: "GET",
      url: `/v1/staff/publications?status=failed&workspaceId=${workspaceId}`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(listPublications).toHaveBeenCalledWith(
      staffIdentity.subject,
      expect.objectContaining({ status: "failed", workspaceId }),
    );
    await app.close();
  });
});

describe("POST /v1/staff/publications/:publicationId/retry", () => {
  it("retries a failed publication", async () => {
    const publicationId = randomUUID();
    const retryPublication = vi
      .fn()
      .mockResolvedValue(
        publicationRowFixture({ id: publicationId, status: "pending" }),
      );
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      publicationRepository: {
        listPublications: async () => {
          throw new Error("not used");
        },
        retryPublication,
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/publications/${publicationId}/retry`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe("pending");
    await app.close();
  });

  it("returns 409 when the publication is not failed", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      publicationRepository: {
        listPublications: async () => {
          throw new Error("not used");
        },
        retryPublication: async () => {
          throw new StaffConflictError(
            "Only a failed publication can be retried.",
          );
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/publications/${randomUUID()}/retry`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().code).toBe("STAFF_CONFLICT");
    await app.close();
  });

  it("returns 404 for an unknown publication", async () => {
    const app = buildStaffApi({
      sessionVerifier: { verify: async () => staffIdentity },
      sessionRepository: sessionRepository(),
      publicationRepository: {
        listPublications: async () => {
          throw new Error("not used");
        },
        retryPublication: async () => {
          throw new StaffNotFoundError();
        },
      },
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/staff/publications/${randomUUID()}/retry`,
      headers: { authorization: "Bearer staff-token" },
    });
    expect(response.statusCode).toBe(404);
    await app.close();
  });

  it("fires the publisher kick after a successful retry, at the repository level", async () => {
    const { createPostgresStaffPublicationRepository } = await import(
      "../src/repositories/publications.js"
    );
    const publicationId = randomUUID();
    const jobId = randomUUID();

    function runQuery(strings: TemplateStringsArray) {
      const text = strings.join(" ");
      if (text.includes("select exists(")) {
        return Promise.resolve([{ granted: true }]);
      }
      if (text.includes("select pub.id, pub.status::text as status")) {
        return Promise.resolve([
          { id: publicationId, status: "failed", workspace_id: null },
        ]);
      }
      if (text.includes("select id from kardo_core.publication_jobs")) {
        return Promise.resolve([{ id: jobId }]);
      }
      if (text.includes("update kardo_core.publications")) {
        // The guarded reset (`where status = 'failed' returning id`).
        return Promise.resolve([{ id: publicationId }]);
      }
      if (text.includes("where pub.id =")) {
        // fetchPublicationRow's main select (the select-list and from-clause
        // are separate nested fragments this fake does not stitch back in;
        // only the outer query's own literal text — this where clause — is
        // visible here)
        return Promise.resolve([
          {
            id: publicationId,
            touchpoint_id: randomUUID(),
            touchpoint_public_id: "touchpointpublicid00001",
            touchpoint_name: "Mesa 1",
            workspace_id: null,
            workspace_name: null,
            experience_id: randomUUID(),
            experience_name: "Menu",
            experience_type: "menu",
            version_revision: 1,
            status: "pending",
            job_status: "pending",
            attempts: 0,
            last_error: null,
            created_at: new Date().toISOString(),
            published_at: null,
          },
        ]);
      }
      return Promise.resolve([]);
    }

    const tag = (strings: TemplateStringsArray) => runQuery(strings);
    tag.unsafe = () => Promise.resolve([]);
    tag.json = (value: unknown) => value;
    tag.begin = (fn: (tx: typeof tag) => Promise<unknown>) => fn(tag);

    const repository = createPostgresStaffPublicationRepository(
      // biome-ignore lint/suspicious/noExplicitAny: minimal fake for postgres.js's tagged-template Sql type
      tag as any,
    );
    const publisherKick = vi.fn();

    const result = await repository.retryPublication(
      staffIdentity.subject,
      publicationId,
      publisherKick,
    );
    expect(result.status).toBe("pending");
    expect(publisherKick).toHaveBeenCalledOnce();
  });
});
