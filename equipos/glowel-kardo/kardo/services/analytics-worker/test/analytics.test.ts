import { describe, expect, it } from "vitest";
import { parseAnalyticsEvent, parseLeadSubmission } from "../src/index.js";
import worker from "../src/worker.js";

describe("analytics privacy boundary", () => {
  it("accepts only the minimal server-issued event contract", () => {
    expect(
      parseAnalyticsEvent({
        schemaVersion: 1,
        eventId: "00000000-0000-4000-8000-000000000001",
        occurredAt: new Date().toISOString(),
        publicId: "kardotesttouchpoint01",
        publicationRevision: 1,
        type: "tap",
        channel: "nfc",
        test: true,
      }),
    ).toMatchObject({ type: "tap", channel: "nfc", test: true });
    expect(
      parseAnalyticsEvent({
        schemaVersion: 1,
        eventId: "not-a-uuid",
        occurredAt: new Date().toISOString(),
        publicId: "kardotesttouchpoint01",
        publicationRevision: 1,
        type: "tap",
        channel: "nfc",
        test: true,
      }),
    ).toBeNull();
  });

  it("requires explicit consent and bounded lead fields", () => {
    expect(
      parseLeadSubmission({
        publicId: "kardotesttouchpoint01",
        email: "Lead@Example.test",
        consent: true,
        name: "Ana",
      }),
    ).toEqual({
      publicId: "kardotesttouchpoint01",
      email: "lead@example.test",
      consent: true,
      name: "Ana",
    });
    expect(
      parseLeadSubmission({
        publicId: "kardotesttouchpoint01",
        email: "lead@example.test",
        consent: false,
      }),
    ).toBeNull();
  });

  it("accepts an optional phone number in the same shape the Resolver's lead form uses", () => {
    expect(
      parseLeadSubmission({
        publicId: "kardotesttouchpoint01",
        email: "lead@example.test",
        consent: true,
        phone: "+52 55 1234 5678",
      }),
    ).toMatchObject({ phone: "+52 55 1234 5678" });
  });

  it("rejects a phone number with letters or other unsafe characters", () => {
    expect(
      parseLeadSubmission({
        publicId: "kardotesttouchpoint01",
        email: "lead@example.test",
        consent: true,
        phone: "call me maybe",
      }),
    ).toBeNull();
  });

  it("rejects a phone number shorter than the database's 3 character minimum", () => {
    expect(
      parseLeadSubmission({
        publicId: "kardotesttouchpoint01",
        email: "lead@example.test",
        consent: true,
        phone: "12",
      }),
    ).toBeNull();
  });

  it("rejects a phone number over 40 characters", () => {
    expect(
      parseLeadSubmission({
        publicId: "kardotesttouchpoint01",
        email: "lead@example.test",
        consent: true,
        phone: "1".repeat(41),
      }),
    ).toBeNull();
  });
});

describe("lead intake authorization", () => {
  const request = (headers: Record<string, string> = {}) =>
    new Request("https://analytics.test/v1/public/leads", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "content-length": "2",
        ...headers,
      },
      body: "{}",
    });
  const executionContext = {
    waitUntil: () => {},
    passThroughOnException: () => {},
  } as unknown as ExecutionContext;

  it("fails closed when no shared secret is configured", async () => {
    for (const headers of [
      {},
      { "x-kardo-lead-intake": "" },
      { "x-kardo-lead-intake": "anything" },
    ]) {
      const response = await worker.fetch(
        request(headers),
        {
          HYPERDRIVE: { connectionString: "postgres://unused" },
        } as unknown as Env,
        executionContext,
      );
      expect(response.status).toBe(401);
    }
  });

  it("rejects a request missing the shared secret once one is configured", async () => {
    const response = await worker.fetch(
      request(),
      {
        HYPERDRIVE: { connectionString: "postgres://unused" },
        LEAD_INTAKE_KEY: "shared-secret",
      } as unknown as Env,
      executionContext,
    );
    expect(response.status).toBe(401);
  });

  it("accepts a request presenting the configured shared secret", async () => {
    const response = await worker.fetch(
      request({ "x-kardo-lead-intake": "shared-secret" }),
      {
        HYPERDRIVE: { connectionString: "postgres://unused" },
        LEAD_INTAKE_KEY: "shared-secret",
      } as unknown as Env,
      executionContext,
    );
    // Past the auth check, same as the "no secret configured" case: it fails
    // at body validation, not at authorization.
    expect(response.status).toBe(400);
  });
});
