import { Check } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Closing } from "@/components/sections/Closing";
import { Faq } from "@/components/sections/Faq";
import { Kits } from "@/components/sections/Kits";
import { faqs as landingFaqs } from "@/content/landing";
import { loadKits } from "@/lib/kits";
import { legalDocuments, visibleLegalSlugs } from "@/lib/legal";
import {
  formatPesos,
  limitRows,
  loadPricing,
  organizationsByPlan,
  type Pricing,
  pricingPublished,
} from "@/lib/pricing";
import { panel, whatsappLink } from "@/lib/site";
import { PlanCards } from "./PlanCards";
import { corporateMessage, planCards } from "./plan-card-data";
import { StartPaths } from "./StartPaths";

export function pricingMetadata(): Metadata {
  const pricing = loadPricing();
  const { kits } = loadKits();
  const kitFrom = Math.min(...kits.map((kit) => kit.price));
  return {
    title: "Precios",
    description: `Planes de Kardo en pesos mexicanos con IVA incluido. Prueba ${pricing.trialDays} días sin tarjeta, o empieza con un kit de piezas con QR y NFC desde ${formatPesos(kitFrom)}.`,
    alternates: { canonical: "/precios/" },
    // A catalog the owner has not approved is a draft: never indexed.
    robots: pricing.approved ? undefined : { index: false, follow: false },
  };
}

function faqs(pricing: Pricing) {
  const {
    trialDays,
    trialPlanName,
    graceDays,
    deleteAfterDays,
    annualMaxFreeMonths,
  } = pricing;
  return [
    {
      q: "¿Necesito tarjeta para probar Kardo?",
      a: `No. Creas tu cuenta y usas ${trialDays} días el plan que elijas, o ${trialPlanName} si no eliges ninguno, sin dar tarjeta. Hay una prueba por persona.`,
    },
    {
      q: "¿Qué pasa cuando termina la prueba?",
      a: `No se cobra nada. Para seguir editando eliges un plan desde tu panel. Tus páginas siguen abriendo ${graceDays} días más; después muestran un aviso de que no están disponibles, hasta que contrates. Si en ${deleteAfterDays} días no contratas, borramos tus organizaciones y te avisamos antes. Mientras tanto puedes descargar tu información.`,
    },
    {
      q: "¿Puedo tener varios negocios?",
      a: `Sí. Tu plan cubre tus organizaciones: ${organizationsByPlan(pricing)}. Los límites del plan se reparten entre ellas y pagas todo con una sola tarjeta. Si te falta una, la agregas como extra o subes de plan.`,
    },
    {
      q: "¿Puedo contratar antes de que termine mi prueba?",
      a: "Sí, y no pierdes tus días: si faltan al menos cinco, el primer cobro es el día que termina tu prueba y te avisamos por correo antes. Si faltan menos, el cobro es al contratar.",
    },
    {
      q: "¿Puedo cambiar de plan a medio mes?",
      a: "Sí. Si subes, pagas solo la diferencia por los días que faltan y ves el monto exacto antes de confirmar. Si bajas, lo que ya pagaste de más queda a tu favor en los siguientes cobros. Si el plan nuevo incluye menos, tienes 14 días para elegir qué sigue activo; nada se borra.",
    },
    {
      q: "¿Cómo cancelo?",
      a: "Desde tu panel, en Configuración, Plan. Sin llamadas ni penalizaciones. Conservas tu plan hasta el final del periodo que ya pagaste y no hay más cobros.",
    },
    {
      q: "¿Cómo pago?",
      a: `Con tarjeta de crédito o débito, en la página de pago segura de Stripe. Puedes pagar cada mes o cada año; el pago anual te ahorra hasta ${annualMaxFreeMonths} meses, según el plan.`,
    },
    {
      q: "¿Me dan factura?",
      a: "Sí, si la pides. Capturas tus datos fiscales en tu panel, antes o después de pagar, y te enviamos tu CFDI. Si no necesitas factura, no te pedimos datos fiscales.",
    },
    {
      q: "¿Hay límite de visitas?",
      a: "No. Ningún plan limita las visitas, taps o escaneos de tus QR, tus NFC y tus links.",
    },
  ];
}

const everyPlan = [
  "Un plan para tus organizaciones: sus límites se reparten entre ellas.",
  "Visitas, taps y escaneos sin límite.",
  "Cambias tus páginas sin reimprimir tus QR ni tus NFC.",
  "Estadísticas por canal, día y hora.",
  "Formularios de contacto con el permiso de cada persona.",
  "Precios en pesos mexicanos con IVA incluido.",
  "Cancelas cuando quieras desde tu panel.",
];

/** Kit questions of the home page that also belong next to the prices. */
const kitQuestions = landingFaqs.filter((faq) =>
  [
    "¿Cómo conecto las piezas de mi kit a mi panel?",
    "¿Qué pasa cuando terminan los 30 días del kit?",
  ].includes(faq.q),
);

