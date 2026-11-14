# Kardo Landing Page - Reporte de Aseguramiento de Calidad (QA)

**Fecha:** 2026-10-04  
**Rama:** `AntigravityLanding`  
**Alcance:** Exclusivamente `apps/website`  
**Referencia del Plan:** `Docs/KARDO_LANDING_SQUARE_ALIGNMENT_AND_CTA_PLAN.md`  

---

## 1. Resumen Ejecutivo

Se implementó el rediseño y alineación estructural de la página de inicio pública de Kardo, traduciendo los principios de diseño sobrio, editorial y material observados en referencias de comercio de alto nivel (Square):
- **Conversión Principal Unificada:** Redirección directa hacia el flujo de alta real en el panel (`Crear mi cuenta` → `panel.signUp` → `/registro`).
- **Democión de WhatsApp:** Se eliminó el botón flotante invasivo (`WhatsAppFloat`) de la home. WhatsApp se mantiene exclusivamente como canal de asistencia secundaria en footer, FAQ y plan Corporativo.
- **Identidad Visual Editorial:** Cabecera fija blanca nítida, lienzo cálido papel crema (`bg-paper`), tipografía display editorial de gran escala (DM Sans y Geist), líneas divisorias ultrafinas (1px hairline) y radios acotados (0 a 12px), eliminando la repetición de tarjetas crema con sombras y `rounded-3xl`.
- **Transparencia y Anti-Slop:** Inclusión obligatoria del aviso: *"Escenas ilustrativas generadas. No son clientes ni instalaciones de Kardo."* Eliminación de afirmaciones no verificables ("visitas reales", "sin interrupciones", "se distribuye en el borde", "personas únicas") y prohibición de guiones largos (`—`) y puntos medios (`·`).
- **Optimización de Assets:** Generación de variantes WebP responsivas (640w, 1200w, 1800w) preservando los originales JPEG intactos.

---

## 2. Matriz de Conversión y Mapeo de CTAs

| Ubicación | Texto del Botón / Enlace | Destino Resuelto | Propósito |
| :--- | :--- | :--- | :--- |
| **Header (Escritorio)** | `Crear mi cuenta` (Teal) | `panel.signUp` (`/registro`) | Alta directa del comerciante |
| **Header (Escritorio)** | `Entrar` (Muted) | `panel.signIn` (`/login`) | Acceso a clientes existentes |
| **Header (Móvil)** | `Crear mi cuenta` / `Entrar` | `panel.signUp` / `panel.signIn` | Mismo embudo en cajón accesible |
| **Hero** | `Crear mi cuenta` (Primario) | `panel.signUp` (`/registro`) | Llamada a la acción principal |
| **Hero** | `Ver cómo funciona` (Secundario)| `#como-funciona` | Navegación a la secuencia de pasos |
| **Banda de Activación** | `Crear mi cuenta` | `panel.signUp` (`/registro`) | Conversión tras conocer el precio ($199/mes) |
| **Banda de Activación** | `Ver detalle de planes en /precios/` | `/precios/` | Exploración de tiers de facturación |
| **Cierre (Footer)** | `Crear mi cuenta` / `Entrar a mi panel` | `panel.signUp` / `panel.signIn` | Doble acción final de onboarding |
| **FAQ / Footer** | `Escríbenos por WhatsApp` | `wa.me/5215500000000` | Contacto y soporte secundario únicamente |

*Nota:* No se utiliza el término "Solicitar demo" para enlaces que dirigen a registro.

---

## 3. Optimización de Imágenes (WebP Responsivo)

Las 6 imágenes de ambientación se mantuvieron en su formato original JPEG y se procesaron en 3 resoluciones WebP (640w, 1200w, 1800w) usando Pillow, reduciendo el peso de transferencia en más del 85%:

| Imagen | JPEG Original | WebP 640w | WebP 1200w | WebP 1800w | Reducción Promedio |
| :--- | :---: | :---: | :---: | :---: | :---: |
| `hero-touchpoint-card` | 382 KB | 14 KB | 30 KB | 53 KB | **86%** |
| `how-it-works-nfc` | 747 KB | 18 KB | 42 KB | 97 KB | **87%** |
| `food-and-drink-cafe` | 1.1 MB | 36 KB | 86 KB | 162 KB | **85%** |
| `retail-products-counter` | 426 KB | 16 KB | 33 KB | 56 KB | **87%** |
| `local-services-studio` | 761 KB | 28 KB | 60 KB | 101 KB | **87%** |
| `activation-card-editorial` | 370 KB | 13 KB | 29 KB | 51 KB | **86%** |

Cada imagen se sirve mediante elementos `<picture>` con etiquetas `<source type="image/webp" media="...">` y atributos `loading="lazy"` (excepto el Hero con `priority/fetchpriority="high"`).

---

## 4. Pipeline de Comprobación y Comandos Ejecutados

### A. Linter y Formato de Código (Biome)
```bash
pnpm --filter @kardo/website lint
```
- **Resultado:** `Checked 104 files in 114ms. No fixes applied.` (Código 100% limpio conforme a reglas de Biome).

