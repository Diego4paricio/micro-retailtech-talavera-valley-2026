import { Coffee } from "lucide-react";
import type { ReactNode } from "react";
import { Logo } from "../Logo";
import {
  AristaMark,
  CifraMark,
  JacarandaMark,
  NacarMark,
  TamarindoMark,
} from "./logos";

/*
  The pages the customers of each business open, as a business designs them
  in the Estudio's HTML mode (ADR 018, addendum 2026-09-29): its own logo,
  photos from its library, its colors and one of the Estudio's webfonts,
  links only to https, WhatsApp or the phone, no scripts, and the Kardo
  mark kept at the end. Laid out at 390 px like a phone; the hero shows the
  top of each one. Photos: public/media/hero/ (Higgsfield and Unsplash).
*/

const photo = (name: string) => `/media/hero/${name}.webp`;

function Img({
  name,
  alt = "",
  className,
}: {
  name: string;
  alt?: string;
  className?: string;
}) {
  return (
    // biome-ignore lint/performance/noImgElement: a static export draws the pages as HTML, like the Resolver.
    <img
      alt={alt}
      className={className}
      decoding="async"
      loading="lazy"
      src={photo(name)}
    />
  );
}

function KardoFoot({ light }: { light?: boolean }) {
  return (
    <footer className={`hp-kardo ${light ? "hp-kardo-light" : ""}`}>
      <Logo className="h-[15px] w-auto" tone="mono" />
    </footer>
  );
}

