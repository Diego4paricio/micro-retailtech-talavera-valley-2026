import { businesses, businessesDisclaimer } from "@/content/landing";
import { EditorialImage } from "../landing/EditorialImage";
import { Reveal } from "../landing/Reveal";
import "@/app/landing-zonas.css";
export function Businesses() {
  return (
    <section
      id="para-negocios"
      className="editorial-section businesses-editorial"
      aria-labelledby="businesses-title"
    >
      <Reveal>
        <div className="businesses-heading">
          <h2 id="businesses-title">
            Cada negocio tiene
            <br />
            algo que compartir.
          </h2>
          <p>
            En una mesa, en tu mostrador o en recepción. Kardo conecta lo que
            haces con quienes te visitan.
          </p>
        </div>
      </Reveal>
      <div className="businesses-gallery">
        {businesses.map((business, index) => (
          <Reveal
            key={business.id}
            className={`business-feature business-feature-${index}`}
          >
            <article>
              <div className="business-photo">
                <EditorialImage
                  name={business.image.name}
                  alt={business.image.alt}
                  sizes={
                    index === 0
                      ? "(max-width: 1023px) 100vw, 56vw"
                      : "(max-width: 1023px) 100vw, 44vw"
                  }
                />
                <span>{business.name}</span>
              </div>
              <h3>{business.title}</h3>
              <p>{business.text}</p>
              <div className="business-channels">
                {business.channels.join(" / ")}
              </div>
            </article>
          </Reveal>
        ))}
      </div>
      <p className="editorial-note">{businessesDisclaimer}</p>
    </section>
  );
}
