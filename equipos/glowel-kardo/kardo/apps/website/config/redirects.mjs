// Short addresses of the website that forward somewhere else: to the panel
// (sign up, sign in, activate a kit) or to a section of the site. Printed
// pieces and WhatsApp messages can use them, so they must keep working even
// if the panel moves.
//
// Two layers, same table:
// 1. `out/_redirects` (scripts/harden-export.mjs): Netlify and Cloudflare
//    Pages answer with a 302 before any page loads and keep the query string
//    (`/registro?plan=negocio`, `/activar?codigo=…`).
// 2. A static page per address (src/app/[atajo]/page.tsx) that does the same
//    in the browser, for any other host and for `next dev`.

/**
 * Path of the panel's kit activation (the «Producto de Kardo» flow of the
 * Touchpoints section). It takes `?codigo=` and survives sign in and sign up.
 */
export const panelActivationPath = "/activar";

/**
 * @param {string} customerAppUrl Origin of the panel (config/site-env.mjs).
 * @returns {{ slug: string, to: string, title: string, keepQuery: boolean }[]}
 */
export function siteRedirects(customerAppUrl) {
  return [
    {
      slug: "registro",
      to: `${customerAppUrl}/registro`,
      title: "Crear tu cuenta",
      keepQuery: true,
    },
    {
      slug: "entrar",
      to: `${customerAppUrl}/`,
      title: "Entrar a tu panel",
      keepQuery: false,
    },
    {
      slug: "activar",
      to: `${customerAppUrl}${panelActivationPath}`,
      title: "Activar tu kit",
      keepQuery: true,
    },
    { slug: "planes", to: "/precios/", title: "Precios", keepQuery: false },
    { slug: "kits", to: "/precios/#kits", title: "Kits", keepQuery: false },
  ];
}

/**
 * The Netlify `_redirects` file (ADR 010). `302!` forces the rule over the
 * static page that exists at the same path; Netlify keeps the query string.
 * Paths go with and without the trailing slash (`trailingSlash: true`).
 * @param {string} customerAppUrl
 */
export function redirectsFile(customerAppUrl) {
  return `${siteRedirects(customerAppUrl)
    .flatMap(({ slug, to }) => [
      `/${slug}  ${to}  302!`,
      `/${slug}/  ${to}  302!`,
    ])
    .join("\n")}\n`;
}
