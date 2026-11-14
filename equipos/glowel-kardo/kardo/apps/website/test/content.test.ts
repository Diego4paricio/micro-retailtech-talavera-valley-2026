import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as landing from "@/content/landing";
import { loadKits } from "@/lib/kits";

// Guards for what the owner asked of this landing (2026-09-28): copy that
// does not read as written by AI (no dashes, no "·", no stock phrases), the
// platform first, and no promise of something outside the MVP
// (Docs/engineering/11-customer-mvp-capabilities.md).

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const src = path.join(root, "src");

function files(dir: string, pattern: RegExp): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return files(full, pattern);
    return pattern.test(entry.name) ? [full] : [];
  });
}

/** Visible text only: comments are for developers. */
function withoutComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

// The legal pages (built from Docs/legal) must name subscriptions, trials
// and a contact email; these guards cover the marketing copy only.
const legalSources = /(^|\/)(lib\/legal[^/]*\.ts|components\/legal\/)/;

const sources = files(src, /\.(ts|tsx)$/)
  .filter((file) => !legalSources.test(path.relative(src, file)))
  .map((file) => ({
    file: path.relative(root, file),
    text: withoutComments(fs.readFileSync(file, "utf8")),
  }));

// The pricing page (built from the billing catalog, ADR 020) must name the
// trial, the plans and their prices; every other guard still applies to it.
const pricingSources =
  /^src\/(lib\/pricing\.ts|components\/pricing\/|app\/precios\/)/;

function hits(pattern: RegExp, { billing = false } = {}): string[] {
  return sources
    .filter(({ file }) => !(billing && pricingSources.test(file)))
    .filter(({ text }) => pattern.test(text))
    .map(({ file }) => file);
}

describe("copy", () => {
  it("uses no em or en dashes", () => {
    expect(hits(/[–—]/)).toEqual([]);
  });

  it("joins nothing with a middle dot", () => {
    expect(hits(/·/)).toEqual([]);
  });

  // Kardo sells its own pieces since ADR 025 (Stand, Card, Magnet, Sticker),
  // so "pieza Kardo" is allowed; the guard of ADR 012 was removed on purpose.

  it.each([
    /siguiente nivel/i,
    /revoluci[oó]n/i,
    /soluci[oó]n integral/i,
    /todo en uno/i,
    /sin complicaciones/i,
    /potencia tu/i,
    /impulsa tus/i,
    /ecosistema/i,
    /transforma tu/i,
    /descubre/i,
    /experiencia/i,
    /\bIA\b/,
    /inteligencia artificial/i,
    /\b(unlock|seamless|elevate|empower|game.?changer)\b/i,
    /✨/u,
    /visitas reales/i,
    /sin interrupciones/i,
    /se distribuye en el borde/i,
    /personas [uú]nicas/i,
    // Words from the hardware plan that read as AI or promise too much
    // (Docs/PLAN_REDISENO_SITIO_Y_PIEZAS.md §6).
    /phygital/i,
    /caballo de troya/i,
    /premium/i,
    /de alta gama/i,
    /en 1 segundo/i,
    /al instante/i,
    /kardo cloud/i,
    /kardo portal/i,
  ])("has no stock phrase %s", (pattern) => {
    // A provenance disclosure is not a marketing claim about AI features.
    const marketing = sources.filter(({ text }) =>
      pattern.test(
        text.replace(
          /Escenas? ilustrativas? generadas? con inteligencia artificial\.?/g,
          "",
        ),
      ),
    );
    expect(marketing.map(({ file }) => file)).toEqual([]);
  });

  // Not built yet (Docs/engineering/12-claude-code-handoff.md).
  it.each([
    /vcard/i,
    /guarda(r)? (el |tu )?contacto/i,
    /\bCRM\b/,
    /app m[oó]vil/i,
    /descarga (la|nuestra) app/i,
    /dominio propio/i,
    /copia por correo/i,
    // Not an Experience: only a link through a Redirect.
    /agenda en l[ií]nea/i,
    // Kits are ordered by WhatsApp (ADR 025), but there is no store: no
    // shipping promise in the code (the approved delivery sentence lives in
    // kits-catalog.json) and no online purchase of pieces.
    /\benv[ií]os?\b/i,
    /compra (tu|tus) (placa|tarjeta|etiqueta|pieza)/i,
    // Availability (ADR 017) is set by hand: no orders, no stock deduction.
    /descuent[ao]s? (autom[aá]tic|de (existencias|inventario))/i,
    /control de inventario/i,
    /pedidos en l[ií]nea/i,
    // Businesses are shown only with what Kardo does (checked with the
    // panel session, 2026-09-28): no bookings or appointments, orders or
    // delivery, payments or tips at the table, tickets or access control,
    // loyalty points, hotel check-in or room service, medical data.
    /\breserva(s|r)?\b|\bcitas?\b|\bagendar\b/i,
    /\bpedidos?\b|\bp[ií]del[oa]s?\b|\bdelivery\b|a domicilio/i,
    /\bpropinas?\b|paga(r|s)? (la|tu) cuenta|pagos? en l[ií]nea/i,
    /\bboletos?\b|control de acceso/i,
    /lealtad|acumula(r|s)? puntos|\brecompensas?\b/i,
    /check.?in|servicio a la habitaci[oó]n/i,
    /expediente|historial (m[eé]dico|cl[ií]nico)|s[ií]ntomas|diagn[oó]stico|datos m[eé]dicos/i,
    // The Estudio de Experiences (ADR 018), labeled "Estudio de diseño" in
    // the panel, is not deployed yet. The Estudio QR is real and stays
    // allowed, and so does the "Diseño" tab, which edits the theme.
    /estudio de (experiences|p[aá]ginas|dise[nñ]o)|dise[nñ]o libre|\bbloques\b/i,
  ])("promises nothing outside the MVP: %s", (pattern) => {
    expect(hits(pattern)).toEqual([]);
  });

  // Plans, trial and general prices live on /precios/ (ADR 020).
  // The home page is allowed to show the approved starting price offer: "$199 al mes".
  it.each([
    /\bgratis\b/i,
    /prueba gratuita/i,
    /pagas una vez/i,
    /mensualidad/i,
    /suscripci[oó]n/i,
  ])("talks billing only on the pricing page: %s", (pattern) => {
    // The closing section is allowed to mention the 15-day trial requested by the owner.
    const billingHits = hits(pattern, { billing: true }).filter(
      (file) =>
        !(
          file === "src/content/landing.ts" &&
          /prueba gratuita/i.test(pattern.source)
        ),
    );
    expect(billingHits).toEqual([]);
  });

  it("only quotes the approved starting price of $199 al mes outside pricing", () => {
    const priceHits = hits(/\$\s?\d+\s?(al|por) mes/i, { billing: true });
    for (const file of priceHits) {
      const text = sources.find((s) => s.file === file)?.text ?? "";
      const matches = text.match(/\$\s?\d+\s?(al|por) mes/gi) ?? [];
      for (const m of matches) {
        expect(m.toLowerCase()).toMatch(/\$199\s?al mes/);
      }
    }
  });

  // Kit prices come only from kits-catalog.json (ADR 025).
  it("writes no kit price by hand", () => {
    const kitSources =
      /^src\/(lib\/kits\.ts|components\/sections\/Kits\.tsx|app\/piezas\/|content\/pieces\.ts)/;
    expect(
      sources
        .filter(({ file }) => kitSources.test(file))
        .filter(({ text }) => /\$\s?\d/.test(text))
        .map(({ file }) => file),
    ).toEqual([]);
  });

  it("writes no price by hand on the pricing page", () => {
    expect(
      sources
        .filter(({ file }) => pricingSources.test(file))
        .filter(({ text }) => /\$\s?\d/.test(text))
        .map(({ file }) => file),
    ).toEqual([]);
  });

  // Perfil and Página de enlaces buttons only take https:// addresses
  // (LinkItemSchema in packages/contracts): WhatsApp, a map or a page, never
  // an email or a phone call. Only the footer may link to an email.
  it("draws no email or phone button on example pages", () => {
    expect(
      hits(
        /(m[aá]ndame|env[ií]ame|escr[ií]beme|escr[ií]benos) (un )?correo|ll[aá]ma(me|nos)\b/i,
      ),
    ).toEqual([]);
    expect(
      hits(/\b(mailto|tel):/).filter((file) => !file.endsWith("Footer.tsx")),
    ).toEqual([]);
  });
});

