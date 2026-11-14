import { contactMessage, navigation } from "@/content/landing";
import { legalDocuments, visibleLegalSlugs } from "@/lib/legal";
import { pricingPublished } from "@/lib/pricing";
import { panel, site, whatsappLink } from "@/lib/site";
import { Logo } from "./Logo";
import { Container } from "./ui";

export function Footer() {
  const year = new Date().getFullYear();
  return (
    <footer className="bg-ink-deep pt-16 pb-10 text-ink-text">
      <Container>
        <div className="grid gap-10 border-b border-white/8 pb-12 md:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <Logo className="h-8 w-auto" tone="dark" />
            <p className="mt-5 text-lg font-medium text-white">
              Tu negocio, siempre vigente.
            </p>
            <p className="mt-2 max-w-xs text-[15px] leading-relaxed text-ink-soft">
              Tus QR, tus NFC y tus links abren páginas que cambias cuando
              quieras.
            </p>
          </div>
          <nav aria-label="Secciones">
            <p className="text-sm font-semibold text-white">Kardo</p>
            <ul className="mt-4 grid gap-2.5 text-[15px]">
              {navigation.map((link) => (
                <li key={link.href}>
                  {/* Section anchors live on the home page; keep them working
                      from the legal pages too. */}
                  <a
                    className="hover:text-white"
                    href={
                      link.href.startsWith("#") ? `/${link.href}` : link.href
                    }
                  >
                    {link.label}
                  </a>
                </li>
              ))}
              {pricingPublished() ? (
                <li>
                  <a className="hover:text-white" href="/precios/">
                    Precios
                  </a>
                </li>
              ) : null}
            </ul>
          </nav>
          <div>
            <p className="text-sm font-semibold text-white">Contacto</p>
            <ul className="mt-4 grid gap-2.5 text-[15px]">
              <li>
                <a
                  className="hover:text-white"
                  href={whatsappLink(contactMessage)}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  WhatsApp
                </a>
              </li>
              {site.contactEmail ? (
                <li>
                  <a
                    className="hover:text-white"
                    href={`mailto:${site.contactEmail}`}
                  >
                    {site.contactEmail}
                  </a>
                </li>
              ) : null}
              <li>
                <a className="hover:text-white" href={panel.signIn}>
                  Entrar a mi panel
                </a>
              </li>
              <li>
                <a className="hover:text-white" href={panel.signUp}>
                  Crear cuenta
                </a>
              </li>
              <li>
                <a className="hover:text-white" href="/activar/">
                  Activar mi kit
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4 pt-8 text-sm text-ink-soft">
          <p>© {year} Kardo. Un producto de Glowel, hecho en México.</p>
          <nav aria-label="Legal">
            <ul className="flex flex-wrap gap-x-5 gap-y-2">
              {visibleLegalSlugs().map((slug) => (
                <li key={slug}>
                  <a className="hover:text-white" href={`/${slug}/`}>
                    {legalDocuments[slug].title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </Container>
    </footer>
  );
}
