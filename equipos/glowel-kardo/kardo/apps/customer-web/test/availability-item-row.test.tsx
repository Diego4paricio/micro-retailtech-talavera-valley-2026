import type { AvailabilityItem } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ItemRow } from "../src/features/availability/ItemRow.js";

/**
 * A guisado (relevo 37, D1) is listed by `MenuChoice` (just id and name):
 * it never has its own price, the dish does. Since round 3's second pass
 * the guisados live inside their dish's card with only «Hay / Se acabó»:
 * as separate cards with the dish's same three buttons, Rosa tapped the
 * dish's «Agotado» and her whole comida corrida showed as sold out.
 */
function item(overrides: Partial<AvailabilityItem> = {}): AvailabilityItem {
  return {
    id: "mole",
    name: "Mole con pollo",
    status: "available",
    quantity: null,
    updatedAt: null,
    ...overrides,
  };
}

const base = {
  currency: "MXN",
  typeIcon: "menu" as const,
  workspaceId: "w1",
  canChange: true,
  failed: false,
  now: Date.now(),
  onChange: () => {},
};

const dish = item({ id: "comida-corrida", name: "Comida corrida", price: 85 });
const choices = [
  item({ choiceOf: "comida-corrida", status: "sold_out" }),
  item({ id: "chicharron", name: "Chicharrón", choiceOf: "comida-corrida" }),
];

describe("ItemRow — a dish with guisados", () => {
  it("shows its guisados inside its card, each with only «Hay / Se acabó»", () => {
    const html = renderToStaticMarkup(
      <ItemRow {...base} choices={choices} item={dish} />,
    );
    expect(html).toContain("av-choices");
    expect(html).toContain("El platillo sigue a la venta.");
    expect(html).toContain("¿Hay Mole con pollo?");
    expect(html).toContain("¿Hay Chicharrón?");
    expect(html.match(/Se acabó/g)).toHaveLength(2);
    // The dish keeps its own three buttons; the guisados count no pieces.
    expect(html.match(/Agotado/g)).toHaveLength(1);
    expect(html.match(/Contar piezas de/g)).toEqual(["Contar piezas de"]);
  });

  it("never offers a price to a guisado; the dish keeps «Cambiar precio»", () => {
    const html = renderToStaticMarkup(
      <ItemRow
        {...base}
        choices={choices}
        item={dish}
        onEditPrice={() => {}}
      />,
    );
    expect(html.match(/Cambiar el precio de/g)).toHaveLength(1);
    expect(html).toContain("Cambiar el precio de Comida corrida");
    expect(html).not.toContain("Poner precio");
  });

  it("marks the guisado that did not save", () => {
    const html = renderToStaticMarkup(
      <ItemRow
        {...base}
        choices={choices}
        failedIds={new Set(["chicharron"])}
        item={dish}
      />,
    );
    expect(html.match(/No se guardó/g)).toHaveLength(1);
  });

  it("a dish without guisados has no guisados block", () => {
    const html = renderToStaticMarkup(<ItemRow {...base} item={dish} />);
    expect(html).not.toContain("av-choices");
  });
});

describe("ItemRow — simplified after round 4 (owner, 2026-10-12)", () => {
  it("«Contar piezas» is a link in the price line, not a box under the item", () => {
    const html = renderToStaticMarkup(<ItemRow {...base} item={dish} />);
    const meta = html.slice(html.indexOf("av-item-meta"));
    expect(meta.indexOf("Contar piezas de")).toBeLessThan(
      meta.indexOf("av-item-controls"),
    );
    expect(html).not.toContain("av-count-slot");
  });

  it("counting shows the stepper and no link", () => {
    const html = renderToStaticMarkup(
      <ItemRow {...base} item={{ ...dish, quantity: 4 }} />,
    );
    expect(html).toContain("Piezas que quedan de Comida corrida");
    expect(html).not.toContain("Contar piezas de");
  });

  it("whoever cannot change it gets no link to count", () => {
    const html = renderToStaticMarkup(
      <ItemRow {...base} canChange={false} item={dish} />,
    );
    expect(html).not.toContain("Contar piezas");
  });

  it("no empty photo box when the page has no photos", () => {
    const withBox = renderToStaticMarkup(<ItemRow {...base} item={dish} />);
    const without = renderToStaticMarkup(
      <ItemRow {...base} item={dish} showThumb={false} />,
    );
    expect(withBox).toContain("av-thumb");
    expect(without).not.toContain("av-thumb");
    expect(without).not.toContain("data-thumb");
  });
});
