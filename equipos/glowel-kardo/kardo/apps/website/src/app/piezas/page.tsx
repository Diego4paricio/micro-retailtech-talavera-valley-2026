import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { PieceImage } from "@/components/pieces/PieceImage";
import { PiecesShowcase } from "@/components/pieces/PiecesShowcase";
import { Faq } from "@/components/sections/Faq";
import { Kits } from "@/components/sections/Kits";
import { businessesDisclaimer, faqs, piecesPage } from "@/content/landing";
import { pieces } from "@/content/pieces";
import { loadKits } from "@/lib/kits";
import { pricingPublished } from "@/lib/pricing";
import { absoluteUrl } from "@/lib/site";
import "../landing-editorial.css";
import "../landing-zonas.css";

export const metadata: Metadata = {
  title: piecesPage.metaTitle,
  description: piecesPage.metaDescription,
  alternates: { canonical: "/piezas/" },
  openGraph: {
    title: `${piecesPage.metaTitle} | Kardo`,
    description: piecesPage.metaDescription,
    url: "/piezas/",
  },
};

/**
 * The kits as products for search engines, with the price from
 * kits-catalog.json. The CSP hashes this inline script at export time
 * (scripts/harden-export.mjs).
 */
function kitsStructuredData(): string {
  const { kits } = loadKits();
  const data = {
    "@context": "https://schema.org",
    "@graph": kits.map((kit) => ({
      "@type": "Product",
      name: kit.name,
      brand: { "@type": "Brand", name: "Kardo" },
      description: `${kit.items.map((item) => `${item.quantity} ${item.label}`).join(", ")}. Incluye ${kit.panelDays} días del panel de Kardo en el plan ${kit.panelPlanName}.`,
      offers: {
        "@type": "Offer",
        price: kit.price.toFixed(2),
        priceCurrency: "MXN",
        availability: "https://schema.org/InStock",
        url: absoluteUrl("/piezas/#kits"),
      },
    })),
  };
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

/** Questions about the pieces, from the home's list (same answers). */
const pieceQuestions = faqs.filter((faq) =>
  piecesPage.questions.includes(faq.q),
);

export default function Page() {
  return (
    <>
      <Header editorial home={false} pricing={pricingPublished()} />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON built from the approved catalog, with "<" escaped.
        dangerouslySetInnerHTML={{ __html: kitsStructuredData() }}
      />
      <main id="contenido" className="landing-editorial">
        <header className="pieces-page-head">
          <p className="editorial-label">{piecesPage.label}</p>
          <h1>
            {piecesPage.title} <em>{piecesPage.titleEm}</em>
          </h1>
          <p className="pieces-page-lead">{piecesPage.lead}</p>
        </header>

        <div>
          {pieces.map((piece, index) => (
            <article
              key={piece.id}
              id={piece.id}
              className="piece-sheet"
              aria-labelledby={`${piece.id}-title`}
            >
              <div className="piece-photo">
                <PieceImage piece={piece} detail priority={index === 0} />
              </div>
              <div>
                <p className="editorial-label">0{index + 1}</p>
                <h2 className="piece-sheet-title" id={`${piece.id}-title`}>
                  {piece.name}
                </h2>
                <p className="piece-sheet-say">{piece.say}</p>
                <dl className="piece-spec">
                  {piece.specs.map((spec) => (
                    <div key={spec.label} className="contents">
                      <dt>{spec.label}</dt>
                      <dd>{spec.value}</dd>
                    </div>
                  ))}
                </dl>
                <a
                  className="zone-button piece-customize"
                  href={`/personalizar/?pieza=${piece.id}`}
                >
                  Personaliza tu {piece.name}
                </a>
              </div>
            </article>
          ))}
          <section
            className="editorial-section pieces-editorial"
            aria-label="Las piezas a escala"
          >
            <PiecesShowcase />
            <p className="editorial-note">{businessesDisclaimer}</p>
          </section>
        </div>

        <Kits id="kits" label={false} />
        <Faq items={pieceQuestions} />
      </main>
      <Footer />
    </>
  );
}
