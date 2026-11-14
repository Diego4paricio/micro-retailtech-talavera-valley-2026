import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { Reveal } from "@/components/landing/Reveal";
import { HomePricing } from "@/components/pricing/HomePricing";
import { startFaqs } from "@/components/pricing/start-copy";
import { Businesses } from "@/components/sections/Businesses";
import { Closing } from "@/components/sections/Closing";
import { Confidence } from "@/components/sections/Confidence";
import { Faq } from "@/components/sections/Faq";
import { Hero } from "@/components/sections/Hero";
import { HowItWorks } from "@/components/sections/HowItWorks";
import { Kits } from "@/components/sections/Kits";
import { Manifesto } from "@/components/sections/Manifesto";
import { PanelPreview } from "@/components/sections/PanelPreview";
import { Pieces } from "@/components/sections/Pieces";
import { TwoWays } from "@/components/sections/TwoWays";
import { faqs } from "@/content/landing";
import { loadKits } from "@/lib/kits";
import { loadPricing, pricingPublished } from "@/lib/pricing";
import "./landing-editorial.css";
import "./landing-zonas.css";

/*
  Kardo landing page: editorial, luminosa y orientada a negocios locales.
  Kardo vende dos cosas que se usan juntas: la plataforma (el panel, cada
  mes) y las piezas físicas (ADR 025, una vez). La página las presenta en
  dos zonas y termina en las dos formas de empezar.
  1. Hero editorial
  2. Dos partes que trabajan juntas: la plataforma y las piezas
  3. Manifiesto
  Zona de la plataforma (completa en /plataforma/)
  4. Así funciona
  5. Tu panel por dentro: sus partes, con pantallas reales
  6. Para el día a día
  7. Para cada negocio (une las dos zonas)
  Zona de las piezas (completa en /piezas/)
  8. Las piezas: diseños a tamaño real, lo que abre cada una, Personalizar
     y las fotos
  9. Kits y cómo llegan al panel
  Decidir
  10. Precios: dos formas de empezar y los planes del panel
  11. Preguntas frecuentes
  12. Cierre de alto contraste
*/
export default function Home() {
  const published = pricingPublished();
  const questions = published
    ? [...startFaqs(loadPricing(), loadKits()), ...faqs]
    : faqs;
  return (
    <>
      <Header pricing={published} />
      <main id="contenido" className="landing-editorial">
        <Hero />
        <TwoWays />
        <Manifesto />
        <HowItWorks />
        <PanelPreview />
        <Reveal>
          <Confidence />
        </Reveal>
        <Businesses />
        <Pieces />
        <Kits label={false} />
        <HomePricing />
        <Reveal>
          <Faq items={questions} />
        </Reveal>
        <Closing />
      </main>
      <Footer />
    </>
  );
}
