import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { faqs, kitsSection, piecesPage } from "@/content/landing";
import { pieces } from "@/content/pieces";
import { kitMessage, loadKits, lowestMonthlyPrice } from "@/lib/kits";
import { loadPricing } from "@/lib/pricing";

// Kits and pieces (ADR 025): prices only from kits-catalog.json, the plan
// each kit includes must exist in billing-catalog.json, and every piece the
// site shows must have its images and a description.

const root = path.resolve(import.meta.dirname, "..");
const catalog = JSON.parse(
  fs.readFileSync(
    path.resolve(root, "../../Docs/engineering/config/kits-catalog.json"),
    "utf8",
  ),
);

describe("kits", () => {
  const kits = loadKits();

  it("is approved and shows the four kits with the catalog prices", () => {
    expect(kits.approved).toBe(true);
    expect(kits.kits.map((kit) => [kit.name, kit.price])).toEqual(
      catalog.kits.map((kit: { name: string; price: number }) => [
        kit.name,
        kit.price,
      ]),
    );
  });

  it("includes a plan that exists, with the plan's own name", () => {
    const names = new Map(loadPricing().plans.map((p) => [p.code, p.name]));
    for (const [index, kit] of kits.kits.entries())
      expect(kit.panelPlanName).toBe(names.get(catalog.kits[index].panelPlan));
  });

  it("lists only known pieces, with the plural from two up", () => {
    for (const kit of kits.kits)
      for (const item of kit.items) {
        const piece = pieces.find((p) => p.id === item.piece);
        expect(piece, item.piece).toBeDefined();
        expect(item.label).toBe(
          item.quantity === 1 ? piece?.name : piece?.plural,
        );
        expect(item.quantity).toBeGreaterThan(0);
      }
  });

  it("matches what the owner approved (2026-10-11)", () => {
    const contents = Object.fromEntries(
      kits.kits.map((kit) => [
        kit.code,
        Object.fromEntries(kit.items.map((i) => [i.piece, i.quantity])),
      ]),
    );
    expect(contents).toEqual({
      mostrador: { stand: 1, sticker: 2 },
      presentacion: { card: 2, stand: 1 },
      refri: { magnet: 25, sticker: 2 },
      completo: { stand: 1, card: 1, magnet: 10, sticker: 5 },
    });
    expect(kits.panelDays).toBe(30);
  });

  it("opens WhatsApp with the kit's name already written", () => {
    expect(kitMessage("Kit Mostrador")).toBe(
      "Hola, me interesa el Kit Mostrador para mi negocio",
    );
    for (const kit of kits.kits) expect(kit.message).toContain(kit.name);
  });

  it("uses the approved shipping sentence and nothing more", () => {
    expect(kits.shipping).toBe(
      "Entrega en Puebla y envíos por paquetería coordinados al ordenar.",
    );
  });

  it("offers the panel alone from the lowest public monthly price", () => {
    expect(lowestMonthlyPrice()).toBe(199);
  });

  it("promises the basic mode in the words the owner approved", () => {
    expect(kitsSection.basicText).toMatch(/WhatsApp o tu ficha de Google Maps/);
  });
});

describe("pieces", () => {
  it("are the four approved formats", () => {
    expect(pieces.map((piece) => piece.id)).toEqual([
      "stand",
      "card",
      "magnet",
      "sticker",
    ]);
  });

  // Their photos and alts are checked in test/media.test.ts.

  it("keep the sticker at 10 cm", () => {
    const sticker = pieces.find((piece) => piece.id === "sticker");
    expect(sticker?.size).toMatchObject({ width: 10, height: 10, round: true });
  });

  it("only ask questions that exist on the home page", () => {
    const questions = faqs.map((faq) => faq.q);
    for (const q of piecesPage.questions) expect(questions).toContain(q);
  });
});
