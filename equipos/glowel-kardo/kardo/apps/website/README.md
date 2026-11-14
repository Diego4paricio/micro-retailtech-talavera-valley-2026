# Kardo Website

The public landing page. It sells the platform: QR codes, NFC tags and shareable links that open pages the business edits and publishes from its panel, with analytics and leads. NFC and QR carry the same weight; the physical pieces are optional formats. It sends people to the panel to create an account and to WhatsApp for questions. It is a separate surface (ADR 009/010): a static Next.js export for Netlify that never imports Customer App code, holds no secrets, has no server code and shares no cookies or origin with the panel. It only links out.

## Run it

```sh
pnpm --filter @kardo/website dev        # http://localhost:5177 (the APIs use 3001/3002)
pnpm --filter @kardo/website build      # static export in out/ + CSP and _headers
PORT=5178 pnpm --filter @kardo/website preview   # serves out/ like the host, with _headers
pnpm --filter @kardo/website test       # config, CSP, QR legibility, copy guards
# a phone-width screenshot of the preview, with console and CSP errors listed:
node apps/website/scripts/capture.mjs http://localhost:5178/ 390 844 2 shot.png --mobile
```

`next build` is followed by `scripts/harden-export.mjs`, which adds a `<meta>` Content-Security-Policy to every page (inline scripts allowed only by SHA-256 hash, no third-party origins), writes `out/_headers` (frame-ancestors, HSTS, nosniff, caching) and fails a production build that still links to localhost.

## Configuration

Only this allowlist reaches the pages (`config/site-env.mjs`, compiled through `env` in `next.config.ts`). Next.js reads it from the process environment or from `apps/website/.env.local`; it never reads the monorepo's root `.env`.

