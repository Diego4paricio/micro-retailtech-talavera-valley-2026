import type { KardoPieceClaimPreview, Touchpoint } from "@kardo/contracts";
import type { Sql } from "postgres";
import { describe, expect, it, vi } from "vitest";
import { buildCustomerApi } from "../src/app.js";
import { ApiError, PlanLimitError } from "../src/errors.js";
import {
  createPostgresKardoPieceRepository,
  type KardoPieceRepository,
} from "../src/repositories/kardo-pieces.js";
import type { TouchpointAvailabilityClient } from "../src/resolver-clients/touchpoint-availability.js";
import {
  authHeader,
  subjectId,
  touchpointId,
  verifierFor,
  workspaceId,
} from "./helpers.js";

const identity = { subject: subjectId, email: "owner@kardo.test" };
const pieceId = "5a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d";

const preview: KardoPieceClaimPreview = {
  scope: "kit",
  pieces: [
    { touchpointId, model: "stand" },
    { touchpointId: pieceId, model: "card" },
  ],
  alreadyActive: 0,
  kit: {
    kitCode: "presentacion",
    kitName: "Kit Presentación",
    planCode: "profesional",
    planName: "Profesional",
    days: 30,
    pending: true,
    outcome: "trial",
  },
  limit: { limit: 60, usage: 3, fits: 2 },
  planRequired: false,
};

const piece: Touchpoint = {
  id: touchpointId,
  publicId: "kp_Ab3dEf6hIj9kLm2nOp4q",
  operationalName: "Stand",
  physicalType: "card",
  kind: "kardo",
  pieceModel: "stand",
  status: "assigned",
  createdAt: "2026-10-13T00:00:00.000Z",
  live: null,
};

function repository(
  overrides: Partial<KardoPieceRepository> = {},
): KardoPieceRepository {
  return {
    previewClaim: async () => preview,
    claim: async () => ({
      touchpoints: [piece],
      panel: null,
      propagatedPublications: 0,
    }),
    ...overrides,
  };
}

