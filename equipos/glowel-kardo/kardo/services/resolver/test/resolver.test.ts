import { reset, SELF } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { afterEach, describe, expect, it } from "vitest";
import {
  hasPublishAuthorization,
  hasSuspensionAuthorization,
  isPanelPreview,
  leadTurnstileRefused,
  publicHtmlHeaders,
  recordTap,
} from "../src/index.js";

const publicId = "kardotesttouchpoint01";
const commandHeaders = {
  authorization: "Bearer resolver-test-command",
  "content-type": "application/json",
};
const suspensionHeaders = {
  authorization: "Bearer resolver-test-suspension",
  "content-type": "application/json",
};

afterEach(async () => reset());

async function publishLegacyRedirect(
  revision: number,
  destinationUrl: string,
): Promise<Response> {
  const response = await SELF.fetch("https://resolver.test/internal/publish", {
    method: "POST",
    headers: commandHeaders,
    body: JSON.stringify({ publicId, revision, destinationUrl }),
  });
  expect(response.status).toBe(200);
  return response;
}

async function publishExperience(
  experience: unknown,
  options: {
    revision?: number;
    asset?: unknown;
    assets?: unknown;
    id?: string;
    experienceId?: string;
  } = {},
): Promise<Response> {
  const response = await SELF.fetch("https://resolver.test/internal/publish", {
    method: "POST",
    headers: commandHeaders,
    body: JSON.stringify({
      publicId: options.id ?? publicId,
      revision: options.revision ?? 1,
      experience,
      ...(options.asset ? { asset: options.asset } : {}),
      ...(options.assets ? { assets: options.assets } : {}),
      ...(options.experienceId ? { experienceId: options.experienceId } : {}),
    }),
  });
  return response;
}

async function resolve(
  id: string = publicId,
): Promise<{ status: number; location: string | null }> {
  const response = await SELF.fetch(`https://resolver.test/t/${id}`, {
    redirect: "manual",
  });
  return {
    status: response.status,
    location: response.headers.get("location"),
  };
}

