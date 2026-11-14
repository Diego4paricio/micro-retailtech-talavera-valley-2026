// Public build configuration of the Kardo Website (ADR 010). The site is a
// static export: these values are compiled into the pages, so only this
// allowlist ever reaches them — never spread `process.env` into Next's `env`.
// Secrets have no place here; the Website holds no credentials at all.

const environments = new Set(["development", "test", "production"]);

/** Local stack from the root README (panel on 5175, website on 5177). */
const developmentDefaults = {
  PUBLIC_WEBSITE_URL: "http://localhost:5177",
  PUBLIC_CUSTOMER_APP_URL: "http://localhost:5175",
};

/**
 * Sales go through WhatsApp, like glowel.com.mx. Kardo is a Glowel product,
 * so Glowel's public number is the default until Kardo has its own.
 */
const defaultWhatsapp = "522224944012";

const emailPattern = /^[^\s@<>()"',;:]+@[^\s@<>()"',;:]+\.[a-z]{2,}$/i;

/**
 * Validates and normalizes the public configuration. Production builds fail
 * on a missing or non-HTTPS origin instead of shipping localhost links.
 *
 * @param {Record<string, string | undefined>} source
 * @returns {{ environment: "development" | "test" | "production", websiteUrl: string, customerAppUrl: string, contactEmail: string | null, whatsapp: string }}
 */
export function readSiteEnv(source) {
  const environment = source.KARDO_ENV?.trim() || "development";
  if (!environments.has(environment)) {
    throw new Error(`KARDO_ENV desconocido: "${environment}".`);
  }
  const production = environment === "production";
  const websiteUrl = readOrigin(source, "PUBLIC_WEBSITE_URL", production);
  const customerAppUrl = readOrigin(
    source,
    "PUBLIC_CUSTOMER_APP_URL",
    production,
  );
  // Separate surfaces: the Website never shares an origin (or cookies) with
  // the Customer App.
  if (websiteUrl === customerAppUrl) {
    throw new Error(
      "PUBLIC_WEBSITE_URL y PUBLIC_CUSTOMER_APP_URL deben ser orígenes distintos.",
    );
  }
  const contactEmail = source.PUBLIC_CONTACT_EMAIL?.trim() || null;
  if (contactEmail && !emailPattern.test(contactEmail)) {
    throw new Error("PUBLIC_CONTACT_EMAIL no es un correo válido.");
  }
  // wa.me wants the full number with country code and no symbols.
  const whatsapp = (source.PUBLIC_WHATSAPP?.trim() || defaultWhatsapp).replace(
    /[\s+()-]/g,
    "",
  );
  if (!/^\d{10,15}$/.test(whatsapp)) {
    throw new Error(
      "PUBLIC_WHATSAPP debe ser un número con lada de país (p. ej. 5215512345678).",
    );
  }
  return {
    environment: /** @type {"development" | "test" | "production"} */ (
      environment
    ),
    websiteUrl,
    customerAppUrl,
    contactEmail,
    whatsapp,
  };
}

/**
 * @param {Record<string, string | undefined>} source
 * @param {"PUBLIC_WEBSITE_URL" | "PUBLIC_CUSTOMER_APP_URL"} name
 * @param {boolean} production
 */
function readOrigin(source, name, production) {
  const raw =
    source[name]?.trim() || (production ? "" : developmentDefaults[name]);
  if (!raw) throw new Error(`${name} es obligatorio en producción.`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${name} debe ser una URL completa (https://…).`);
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error(`${name} debe usar https.`);
  }
  if (production && url.protocol !== "https:") {
    throw new Error(`${name} debe usar https en producción.`);
  }
  if (url.username || url.password) {
    throw new Error(`${name} no puede incluir credenciales.`);
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error(`${name} debe ser solo un origen, sin ruta ni parámetros.`);
  }
  return url.origin;
}