describe("content model", () => {
  it("shows the eight Experience types of the MVP", () => {
    expect(landing.pageKinds.map((kind) => kind.id)).toEqual([
      "menu",
      "catalog",
      "profile",
      "links",
      "image",
      "document",
      "form",
      "redirect",
    ]);
  });

  it("gives QR and NFC the same place, Links apart", () => {
    expect(landing.channels.map((channel) => channel.id)).toEqual([
      "qr",
      "nfc",
      "other",
    ]);
  });

  // The landing photos themselves are checked in test/media.test.ts.
  it("describes every business image", () => {
    for (const business of landing.businesses) {
      expect(business.image.alt.length, business.image.name).toBeGreaterThan(
        20,
      );
    }
  });

  it("opens WhatsApp with a written first message", () => {
    const messages = [
      landing.contactMessage,
      landing.closing.whatsappMessage,
      ...landing.businesses.map((business) => business.message),
      ...loadKits().kits.map((kit) => kit.message),
    ];
    for (const message of messages) expect(message).toMatch(/^Hola, /);
  });

  it("uses Crear mi cuenta as primary CTA across landing sections", () => {
    expect(landing.hero.ctaPrimary).toBe("Crear mi cuenta");
    expect(landing.closing.cta).toBe("Crear mi cuenta");
  });

  // The kit activation the site explains must be the panel's: «Producto de
  // Kardo» with the «código de activación» of the box (kardo-a2, 2026-10-13).
  it("explains the kit activation in the panel's words", () => {
    const text = [
      ...landing.kitActivation.steps.map((step) => step.text),
      ...landing.faqs.map((faq) => faq.a),
    ].join(" ");
    expect(text).toContain("código de activación");
    expect(text).toContain("Producto de Kardo");
    expect(landing.kitActivation.steps).toHaveLength(3);
  });

  it("includes visible disclaimer for generated illustrative scenes", () => {
    expect(landing.businessesDisclaimer).toContain(
      "Escenas ilustrativas generadas",
    );
  });

  it("does not render floating WhatsApp button on home page", () => {
    const pageContent = fs.readFileSync(path.join(src, "app/page.tsx"), "utf8");
    expect(pageContent).not.toContain("WhatsAppFloat");
  });
});
