import { describe, expect, it } from "vitest";
import { readSiteEnv } from "../config/site-env.mjs";

const production = {
  KARDO_ENV: "production",
  PUBLIC_WEBSITE_URL: "https://kardo.example.com",
  PUBLIC_CUSTOMER_APP_URL: "https://app.kardo.example.com",
};

describe("readSiteEnv", () => {
  it("uses the local stack in development", () => {
    expect(readSiteEnv({})).toEqual({
      environment: "development",
      websiteUrl: "http://localhost:5177",
      customerAppUrl: "http://localhost:5175",
      contactEmail: null,
      whatsapp: "522224944012",
    });
  });

  it("normalizes the sales WhatsApp and rejects anything else", () => {
    expect(
      readSiteEnv({ PUBLIC_WHATSAPP: "+52 (55) 1234-5678" }).whatsapp,
    ).toBe("525512345678");
    // An empty line copied from the env example means "not set".
    expect(readSiteEnv({ PUBLIC_WHATSAPP: " " }).whatsapp).toBe("522224944012");
    expect(() => readSiteEnv({ PUBLIC_WHATSAPP: "hola" })).toThrow(
      /PUBLIC_WHATSAPP/,
    );
    expect(() => readSiteEnv({ PUBLIC_WHATSAPP: "123" })).toThrow(
      /PUBLIC_WHATSAPP/,
    );
  });

  it("normalizes production origins", () => {
    const env = readSiteEnv({
      ...production,
      PUBLIC_WEBSITE_URL: " https://kardo.example.com/ ",
      PUBLIC_CONTACT_EMAIL: "hola@kardo.example.com",
    });
    expect(env.websiteUrl).toBe("https://kardo.example.com");
    expect(env.contactEmail).toBe("hola@kardo.example.com");
  });

  it("refuses a production build without the panel URL", () => {
    expect(() =>
      readSiteEnv({ ...production, PUBLIC_CUSTOMER_APP_URL: "" }),
    ).toThrow(/PUBLIC_CUSTOMER_APP_URL es obligatorio/);
  });

  it("requires HTTPS in production", () => {
    expect(() =>
      readSiteEnv({
        ...production,
        PUBLIC_CUSTOMER_APP_URL: "http://app.kardo.example.com",
      }),
    ).toThrow(/https en producción/);
  });

  it("keeps the Website and the panel on different origins", () => {
    expect(() =>
      readSiteEnv({
        ...production,
        PUBLIC_CUSTOMER_APP_URL: production.PUBLIC_WEBSITE_URL,
      }),
    ).toThrow(/orígenes distintos/);
  });

  it.each([
    ["una ruta", "https://app.kardo.example.com/panel"],
    ["parámetros", "https://app.kardo.example.com/?next=/"],
    ["credenciales", "https://user:secret@app.kardo.example.com"],
    ["otro protocolo", "javascript:alert(1)"],
  ])("rejects an origin with %s", (_label, value) => {
    expect(() =>
      readSiteEnv({ ...production, PUBLIC_CUSTOMER_APP_URL: value }),
    ).toThrow();
  });

  it("rejects unknown environments and malformed contact emails", () => {
    expect(() => readSiteEnv({ KARDO_ENV: "staging" })).toThrow(/KARDO_ENV/);
    expect(() =>
      readSiteEnv({ PUBLIC_CONTACT_EMAIL: "hola<script>@x.mx" }),
    ).toThrow(/correo válido/);
  });
});