### B. Verificación de Tipos TypeScript
```bash
pnpm --filter @kardo/website typecheck
```
- **Resultado:** `tsc --noEmit` completado con 0 errores de tipado.

### C. Suite de Pruebas Automatizadas (Vitest)
```bash
pnpm --filter @kardo/website test
```
- **Resultado:** **11 archivos de test superados, 155 pruebas pasadas (0 fallidas)**.
  - `test/content.test.ts` (60 pruebas): Valida ausencia estricta de em/en dashes, ausencia de puntos medios `·`, ausencia de frases prohibidas ("visitas reales", "sin interrupciones", "se distribuye en el borde", "personas únicas"), presencia de avisos de escenas ilustrativas, asignación de CTAs a `panel.signUp` y ausencia de `WhatsAppFloat` en la home.
  - `test/legal.test.ts` (5 pruebas): Integridad de términos y políticas.
  - `test/pricing.test.ts` (5 pruebas): Coherencia con catálogo de facturación.
  - `test/csp.test.ts` (6 pruebas): Reglas de Content Security Policy estricta.
  - `test/qr-art.test.ts` (7 pruebas): Renderizado SVG de códigos legibles.
  - `test/panel-link.test.ts` (6 pruebas): Resolución adecuada de URLs hacia el panel.

### D. Compilación de Producción y Exportación Estática (Next.js 16 + Turbopack)
```bash
pnpm --filter @kardo/website build
```
- **Resultado:**
  - Compilación exitosa en 2.3s con TypeScript validado en 3.2s.
  - Exportación estática generada para 11 rutas (`/`, `/precios/`, `/privacidad/`, `/terminos/`, `/cancelacion-y-reembolsos/`, `robots.txt`, `sitemap.xml`, etc.).
  - Script `harden-export.mjs` completado: CSP inyectada en 8 páginas HTML con 16 hashes para scripts inline y archivo `_headers` emitido.

---

## 5. Inspección Visual y Responsive

La página fue inspeccionada visualmente en los tres viewports canónicos:

1. **Desktop (1440 × 1054 px):**
   - Cabecera fija nítida con espaciado equilibrado (`max-w-7xl`).
   - Hero asimétrico con imagen estructural en madera/papel sin tarjetas superpuestas.
   - Tipografía display jerárquica con titular a tres líneas máximo.
   - Secuencia "Cómo funciona" en 3 pasos con línea conectora vertical y foto contextual de interacción NFC.
   - Acordeón editorial de dos columnas con divisores finos de 1 px para Capacidades.
   - Galería de 3 giros con tarjetas asimétricas y notas contextuales claras.
   - Cero desbordamiento horizontal (`scrollWidth === clientWidth`).

2. **Tablet (1054 × 900 px):**
   - Transición fluida de rejillas a dos columnas o apiladas con márgenes protegidos (`px-6`).
   - Todos los titulares mantienen escala sin salto antiestético de palabras.

3. **Móvil (390 × 844 px):**
   - Menú hamburguesa accesible con botón de 44×44 px de área táctil.
   - Al pulsar Escape o hacer clic en un enlace de navegación, el menú se cierra y el foco regresa al botón disparador (`triggerRef.current?.focus()`).
   - Atributos `role="dialog"`, `aria-modal="true"` y bloqueo de desplazamiento en `document.documentElement` mientras el menú está abierto.
   - Ausencia total de `transition-all`.
   - Botón CTA principal a ancho completo con altura mínima de 48 px.
   - Cero desbordamiento horizontal en 390 px.

---

## 6. Auditoría SEO y Accesibilidad

- **Etiqueta Title:** `Kardo | Tu negocio, en un solo panel`
- **Meta Descripción:** Concisa, informativa, orientada a beneficios reales y sin frases de relleno de IA.
- **Jerarquía de Encabezados:** Un único `<h1>` en la página ("Actualiza lo que abre tu QR, NFC o link.") seguido de una estructura estricta de `<h2>` y `<h3>`.
- **OpenGraph & Canonical:** Canonical hacia URL base y metadatos sociales coherentes.
- **Sitemap & Robots:** Archivos estáticos `sitemap.xml` y `robots.txt` presentes en la raíz de exportación.
- **Movimiento Reducido:** Se respeta `prefers-reduced-motion`; no existen efectos de scroll-jacking, carruseles descontrolados ni animaciones pesadas.

---

## 7. Limitaciones y Alcance Real

1. **Capturas de Pantalla del Panel:** Actualmente no se han incluido mockups de software simulados para respetar el principio de no inventar interfaces. Cuando existan capturas reales del panel de producción de Kardo, se integrarán en el acordeón de capacidades.
2. **Entorno Local de Previsualización:** El servidor de previsualización local utiliza HTTP en puerto 5177 con el script `preview.mjs` que adapta la CSP para evitar conflictos de `upgrade-insecure-requests` en navegadores locales sin certificado SSL. La exportación estática de producción mantiene la política CSP completa con HTTPS.