describe("public Resolver: redirects", () => {
  it("keeps v1 live until v2 is activated, then resolves the same public ID to v2", async () => {
    await publishLegacyRedirect(1, "https://example.test/v1");
    expect(await resolve()).toMatchObject({
      status: 302,
      location: "https://example.test/v1",
    });

    await publishLegacyRedirect(2, "https://example.test/v2");
    expect(await resolve()).toMatchObject({
      status: 302,
      location: "https://example.test/v2",
    });
  });

  it("does not let a delayed v1 publication replace v2", async () => {
    await publishLegacyRedirect(2, "https://example.test/v2");
    const delayed = await publishLegacyRedirect(1, "https://example.test/v1");
    expect(await delayed.json()).toEqual({ result: "stale", revision: 1 });
    expect(await resolve()).toMatchObject({
      status: 302,
      location: "https://example.test/v2",
    });
  });

  it("fails closed when the active snapshot is missing", async () => {
    await publishLegacyRedirect(1, "https://example.test/v1");
    await env.PUBLISHED_SNAPSHOTS.delete(`snapshots/${publicId}/1.json`);
    expect(await resolve()).toMatchObject({ status: 503 });
  });

  it("blocks a paused Touchpoint before it can serve its active snapshot", async () => {
    await publishLegacyRedirect(1, "https://example.test/v1");
    const paused = await SELF.fetch(
      "https://resolver.test/internal/availability",
      {
        method: "POST",
        headers: commandHeaders,
        body: JSON.stringify({ publicId, status: "paused" }),
      },
    );
    expect(paused.status).toBe(200);
    expect(
      await SELF.fetch(`https://resolver.test/t/${publicId}`),
    ).toMatchObject({ status: 404 });
  });

  it("keeps the Tap response available while analytics is recorded asynchronously", async () => {
    await publishLegacyRedirect(1, "https://example.test/v1");
    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}?src=nfc`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://example.test/v1");
  });

  it("records one privacy-bounded Analytics Engine point without delaying the Tap", () => {
    const points: AnalyticsEngineDataPoint[] = [];
    recordTap(
      {
        KARDO_ENV: "test",
        TAP_ANALYTICS: { writeDataPoint: (point) => points.push(point ?? {}) },
      },
      publicId,
      1,
      "nfc",
    );
    expect(points).toEqual([
      { indexes: [publicId], blobs: ["1", "tap", "nfc", "test"], doubles: [1] },
    ]);
  });

  it("serves the panel's preview without counting it as a visit (relevo 36)", async () => {
    expect(
      isPanelPreview(
        new URL(`https://resolver.test/t/${publicId}?src=preview`),
      ),
    ).toBe(true);
    expect(
      isPanelPreview(new URL(`https://resolver.test/t/${publicId}?src=nfc`)),
    ).toBe(false);
    expect(isPanelPreview(new URL(`https://resolver.test/t/${publicId}`))).toBe(
      false,
    );
    await publishLegacyRedirect(1, "https://example.test/v1");
    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}?src=preview`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(302);
  });

  it("swallows Analytics Engine errors so the caller never waits for metrics", () => {
    expect(() =>
      recordTap(
        {
          KARDO_ENV: "test",
          TAP_ANALYTICS: {
            writeDataPoint: () => {
              throw new Error("analytics unavailable");
            },
          },
        },
        publicId,
        1,
        "nfc",
      ),
    ).not.toThrow();
  });

  it("rejects untrusted publication commands and unsafe destinations", async () => {
    const noCredential = await SELF.fetch(
      "https://resolver.test/internal/publish",
      {
        method: "POST",
        body: JSON.stringify({
          publicId,
          revision: 1,
          destinationUrl: "https://example.test",
        }),
        headers: { "content-type": "application/json" },
      },
    );
    expect(noCredential.status).toBe(401);

    const unsafe = await SELF.fetch("https://resolver.test/internal/publish", {
      method: "POST",
      body: JSON.stringify({
        publicId,
        revision: 1,
        destinationUrl: "http://example.test",
      }),
      headers: commandHeaders,
    });
    expect(unsafe.status).toBe(400);
  });
});

describe("regression: redirect publications shaped like the Publisher's experience command", () => {
  it("accepts {experience:{type:'redirect',destinationUrl}} with no top-level destinationUrl and redirects to it", async () => {
    const published = await publishExperience({
      type: "redirect",
      destinationUrl: "https://example.test/bienvenida",
    });
    expect(published.status).toBe(200);
    expect(await resolve()).toMatchObject({
      status: 302,
      location: "https://example.test/bienvenida",
    });
  });

  it("still resolves an old snapshot stored with a root-level destinationUrl (R2 backward compatibility)", async () => {
    // Simulates a snapshot written and activated before the experience-shaped
    // command existed: written straight to R2 and activated on the Durable
    // Object's RPC surface directly, never through /internal/publish, so this
    // exercises exactly what a pre-existing production snapshot looks like.
    const legacyBody = JSON.stringify({
      schemaVersion: 1,
      status: "active",
      publicId,
      revision: 1,
      destinationUrl: "https://example.test/legacy-v1",
    });
    const sha256 = await sha256Hex(legacyBody);
    const snapshotKey = `snapshots/${publicId}/1.json`;
    await env.PUBLISHED_SNAPSHOTS.put(snapshotKey, legacyBody, {
      customMetadata: { sha256 },
    });
    const result = await env.TOUCHPOINT_STATE.getByName(publicId).activate({
      revision: 1,
      snapshotKey,
      sha256,
    });
    expect(result).toBe("activated");
    expect(await resolve()).toMatchObject({
      status: 302,
      location: "https://example.test/legacy-v1",
    });
  });
});

describe("regression: image publications render alt text, not a title", () => {
  it("publishes and renders an image experience keyed only on alt", async () => {
    const hash = "a".repeat(64);
    await env.PUBLISHED_SNAPSHOTS.put(
      `assets/${hash}`,
      new Uint8Array([137, 80, 78, 71]),
      {
        httpMetadata: { contentType: "image/png" },
        customMetadata: { sha256: hash },
      },
    );
    const published = await publishExperience(
      { type: "image", alt: "Escaparate de la tienda" },
      {
        asset: {
          sha256: hash,
          mediaType: "image/png",
          title: "escaparate.png",
        },
        assets: [{ sha256: hash, mediaType: "image/png" }],
      },
    );
    expect(published.status).toBe(200);
    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.status).toBe(200);
    const html = await page.text();
    expect(html).toContain("Escaparate de la tienda");
    expect(html).toContain(`/t/${publicId}/assets/${hash}`);
  });
});

describe("snapshot with an asset not listed cannot be served", () => {
  it("returns 404 for a hash that is not part of the active snapshot's asset list", async () => {
    const hash = "b".repeat(64);
    await env.PUBLISHED_SNAPSHOTS.put(
      `assets/${hash}`,
      new Uint8Array([1, 2, 3]),
      {
        httpMetadata: { contentType: "image/png" },
        customMetadata: { sha256: hash },
      },
    );
    await publishExperience({ type: "image", alt: "Sin assets listados" });
    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}/assets/${hash}`,
    );
    expect(response.status).toBe(404);
  });

  it("serves a verified derivative only through its active Touchpoint and applies CSP", async () => {
    const hash = "a".repeat(64);
    await env.PUBLISHED_SNAPSHOTS.put(
      `assets/${hash}`,
      new Uint8Array([137, 80, 78, 71]),
      {
        httpMetadata: { contentType: "image/png" },
        customMetadata: { sha256: hash },
      },
    );
    const published = await publishExperience(
      { type: "image", alt: "Imagen Kardo" },
      {
        asset: { sha256: hash, mediaType: "image/png", title: "Imagen Kardo" },
      },
    );
    expect(published.status).toBe(200);
    const publicPage = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(publicPage.headers.get("content-security-policy")).toContain(
      "default-src 'none'",
    );
    const asset = await SELF.fetch(
      `https://resolver.test/t/${publicId}/assets/${hash}`,
    );
    expect(asset.status).toBe(200);
    expect(asset.headers.get("x-content-type-options")).toBe("nosniff");
    expect(
      (
        await SELF.fetch(
          `https://resolver.test/t/${publicId}/assets/${"b".repeat(64)}`,
        )
      ).status,
    ).toBe(404);
  });
});

describe("hardening headers", () => {
  it("sends HSTS and X-Frame-Options on the public HTML page", async () => {
    await publishExperience({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
    });
    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.headers.get("strict-transport-security")).toContain(
      "max-age=31536000",
    );
    expect(page.headers.get("x-frame-options")).toBe("DENY");
    expect(page.headers.get("cache-control")).toBe("no-store");
  });

  it("uses form-action 'self' only on a form experience's page", async () => {
    await publishExperience({
      type: "form",
      title: "Contacto",
      fields: { name: "hidden", phone: "hidden", message: "hidden" },
      submitLabel: "Enviar",
      successMessage: "Gracias",
      consentText: "Acepto.",
    });
    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.headers.get("content-security-policy")).toContain(
      "form-action 'self'",
    );
  });

  it("uses form-action 'none' on a non-form experience's page", async () => {
    await publishExperience({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
    });
    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.headers.get("content-security-policy")).toContain(
      "form-action 'none'",
    );
  });

  it("keeps the same strict CSP (no new external domains) on a themed linkpage and on its /@handle alias", async () => {
    await publishExperience({
      type: "linkpage",
      displayName: "Estudio Kardo",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      socials: [
        {
          id: "ig",
          network: "instagram",
          value: "https://instagram.com/kardo",
        },
      ],
      theme: {
        background: { kind: "solid", color: "#112233" },
        surface: "dark",
        accent: "#ff9900",
        buttonStyle: "outline",
        font: "mono",
      },
    });
    await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: commandHeaders,
      body: JSON.stringify({
        handle: "cspcheckhandle",
        publicId,
        previousHandle: null,
      }),
    });

    for (const url of [
      `https://resolver.test/t/${publicId}`,
      "https://resolver.test/@cspcheckhandle",
    ]) {
      const response = await SELF.fetch(url);
      const csp = response.headers.get("content-security-policy") ?? "";
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("img-src 'self'");
      expect(csp).toContain("style-src 'unsafe-inline'");
      expect(csp).not.toContain("challenges.cloudflare.com");
      expect(csp).not.toContain("script-src");
    }
  });
});

