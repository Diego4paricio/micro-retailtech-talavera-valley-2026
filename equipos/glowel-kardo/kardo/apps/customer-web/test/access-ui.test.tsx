import type { WorkspaceBilling } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccessBannerView } from "../src/features/billing/AccessBanner.js";
import type { AccessBanner } from "../src/features/billing/access-model.js";
import { BillingReady } from "../src/features/billing/BillingSection.js";
import { PlanChoiceView } from "../src/features/billing/PlanChoice.js";
import { PlanRequiredView } from "../src/features/billing/PlanRequiredDialog.js";
import { handleBillingDemo } from "../src/lib/demo/billing.js";

const href = "https://kardo.mx/precios/?desde=panel&organizacion=abc";
const amp = (value: string) => value.replaceAll("&", "&amp;");

const banner = (overrides: Partial<AccessBanner> = {}): AccessBanner => ({
  tone: "warning",
  text: "Tus páginas están en pausa. Elige un plan y vuelven al instante",
  choosePlan: true,
  download: false,
  ...overrides,
});

describe("access strip", () => {
  it("is a status region with the plan button for the Owner", () => {
    const html = renderToStaticMarkup(
      <AccessBannerView banner={banner()} canManage pricingHref={href} />,
    );
    expect(html).toContain('role="status"');
    expect(html).toContain("Tus páginas están en pausa");
    expect(html).toContain(`href="${amp(href)}"`);
    expect(html).toContain("Elegir plan");
    expect(html).not.toContain("Pídele al propietario");
  });

  it("asks everyone else to talk to the owner", () => {
    const html = renderToStaticMarkup(
      <AccessBannerView
        banner={banner()}
        canManage={false}
        pricingHref={href}
      />,
    );
    expect(html).toContain("Pídele al propietario que elija un plan");
    expect(html).not.toContain("Elegir plan");
    expect(html).not.toContain("<a ");
  });

  it("offers the download when the organization is about to be deleted", () => {
    const html = renderToStaticMarkup(
      <AccessBannerView
        banner={banner({ download: true })}
        canManage
        pricingHref={href}
      />,
    );
    expect(html).toContain("Descargar");
  });

  it("shows a close button only when it can be dismissed", () => {
    const withDismiss = renderToStaticMarkup(
      <AccessBannerView
        banner={banner({ tone: "info" })}
        canManage
        onDismiss={() => undefined}
        pricingHref={href}
      />,
    );
    expect(withDismiss).toContain("Ocultar este aviso");
    const withoutDismiss = renderToStaticMarkup(
      <AccessBannerView banner={banner()} canManage pricingHref={href} />,
    );
    expect(withoutDismiss).not.toContain("Ocultar este aviso");
  });
});

describe("plan required dialog", () => {
  const render = (canManage: boolean, canExport: boolean) =>
    renderToStaticMarkup(
      <PlanRequiredView
        canExport={canExport}
        canManage={canManage}
        onClose={() => {}}
        open
        pricingHref={href}
      />,
    );

  it("explains and offers the plans to the Owner", () => {
    const html = render(true, true);
    expect(html).toContain("Elige un plan para seguir editando");
    expect(html).toContain("no tiene un plan");
    expect(html).toContain("Ver planes");
    expect(html).toContain(`href="${amp(href)}"`);
    expect(html).toContain("Descargar mi información");
    expect(html).toContain("Cerrar");
  });

  it("gives an Admin the download and the owner hint, without the plans", () => {
    const html = render(false, true);
    expect(html).toContain("Pídele al propietario que elija un plan");
    expect(html).toContain("Descargar mi información");
    expect(html).not.toContain("Ver planes");
  });

  it("gives an Editor only the hint", () => {
    const html = render(false, false);
    expect(html).toContain("Pídele al propietario");
    expect(html).not.toContain("Descargar mi información");
  });
});

describe("plan choice card", () => {
  const view = (
    state: Parameters<typeof PlanChoiceView>[0]["state"],
    offerText: string | null = null,
  ) =>
    renderToStaticMarkup(
      <PlanChoiceView
        busy={false}
        offerText={offerText}
        onCancel={() => {}}
        onContinue={() => {}}
        state={state}
      />,
    );

  it("says only the owner can choose", () => {
    expect(view({ status: "not-owner" })).toContain(
      "Solo el propietario puede elegir el plan",
    );
  });

  it("shows a discreet message for an invalid code or period", () => {
    const html = view({ status: "invalid" });
    expect(html).toContain("No encontramos ese plan o periodo");
    expect(html).not.toContain("Continuar a pago");
  });

  it("confirms the purchase with the coupon when there is one", () => {
    const catalog = handleBillingDemo("/v1/billing/plans", "GET", {}) as {
      plans: {
        code: string;
        name: string;
        prices: {
          id: string;
          interval: "month" | "year";
          unitAmount: number;
          currency: string;
        }[];
      }[];
    };
    const plan = catalog.plans[0];
    const price = plan?.prices[0];
    if (!plan || !price) throw new Error("catalog is empty");
    const html = view(
      {
        status: "ready",
        choice: { plan, price, interval: "month" } as never,
        billing: {} as WorkspaceBilling,
        fiscal: null,
      },
      "Con 20 % de descuento en tus 3 primeros meses",
    );
    expect(html).toContain("Vas a contratar Esencial mensual");
    expect(html).toContain("IVA incluido");
    expect(html).toContain("Con 20 % de descuento en tus 3 primeros meses");
    expect(html).toContain("Continuar a pago");
    expect(html).toContain("Cancelar");
  });

  it("renders nothing while loading or when not asked", () => {
    expect(view({ status: "loading" })).toBe("");
    expect(view({ status: "none" })).toBe("");
  });
});

describe("Configuración, Plan", () => {
  const billing = handleBillingDemo(
    "/v1/workspaces/x/billing",
    "GET",
    {},
  ) as WorkspaceBilling;
  const render = (canExport: boolean) =>
    renderToStaticMarkup(
      <BillingReady
        billing={billing}
        busy={null}
        canExport={canExport}
        clearError={() => {}}
        error={null}
        exporting={false}
        foreign={false}
        onExport={() => {}}
        onPortal={() => {}}
        pricingHref={href}
        result={null}
        waiting={false}
      />,
    );

  it("no longer lists the plan catalog", () => {
    const html = render(true);
    expect(html).not.toContain("Elegir este plan");
    expect(html).not.toContain("billing-plan-card");
    expect(html).not.toContain("Mensual");
    expect(html).not.toContain("Anual");
  });

  it("links to the plans, no longer has the download, and keeps the rest", () => {
    const html = render(true);
    expect(html).toContain("Ver planes y precios");
    expect(html).toContain(`href="${amp(href)}"`);
    // The data download lives in Configuración, General (A2-64).
    expect(html).not.toContain("Descargar mi información");
    expect(html).toContain("Facturas");
  });

  it("hides the download from roles that cannot export", () => {
    const html = render(false);
    expect(html).toContain("Ver planes y precios");
    expect(html).not.toContain("Descargar mi información");
  });
});
