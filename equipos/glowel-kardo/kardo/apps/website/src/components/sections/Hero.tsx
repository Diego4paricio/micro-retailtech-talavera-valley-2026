import { hero } from "@/content/landing";
import { loadKits } from "@/lib/kits";
import { loadPricing, pricingPublished } from "@/lib/pricing";
import { panel } from "@/lib/site";
import { HeroVideo } from "../landing/HeroVideo";
import { heroOffer } from "../pricing/start-copy";

export function Hero() {
  const published = pricingPublished();
  return (
    <section
      className="editorial-hero"
      id="inicio"
      aria-labelledby="hero-title"
    >
      <HeroVideo />
      <div className="editorial-hero-copy">
        <h1 id="hero-title">
          {hero.title} <span className="hero-accent">{hero.titleAccent}</span>
        </h1>
        <p className="editorial-lead">{hero.lead}</p>
        <div className="editorial-actions">
          <a className="editorial-button group" href={panel.signUp}>
            <span>{hero.ctaPrimary}</span>
            <svg
              aria-hidden="true"
              className="size-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <path
                d="M7 17L17 7M17 7H7M17 7V17"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
          <a
            className="editorial-link group"
            href={published ? "#precios" : "#kits"}
          >
            <span>{hero.ctaSecondary}</span>
            <svg
              aria-hidden="true"
              className="size-3.5 shrink-0 transition-transform duration-200 group-hover:translate-y-0.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              viewBox="0 0 24 24"
            >
              <path
                d="M12 5v14M19 12l-7 7-7-7"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        </div>
        {published ? (
          <p className="editorial-offer">
            {heroOffer(loadPricing(), loadKits())}
          </p>
        ) : null}
      </div>
    </section>
  );
}