describe("tracked clicks: /t/{publicId}/go/{itemId}", () => {
  it("redirects to the linked url for a known id, preserving the channel", async () => {
    await publishExperience({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/destino" }],
    });
    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/l1?src=qr`,
      { redirect: "manual" },
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("https://kardo.test/destino");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  });

  it("returns 404 for an unknown id instead of accepting an arbitrary destination (no open redirect)", async () => {
    await publishExperience({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/destino" }],
    });
    const unknown = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/unknown-id`,
      { redirect: "manual" },
    );
    expect(unknown.status).toBe(404);

    // A raw URL is never accepted as a destination through this route.
    const attempted = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/${encodeURIComponent("https://evil.test")}`,
      { redirect: "manual" },
    );
    expect(attempted.status).toBe(404);
  });

  it("respects a paused Touchpoint the same way the main route does", async () => {
    await publishExperience({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/destino" }],
    });
    await SELF.fetch("https://resolver.test/internal/availability", {
      method: "POST",
      headers: commandHeaders,
      body: JSON.stringify({ publicId, status: "paused" }),
    });
    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/l1`,
    );
    expect(response.status).toBe(404);
  });
});

describe("lead submissions: POST /t/{publicId}/leads", () => {
  async function publishForm(
    fields: {
      name: "hidden" | "optional" | "required";
      phone: "hidden" | "optional" | "required";
      message: "hidden" | "optional" | "required";
    } = {
      name: "optional",
      phone: "hidden",
      message: "optional",
    },
  ) {
    await publishExperience({
      type: "form",
      title: "Contáctanos",
      fields,
      submitLabel: "Enviar",
      successMessage: "Gracias, te contactaremos pronto.",
      consentText: "Acepto ser contactado.",
    });
  }

  function leadRequest(
    body: string,
    headers: Record<string, string> = {},
  ): Request {
    return new Request(`https://resolver.test/t/${publicId}/leads?src=qr`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": String(new TextEncoder().encode(body).byteLength),
        "cf-connecting-ip": "203.0.113.10",
        ...headers,
      },
      body,
    });
  }

  it("accepts a valid submission and forwards it to analytics-worker via the LEAD_INTAKE service binding", async () => {
    await publishForm();
    const response = await SELF.fetch(
      leadRequest("email=lead%40example.test&consent=yes&name=Ana"),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Gracias, te contactaremos pronto.");
  });

  it("accepts a filled honeypot silently (no error, no real submission) and still shows success", async () => {
    await publishForm();
    const response = await SELF.fetch(
      leadRequest(
        "email=lead%40example.test&consent=yes&website=http://spam.test",
      ),
    );
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Gracias, te contactaremos pronto.");
  });

  it("rejects a submission missing consent", async () => {
    await publishForm();
    const response = await SELF.fetch(leadRequest("email=lead%40example.test"));
    expect(response.status).toBe(400);
    const html = await response.text();
    expect(html).toContain("consentimiento");
  });

  it("rejects an invalid email", async () => {
    await publishForm();
    const response = await SELF.fetch(
      leadRequest("email=not-an-email&consent=yes"),
    );
    expect(response.status).toBe(400);
  });

  it("returns 404 for a Touchpoint whose active publication is not a form", async () => {
    await publishExperience({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
    });
    const response = await SELF.fetch(
      leadRequest("email=lead%40example.test&consent=yes"),
    );
    expect(response.status).toBe(404);
  });

  it("respects a paused Touchpoint the same way the main route does", async () => {
    await publishForm();
    await SELF.fetch("https://resolver.test/internal/availability", {
      method: "POST",
      headers: commandHeaders,
      body: JSON.stringify({ publicId, status: "paused" }),
    });
    const response = await SELF.fetch(
      leadRequest("email=lead%40example.test&consent=yes"),
    );
    expect(response.status).toBe(404);
  });

  it("rejects a body over the 4 KiB limit", async () => {
    await publishForm();
    const huge = `email=lead%40example.test&consent=yes&message=${"a".repeat(5000)}`;
    const response = await SELF.fetch(leadRequest(huge));
    expect(response.status).toBe(400);
  });

  it("surfaces a 503 when analytics-worker rejects the lead as a service failure", async () => {
    await publishExperience(
      {
        type: "form",
        title: "Contáctanos",
        fields: { name: "hidden", phone: "hidden", message: "hidden" },
        submitLabel: "Enviar",
        successMessage: "Gracias.",
        consentText: "Acepto.",
      },
      { id: "kardodownstreamdown001" },
    );
    const response = await SELF.fetch(
      new Request(`https://resolver.test/t/kardodownstreamdown001/leads`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": "38",
          "cf-connecting-ip": "203.0.113.11",
        },
        body: "email=lead%40example.test&consent=yes",
      }),
    );
    expect(response.status).toBe(503);
  });

  it("rate limits repeated submissions from the same IP for the same Touchpoint", async () => {
    await publishForm();
    const attempts = await Promise.all(
      Array.from({ length: 7 }, () =>
        SELF.fetch(
          leadRequest("email=lead%40example.test&consent=yes", {
            "cf-connecting-ip": "203.0.113.20",
          }),
        ),
      ),
    );
    const statuses = attempts.map((response) => response.status);
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThan(
      0,
    );
  });
});