function Button({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <span className={`hp-button ${className}`}>{children}</span>;
}

/** Jacaranda, taller floral (Catálogo): an editorial boutique. */
export function JacarandaPage() {
  return (
    <div className="hp hp-jacaranda">
      <div className="hp-j-hero">
        <Img name="floreria-ramo" />
        <div className="hp-j-brand">
          <JacarandaMark className="hp-j-mark" />
          <span>
            <b>Jacaranda</b>
            <small>taller floral</small>
          </span>
        </div>
        <div className="hp-j-tag">
          <span>Ramo de temporada</span>
          <b>$450</b>
          <em>Quedan 2</em>
        </div>
      </div>
      <div className="hp-j-body">
        <h2>Flores de temporada, armadas a mano.</h2>
        <p>Taller floral en Cholula. Abrimos de martes a domingo.</p>
        <div className="hp-j-grid">
          <figure>
            <Img name="floreria-rosas" />
            <figcaption>
              <span>Caja de rosas</span>
              <b>$680</b>
            </figcaption>
          </figure>
          <figure>
            <Img name="floreria-suculenta" />
            <figcaption>
              <span>Suculenta en barro</span>
              <b>$180</b>
            </figcaption>
          </figure>
        </div>
        <Button className="hp-j-button">Escríbenos por WhatsApp</Button>
      </div>
      <KardoFoot />
    </div>
  );
}

/** Nácar, estudio de uñas (Página de enlaces): dark and quiet. */
export function NacarPage() {
  return (
    <div className="hp hp-nacar">
      <div className="hp-n-brand">
        <NacarMark className="hp-n-mark" />
        <b>nácar</b>
        <small>estudio de uñas</small>
      </div>
      <div className="hp-n-arch">
        <Img name="salon-unas" />
      </div>
      <h2>Manos que se notan.</h2>
      <ul className="hp-n-list">
        <li>
          <span>Gelish en manos</span>
          <b>$350</b>
        </li>
        <li>
          <span>Uñas acrílicas</span>
          <b>$520</b>
        </li>
        <li>
          <span>Lifting de pestañas</span>
          <b>$590</b>
        </li>
      </ul>
      <div className="hp-n-actions">
        <Button className="hp-n-primary">Escríbenos por WhatsApp</Button>
        <Button className="hp-n-ghost">Síguenos en Instagram</Button>
        <Button className="hp-n-ghost">Cómo llegar</Button>
      </div>
      <KardoFoot light />
    </div>
  );
}

/** Tamarindo, cocina de barrio (Menú): warm, with the dish first. */
export function TamarindoPage() {
  return (
    <div className="hp hp-tamarindo">
      <header className="hp-t-head">
        <TamarindoMark className="hp-t-mark" />
        <span>
          <b>Tamarindo</b>
          <small>cocina de barrio</small>
        </span>
      </header>
      <div className="hp-t-hero">
        <Img name="restaurante-chilaquiles" />
        <div>
          <span>Chilaquiles de la casa</span>
          <b>$125</b>
        </div>
      </div>
      <div className="hp-t-tabs">
        <span data-on="">Desayunos</span>
        <span>Comida</span>
        <span>Bebidas</span>
      </div>
      <ul className="hp-t-list">
        <li>
          <Img name="restaurante-enchiladas" />
          <span>
            <b>Enchiladas verdes</b>
            <small>Pollo, crema y queso fresco.</small>
          </span>
          <em>$145</em>
        </li>
        <li>
          <Img name="restaurante-concha" />
          <span>
            <b>Concha con nata</b>
            <small>Recién horneada.</small>
            <i className="hp-t-low">Quedan 3</i>
          </span>
          <em>$38</em>
        </li>
        <li>
          <Img name="restaurante-cafe" />
          <span>
            <b>Café de olla</b>
            <small>Piloncillo y canela.</small>
          </span>
          <em>$45</em>
        </li>
        <li className="hp-t-out">
          <span className="hp-t-blank">
            <Coffee />
          </span>
          <span>
            <b>Capuchino</b>
            <i className="hp-t-sold">Agotado</i>
          </span>
          <em>$52</em>
        </li>
      </ul>
      <KardoFoot />
    </div>
  );
}

/** Arista, bienes raíces (Formulario): one house, big photos, a short form. */
export function AristaPage() {
  return (
    <div className="hp hp-arista">
      <div className="hp-a-hero">
        <Img name="inmobiliaria-casa" />
        <div className="hp-a-brand">
          <AristaMark className="hp-a-mark" />
          <b>ARISTA</b>
        </div>
        <span className="hp-a-price">$6,850,000</span>
      </div>
      <div className="hp-a-body">
        <h2>Casa en Lomas de Angelópolis</h2>
        <p className="hp-a-specs">
          <span>
            <b>3</b> recámaras
          </span>
          <span>
            <b>3.5</b> baños
          </span>
          <span>
            <b>240</b> m²
          </span>
        </p>
        <div className="hp-a-thumbs">
          <Img name="inmobiliaria-sala" />
          <Img name="inmobiliaria-cocina" />
        </div>
        <div className="hp-a-form">
          <b>Pide informes de esta casa</b>
          <span className="hp-a-field">Correo electrónico</span>
          <span className="hp-a-field">Nombre</span>
          <span className="hp-a-consent">
            <i /> Acepto que me contacten sobre esta propiedad.
          </span>
          <Button className="hp-a-button">Pedir informes</Button>
        </div>
      </div>
      <KardoFoot />
    </div>
  );
}

/** Cifra, despacho contable (Perfil): clean and trustworthy. */
export function CifraPage() {
  return (
    <div className="hp hp-cifra">
      <header className="hp-c-head">
        <CifraMark className="hp-c-mark" />
        <b>cifra</b>
        <small>despacho contable</small>
      </header>
      <div className="hp-c-photo">
        <Img name="despacho-oficina" />
      </div>
      <h2>C.P. Sofía Ramírez</h2>
      <p>Contabilidad para negocios y emprendedores en Puebla.</p>
      <div className="hp-c-grid">
        <span>
          <b>Declaraciones</b>mensuales y anuales
        </span>
        <span>
          <b>Facturación</b>CFDI 4.0
        </span>
        <span>
          <b>Nómina</b>y altas en el IMSS
        </span>
        <span>
          <b>Asesoría</b>para tu régimen
        </span>
      </div>
      <Button className="hp-c-primary">Escríbeme por WhatsApp</Button>
      <Button className="hp-c-ghost">Cómo llegar a la oficina</Button>
      <KardoFoot />
    </div>
  );
}
