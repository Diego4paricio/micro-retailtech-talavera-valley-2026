import { describe, expect, it } from "vitest";
import { pedidoAsksForPricesOnPageWithout } from "../src/features/studio/ai/ai-brief.js";

describe("pedidoAsksForPricesOnPageWithout (relevo 37, IA4)", () => {
  it("offers a Menú when a Página de enlaces' pedido asks for prices or dishes", () => {
    expect(
      pedidoAsksForPricesOnPageWithout("linkpage", "mis platillos y precios"),
    ).toBe(true);
    expect(pedidoAsksForPricesOnPageWithout("links", "muéstrame mi menú")).toBe(
      true,
    );
    expect(
      pedidoAsksForPricesOnPageWithout("profile", "quiero mi catálogo aquí"),
    ).toBe(true);
  });

  it("stays quiet when the pedido never mentions prices or dishes", () => {
    expect(
      pedidoAsksForPricesOnPageWithout(
        "linkpage",
        "un botón de WhatsApp y mi Instagram",
      ),
    ).toBe(false);
  });

  it("stays quiet on a type that already shows prices", () => {
    expect(
      pedidoAsksForPricesOnPageWithout("menu", "mis platillos y precios"),
    ).toBe(false);
    expect(
      pedidoAsksForPricesOnPageWithout("catalog", "mis productos y precios"),
    ).toBe(false);
  });
});