async function sha256Hex(value: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(hash)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

describe("branded status pages: GET /t/{publicId}", () => {
  it("shows the 'unpublished' page with 404 for a Touchpoint that has never been published", async () => {
    const neverPublished = "kardoneverpublished001";
    const response = await SELF.fetch(
      `https://resolver.test/t/${neverPublished}`,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
    const html = await response.text();
    expect(html).toContain("Este Kardo aún no tiene contenido");
    expect(html).toContain('<meta name="robots" content="noindex">');
  });

  it("shows the 'paused' page with 404 for a paused Touchpoint", async () => {
    await publishLegacyRedirect(1, "https://example.test/paused-status-page");
    await SELF.fetch("https://resolver.test/internal/availability", {
      method: "POST",
      headers: commandHeaders,
      body: JSON.stringify({ publicId, status: "paused" }),
    });
    const response = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Temporalmente no disponible");
  });

  it("shows the 'retired' page with 410, and retirement is terminal", async () => {
    await publishLegacyRedirect(1, "https://example.test/retire-status-page");

    const retire = await SELF.fetch(
      "https://resolver.test/internal/availability",
      {
        method: "POST",
        headers: commandHeaders,
        body: JSON.stringify({ publicId, status: "retired" }),
      },
    );
    expect(retire.status).toBe(200);
    expect(await retire.json()).toEqual({ result: "retired" });

    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.status).toBe(410);
    expect(await page.text()).toContain("Este Kardo ya no está activo");

    // A later active/paused command no longer revives a retired Touchpoint.
    const revive = await SELF.fetch(
      "https://resolver.test/internal/availability",
      {
        method: "POST",
        headers: commandHeaders,
        body: JSON.stringify({ publicId, status: "active" }),
      },
    );
    expect(revive.status).toBe(409);
    expect(await revive.json()).toEqual({ result: "retired" });

    const stillRetired = await SELF.fetch(
      `https://resolver.test/t/${publicId}`,
    );
    expect(stillRetired.status).toBe(410);
  });

  it("shows a generic 'suspended' page with 404 that never reveals a suspension, and lifting it restores content", async () => {
    await publishLegacyRedirect(1, "https://example.test/suspend-status-page");

    const suspend = await SELF.fetch(
      "https://resolver.test/internal/suspension",
      {
        method: "POST",
        headers: suspensionHeaders,
        body: JSON.stringify({ publicId, suspended: true }),
      },
    );
    expect(suspend.status).toBe(200);
    expect(await suspend.json()).toEqual({ result: "suspended" });

    const page = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(page.status).toBe(404);
    const html = await page.text();
    expect(html).toContain("Este contenido no está disponible");
    expect(html.toLowerCase()).not.toContain("suspend");

    const unsuspend = await SELF.fetch(
      "https://resolver.test/internal/suspension",
      {
        method: "POST",
        headers: suspensionHeaders,
        body: JSON.stringify({ publicId, suspended: false }),
      },
    );
    expect(unsuspend.status).toBe(200);
    expect(await unsuspend.json()).toEqual({ result: "unsuspended" });
    expect(await resolve()).toMatchObject({
      status: 302,
      location: "https://example.test/suspend-status-page",
    });
  });

  it("keeps /go, /leads, and asset paths on the plain notFound() for retired/suspended Touchpoints (no content leak)", async () => {
    const id = "kardoleaktestnocontent1";
    await publishExperience(
      {
        type: "links",
        title: "Enlaces",
        links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      },
      { id },
    );
    await SELF.fetch("https://resolver.test/internal/availability", {
      method: "POST",
      headers: commandHeaders,
      body: JSON.stringify({ publicId: id, status: "retired" }),
    });

    const go = await SELF.fetch(`https://resolver.test/t/${id}/go/l1`);
    expect(go.status).toBe(404);
    expect(await go.text()).toBe("This Kardo Touchpoint is unavailable.");

    const leads = await SELF.fetch(
      new Request(`https://resolver.test/t/${id}/leads`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": "38",
          "cf-connecting-ip": "203.0.113.30",
        },
        body: "email=lead%40example.test&consent=yes",
      }),
    );
    expect(leads.status).toBe(404);
    expect(await leads.text()).toBe("This Kardo Touchpoint is unavailable.");
  });
});

