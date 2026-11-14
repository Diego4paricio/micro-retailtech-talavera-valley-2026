# Kardo Website Design System (DESIGN.md)

> **Design Direction:** B2B Editorial Platform for Local Businesses  
> **Inspiration:** Square's structural clarity (sharp white header, display typography, photography as page architecture, full-bleed bands, 1px dividers, restrained radii 0–12px, single idea per section) translated to Kardo's own identity (not copied).  
> **Dials:** `DESIGN_VARIANCE: 7`, `MOTION_INTENSITY: 2`, `VISUAL_DENSITY: 3`.

---

## 1. Brand Tokens & Color Palette

Kardo's palette is grounded in authentic, tangible materials: warm cream paper, deep carbon ink, and restrained accents of teal and aqua.

### Surfaces (Fondos)
- `--color-cream`: `#FBF9F5` (Dominant page background; warm, tactile, unbleached paper)
- `--color-paper`: `#F4EFE6` (Subtle container contrast; editorial canvas)
- `--color-white`: `#FFFFFF` (High clarity for header, reading strips and content bands)
- `--color-ink`: `#16232E` (Deep navy/carbon; reserved for closing section and high-contrast moments)
- `--color-ink-deep`: `#0D151C` (Darkest activation and footer surface)

### Typography & Ink
- `--color-text-primary`: `#16232E` (High legibility, deep ink)
- `--color-text-muted`: `#52646D` (Calibrated secondary text, minimum contrast ratio 4.8:1)
- `--color-text-soft`: `#7D8E98` (Tertiary metadata, footnotes, and disclaimer notes)
- `--color-text-inverted`: `#FFFFFF` (On ink surfaces)
- `--color-text-inverted-muted`: `#A0B0B8` (On ink surfaces)

### Brand Action Accent
- `--color-teal`: `#0A6C78` (Primary brand action: "Crear mi cuenta")
- `--color-teal-hover`: `#08545E` (Hover state)
- `--color-aqua`: `#4EC3CE` (Accent highlights on dark ink surfaces)

---

## 2. Typography

- **Display & Headings:** Geist Display & Serif (weights 600, 700). Tracking `-0.035em` for large hero and section titles; crisp, architectural, modern.
- **Body, Navigation & Controls:** DM Sans (weights 400, 500, 600). Open, readable, highly legible on small mobile screens.
- **Scale:**
  - Hero Display: `text-4xl sm:text-5xl lg:text-6xl` (`tracking-[-0.035em]`, `leading-[1.08]`)
  - Section Title: `text-3xl sm:text-4xl lg:text-5xl` (`tracking-[-0.03em]`, `leading-[1.15]`)
  - Subsection / Step Title: `text-xl sm:text-2xl` (`font-semibold`, `tracking-[-0.02em]`)
  - Body Regular: `text-base sm:text-[17px]` (`leading-relaxed`)
  - Caption / Label: `text-xs sm:text-sm` (`font-medium`)

---

## 3. Radii, Dividers & Structural Geometry

- **Radii:** Restrained `0px` to `12px` (`rounded-none`, `rounded-sm`, `rounded-md`, `rounded-lg`). Strict avoidance of generic `rounded-3xl` cards or floating pills.
- **Dividers:** Fine `1px` lines (`border-stone-200/80` or `border-ink/10` on light; `border-white/10` on dark) replace card containers and drop shadows.
- **Container:** Broad max-width `1280px` to `1440px` with generous vertical breathing room (`py-20` to `py-28`).

---

## 4. Primary Conversion Architecture

- **Primary Funnel:** Direct registration flow:
  `Home pública → /registro (panel.signUp) → verificación por correo → contraseña → configuración del negocio → panel de Kardo`
- **Primary CTA:** `Crear mi cuenta` pointing to `panel.signUp` across all key sections:
  1. Header (fixed desktop & mobile drawer)
  2. Hero
  3. Kits y planes (kits por WhatsApp; panel solo desde $199 al mes, IVA incluido)
  4. Cierre final
- **Secondary Actions:**
  - `Entrar` / `Entrar a mi panel` pointing to `panel.signIn`.
  - `Ver cómo funciona` pointing to `#como-funciona`.
  - WhatsApp: secondary contact in the footer, the FAQ and the closing. No floating WhatsApp buttons.
  - Exception (ADR 025): each kit in "Kits y planes" and on `/piezas` is ordered with its own "Pedirlo por WhatsApp" button, because kits are sold by WhatsApp.

---

## 5. Imagery & Asset Rules

- **Originals Preserved:** All master JPEG assets are preserved in `public/media/landing/`.
- **Responsive WebP:** Images serve responsive WebP variants (640w, 1200w, 1800w) via `<picture>` or `srcset`.
- **Priority Loading:** Hero image has `priority` / `fetchPriority="high"`; all subsequent images load lazily.
- **Disclaimer Note:** Every gallery or context section displays the required visible disclaimer:
  *"Escenas ilustrativas generadas. No son clientes ni instalaciones de Kardo."*
