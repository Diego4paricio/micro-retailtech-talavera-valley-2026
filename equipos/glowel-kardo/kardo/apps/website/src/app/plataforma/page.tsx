import type { Metadata } from "next";
import { LiveDemo } from "@/components/demo/LiveDemo";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PageTypes } from "@/components/platform/PageTypes";
import { PanelShot } from "@/components/platform/PanelShot";
import { Closing } from "@/components/sections/Closing";
import { Confidence } from "@/components/sections/Confidence";
import { demo } from "@/content/demo";
import { platformPage, platformParts } from "@/content/zonas";
import { pricingPublished } from "@/lib/pricing";
import { panel } from "@/lib/site";
import "../landing-editorial.css";
import "../landing-zonas.css";

export const metadata: Metadata = {
  title: platformPage.metaTitle,
  description: platformPage.metaDescription,
  alternates: { canonical: "/plataforma/" },
  openGraph: {
    title: `${platformPage.metaTitle} | Kardo`,
    description: platformPage.metaDescription,
    url: "/plataforma/",
  },
};

function Arrow() {
  return (
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
  );
}

/*
  /plataforma/: the panel, part by part, with real screens of the panel in
  demo mode; then the page types the customer sees, the live demo, the
  everyday safeguards and the way to the pieces. Twin of /piezas/.
*/
export default function Page() {
  const published = pricingPublished();
  return (
    <>
      <Header editorial home={false} pricing={published} />
      <main className="landing-editorial" id="contenido">
        <header className="platform-head">
          <h1>{platformPage.title}</h1>
          <p>{platformPage.lead}</p>
          <div className="zone-actions">
            <a className="editorial-button" href={panel.signUp}>
              Crear mi cuenta
            </a>
            {published ? (
              <a className="editorial-link group" href="/precios/">
                <span>Ver precios</span>
                <Arrow />
              </a>
            ) : null}
          </div>
          <div className="platform-hero-shot">
            <PanelShot
              alt="El panel de Kardo con su menú lateral y el Resumen de Café Nube"
              name="panel-completo"
              priority
              sizes="(max-width: 1023px) 94vw, 90vw"
            />
          </div>
        </header>

        <section
          aria-label="Partes del panel"
          className="editorial-section platform-parts"
        >
          {platformParts.map((part) => (
            <article className="platform-part" id={part.id} key={part.id}>
              <div className="part-copy">
                <p className="part-name">{part.name}</p>
                <h2>{part.title}</h2>
                <p>{part.text}</p>
                <ul>
                  {part.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
              <PanelShot alt={part.alt} name={part.image} />
            </article>
          ))}
          <p className="panel-note">
            Pantallas del panel de Kardo con datos de ejemplo de un café.
          </p>
        </section>

        <section
          aria-labelledby="tipos-title"
          className="editorial-section platform-types"
          id="tipos-de-pagina"
        >
          <div className="zone-heading">
            <h2 id="tipos-title">{platformPage.pagesTitle}</h2>
            <div className="zone-heading-side">
              <p>{platformPage.pagesLead}</p>
            </div>
          </div>
          <PageTypes />
        </section>

        <section
          aria-labelledby="demo-title"
          className="editorial-section platform-try"
          id="demo"
        >
          <div className="zone-heading">
            <h2 id="demo-title">{platformPage.tryTitle}</h2>
            <div className="zone-heading-side">
              <p>{platformPage.tryLead}</p>
            </div>
          </div>
          <LiveDemo />
          <p className="panel-note">{demo.note}</p>
        </section>

        <Confidence />

        <section
          aria-labelledby="a-piezas-title"
          className="editorial-section platform-to-pieces"
        >
          <h2 id="a-piezas-title">{platformPage.piecesTitle}</h2>
          <p>{platformPage.piecesText}</p>
          <a className="editorial-link group" href="/piezas/">
            <span>{platformPage.piecesLink}</span>
            <Arrow />
          </a>
        </section>

        <Closing />
      </main>
      <Footer />
    </>
  );
}
