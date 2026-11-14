import type { Metadata } from "next";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { type KitOption, Studio } from "@/components/personalizar/Studio";
import { personalizarPage } from "@/content/personalizar";
import { loadKits } from "@/lib/kits";
import { formatPesos, pricingPublished } from "@/lib/pricing";
import { absoluteUrl } from "@/lib/site";
import "./personalizar.css";

export const metadata: Metadata = {
  title: personalizarPage.metaTitle,
  description: personalizarPage.metaDescription,
  alternates: { canonical: "/personalizar/" },
  openGraph: {
    title: `${personalizarPage.metaTitle} | Kardo`,
    description: personalizarPage.metaDescription,
    url: "/personalizar/",
  },
};

/** Kits as the studio shows them; prices come from kits-catalog.json. */
function kitOptions(): KitOption[] {
  return loadKits().kits.map((kit) => ({
    code: kit.code,
    name: kit.name,
    items: kit.items,
    price: formatPesos(kit.price),
    panelLine: `Incluye ${kit.panelDays} días del panel en ${kit.panelPlanName}.`,
  }));
}

export default function Page() {
  return (
    <>
      <Header editorial home={false} pricing={pricingPublished()} />
      <main className="ps-page" id="contenido">
        <header className="ps-head">
          <h1>{personalizarPage.title}</h1>
          <p>{personalizarPage.lead}</p>
        </header>
        <Studio kits={kitOptions()} qrText={absoluteUrl("/piezas/")} />
      </main>
      <Footer />
    </>
  );
}