| Variable | Development default | Production |
|---|---|---|
| `KARDO_ENV` | `development` | `production` (set by `netlify.toml`) |
| `PUBLIC_WEBSITE_URL` | `http://localhost:5177` | required, HTTPS origin |
| `PUBLIC_CUSTOMER_APP_URL` | `http://localhost:5175` | required, HTTPS origin, different from the website |
| `PUBLIC_CONTACT_EMAIL` | empty | optional; adds a `mailto:` in the footer |
| `PUBLIC_WHATSAPP` | `522224944012` (Glowel's public line) | contact number with country code; spaces, `+`, `-` and parentheses are dropped |

The main action everywhere is **Crear cuenta**. WhatsApp is for questions: its links open `https://wa.me/<PUBLIC_WHATSAPP>` with a first message already written for each business type (`src/content/landing.ts`).

Links into the panel: **Entrar** → `PUBLIC_CUSTOMER_APP_URL/`, **Crear cuenta** → `PUBLIC_CUSTOMER_APP_URL/registro`. The panel treats `/registro` as an entry point: it opens the access screen on registration and then shows `/` (`entryIntent` in `apps/customer-web/src/lib/router.tsx`).

Only production builds may be indexed (`robots.txt` disallows everything otherwise).

## Deploy (Netlify)

1. New site from the repository, base directory `apps/website` (build command and publish directory come from `netlify.toml`).
2. Site environment variables: `PUBLIC_WEBSITE_URL`, `PUBLIC_CUSTOMER_APP_URL`, `PUBLIC_WHATSAPP` and, optionally, `PUBLIC_CONTACT_EMAIL`.
3. Custom domain and HTTPS in Netlify; then add the website origin wherever the panel lists allowed referrers, if any.

## Content rules

- Only what the MVP does today (`Docs/engineering/11-customer-mvp-capabilities.md`). `test/content.test.ts` fails on dashes, `·`, stock marketing phrases and promises outside the MVP: prices or plans (billing is not defined yet), hardware sales or shipping (ADR 012), "agenda en línea" (only a link through a Redirect), vCard, CRM, a mobile app, custom domains.
- Copy is Mexican Spanish with "tú" and short sentences. It lives in `src/content/landing.ts`, and the live demo's in `src/content/demo.ts`.
- Many businesses, never one case: tienda, restaurante, salón, profesional, inmobiliaria, hotel, eventos and escuela, each shown only with what Kardo does (checked with the panel session). `test/content.test.ts` also fails on bookings or appointments, orders or delivery, tips or paying the bill, tickets or access control, loyalty points, hotel check-in or room service, and medical data.
- Links (the @handle page) is its own product: the page shows it apart from QR, NFC and "Otro", never as another physical format or sharing groups.

## The demo and the replicas stay honest

- `src/app/kardo-page.css` and `src/components/kardo-page/` are a port of the public page the Resolver renders (`services/resolver/src/render.ts`: `brandCss`, one function per template, `themeAttributes()`), and `theme.ts` copies the panel's eight preset themes (`apps/customer-web/src/features/experiences/theme-style.ts`). When a template or a theme changes there, change it here too.
- The live demo (`src/components/demo/`) lets you pick one of three businesses and has what the product has:
  - **Café Central:** a group of 20 tables, a Menú and a Catálogo with photos, draft and publish as separate steps, immutable versions and rollback, and live availability outside the versions ("Agotado", "Quedan N", hidden; ADR 017).
  - **Florería Lila:** a Catálogo with "Ver más" to its WhatsApp and live availability, and its Links page @florerialila shown apart as the separate product.
  - **Estudio Noa:** its reception plate switches between a Página de enlaces and a Formulario. The form always asks for the email; a sent form lands in Leads with its consent and exports to CSV like the panel does.
  - Every business counts NFC and QR visits per point, and its ad is an "Otro" point of its own (URL directa) that publishing also covers. Leads only come from a Formulario, so only Estudio Noa has them. The Resumen replica follows the chosen business through `src/lib/demo-business.ts`.
  - The phone renders the page at 390 px and zooms it, so the Resolver's sizes stay real. `LiveForm.tsx` is a working copy of the Resolver's `renderForm()` and notice page.
- Menú photos and availability follow ADR 017 as the Resolver renders them (`menu-thumb`, `menu-meta`, `badge`, `is-sold-out`), deployed on 2026-09-28. Button text on light accents (`--t-on-accent`) and the Catálogo badge alignment were ported from the Resolver the same day; real pages show them once the Resolver is deployed.
- The Resumen replica (`src/components/insights/`) follows the panel's default board and tokens (KPI cards with sparkline and delta, trend against the previous period with titled axes, channel donut, day by hour heatmap with the 5-step teal ramp, ranking, funnel), with example data.
- Every QR on the page is real and opens the site: `test/qr-art.test.ts` decodes the geometry. On the QR table photo the code is drawn over a blank card in HTML, so it follows `PUBLIC_WEBSITE_URL`.

## Visual language and media

- Tailwind CSS v4 with the brand tokens in `src/app/globals.css` (same colors as the panel), Geist semibold for titles and figures (the panel's `--font-display`), DM Sans for text, lucide icons. Motion is CSS only and turns off with `prefers-reduced-motion`.
- Fonts are self-hosted from npm (fontsource). The site sets no cookies and loads nothing from third parties.
- The hero has no background photo. The title speaks to the visitor's trade ("Tu negocio, en un solo panel.", with the word in aqua rotating through florería, salón, restaurante, inmobiliaria and despacho). The drawing next to it answers with the product:
  - that business's panel: the real sidebar, a Resumen with its own widgets (KPIs, Reparto por canal, "Touchpoints con más accesos") and, for some, a window of another section (Disponibilidad or Leads);
  - in front, the page its customers open.
  - Data are in `src/components/hero/businesses.tsx`, checked with the panel session on 2026-09-29.
  - The businesses are made up for the landing (Jacaranda, Nácar, Tamarindo, Arista, Cifra). Their logos are SVG drawn for the site (`src/components/hero/logos.tsx`), not real brands and never Kardo's.
  - Their pages (`src/components/hero/HeroPages.tsx`, styles in `src/app/hero-pages.css`) are designed the way the Estudio's HTML mode allows (ADR 018, addendum of 2026-09-29): photos from the library, the Estudio's webfonts (Playfair Display, Lora, Space Grotesk, Poppins, Geist, copied from `packages/page-render/fonts` to `src/app/fonts/`, not preloaded), no scripts, and the Kardo mark at the end.
  - Nácar, Cifra and the top of Arista fit the HTML mode. The live availability in Jacaranda's Catálogo and Tamarindo's Menú, and Arista's form, are the Estudio's native blocks of phase 3 (the HTML mode strips forms).
  - **The site must not go public before both are deployed**, as with ADR 017. The fallback and the HTML mode's rules (fonts, SVG allowlist, links) are in `Docs/engineering/15-relevo-sitio-web.md`, section 4.
  - Photos: `public/media/hero/*.webp` (172 KB), made by `python3 scripts/media/hero-pages.py` from the sources that `scripts/media/fuentes/descargar-hero-paginas.sh` downloads (git-ignored). Bouquet, chilaquiles and house are Higgsfield z_image; the others are Unsplash (Unsplash License, commercial use, no Unsplash+, no faces or brands).
  - `src/components/hero/HeroVisual.tsx` draws it all at a fixed size in CSS px (740×560) and scales it as a whole with a plain 2D `scale()`. The wrapper keeps the ratio of the part it shows (`--hv-view`) in CSS, and a ResizeObserver sets the scale as a number; CSS steps cover the first paint.
    - Below 640 px the view starts after the panel's sidebar (`--hv-left`) and runs to the screen edges, so the Resumen and the phone come out larger.
    - Side by side (1024 px and up) the section is exactly one window tall (`min-height: 100svh`), so the next section never peeks in.
    - The product takes up to 12rem of the right margin (17rem from 1600 px), and it also fits the window's height: `max-width` is capped at `(100svh - 12rem) × 740/560`. Changes are opacity and short translations only, so WebKit and Blink render them the same. Earlier heroes broke in Safari with `tan(atan2())` over container units and with a projective `matrix3d()`: do not bring those back.
  - `Hero.tsx` rotates only while the hero is on screen and the tab is visible. With `prefers-reduced-motion` the title says "negocio" and the drawing keeps the first business.
  - The photo hero it replaced (2026-09-28: counter photo, `SceneFit`, `quad.ts`, `hero-scene.mjs`) is archived outside git in `scripts/media/fuentes/hero-foto-2026-09-28.tar.gz`.
- `src/app/og-producto.jpg` (700×560) is the hero's drawing with its first business, captured from the page at 1:1 over the hero's background. `opengraph-image.tsx` puts it next to the title in Geist 600 from `og-geist-600.ttf`, a static instance of the variable font made with fontTools, because next/og cannot read woff2. Capture it again when the drawing changes.
- The other photos in `public/media/` were generated with Higgsfield as placeholders. Kardo sells no hardware (ADR 012), so no piece shows the Kardo symbol as a product. Each plate, card or sticker carries the name of the business that owns it (Cocina Maru, Estudio Noa, Roble Inmobiliaria, Florería Lila, Ana Treviño, Sofía Ramírez) and a generic NFC icon (lucide "Nfc").
  - `scripts/media/compose-symbol.mjs` painted out the symbol and composed that mark with the piece's perspective (the `brand` patch; format in its header). There is one job per photo in `scripts/media/jobs/`.
  - Never ship a logo drawn by a model: generate the piece plain and compose. `test/content.test.ts` fails if the copy calls a piece a Kardo product.
  - Replace them with real photos when there are some, keeping the file names: `qr-mesa.webp` 900×1200 with its blank card where it is, business photos 1200×900, pieces 900×1200 (`etiquetas.webp` is 900×1125).
- Source files live in `scripts/media/fuentes/`, which git ignores:
  - `hero-mostrador.png` is Higgsfield job `43be6f38-d7bd-4cab-bc9c-49134dff5b61` (z_image, 2048×1152), the photo of the retired hero;
  - the pieces before their names come from `git show fa6f9af:apps/website/public/media/<name>.webp`.
- Catálogo products and the promotion poster are drawings (`src/components/kardo-page/illustrations.tsx`), not photos.
- Legal pages (aviso de privacidad, términos) are not included: their text has to come from Glowel.
