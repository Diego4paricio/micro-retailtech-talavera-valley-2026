import { loadKits } from "@/lib/kits";
import { loadPricing, pricingPublished } from "@/lib/pricing";
import { panel, whatsappLink } from "@/lib/site";
import { Reveal } from "../landing/Reveal";
import { PlanCards } from "./PlanCards";
import { corporateMessage, planCards } from "./plan-card-data";
import { StartPaths } from "./StartPaths";

/**
 * Prices on the home page: the two ways in and the panel plans, from the
 * catalogs. The full comparison, the extras and the billing questions stay
 * on /precios/. Hidden while the catalog is a draft in production.
 */
export function HomePricing() {
  if (!pricingPublished()) return null;
  const pricing = loadPricing();
  const { panelDays } = loadKits();
  return (
    <section
      id="precios"
      className="editorial-section pricing-editorial"
      aria-labelledby="precios-title"
    >
      <Reveal>
        <div className="businesses-heading">
          <h2 id="precios-title">
            Dos formas de empezar.
            <br />
            <em>Con tus QR o con nuestras piezas.</em>
          </h2>
          <p>
            Precios en pesos mexicanos con IVA incluido. Cancelas cuando quieras
            desde tu panel, sin llamadas.
          </p>
        </div>
      </Reveal>

      <StartPaths />

      <div className="plans-intro">
        <h3>Los planes del panel</h3>
        <p>
          Para seguir después de tu prueba o de los {panelDays} días de tu kit.
          Todos con visitas, taps y escaneos sin límite.
        </p>
      </div>
      <PlanCards
        annualMaxFreeMonths={pricing.annualMaxFreeMonths}
        compact
        contactHref={whatsappLink(corporateMessage)}
        panelPlanUrl={panel.plan}
        plans={planCards(pricing)}
        trialDays={pricing.trialDays}
      />
      <div className="plans-foot">
        <a className="editorial-link group" href="/precios/#comparar">
          <span>Compara todo lo que incluye cada plan</span>
          <svg
            aria-hidden="true"
            className="size-3.5 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            viewBox="0 0 24 24"
          >
            <path
              d="M5 12h14M13 6l6 6-6 6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </a>
      </div>
    </section>
  );
}