describe("internal suspension command: POST /internal/suspension", () => {
  it("rejects the customer-facing publish key — it must not lift or set a suspension", async () => {
    const response = await SELF.fetch(
      "https://resolver.test/internal/suspension",
      {
        method: "POST",
        headers: commandHeaders,
        body: JSON.stringify({ publicId, suspended: true }),
      },
    );
    expect(response.status).toBe(401);
  });

  it("rejects a request with no Authorization header", async () => {
    const response = await SELF.fetch(
      "https://resolver.test/internal/suspension",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ publicId, suspended: true }),
      },
    );
    expect(response.status).toBe(401);
  });

  it("accepts the correct, distinct suspension key", async () => {
    const response = await SELF.fetch(
      "https://resolver.test/internal/suspension",
      {
        method: "POST",
        headers: suspensionHeaders,
        body: JSON.stringify({ publicId, suspended: true }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ result: "suspended" });
  });

  it("rejects an invalid body", async () => {
    const response = await SELF.fetch(
      "https://resolver.test/internal/suspension",
      {
        method: "POST",
        headers: suspensionHeaders,
        body: JSON.stringify({ publicId, suspended: "yes" }),
      },
    );
    expect(response.status).toBe(400);
  });

  it("rejects a non-POST request", async () => {
    const response = await SELF.fetch(
      "https://resolver.test/internal/suspension",
      { method: "GET" },
    );
    expect(response.status).toBe(401);
  });

  it("fails closed (via hasSuspensionAuthorization) when no secret is configured on env at all", () => {
    const request = new Request("https://resolver.test/internal/suspension", {
      headers: { authorization: "Bearer anything-at-all" },
    });
    expect(
      hasSuspensionAuthorization(
        request,
        {} as Parameters<typeof hasSuspensionAuthorization>[1],
      ),
    ).toBe(false);
  });

  it("fails closed when the suspension key was misconfigured to equal the customer command key", () => {
    const shared = "the-same-key-configured-twice";
    const request = new Request("https://resolver.test/internal/suspension", {
      headers: { authorization: `Bearer ${shared}` },
    });
    expect(
      hasSuspensionAuthorization(request, {
        SUSPENSION_COMMAND_KEY: shared,
        PUBLISH_COMMAND_KEY: shared,
      } as Parameters<typeof hasSuspensionAuthorization>[1]),
    ).toBe(false);
  });
});

describe("fail closed on missing keys (security review 2026-10)", () => {
  it("never accepts a publish command when PUBLISH_COMMAND_KEY is empty", () => {
    for (const authorization of ["Bearer ", "Bearer undefined", "Bearer x"]) {
      const request = new Request("https://resolver.test/internal/publish", {
        headers: { authorization },
      });
      for (const key of ["", undefined]) {
        expect(
          hasPublishAuthorization(request, {
            PUBLISH_COMMAND_KEY: key,
          } as unknown as Parameters<typeof hasPublishAuthorization>[1]),
        ).toBe(false);
      }
    }
  });

  it("refuses leads in production without Turnstile keys, only there", () => {
    expect(leadTurnstileRefused({ KARDO_ENV: "production" })).toBe(true);
    expect(
      leadTurnstileRefused({
        KARDO_ENV: "production",
        TURNSTILE_SITE_KEY: "site",
      }),
    ).toBe(true);
    expect(
      leadTurnstileRefused({
        KARDO_ENV: "production",
        TURNSTILE_SITE_KEY: "site",
        TURNSTILE_SECRET_KEY: "secret",
      }),
    ).toBe(false);
    expect(leadTurnstileRefused({ KARDO_ENV: "test" })).toBe(false);
  });
});

describe("publicHtmlHeaders: Turnstile CSP relaxation", () => {
  function csp(headers: HeadersInit): string {
    return (headers as Record<string, string>)["content-security-policy"] ?? "";
  }

  it("adds script-src and frame-src for challenges.cloudflare.com only when turnstile is requested", () => {
    const relaxed = csp(
      publicHtmlHeaders({ formAction: "self", turnstile: true }),
    );
    expect(relaxed).toContain("script-src https://challenges.cloudflare.com");
    expect(relaxed).toContain("frame-src https://challenges.cloudflare.com");
  });

  it("keeps the strict default-src 'none' baseline with no Turnstile directives otherwise", () => {
    const strict = csp(publicHtmlHeaders({ formAction: "none" }));
    expect(strict).toContain("default-src 'none'");
    expect(strict).not.toContain("challenges.cloudflare.com");
  });
});

describe("bot/link-preview requests are still served normally, just not counted", () => {
  it("still redirects a request carrying a known bot user agent", async () => {
    await publishLegacyRedirect(1, "https://example.test/bot-still-served");
    const response = await SELF.fetch(`https://resolver.test/t/${publicId}`, {
      redirect: "manual",
      headers: { "user-agent": "curl/8.4.0" },
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      "https://example.test/bot-still-served",
    );
  });

  it("still resolves a tracked click for a HEAD request", async () => {
    await publishExperience({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/destino" }],
    });
    const response = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/l1`,
      { method: "HEAD", redirect: "manual" },
    );
    expect(response.status).toBe(302);
  });
});

describe("lead submissions: honeypot is truly never forwarded", () => {
  it("still returns success even when the intake service would reject the Touchpoint (proves the honeypot never forwards)", async () => {
    await publishExperience(
      {
        type: "form",
        title: "Contáctanos",
        fields: { name: "hidden", phone: "hidden", message: "hidden" },
        submitLabel: "Enviar",
        successMessage: "Gracias por tu mensaje.",
        consentText: "Acepto.",
      },
      { id: "kardodownstreamdown001" },
    );
    const body =
      "email=lead%40example.test&consent=yes&website=http://spam.test";
    const response = await SELF.fetch(
      new Request(`https://resolver.test/t/kardodownstreamdown001/leads`, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          "content-length": String(new TextEncoder().encode(body).byteLength),
          "cf-connecting-ip": "203.0.113.12",
        },
        body,
      }),
    );
    // The mocked LEAD_INTAKE binding returns 503 for this publicId — a 200
    // here proves the honeypot submission never reached it.
    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Gracias por tu mensaje.");
  });
});

