import type { ReactNode } from "react";
import { Logo } from "../Logo";
import { WhatsAppIcon } from "../ui";
import { type PageTheme, themeAttributes } from "./theme";

/*
  The markup of services/resolver/src/render.ts, one function per template,
  with the same class names (styles in src/app/kardo-page.css). Links and
  form controls are drawn, not live: on the landing they illustrate a page,
  they do not go anywhere.
*/

/** Live state of an item (ADR 017), already resolved: hidden items are
 * left out before rendering, like the Resolver's applyItemAvailability(). */
export interface Availability {
  soldOut: boolean;
  remaining: number | null;
}

export interface MenuContent {
  type: "menu";
  title: string;
  description?: string;
  currency: string;
  sections: {
    id: string;
    name: string;
    items: {
      id: string;
      name: string;
      description?: string;
      price?: number;
      /** A drawn dish: the landing has no customer photos. */
      image?: ReactNode;
      availability?: Availability;
    }[];
  }[];
}

export interface CatalogContent {
  type: "catalog";
  title: string;
  description?: string;
  currency: string;
  items: {
    id: string;
    name: string;
    description?: string;
    price?: number;
    /** A drawn product: the landing has no customer photos. */
    image?: ReactNode;
    hasLink?: boolean;
    availability?: Availability;
  }[];
}

export type PageContent =
  | MenuContent
  | CatalogContent
  | {
      type: "profile";
      displayName: string;
      headline?: string;
      biography?: string;
      links: string[];
    }
  | { type: "links"; title: string; description?: string; links: string[] }
  | {
      type: "linkpage";
      displayName: string;
      bio?: string;
      socials: ("instagram" | "tiktok" | "whatsapp")[];
      links: { label: string; highlight?: boolean }[];
    }
  | { type: "image"; alt: string; image: ReactNode }
  | { type: "document"; title: string; description?: string }
  | {
      type: "form";
      title: string;
      description?: string;
      name: "hidden" | "optional" | "required";
      phone: "hidden" | "optional" | "required";
      message: "hidden" | "optional" | "required";
      consentText: string;
      submitLabel: string;
    };

/** es-MX currency, as the Resolver's formatPrice(). */
export function formatPrice(value: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency,
    }).format(value);
  } catch {
    return `${value.toFixed(2)} ${currency}`;
  }
}

type Flash = { ids: ReadonlySet<string>; key: number };

export function KardoPage({
  content,
  theme,
  changed,
  insetTop,
}: {
  content: PageContent;
  theme?: PageTheme;
  /** Items to flash after a publication; a new key replays the flash. */
  changed?: Flash;
  /** Room for a phone's status bar above the page's own padding. */
  insetTop?: number;
}) {
  const { className, style } = themeAttributes(theme);
  return (
    <div className="kp flex flex-1 flex-col">
      <div
        className={`page flex-1 ${className}`}
        style={insetTop ? { ...style, paddingTop: 28 + insetTop } : style}
      >
        <Body changed={changed} content={content} />
        <footer className="kardo-footer">
          <Logo className="h-[15px] w-auto" title="Kardo" tone="mono" />
        </footer>
      </div>
    </div>
  );
}

function flashProps(id: string, changed?: Flash) {
  return changed?.ids.has(id)
    ? { key: `${id}-${changed.key}`, flash: " kp-changed" }
    : { key: id, flash: "" };
}