export function PricingPage() {
  if (!pricingPublished()) notFound();
  const pricing = loadPricing();
  const { panelDays } = loadKits();
  const legal = visibleLegalSlugs().filter(
    (slug) => slug === "terminos" || slug === "cancelacion-y-reembolsos",
  );
  const sellable = pricing.plans.filter((plan) => !plan.contactOnly);

  return (
    <>
      <Header editorial home={false} pricing />
      <main id="contenido" className="landing-editorial">
        <header className="pieces-page-head">
          {pricing.approved ? null : (
            <div className="draft-note" role="note">
              <p>
                <b>Borrador: estos precios están en revisión.</b> Todavía no son
                una oferta. En producción esta página no se publica hasta que se
                aprueben.
              </p>
            </div>
          )}
          <p className="editorial-label">Precios</p>
          <h1>
            Dos formas de empezar. <em>Precios claros, con IVA.</em>
          </h1>
          <p className="pieces-page-lead">
            Prueba el panel {pricing.trialDays} días sin tarjeta con tus propios
            QR o NFC, o pide un kit de piezas con tu marca que ya trae{" "}
            {panelDays} días del panel. Al terminar no se cobra nada: tú decides
            si contratas.
          </p>
        </header>

        <section
          aria-label="Dos formas de empezar"
          className="editorial-section pricing-editorial"
        >
          <StartPaths />
        </section>

        <section
          aria-labelledby="planes-title"
          className="editorial-section plans-editorial"
          id="planes"
        >
          <p className="editorial-label">Planes del panel</p>
          <h2 id="planes-title">
            Elige tu plan.
            <br />
            <em>Pruébalo {pricing.trialDays} días sin tarjeta.</em>
          </h2>
          <PlanCards
            annualMaxFreeMonths={pricing.annualMaxFreeMonths}
            contactHref={whatsappLink(corporateMessage)}
            panelPlanUrl={panel.plan}
            plans={planCards(pricing)}
            trialDays={pricing.trialDays}
          />
          <div className="plans-every">
            <h3>En todos los planes</h3>
            <ul>
              {everyPlan.map((line) => (
                <li key={line}>
                  <Check aria-hidden="true" className="size-4 shrink-0" />
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </section>

        <Kits id="kits" label={false} />

        {pricing.extras.length > 0 ? (
          <section
            aria-labelledby="extras-title"
            className="editorial-section pricing-editorial"
          >
            <p className="editorial-label">Extras</p>
            <h2 id="extras-title">
              ¿Te falta poco?
              <br />
              <em>Agrega un extra.</em>
            </h2>
            <p className="pieces-page-lead mb-8">
              Con un plan pagado, desde tu panel, al mes o al año como tu plan.
              Pagas solo lo que falta del periodo y lo quitas cuando quieras.
            </p>
            <ul className="extras-list">
              {pricing.extras.map((extra) => (
                <li key={extra.code}>
                  <span>
                    <b>{extra.name}</b>
                    {extra.description}
                  </span>
                  <span className="extras-price">
                    {[
                      extra.monthly === null
                        ? null
                        : `${formatPesos(extra.monthly)} al mes`,
                      extra.yearly === null
                        ? null
                        : `${formatPesos(extra.yearly)} al año`,
                    ]
                      .filter(Boolean)
                      .join(" o ")}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section
          aria-labelledby="comparar-title"
          className="editorial-section plans-editorial"
          id="comparar"
        >
          <p className="editorial-label">Comparar</p>
          <h2 id="comparar-title">Compara los planes.</h2>
          <div className="compare-table">
            <table>
              <caption className="sr-only">
                Límites de cada plan de Kardo
              </caption>
              <thead>
                <tr>
                  <th scope="col">Límite</th>
                  {sellable.map((plan) => (
                    <th key={plan.code} scope="col">
                      {plan.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {limitRows.map((row) => (
                  <tr key={row.key}>
                    <th scope="row">{row.label}</th>
                    {sellable.map((plan) => (
                      <td key={plan.code}>
                        {row.format(plan.entitlements[row.key])}
                      </td>
                    ))}
                  </tr>
                ))}
                <tr className="compare-price">
                  <th scope="row">Precio mensual</th>
                  {sellable.map((plan) => (
                    <td key={plan.code}>
                      {plan.monthly === null
                        ? "No disponible"
                        : formatPesos(plan.monthly)}
                    </td>
                  ))}
                </tr>
                <tr className="compare-price">
                  <th scope="row">Precio anual</th>
                  {sellable.map((plan) => (
                    <td key={plan.code}>
                      {plan.yearly === null
                        ? "No disponible"
                        : formatPesos(plan.yearly)}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="compare-note">
            ¿Necesitas más? El plan Corporativo se ajusta a tu operación.{" "}
            <a
              href={whatsappLink(corporateMessage)}
              rel="noopener noreferrer"
              target="_blank"
            >
              Escríbenos por WhatsApp
            </a>
            .
          </p>
        </section>

        <Faq
          items={[...faqs(pricing), ...kitQuestions]}
          lead={
            legal.length > 0 ? (
              <>
                Las condiciones completas están en{" "}
                {legal.map((slug, index) => (
                  <span key={slug}>
                    {index > 0 ? " y " : ""}
                    <a
                      className="font-semibold text-ink underline decoration-aqua decoration-2 underline-offset-2"
                      href={`/${slug}/`}
                    >
                      {legalDocuments[slug].title}
                    </a>
                  </span>
                ))}
                .
              </>
            ) : undefined
          }
          title="Preguntas sobre precios y kits"
        />
        <Closing />
      </main>
      <Footer />
    </>
  );
}
