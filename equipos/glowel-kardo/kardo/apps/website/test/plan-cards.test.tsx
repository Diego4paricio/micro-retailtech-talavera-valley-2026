import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PlanCards } from "@/components/pricing/PlanCards";

const card = {
  code: "esencial",
  name: "Esencial",
  description: "x",
  recommended: false,
  contactOnly: false,
  monthly: "$1",
  yearly: "$10",
  yearlyPerMonth: "$1",
  yearlySavings: "$2",
  highlights: [],
  monthHref: "https://app.kardo.mx/registro?plan=esencial&periodo=mensual",
  yearHref: "https://app.kardo.mx/registro?plan=esencial&periodo=anual",
};

describe("plan cards", () => {
  it("render the usual sign up button first, before any address is read", () => {
    const html = renderToStaticMarkup(
      <PlanCards
        annualMaxFreeMonths={2}
        contactHref="https://wa.me/1"
        panelPlanUrl="https://app.kardo.mx/settings/plan"
        plans={[card]}
        trialDays={15}
      />,
    );
    expect(html).toContain("Empieza gratis");
    expect(html).toContain(card.monthHref.replace("&", "&amp;"));
    expect(html).not.toContain("Elegir este plan");
    expect(html).not.toContain("Volver al panel");
    expect(html).toContain("Con el plan anual ahorras hasta 2 meses.");
    expect(html).not.toContain("meses gratis");
  });
});