function Body({ content, changed }: { content: PageContent; changed?: Flash }) {
  switch (content.type) {
    case "menu":
      return (
        <div className="card">
          <h1>{content.title}</h1>
          {content.description ? (
            <p className="description">{content.description}</p>
          ) : null}
          {content.sections.length === 0 ? <NothingAvailable /> : null}
          {content.sections.map((section) => (
            <div className="menu-section" key={section.id}>
              <h2>{section.name}</h2>
              <ul className="menu-items">
                {section.items.map((item) => {
                  const text = (
                    <>
                      <span className="name">{item.name}</span>
                      {item.description ? (
                        <div className="desc">{item.description}</div>
                      ) : null}
                    </>
                  );
                  const badge = <Badge availability={item.availability} />;
                  return (
                    <li
                      className={`menu-item${item.availability?.soldOut ? " is-sold-out" : ""}${flashProps(item.id, changed).flash}`}
                      key={flashProps(item.id, changed).key}
                    >
                      {item.image ? (
                        <span className="menu-thumb">{item.image}</span>
                      ) : null}
                      {item.image ? (
                        <span className="menu-text">{text}</span>
                      ) : (
                        <span>{text}</span>
                      )}
                      {item.price !== undefined || item.availability ? (
                        <span className="menu-meta">
                          {item.price !== undefined ? (
                            <span className="price">
                              {formatPrice(item.price, content.currency)}
                            </span>
                          ) : null}
                          {badge}
                        </span>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      );
    case "catalog":
      return (
        <div className="card">
          <h1>{content.title}</h1>
          {content.description ? (
            <p className="description">{content.description}</p>
          ) : null}
          {content.items.length === 0 ? <NothingAvailable /> : null}
          <div className="catalog-grid">
            {content.items.map((item) => (
              <div
                className={`catalog-card${item.availability?.soldOut ? " is-sold-out" : ""}${flashProps(item.id, changed).flash}`}
                key={flashProps(item.id, changed).key}
              >
                {item.image ? (
                  <div className="catalog-image">{item.image}</div>
                ) : null}
                <div className="catalog-body">
                  <div className="name">{item.name}</div>
                  <Badge availability={item.availability} />
                  {item.description ? (
                    <div className="desc">{item.description}</div>
                  ) : null}
                  {item.price !== undefined ? (
                    <div className="price">
                      {formatPrice(item.price, content.currency)}
                    </div>
                  ) : null}
                  {item.hasLink ? (
                    <span className="link-button">Ver más</span>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    case "profile":
      return (
        <div className="card">
          <h1>{content.displayName}</h1>
          {content.headline ? (
            <p className="headline">{content.headline}</p>
          ) : null}
          {content.biography ? (
            <p className="bio">{content.biography}</p>
          ) : null}
          <ButtonList labels={content.links} />
        </div>
      );
    case "links":
      return (
        <div className="card">
          <h1>{content.title}</h1>
          {content.description ? (
            <p className="description">{content.description}</p>
          ) : null}
          <ButtonList labels={content.links} />
        </div>
      );
    case "linkpage":
      return (
        <div className="card linkpage-card">
          <div className="avatar avatar-initials">
            {initials(content.displayName)}
          </div>
          <h1>{content.displayName}</h1>
          {content.bio ? <p className="bio">{content.bio}</p> : null}
          <ul className="socials">
            {content.socials.map((network) => (
              <li key={network}>
                <span className="social-icon">
                  <SocialGlyph network={network} />
                </span>
              </li>
            ))}
          </ul>
          <ul className="links">
            {content.links.map((link) => (
              <li key={link.label}>
                <span
                  className={`link-button${link.highlight ? " link-button--highlight" : ""}`}
                >
                  {link.label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      );
    case "image":
      return (
        <div className="card">
          <div className="hero-image">{content.image}</div>
        </div>
      );
    case "document":
      return (
        <div className="card">
          <div className="doc-icon">PDF</div>
          <h1>{content.title}</h1>
          {content.description ? (
            <p className="description">{content.description}</p>
          ) : null}
          <span className="link-button">Descargar PDF</span>
        </div>
      );
    case "form":
      return (
        <div className="card">
          <h1>{content.title}</h1>
          {content.description ? (
            <p className="description">{content.description}</p>
          ) : null}
          <div className="form">
            <Field label="Correo electrónico" />
            <Field label="Nombre" setting={content.name} />
            <Field label="Teléfono" setting={content.phone} />
            <Field label="Mensaje" setting={content.message} />
            <div className="consent">
              <span className="checkbox" />
              <span>{content.consentText}</span>
            </div>
            <span className="primary">{content.submitLabel}</span>
          </div>
        </div>
      );
  }
}

/** "Agotado", "Queda 1" or "Quedan N", like availabilityBadgeHtml(). */
function Badge({ availability }: { availability?: Availability }) {
  if (!availability) return null;
  if (availability.soldOut)
    return <span className="badge badge-sold-out">Agotado</span>;
  if (availability.remaining === null) return null;
  return (
    <span className="badge badge-low">
      {availability.remaining === 1
        ? "Queda 1"
        : `Quedan ${availability.remaining}`}
    </span>
  );
}

function NothingAvailable() {
  return <p className="description">Por ahora no hay artículos disponibles.</p>;
}

function ButtonList({ labels }: { labels: string[] }) {
  if (labels.length === 0) return null;
  return (
    <ul className="links">
      {labels.map((label) => (
        <li key={label}>
          <span className="link-button">{label}</span>
        </li>
      ))}
    </ul>
  );
}

function Field({
  label,
  setting = "required",
}: {
  label: string;
  setting?: "hidden" | "optional" | "required";
}) {
  if (setting === "hidden") return null;
  return (
    <div className="label">
      {label}
      {setting === "optional" ? " (opcional)" : ""}
      <span className="input" />
    </div>
  );
}

/** First letter of the first two words, like the Resolver's initials(). */
function initials(name: string): string {
  const letters = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0] ?? "")
    .join("");
  return (letters || name.slice(0, 1)).toUpperCase();
}

function SocialGlyph({
  network,
}: {
  network: "instagram" | "tiktok" | "whatsapp";
}) {
  if (network === "whatsapp") return <WhatsAppIcon className="size-[18px]" />;
  if (network === "instagram")
    return (
      <svg
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <rect height="18" rx="5" width="18" x="3" y="3" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" fill="currentColor" r="1" stroke="none" />
      </svg>
    );
  return (
    <svg aria-hidden="true" fill="currentColor" viewBox="0 0 24 24">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 0 1-2.59 2.5 2.6 2.6 0 0 1-2.6-2.6 2.6 2.6 0 0 1 3.34-2.49V9.66a5.73 5.73 0 0 0-.74-.05 5.69 5.69 0 0 0-5.69 5.69A5.69 5.69 0 0 0 9.86 21a5.69 5.69 0 0 0 5.69-5.69V9.01a7.33 7.33 0 0 0 4.28 1.36V7.28a4.28 4.28 0 0 1-3.23-1.46Z" />
    </svg>
  );
}