describe("linkpage experiences: tracked clicks for links and socials", () => {
  it("resolves a linkpage link id and a social id through the same tracked /go route", async () => {
    await publishExperience({
      type: "linkpage",
      displayName: "Estudio Kardo",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/sitio" }],
      socials: [
        {
          id: "ig",
          network: "instagram",
          value: "https://instagram.com/kardo",
        },
        { id: "mail", network: "email", value: "hola@kardo.test" },
        { id: "tel", network: "phone", value: "+525512345678" },
      ],
    });

    const link = await SELF.fetch(`https://resolver.test/t/${publicId}/go/l1`, {
      redirect: "manual",
    });
    expect(link.status).toBe(302);
    expect(link.headers.get("location")).toBe("https://kardo.test/sitio");

    const instagram = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/ig`,
      { redirect: "manual" },
    );
    expect(instagram.headers.get("location")).toBe(
      "https://instagram.com/kardo",
    );

    const mail = await SELF.fetch(
      `https://resolver.test/t/${publicId}/go/mail`,
      { redirect: "manual" },
    );
    expect(mail.headers.get("location")).toBe("mailto:hola%40kardo.test");

    const tel = await SELF.fetch(`https://resolver.test/t/${publicId}/go/tel`, {
      redirect: "manual",
    });
    expect(tel.headers.get("location")).toBe("tel:+525512345678");
  });

  it("renders the linkpage itself with escaped content and the socials/links markup", async () => {
    await publishExperience({
      type: "linkpage",
      displayName: "Estudio Kardo",
      bio: "Diseño y branding.",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      socials: [
        {
          id: "ig",
          network: "instagram",
          value: "https://instagram.com/kardo",
        },
      ],
    });
    const response = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Estudio Kardo");
    expect(html).toContain("Diseño y branding.");
    expect(html).toContain(`/t/${publicId}/go/l1?src=link`);
    expect(html).toContain(`/t/${publicId}/go/ig?src=link`);
  });
});

describe("theme validation is enforced end to end through /internal/publish", () => {
  it("rejects a publish command whose theme has an invalid color", async () => {
    const response = await publishExperience({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      theme: {
        background: { kind: "solid", color: "not-a-color" },
        surface: "light",
        accent: "#0a6c78",
        buttonStyle: "pill",
        font: "sans",
      },
    });
    expect(response.status).toBe(400);
  });

  it("accepts and renders a valid theme", async () => {
    await publishExperience({
      type: "links",
      title: "Enlaces",
      links: [{ id: "l1", label: "Sitio", url: "https://kardo.test/" }],
      theme: {
        background: { kind: "solid", color: "#112233" },
        surface: "dark",
        accent: "#ff9900",
        buttonStyle: "outline",
        font: "mono",
      },
    });
    const html = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(html).toContain("theme-dark");
    expect(html).toContain("btn-outline");
    expect(html).toContain("font-mono");
  });
});

describe("branded status pages carry the Kardo logo", () => {
  it.each([
    ["unpublished", "kardologotestunpub0001", 404],
    ["paused", publicId, 404],
  ] as const)("shows the Kardo logo on the %s page", async (kind, id) => {
    if (kind === "paused") {
      await publishLegacyRedirect(1, "https://example.test/logo-check");
      await SELF.fetch("https://resolver.test/internal/availability", {
        method: "POST",
        headers: commandHeaders,
        body: JSON.stringify({ publicId: id, status: "paused" }),
      });
    }
    const response = await SELF.fetch(`https://resolver.test/t/${id}`);
    const html = await response.text();
    expect(html).toContain('aria-label="Kardo"');
  });
});