describe("Kardo piece routes (ADR 026)", () => {
  it("previews a code for the verified member, with the caller's address", async () => {
    const previewClaim = vi.fn(async () => preview);
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      kardoPieceRepository: repository({ previewClaim }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/kardo-pieces/preview`,
      headers: authHeader,
      payload: { code: "abcde-23456" },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      scope: "kit",
      planRequired: false,
    });
    expect(previewClaim).toHaveBeenCalledWith(
      expect.objectContaining({ subject: subjectId }),
      workspaceId,
      "abcde-23456",
      expect.any(String),
    );
    await app.close();
  });

  it("refuses a body that is not a code", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      kardoPieceRepository: repository(),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/kardo-pieces/preview`,
      headers: authHeader,
      payload: { code: "abc", kind: "kardo" },
    });
    expect(response.statusCode).toBe(400);
    await app.close();
  });

  it("answers an unknown code with one neutral error", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      kardoPieceRepository: repository({
        previewClaim: async () => {
          throw new ApiError(
            "PIECE_CODE_INVALID",
            400,
            "Ese código no abre ninguna pieza.",
          );
        },
      }),
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/kardo-pieces/preview`,
      headers: authHeader,
      payload: { code: "ZZZZZ-ZZZZZ" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "PIECE_CODE_INVALID" });
    await app.close();
  });

  it("limits how often one person tries codes", async () => {
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      kardoPieceRepository: repository(),
      rateLimit: { sensitive: { limit: 1, windowMs: 60_000 } },
    });
    const send = () =>
      app.inject({
        method: "POST",
        url: `/v1/workspaces/${workspaceId}/kardo-pieces/preview`,
        headers: authHeader,
        payload: { code: "ABCD-2345" },
      });
    expect((await send()).statusCode).toBe(200);
    expect((await send()).statusCode).toBe(429);
    await app.close();
  });

  it("activates the chosen pieces and wakes the Publisher for a group's page", async () => {
    const publisherKick = vi.fn();
    const claim = vi.fn(async () => ({
      touchpoints: [piece],
      panel: {
        outcome: "trial" as const,
        planCode: "profesional",
        endsAt: "2026-11-12T00:00:00.000Z",
      },
      propagatedPublications: 1,
    }));
    const app = buildCustomerApi({
      sessionVerifier: verifierFor(),
      kardoPieceRepository: repository({ claim }),
      publisherKick,
    });
    const response = await app.inject({
      method: "POST",
      url: `/v1/workspaces/${workspaceId}/kardo-pieces/claim`,
      headers: authHeader,
      payload: {
        code: "ABCDE-23456",
        pieces: [{ touchpointId, name: "Stand" }],
        groupId: null,
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.touchpoints[0]).toMatchObject({
      kind: "kardo",
      pieceModel: "stand",
    });
    expect(body.panel).toMatchObject({ outcome: "trial" });
    expect(body).not.toHaveProperty("propagatedPublications");
    expect(publisherKick).toHaveBeenCalledTimes(1);
    await app.close();
  });
});

// A tagged-template stand-in for postgres.js with `begin`, `savepoint` and
// `json`; `answer` decides each query's rows from its text.
function fakeSql(answer: (text: string) => unknown[]) {
  const queries: string[] = [];
  let committed = 0;
  const tag = ((strings: TemplateStringsArray) => {
    const text = strings.join("?");
    queries.push(text);
    try {
      return Promise.resolve(answer(text));
    } catch (error) {
      return Promise.reject(error);
    }
  }) as unknown as Sql & {
    savepoint: (callback: (sql: Sql) => Promise<unknown>) => Promise<unknown>;
  };
  Object.assign(tag, {
    json: (value: unknown) => value,
    savepoint: (callback: (sql: Sql) => Promise<unknown>) => callback(tag),
    begin: async (callback: (sql: Sql) => Promise<unknown>) => {
      const result = await callback(tag);
      committed += 1;
      return result;
    },
  });
  return { sql: tag as Sql, queries, committed: () => committed };
}

const resolver = (): TouchpointAvailabilityClient & {
  setPieces: ReturnType<typeof vi.fn>;
} => ({
  setAvailability: vi.fn(async () => {}),
  setAlias: vi.fn(async () => {}),
  setPieces: vi.fn(async () => {}),
});

describe("Kardo piece repository (ADR 026)", () => {
  it("keeps a failed code's attempt: it commits, then answers PIECE_CODE_INVALID", async () => {
    const db = fakeSql((text) => {
      if (text.includes("workspace_memberships")) return [{ role: "owner" }];
      if (text.includes("preview_piece_claim"))
        return [{ result: { status: "invalid" } }];
      return [];
    });
    const repo = createPostgresKardoPieceRepository(db.sql, {
      resolver: resolver(),
    });
    const error = await repo
      .previewClaim(identity, workspaceId, "ZZZZZZZZZZ", "10.0.0.1")
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "PIECE_CODE_INVALID",
      statusCode: 400,
    });
    expect(db.committed()).toBe(1);
    // Nothing else was asked once the code opened nothing.
    expect(db.queries.some((text) => text.includes("claim_kardo_pieces"))).toBe(
      false,
    );
  });

  it("says how many pieces fit after the kit's days, from a dry run", async () => {
    const db = fakeSql((text) => {
      if (text.includes("workspace_memberships")) return [{ role: "editor" }];
      if (text.includes("preview_piece_claim"))
        return [
          {
            result: {
              status: "ok",
              scope: "kit",
              pieces: preview.pieces,
              alreadyActive: 0,
              kit: preview.kit,
            },
          },
        ];
      if (text.includes("workspace_usage"))
        return [{ usage: { "touchpoints.max": 59 } }];
      if (text.includes("claim_kardo_pieces"))
        return [{ result: { status: "claimed" } }];
      if (text.includes("effective_plan"))
        return [
          {
            plan_code: "profesional",
            plan_name: "Profesional",
            source: "trial",
            entitlements: { "touchpoints.max": 60 },
          },
        ];
      if (text.includes("workspace_access")) return [{ state: "trial" }];
      return [];
    });
    const repo = createPostgresKardoPieceRepository(db.sql, {
      resolver: resolver(),
    });
    const result = await repo.previewClaim(
      identity,
      workspaceId,
      "ABCDE23456",
      "10.0.0.1",
    );
    expect(result.limit).toEqual({ limit: 60, usage: 59, fits: 1 });
    expect(result.planRequired).toBe(false);
    expect(result.pieces).toHaveLength(2);
  });

  it("rolls everything back when the pieces do not fit, and never tells the Resolver", async () => {
    const pieces = resolver();
    const db = fakeSql((text) => {
      if (text.includes("workspace_memberships")) return [{ role: "owner" }];
      if (text.includes("claim_kardo_pieces"))
        return [
          {
            result: {
              status: "claimed",
              touchpointIds: [touchpointId, pieceId],
              publicIds: ["kp_a", "kp_b"],
              panel: null,
            },
          },
        ];
      if (text.includes("workspace_access")) return [{ state: "active" }];
      if (text.includes("effective_plan"))
        return [
          {
            plan_code: "esencial",
            plan_name: "Esencial",
            source: "subscription",
            entitlements: { "touchpoints.max": 15 },
          },
        ];
      if (text.includes("billing_account_id")) return [{ account: "acc" }];
      if (text.includes("workspace_usage"))
        return [{ usage: { "touchpoints.max": 16 } }];
      return [];
    });
    const repo = createPostgresKardoPieceRepository(db.sql, {
      resolver: pieces,
    });
    const error = await repo
      .claim(
        identity,
        workspaceId,
        {
          code: "ABCDE23456",
          pieces: [
            { touchpointId, name: "Stand" },
            { touchpointId: pieceId, name: "Card" },
          ],
        },
        "10.0.0.1",
      )
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(PlanLimitError);
    // The usage it reports is the one before these two pieces.
    expect((error as PlanLimitError).details).toMatchObject({
      limit: 15,
      usage: 14,
    });
    expect(pieces.setPieces).not.toHaveBeenCalled();
    expect(db.committed()).toBe(0);
  });

  it("tells the Resolver the activated addresses and reconciles after a kit's days", async () => {
    const pieces = resolver();
    const reconcile = vi.fn(async () => {});
    const db = fakeSql((text) => {
      if (text.includes("workspace_memberships")) return [{ role: "owner" }];
      if (text.includes("claim_kardo_pieces"))
        return [
          {
            result: {
              status: "claimed",
              touchpointIds: [touchpointId],
              publicIds: ["kp_Ab3dEf6hIj9kLm2nOp4q"],
              panel: {
                outcome: "trial",
                planCode: "profesional",
                endsAt: "2026-11-12T00:00:00.000Z",
              },
            },
          },
        ];
      if (text.includes("workspace_access")) return [{ state: "trial" }];
      if (text.includes("effective_plan"))
        return [
          {
            plan_code: "profesional",
            plan_name: "Profesional",
            source: "trial",
            entitlements: { "touchpoints.max": 60 },
          },
        ];
      if (text.includes("billing_account_id")) return [{ account: "acc" }];
      if (text.includes("workspace_usage"))
        return [{ usage: { "touchpoints.max": 4 } }];
      if (text.includes("where t.id = any"))
        return [
          {
            id: touchpointId,
            public_id: "kp_Ab3dEf6hIj9kLm2nOp4q",
            operational_name: "Stand",
            physical_type: "card",
            kind: "kardo",
            piece_model: "stand",
            handle: null,
            slug: null,
            status: "assigned",
            group_id: null,
            created_at: "2026-10-13T00:00:00.000Z",
            suspended: false,
            plan_excluded: false,
            publishing: false,
            live_experience_id: null,
            live_experience_name: null,
            live_experience_type: null,
            live_revision: null,
            live_published_at: null,
          },
        ];
      return [];
    });
    const repo = createPostgresKardoPieceRepository(db.sql, {
      resolver: pieces,
      reconcile,
    });
    const result = await repo.claim(
      identity,
      workspaceId,
      { code: "ABCDE23456", pieces: [{ touchpointId, name: "Stand" }] },
      "10.0.0.1",
    );
    expect(pieces.setPieces).toHaveBeenCalledWith({
      publicIds: ["kp_Ab3dEf6hIj9kLm2nOp4q"],
      claimed: true,
    });
    expect(result.touchpoints[0]).toMatchObject({
      kind: "kardo",
      pieceModel: "stand",
    });
    expect(result.panel).toMatchObject({ outcome: "trial" });
    expect(reconcile).toHaveBeenCalledWith(workspaceId);
  });

  it("refuses to activate without a Resolver to tell", async () => {
    const db = fakeSql(() => []);
    const repo = createPostgresKardoPieceRepository(db.sql, { resolver: null });
    const error = await repo
      .claim(
        identity,
        workspaceId,
        { code: "ABCDE23456", pieces: [{ touchpointId, name: "Stand" }] },
        "10.0.0.1",
      )
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "TOUCHPOINT_AVAILABILITY_UNAVAILABLE",
      statusCode: 503,
    });
  });
});
