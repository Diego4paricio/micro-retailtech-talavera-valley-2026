import { describe, expect, it } from "vitest";
import { renderDesignedBody } from "../src/index.js";
import type { DesignableContent } from "../src/types.js";
import { design, section, testContext } from "./fixtures.js";

// «Menú del día» (relevo 37, D1): a comida corrida with one price and the
// guisados to choose from, each sold out on its own.

const menu: Extract<DesignableContent, { type: "menu" }> = {
  type: "menu",
  title: "Cocina Económica Doña Rosa",
  currency: "MXN",
  sections: [
    {
      id: "comidas",
      name: "Comida corrida",
      items: [
        {
          id: "corrida",
          name: "Comida corrida",
          description: "Sopa, guisado, postre y agua",
          price: 90,
          choicesLabel: "Elige tu guisado",
          choices: [
            { id: "mole", name: "Mole poblano", soldOut: true },
            { id: "chicharron", name: "Chicharrón <verde>" },
          ],
        },
        { id: "agua", name: "Agua de jamaica", price: 20 },
      ],
    },
  ],
};

describe("menu block: a dish with choices", () => {
  const page = design([
    section("s1", [[{ id: "m", kind: "menu", layout: "list" }]]),
  ]);

  it("shows the label, every choice and which one is sold out", () => {
    const { html, css } = renderDesignedBody(menu, page, testContext());
    expect(html).toContain(
      '<span class="kd-choices-label">Elige tu guisado</span>',
    );
    expect(html).toContain(
      '<li class="kd-choice kd-choice--sold-out">Mole poblano <span class="kd-choice-state">agotado</span></li>',
    );
    expect(html).toContain(
      '<li class="kd-choice">Chicharrón &lt;verde&gt;</li>',
    );
    expect(css).toContain(".kd-choice--sold-out{");
    // A dish without choices draws nothing extra.
    expect(html.match(/kd-choices"/g)).toHaveLength(1);
  });

  it("says «A elegir» when the dish has no label", () => {
    const first = menu.sections[0];
    const dish = first?.items[0];
    if (!first || !dish) throw new Error("fixture");
    const { choicesLabel: _label, ...unlabeled } = dish;
    const { html } = renderDesignedBody(
      { ...menu, sections: [{ ...first, items: [unlabeled] }] },
      page,
      testContext(),
    );
    expect(html).toContain('<span class="kd-choices-label">A elegir</span>');
  });
});