describe("internal alias command: POST /internal/alias", () => {
  const aliasHeaders = commandHeaders;

  it("rejects the request with no authorization and with the wrong key", async () => {
    const noAuth = await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        handle: "cafecentral",
        publicId,
        previousHandle: null,
      }),
    });
    expect(noAuth.status).toBe(401);

    const wrongKey = await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: suspensionHeaders,
      body: JSON.stringify({
        handle: "cafecentral",
        publicId,
        previousHandle: null,
      }),
    });
    expect(wrongKey.status).toBe(401);
  });

  it("rejects a non-POST request", async () => {
    const response = await SELF.fetch("https://resolver.test/internal/alias", {
      method: "GET",
    });
    expect(response.status).toBe(401);
  });

  it.each([
    { handle: "ab", publicId, previousHandle: null }, // too short
    { handle: "Café", publicId, previousHandle: null }, // uppercase/accents
    { handle: "-cafe", publicId, previousHandle: null }, // must start [a-z0-9]
    { handle: "cafe-", publicId, previousHandle: null }, // must end [a-z0-9]
    { handle: "cafecentral", publicId: "short", previousHandle: null }, // bad publicId
    { handle: "cafecentral", publicId, previousHandle: "Bad Handle" }, // bad previousHandle
  ])("rejects an invalid alias command %j", async (body) => {
    const response = await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: aliasHeaders,
      body: JSON.stringify(body),
    });
    expect(response.status).toBe(400);
  });

  it("sets an alias and serves the same content at GET /@{handle} as /t/{publicId}", async () => {
    await publishLegacyRedirect(1, "https://example.test/via-handle");
    const set = await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: aliasHeaders,
      body: JSON.stringify({
        handle: "cafecentral",
        publicId,
        previousHandle: null,
      }),
    });
    expect(set.status).toBe(200);
    expect(await set.json()).toEqual({ result: "ok" });

    const viaHandle = await SELF.fetch("https://resolver.test/@cafecentral", {
      redirect: "manual",
    });
    expect(viaHandle.status).toBe(302);
    expect(viaHandle.headers.get("location")).toBe(
      "https://example.test/via-handle",
    );
  });

  it("respects status pages (paused/retired/suspended) the same way through the handle", async () => {
    await publishLegacyRedirect(1, "https://example.test/handle-status");
    await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: aliasHeaders,
      body: JSON.stringify({
        handle: "statushandle",
        publicId,
        previousHandle: null,
      }),
    });
    await SELF.fetch("https://resolver.test/internal/availability", {
      method: "POST",
      headers: commandHeaders,
      body: JSON.stringify({ publicId, status: "retired" }),
    });
    const response = await SELF.fetch("https://resolver.test/@statushandle");
    expect(response.status).toBe(410);
    expect(await response.text()).toContain("Este Kardo ya no está activo");
  });

  it("returns the branded 'no existe' 404 page for an unregistered handle", async () => {
    const response = await SELF.fetch("https://resolver.test/@neverregistered");
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain("Este enlace no existe");
    expect(html).toContain('aria-label="Kardo"');
    expect(response.headers.get("x-robots-tag")).toBe("noindex");
  });

  it("removes an alias when publicId is null", async () => {
    await publishLegacyRedirect(1, "https://example.test/removable");
    await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: aliasHeaders,
      body: JSON.stringify({
        handle: "removeme",
        publicId,
        previousHandle: null,
      }),
    });
    expect(
      (
        await SELF.fetch("https://resolver.test/@removeme", {
          redirect: "manual",
        })
      ).status,
    ).toBe(302);

    const remove = await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: aliasHeaders,
      body: JSON.stringify({
        handle: "removeme",
        publicId: null,
        previousHandle: null,
      }),
    });
    expect(remove.status).toBe(200);

    const after = await SELF.fetch("https://resolver.test/@removeme");
    expect(after.status).toBe(404);
    expect(await after.text()).toContain("Este enlace no existe");
  });

  it("renaming a handle removes the previous handle only when it still points at the same publicId", async () => {
    await publishLegacyRedirect(1, "https://example.test/renamed");
    await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: aliasHeaders,
      body: JSON.stringify({
        handle: "oldhandle",
        publicId,
        previousHandle: null,
      }),
    });

    const rename = await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: aliasHeaders,
      body: JSON.stringify({
        handle: "newhandle",
        publicId,
        previousHandle: "oldhandle",
      }),
    });
    expect(rename.status).toBe(200);

    expect(
      (
        await SELF.fetch("https://resolver.test/@newhandle", {
          redirect: "manual",
        })
      ).status,
    ).toBe(302);
    // The old handle was cleaned up as part of the rename.
    expect((await SELF.fetch("https://resolver.test/@oldhandle")).status).toBe(
      404,
    );
  });

  it("does not clobber previousHandle when it now points at a different publicId (race protection)", async () => {
    await publishLegacyRedirect(1, "https://example.test/race-a");
    await publishExperience(
      { type: "redirect", destinationUrl: "https://example.test/race-b" },
      { id: "kardoracehandletest0001" },
    );
    // "sharedhandle" now belongs to a *different* Touchpoint than the one
    // being renamed.
    await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: aliasHeaders,
      body: JSON.stringify({
        handle: "sharedhandle",
        publicId: "kardoracehandletest0001",
        previousHandle: null,
      }),
    });
    // Renaming the *first* Touchpoint's own (different) handle claims that
    // "previousHandle" was "sharedhandle" — but sharedhandle no longer points
    // at this Touchpoint's publicId, so it must not be removed.
    await SELF.fetch("https://resolver.test/internal/alias", {
      method: "POST",
      headers: aliasHeaders,
      body: JSON.stringify({
        handle: "brandnewhandle",
        publicId,
        previousHandle: "sharedhandle",
      }),
    });
    const stillThere = await SELF.fetch("https://resolver.test/@sharedhandle", {
      redirect: "manual",
    });
    expect(stillThere.status).toBe(302);
    expect(stillThere.headers.get("location")).toBe(
      "https://example.test/race-b",
    );
  });
});

describe("image asset serving accepts png, jpeg, and webp", () => {
  it.each([
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["image/webp", [0x52, 0x49, 0x46, 0x46]],
  ] as const)(
    "serves a %s asset inline with the correct content-type",
    async (mediaType, bytes) => {
      const hash = "d".repeat(64);
      await env.PUBLISHED_SNAPSHOTS.put(
        `assets/${hash}`,
        new Uint8Array(bytes),
        {
          httpMetadata: { contentType: mediaType },
          customMetadata: { sha256: hash },
        },
      );
      await publishExperience(
        { type: "image", alt: "Foto" },
        { assets: [{ sha256: hash, mediaType }] },
      );
      const response = await SELF.fetch(
        `https://resolver.test/t/${publicId}/assets/${hash}`,
      );
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe(mediaType);
      expect(response.headers.get("content-disposition")).toBe("inline");
    },
  );
});

describe("internal item availability command: POST /internal/item-availability", () => {
  const experienceId = "9f7a4dc0-0bb7-450e-91c6-342045d779e9";
  const validBody = (overrides: Record<string, unknown> = {}) => ({
    experienceId,
    version: 1,
    items: [{ id: "i1", status: "sold_out", quantity: null }],
    ...overrides,
  });

  async function postItemAvailability(
    body: unknown,
    headers: Record<string, string> = commandHeaders,
  ): Promise<Response> {
    return SELF.fetch("https://resolver.test/internal/item-availability", {
      method: "POST",
      headers,
      body: typeof body === "string" ? body : JSON.stringify(body),
    });
  }

  it("rejects the request with no authorization and with the suspension key (it must not work here)", async () => {
    const noAuth = await postItemAvailability(validBody(), {
      "content-type": "application/json",
    });
    expect(noAuth.status).toBe(401);

    const wrongKey = await postItemAvailability(validBody(), suspensionHeaders);
    expect(wrongKey.status).toBe(401);
  });

  it("rejects a non-POST request", async () => {
    const response = await SELF.fetch(
      "https://resolver.test/internal/item-availability",
      { method: "GET" },
    );
    expect(response.status).toBe(401);
  });

  it("rejects a non-JSON body", async () => {
    const response = await postItemAvailability("not json at all");
    expect(response.status).toBe(400);
  });

  it("rejects a body over the 64 KiB limit before it is even parsed", async () => {
    const response = await postItemAvailability("x".repeat(70_000));
    expect(response.status).toBe(400);
  });

  it.each([
    ["bad experienceId", { ...validBody(), experienceId: "not-a-uuid" }],
    ["version 0", { ...validBody(), version: 0 }],
    ["non-integer version", { ...validBody(), version: 1.5 }],
    [
      "too many items",
      {
        ...validBody(),
        items: Array.from({ length: 501 }, (_, index) => ({
          id: `i${index}`,
          status: "available",
          quantity: null,
        })),
      },
    ],
    [
      "invalid status",
      {
        ...validBody(),
        items: [{ id: "i1", status: "closed", quantity: null }],
      },
    ],
    [
      "quantity over the max",
      {
        ...validBody(),
        items: [{ id: "i1", status: "available", quantity: 10_000 }],
      },
    ],
    [
      "duplicate item ids",
      {
        ...validBody(),
        items: [
          { id: "i1", status: "available", quantity: null },
          { id: "i1", status: "hidden", quantity: null },
        ],
      },
    ],
  ])("rejects an invalid body (%s)", async (_label, body) => {
    const response = await postItemAvailability(body);
    expect(response.status).toBe(400);
  });

  it("applies a valid command, then rejects an older-or-equal version as stale", async () => {
    const applied = await postItemAvailability(validBody({ version: 2 }));
    expect(applied.status).toBe(200);
    expect(await applied.json()).toEqual({ result: "applied", version: 2 });

    const sameVersion = await postItemAvailability(validBody({ version: 2 }));
    expect(sameVersion.status).toBe(200);
    expect(await sameVersion.json()).toEqual({ result: "stale", version: 2 });

    const olderVersion = await postItemAvailability(validBody({ version: 1 }));
    expect(olderVersion.status).toBe(200);
    expect(await olderVersion.json()).toEqual({ result: "stale", version: 2 });
  });
});

