import { reset, SELF } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";
import { siteTarget } from "../src/index.js";

// Links, phase 3b (relevo 34): kardo.com.mx/<negocio> and
// kardo.com.mx/<negocio>/<link>, from the state the Customer API sends.

const commandHeaders = {
  authorization: "Bearer resolver-test-command",
  "content-type": "application/json",
};
const servicios = "kardobusinessservicios1";
const promo = "kardobusinesspromo00001";

afterEach(async () => reset());

async function publishRedirect(id: string, destinationUrl: string) {
  const response = await SELF.fetch("https://resolver.test/internal/publish", {
    method: "POST",
    headers: commandHeaders,
    body: JSON.stringify({ publicId: id, revision: 1, destinationUrl }),
  });
  expect(response.status).toBe(200);
}

async function sendBusiness(body: unknown, headers = commandHeaders) {
  return SELF.fetch("https://resolver.test/internal/business", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

const brillo = {
  slug: "estetica-brillo",
  previousSlugs: ["brillo"],
  mainPublicId: servicios,
  links: [
    { slug: "servicios", publicId: servicios },
    { slug: "promo", publicId: promo },
  ],
  linkRedirects: [{ from: "lista", to: "servicios" }],
};

async function get(path: string) {
  const response = await SELF.fetch(`https://resolver.test${path}`, {
    redirect: "manual",
  });
  return {
    status: response.status,
    location: response.headers.get("location"),
    text: await response.text(),
  };
}

describe("business addresses (Links, phase 3b)", () => {
  it("serves the main link at /<negocio> and each link at /<negocio>/<link>", async () => {
    await publishRedirect(servicios, "https://example.test/servicios");
    await publishRedirect(promo, "https://example.test/promo");
    const applied = await sendBusiness(brillo);
    expect(applied.status).toBe(200);
    expect(await applied.json()).toEqual({ result: "ok" });

    expect(await get("/estetica-brillo")).toMatchObject({
      status: 302,
      location: "https://example.test/servicios",
    });
    expect(await get("/estetica-brillo/promo")).toMatchObject({
      status: 302,
      location: "https://example.test/promo",
    });
  });

  it("leads former addresses, other spellings and capitals to the exact one", async () => {
    await sendBusiness(brillo);
    expect(await get("/brillo/promo")).toMatchObject({
      status: 302,
      location: "/estetica-brillo/promo",
    });
    expect(await get("/esteticabrillo")).toMatchObject({
      status: 302,
      location: "/estetica-brillo",
    });
    expect(await get("/Estetica-Brillo/Promo/")).toMatchObject({
      status: 302,
      location: "/estetica-brillo/promo",
    });
    expect(await get("/estetica-brillo/lista?src=qr")).toMatchObject({
      status: 302,
      location: "/estetica-brillo/servicios?src=qr",
    });
  });

  it("says when the business, the link or the main link does not exist", async () => {
    expect((await get("/nadie-aqui")).status).toBe(404);
    expect((await get("/nadie-aqui")).text).toContain(
      "Esta dirección no existe",
    );
    await sendBusiness({ ...brillo, mainPublicId: null });
    const noMain = await get("/estetica-brillo");
    expect(noMain.status).toBe(404);
    expect(noMain.text).toContain("todavía no está lista");
    const noLink = await get("/estetica-brillo/inexistente");
    expect(noLink.status).toBe(404);
    expect(noLink.text).toContain("Este link no existe");
  });

  it("drops a link that is no longer sent (retired)", async () => {
    await publishRedirect(promo, "https://example.test/promo");
    await sendBusiness(brillo);
    await sendBusiness({
      ...brillo,
      links: brillo.links.filter((link) => link.slug !== "promo"),
    });
    expect((await get("/estetica-brillo/promo")).status).toBe(404);
  });

  it("keeps the site's words and the Resolver's own routes out of business lookups", async () => {
    expect((await get("/precios")).status).toBe(404);
    expect((await get("/health")).status).toBe(200);
    expect((await get("/")).status).toBe(404);
  });

  it("only takes the command with the publish key and a valid body", async () => {
    expect(
      (
        await sendBusiness(brillo, {
          authorization: "Bearer wrong",
          "content-type": "application/json",
        })
      ).status,
    ).toBe(401);
    expect(
      (await sendBusiness({ ...brillo, slug: "Con Espacios" })).status,
    ).toBe(400);
    expect((await sendBusiness({ ...brillo, mainPublicId: "no" })).status).toBe(
      400,
    );
    expect(
      (
        await sendBusiness({
          ...brillo,
          links: [{ slug: "promo", publicId: "x" }],
        })
      ).status,
    ).toBe(400);
  });
});

describe("the website behind kardo.com.mx", () => {
  const site = "https://kardo-site.pages.dev";
  const at = (path: string) =>
    siteTarget(new URL(path, "https://kardo.com.mx"), site);

  it("keeps every path on the website's own origin", () => {
    expect(at("/precios?plan=negocio")?.href).toBe(
      "https://kardo-site.pages.dev/precios?plan=negocio",
    );
    for (const path of [
      "//evil.example/x",
      "/\\evil.example/x",
      "/%2F%2Fevil.example/x",
    ]) {
      expect(at(path)?.origin).toBe("https://kardo-site.pages.dev");
    }
  });

  it("does nothing without a safe website origin", () => {
    expect(siteTarget(new URL("https://kardo.com.mx/"), undefined)).toBeNull();
    expect(
      siteTarget(new URL("https://kardo.com.mx/"), "http://site.test"),
    ).toBeNull();
    expect(siteTarget(new URL("https://kardo.com.mx/"), "nada")).toBeNull();
  });
});
