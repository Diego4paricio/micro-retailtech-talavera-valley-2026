import { reset, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { hasBillingPauseAuthorization } from "../src/index.js";

const publicId = "kardotesttouchpoint01";
const other = "kardotesttouchpoint02";
const json = { "content-type": "application/json" };
const billingHeaders = {
  ...json,
  authorization: "Bearer resolver-test-billing",
};
const publishHeaders = {
  ...json,
  authorization: "Bearer resolver-test-command",
};
const suspensionHeaders = {
  ...json,
  authorization: "Bearer resolver-test-suspension",
};

afterEach(async () => reset());

function post(
  path: string,
  headers: Record<string, string>,
  body: unknown,
): Promise<Response> {
  return SELF.fetch(`https://resolver.test${path}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}
const pause = (paused: boolean, ids: string[] = [publicId]) =>
  post("/internal/billing-pause", billingHeaders, { publicIds: ids, paused });
const suspend = (suspended: boolean) =>
  post("/internal/suspension", suspensionHeaders, { publicId, suspended });

async function publish(id = publicId): Promise<void> {
  const r = await post("/internal/publish", publishHeaders, {
    publicId: id,
    revision: 1,
    destinationUrl: "https://example.test/billing",
  });
  expect(r.status).toBe(200);
}

async function publishForm(id = publicId): Promise<void> {
  const r = await post("/internal/publish", publishHeaders, {
    publicId: id,
    revision: 1,
    experience: {
      type: "form",
      title: "Contacto",
      submitLabel: "Enviar",
      successMessage: "Gracias",
      fields: { name: "hidden", phone: "hidden", message: "hidden" },
      consentText: "Acepto.",
    },
  });
  expect(r.status).toBe(200);
}

const get = (path = `/t/${publicId}`) =>
  SELF.fetch(`https://resolver.test${path}`, { redirect: "manual" });

describe("POST /internal/billing-pause: authorization", () => {
  it("rejects no key, the publish key and the suspension key", async () => {
    const body = { publicIds: [publicId], paused: true };
    expect((await post("/internal/billing-pause", json, body)).status).toBe(
      401,
    );
    expect(
      (await post("/internal/billing-pause", publishHeaders, body)).status,
    ).toBe(401);
    expect(
      (await post("/internal/billing-pause", suspensionHeaders, body)).status,
    ).toBe(401);
    const get401 = await SELF.fetch(
      "https://resolver.test/internal/billing-pause",
    );
    expect(get401.status).toBe(401);
  });

  it("accepts the billing key and reports the result", async () => {
    const r = await pause(true);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ result: "paused", count: 1 });
    const back = await pause(false);
    expect(await back.json()).toEqual({ result: "resumed", count: 1 });
  });

  it("does not accept the billing key on /internal/suspension", async () => {
    const r = await post("/internal/suspension", billingHeaders, {
      publicId,
      suspended: true,
    });
    expect(r.status).toBe(401);
  });

  it("fails closed with no secret or a secret equal to another", () => {
    const request = new Request(
      "https://resolver.test/internal/billing-pause",
      {
        headers: { authorization: "Bearer same" },
      },
    );
    type E = Parameters<typeof hasBillingPauseAuthorization>[1];
    expect(hasBillingPauseAuthorization(request, {} as E)).toBe(false);
    expect(
      hasBillingPauseAuthorization(request, {
        BILLING_COMMAND_KEY: "same",
        PUBLISH_COMMAND_KEY: "same",
      } as E),
    ).toBe(false);
    expect(
      hasBillingPauseAuthorization(request, {
        BILLING_COMMAND_KEY: "same",
        PUBLISH_COMMAND_KEY: "x",
        SUSPENSION_COMMAND_KEY: "same",
      } as E),
    ).toBe(false);
    expect(
      hasBillingPauseAuthorization(request, {
        BILLING_COMMAND_KEY: "same",
        PUBLISH_COMMAND_KEY: "x",
        SUSPENSION_COMMAND_KEY: "y",
      } as E),
    ).toBe(true);
  });
});

describe("POST /internal/billing-pause: validation", () => {
  const many = Array.from(
    { length: 101 },
    (_, i) => `kardobulktouchpt${String(i).padStart(5, "0")}`,
  );
  it.each([
    ["empty list", { publicIds: [], paused: true }],
    ["more than 100 ids", { publicIds: many, paused: true }],
    ["invalid id", { publicIds: [publicId, "short"], paused: true }],
    ["non-string id", { publicIds: [42], paused: true }],
    ["duplicates", { publicIds: [publicId, publicId], paused: true }],
    ["non-boolean paused", { publicIds: [publicId], paused: "yes" }],
    ["missing publicIds", { paused: true }],
    ["publicIds not an array", { publicIds: publicId, paused: true }],
  ])("rejects %s", async (_name, body) => {
    const r = await post("/internal/billing-pause", billingHeaders, body);
    expect(r.status).toBe(400);
    expect(await r.text()).toBe("Invalid billing pause command");
  });

  it("rejects malformed JSON and accepts exactly 100 ids", async () => {
    const bad = await SELF.fetch(
      "https://resolver.test/internal/billing-pause",
      {
        method: "POST",
        headers: billingHeaders,
        body: "{nope",
      },
    );
    expect(bad.status).toBe(400);
    const ok = await pause(true, many.slice(0, 100));
    expect(await ok.json()).toEqual({ result: "paused", count: 100 });
  });
});

describe("billing pause: public behavior", () => {
  it("serves a neutral page at /t/{publicId} and /@{handle}, then resumes", async () => {
    await publish();
    await post("/internal/alias", publishHeaders, {
      handle: "billinghandle",
      publicId,
      previousHandle: null,
    });
    await pause(true);

    for (const path of [`/t/${publicId}`, "/@billinghandle"]) {
      const r = await get(path);
      expect(r.status).toBe(404);
      expect(r.headers.get("x-robots-tag")).toBe("noindex");
      const html = await r.text();
      expect(html).toContain("Esta página no está disponible por ahora");
      expect(html).toContain("Vuelve a intentarlo más tarde.");
      for (const word of ["pago", "plan", "cobro", "suscrip"]) {
        expect(html.toLowerCase()).not.toContain(word);
      }
    }

    await pause(false);
    const back = await get();
    expect(back.status).toBe(302);
    expect(back.headers.get("location")).toBe("https://example.test/billing");
    expect((await get("/@billinghandle")).status).toBe(302);
  });

  it("only affects the listed Touchpoints", async () => {
    await publish();
    await publish(other);
    await pause(true);
    expect((await get(`/t/${other}`)).status).toBe(302);
  });

  it("rejects leads and /go clicks like a suspended Touchpoint (no intake, no click)", async () => {
    await publishForm();
    await pause(true);
    const lead = await SELF.fetch(`https://resolver.test/t/${publicId}/leads`, {
      method: "POST",
      headers: {
        "content-type": "application/x-www-form-urlencoded",
        "content-length": "38",
        "cf-connecting-ip": "203.0.113.31",
      },
      body: "email=lead%40example.test&consent=yes",
    });
    expect(lead.status).toBe(404);
    expect(await lead.text()).toBe("This Kardo Touchpoint is unavailable.");

    const go = await SELF.fetch(`https://resolver.test/t/${publicId}/go/l1`);
    expect(go.status).toBe(404);
    expect(await go.text()).toBe("This Kardo Touchpoint is unavailable.");
  });
});

describe("billing pause vs staff suspension: independent", () => {
  it("suspension wins when both are set", async () => {
    await publish();
    await pause(true);
    await suspend(true);
    const html = await (await get()).text();
    expect(html).toContain("Este contenido no está disponible");
    expect(html).not.toContain("Esta página no está disponible por ahora");
  });

  it("lifting the billing pause does not lift the suspension", async () => {
    await publish();
    await pause(true);
    await suspend(true);
    await pause(false);
    const html = await (await get()).text();
    expect(html).toContain("Este contenido no está disponible");
    await suspend(false);
    expect((await get()).status).toBe(302);
  });

  it("lifting the suspension does not lift the billing pause", async () => {
    await publish();
    await pause(true);
    await suspend(true);
    await suspend(false);
    const r = await get();
    expect(r.status).toBe(404);
    expect(await r.text()).toContain(
      "Esta página no está disponible por ahora",
    );
    await pause(false);
    expect((await get()).status).toBe(302);
  });

  it("the billing pause outranks a customer pause, and retired outranks the billing pause", async () => {
    await publish();
    await post("/internal/availability", publishHeaders, {
      publicId,
      status: "paused",
    });
    await pause(true);
    expect(await (await get()).text()).toContain(
      "Esta página no está disponible por ahora",
    );
    await post("/internal/availability", publishHeaders, {
      publicId,
      status: "retired",
    });
    const r = await get();
    expect(r.status).toBe(410);
  });
});
