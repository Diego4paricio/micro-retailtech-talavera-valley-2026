import { reset, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

// Kardo pieces (ADR 026): an address born in Operations (`kp_` + 20) that
// nobody activated yet shows a neutral page, never an error.
const piece = "kp_Ab3dEf6hIj9kLm2nOp4q";
const otherPiece = "kp_Zz9yXw8vUt7sRq6pOn5m";
const panelTouchpoint = "0f3c2d1e4b5a69788796a5b4c3d2e1f0";
const json = { "content-type": "application/json" };
const publishHeaders = {
  ...json,
  authorization: "Bearer resolver-test-command",
};
const billingHeaders = {
  ...json,
  authorization: "Bearer resolver-test-billing",
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
const claim = (ids: string[], claimed = true, headers = publishHeaders) =>
  post("/internal/pieces", headers, { publicIds: ids, claimed });
const get = (id = piece, query = "") =>
  SELF.fetch(`https://resolver.test/t/${id}${query}`, { redirect: "manual" });

async function publish(id: string): Promise<void> {
  const response = await post("/internal/publish", publishHeaders, {
    publicId: id,
    revision: 1,
    destinationUrl: "https://example.test/pieza",
  });
  expect(response.status).toBe(200);
}

describe("a Kardo piece before its activation", () => {
  it("answers a neutral page on both channels, with no index", async () => {
    for (const query of ["?src=nfc", "?src=qr", ""]) {
      const response = await get(piece, query);
      expect(response.status).toBe(404);
      expect(response.headers.get("x-robots-tag")).toContain("noindex");
      const html = await response.text();
      expect(html).toContain("Esta pieza aún no está activada");
      expect(html).toContain("código de activación");
    }
  });

  it("never serves content, even if a page was published before activation", async () => {
    await publish(piece);
    const response = await get(piece, "?src=qr");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Esta pieza aún no está activada");
  });

  it("serves like any Touchpoint once activated", async () => {
    expect((await claim([piece])).status).toBe(200);
    const empty = await get(piece);
    expect(empty.status).toBe(404);
    expect(await empty.text()).toContain("Este Kardo aún no tiene contenido");
    await publish(piece);
    const live = await get(piece, "?src=nfc");
    expect(live.status).toBe(302);
    expect(live.headers.get("location")).toBe("https://example.test/pieza");
    // The other piece of the order is still not activated.
    expect(await (await get(otherPiece)).text()).toContain(
      "Esta pieza aún no está activada",
    );
  });

  it("lets retirement and a staff suspension win over «not activated»", async () => {
    await post("/internal/suspension", suspensionHeaders, {
      publicId: piece,
      suspended: true,
    });
    expect(await (await get(piece)).text()).toContain(
      "Este contenido no está disponible",
    );
    await post("/internal/availability", publishHeaders, {
      publicId: otherPiece,
      status: "retired",
    });
    expect((await get(otherPiece)).status).toBe(410);
  });

  it("leaves the panel's own Touchpoints exactly as before", async () => {
    const response = await get(panelTouchpoint);
    expect(response.status).toBe(404);
    expect(await response.text()).toContain(
      "Este Kardo aún no tiene contenido",
    );
  });
});

describe("POST /internal/pieces", () => {
  it("only takes the publish key", async () => {
    expect((await claim([piece], true, json)).status).toBe(401);
    expect((await claim([piece], true, billingHeaders)).status).toBe(401);
    expect((await claim([piece], true, suspensionHeaders)).status).toBe(401);
    const response = await claim([piece, otherPiece]);
    expect(await response.json()).toEqual({ result: "claimed", count: 2 });
  });

  it("refuses addresses that are not pieces, repeats and empty lists", async () => {
    expect((await claim([panelTouchpoint])).status).toBe(400);
    expect((await claim([piece, piece])).status).toBe(400);
    expect((await claim([])).status).toBe(400);
    expect(
      (await post("/internal/pieces", publishHeaders, { publicIds: [piece] }))
        .status,
    ).toBe(400);
  });

  it("can take an activation back", async () => {
    await claim([piece]);
    await claim([piece], false);
    expect(await (await get(piece)).text()).toContain(
      "Esta pieza aún no está activada",
    );
  });
});