describe("live item availability overlay applied at render time (no republish needed)", () => {
  it("reflects sold-out and low-stock state on the public page as soon as the overlay is applied", async () => {
    const experienceId = "1f7a4dc0-0bb7-450e-91c6-342045d779e9";
    await publishExperience(
      {
        type: "menu",
        title: "Carta",
        currency: "MXN",
        sections: [
          {
            id: "s1",
            name: "Bebidas",
            items: [
              { id: "i1", name: "Café", price: 45 },
              { id: "i2", name: "Té", price: 30 },
            ],
          },
        ],
      },
      { experienceId },
    );

    const before = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(before).not.toContain('<span class="badge');

    const availability = await SELF.fetch(
      "https://resolver.test/internal/item-availability",
      {
        method: "POST",
        headers: commandHeaders,
        body: JSON.stringify({
          experienceId,
          version: 1,
          items: [
            { id: "i1", status: "sold_out", quantity: null },
            { id: "i2", status: "available", quantity: 2 },
          ],
        }),
      },
    );
    expect(availability.status).toBe(200);

    const after = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(after).toContain('<li class="menu-item is-sold-out">');
    expect(after).toContain(
      '<span class="badge badge-sold-out">Agotado</span>',
    );
    expect(after).toContain('<span class="badge badge-low">Quedan 2</span>');

    // "Todo disponible": the Customer API sends only non-default entries, so
    // clearing everything arrives as an empty list with a newer version.
    const cleared = await SELF.fetch(
      "https://resolver.test/internal/item-availability",
      {
        method: "POST",
        headers: commandHeaders,
        body: JSON.stringify({ experienceId, version: 2, items: [] }),
      },
    );
    expect(cleared.status).toBe(200);
    expect(await cleared.json()).toEqual({ result: "applied", version: 2 });
    const restored = await (
      await SELF.fetch(`https://resolver.test/t/${publicId}`)
    ).text();
    expect(restored).not.toContain('<span class="badge');
    expect(restored).toContain("Café");

    // A late delivery of the older state never overwrites the newer one.
    const late = await SELF.fetch(
      "https://resolver.test/internal/item-availability",
      {
        method: "POST",
        headers: commandHeaders,
        body: JSON.stringify({
          experienceId,
          version: 1,
          items: [{ id: "i1", status: "hidden", quantity: null }],
        }),
      },
    );
    expect(await late.json()).toEqual({ result: "stale", version: 2 });
    expect(
      await (await SELF.fetch(`https://resolver.test/t/${publicId}`)).text(),
    ).toContain("Café");
  });

  it("fails open and renders normally when the snapshot carries no experienceId at all (old snapshots)", async () => {
    await publishExperience({
      type: "menu",
      title: "Carta",
      currency: "MXN",
      sections: [
        { id: "s1", name: "Bebidas", items: [{ id: "i1", name: "Café" }] },
      ],
    });
    const response = await SELF.fetch(`https://resolver.test/t/${publicId}`);
    expect(response.status).toBe(200);
    const html = await response.text();
    expect(html).toContain("Café");
    expect(html).not.toContain('<span class="badge');
  });

  it("never applies the overlay to a tracked /go redirect (menu/catalog carry no go targets anyway, but this pins the boundary)", async () => {
    const experienceId = "2f7a4dc0-0bb7-450e-91c6-342045d779e9";
    await publishExperience(
      {
        type: "catalog",
        title: "Productos",
        currency: "MXN",
        items: [
          {
            id: "p1",
            name: "Vela",
            price: 199,
            url: "https://kardo.test/vela",
          },
        ],
      },
      { experienceId },
    );
    await SELF.fetch("https://resolver.test/internal/item-availability", {
      method: "POST",
      headers: commandHeaders,
      body: JSON.stringify({
        experienceId,
        version: 1,
        items: [{ id: "p1", status: "sold_out", quantity: null }],
      }),
    });
    // A sold-out item still resolves its tracked click — availability only
    // affects what the public page *shows*, never the go redirect itself.
    const go = await SELF.fetch(`https://resolver.test/t/${publicId}/go/p1`, {
      redirect: "manual",
    });
    expect(go.status).toBe(302);
    expect(go.headers.get("location")).toBe("https://kardo.test/vela");
  });
});
