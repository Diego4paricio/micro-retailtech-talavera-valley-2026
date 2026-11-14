# Kardo — Contexto Completo del Proyecto y Arquitectura

> **Documento de Contexto para Modelos de IA (Gemini / Claude)**  
> **Fecha de corte:** Septiembre 2026  
> **Repositorio:** Monorepo de Kardo (`apps/`, `services/`, `packages/`, `supabase/`)  
> **Propósito:** Proporcionar todo el trasfondo de negocio, arquitectura técnica, contratos, reglas de seguridad y convenciones del proyecto para asistir en desarrollo, refactorización o auditoría.

---

## 1. Visión General y Propósito de Negocio

**Kardo** es una plataforma SaaS B2B que conecta **puntos de contacto físicos permanentes** (etiquetas NFC, códigos QR grabados o impresos en mesas, carteles, tarjetas de presentación) o **enlaces digitales** (páginas "Link-in-bio") con **experiencias digitales dinámicas y publicables**.

### El Problema y la Solución
- **Problema:** En hostelería, comercio local y servicios profesionales, cambiar un menú, un catálogo de temporada o un enlace de WhatsApp requiere reimprimir carteles, códigos QR o cambiar piezas de hardware, lo cual es costoso y lento.
- **Solución Kardo:** El código QR o chip NFC se imprime o fabrica **una sola vez**. El comerciante puede cambiar el contenido, el diseño visual, las promociones o la disponibilidad de platillos en tiempo real desde un panel web sin invalidar nunca el medio físico.

---

## 2. Pila Tecnológica (Tech Stack) y Entorno

- **Runtime y Gestor de Paquetes:**
  - Node.js `22.22.2` (especificado en `.node-version` y `package.json`).
  - pnpm `11.21.0` (`pnpm-lock.yaml`, monorepo con `pnpm-workspace.yaml`).
- **Calidad de Código y Tipado:**
  - TypeScript `5.9.x` con `tsconfig.base.json` estricto.
  - Biome `2.3.x` para linter y formateador (`pnpm format`, `pnpm lint`).
  - Vitest `4.x` para pruebas unitarias e integración.
- **Base de Datos & Autenticación:**
  - **Supabase / PostgreSQL:** Esquemas segregados (`kardo_core`, `kardo_private`, `kardo_staff`, `kardo_audit`, `kardo_billing`).
  - **Seguridad en Datos:** Row Level Security (RLS) estricta basada en roles y membresía en organizaciones.
  - **Supabase Auth:** JWT para clientes (`role=authenticated`) y doble factor TOTP (AAL2) para personal interno.
- **Backend & Edge:**
  - **Fastify (Node.js):** Servicios de Control Plane (`customer-api`, `staff-api`) desplegados en Google Cloud Run.
  - **Cloudflare Workers:** Servicios de Data Plane (`resolver`), cola de publicación (`publisher`), gestión de medios (`assets-worker`) y analítica (`analytics-worker`).
  - **Cloudflare Durable Objects & R2:** Almacenamiento y resolución en memoria/borde sin tocar la base de datos principal.
- **Frontends:**
  - **React 19 + Vite:** Panel de clientes (`apps/customer-web`) y panel de operaciones (`apps/operations-web`).
  - **Next.js 16 (Exportación Estática):** Sitio web público y landing comercial (`apps/website`), preparado para Netlify / Cloudflare Pages.
- **Pagos & Facturación:**
  - **Stripe:** Planes mensual/anual en MXN con IVA 16% incluido, Checkout con marca, Customer Portal y soporte de periodo de prueba de 15 días.

---

## 3. Arquitectura del Monorepo

```
Kardo/
├── apps/
│   ├── customer-web/       # Panel autenticado del cliente (React 19 + Vite)
│   ├── operations-web/     # Consola administrativa interna de Kardo (Vite)
│   └── website/            # Sitio público y landing comercial (Next.js 16 estático)
├── services/
│   ├── customer-api/       # API Fastify de gestión para clientes (Cloud Run)
│   ├── staff-api/          # API Fastify de soporte y operaciones internas (Cloud Run)
│   ├── resolver/           # Worker público: resuelve NFC/QR en el borde (Workers + DO + R2)
│   ├── publisher/          # Worker programado: compila y publica snapshots inmutables
│   ├── assets-worker/      # Worker de carga y validación segura de imágenes y PDFs
│   └── analytics-worker/   # Worker asíncrono para ingesta de métricas y leads
├── packages/
│   ├── contracts/          # Esquemas compartidos de validación (Zod/TypeBox) y contratos API
│   ├── domain/             # Entidades del dominio, lógica pura, roles y permisos
│   ├── page-render/        # Motor de renderizado HTML/CSS de experiencias y canvas
│   ├── billing/            # Integración con Stripe, cálculo de planes y avisos legales
│   ├── database/           # Conectores y helpers de PostgreSQL/Supabase
│   ├── permissions/        # Políticas y comprobación de permisos (RBAC)
│   ├── observability/      # Estructura de logs, métricas y telemetría
│   └── config/             # Constantes y esquemas de configuración por entorno
├── supabase/
│   ├── migrations/         # Migraciones SQL incrementales con RLS
│   └── tests/              # Tests de contrato de base de datos (schema_contract.sql)
├── scripts/
│   ├── e2e/                # Pruebas integrales de extremo a extremo (vertical-slice.mjs, operations.mjs)
│   ├── demo/               # Seed local de demostración ("Café Central")
│   └── deploy/             # Automatización de despliegue a Cloud Run y Cloudflare Pages
└── Docs/
    └── engineering/        # Documentación técnica profunda, ADRs (001-020) y bitácoras de relevo
```

---

## 4. Separación Vital: Control Plane vs. Data Plane

Uno de los pilares del diseño de Kardo es que **la resolución en calle de un código QR o chip NFC nunca debe depender de la base de datos de gestión**:

```
[ Cliente / Dueño del Negocio ]
             │
             ▼
   apps/customer-web (Puerto 5175)
             │
             ▼ (JWT / HTTPS)
 services/customer-api (Fastify + Cloud Run)
             │
   ┌─────────┴───────────────────────┐
   ▼                                 ▼
PostgreSQL (Supabase RLS)     services/publisher (Worker)
                                     │ (Compila snapshot inmutable)
                                     ▼
                       Cloudflare R2 + Durable Objects
                                     ▲
                                     │ (Resolución ultrarrápida < 50ms)
                                     │
                          services/resolver (Worker público)
                                     ▲
                                     │ (Escaneo QR o Tap NFC)
                                     │
                        [ Usuario Final / Comensal ]
```

1. **Control Plane:**
   - Maneja la autenticación, CRUD de organizaciones, borradores de páginas, personalización visual y analítica.
   - Aplica RLS estricta en PostgreSQL fijando las variables de sesión `kardo.subject` y `kardo.email` en cada transacción.
   - Al publicar, crea solicitudes de publicación (`publication_requests`) que despiertan al `publisher`.
2. **Data Plane:**
   - El servicio `resolver` recibe el tráfico público en `/t/{touchpointId}`, `/t/{id}/go/{itemId}` y `/@handle`.
   - Lee el snapshot activo directo de **Durable Objects / R2**.
   - No realiza consultas a PostgreSQL en el flujo de lectura normal, garantizando disponibilidad y resistencia ante picos de tráfico.
   - Registra eventos de acceso mediante Cloudflare Workers Analytics Engine de forma asíncrona y no bloqueante.

---

## 5. Módulos y Capacidades del Sistema

### 5.1. Touchpoints y Enlaces (Links)
- **Touchpoint Físico:** Representa una pieza física (`kind: "nfc" | "qr" | "other"`). Puede pertenecer a un `touchpoint_group` (ej. "Mesas Terraza").
- **Links:** Producto digital independiente (tipo link-in-bio) con identificador único (`/@handle`) y experiencia de perfil (`linkpage`).
- **Reglas de Propagación:**
  - *Precedencia directa:* Una experiencia asignada directamente a un Touchpoint tiene prioridad sobre la asignada a su grupo.
  - *Respaldo automático:* Si se retira una experiencia directa, el Touchpoint vuelve a servir la experiencia de su grupo.
  - *Retiro definitivo:* Un Touchpoint retirado responde permanentemente con `410 Gone`.

### 5.2. Estudio QR Vectorial (`packages/contracts/src/qr.ts`, `apps/customer-web/.../qr/`)
- Generador de códigos QR con 8 formas de módulo, 6 estilos de marcos de ojos, colores sólidos y degradados, logotipos y marcos con llamada a la acción (CTA).
- **Control de Presupuesto Reed-Solomon:** Margen mínimo de seguridad del 40 % para evitar que la inserción de logos o degradados destruya la corrección de errores.
- **Arnés de Verificación de Legibilidad:** Ejecuta un Web Worker con `jsQR` sometiendo la imagen generada a pruebas de bajo contraste, desenfoque óptico y ruido gaussiano antes de permitir la exportación.
- **Exportación:** SVG, PNG con metadatos DPI y PDF vectorial (individual o en hoja agrupada para mesas con marcas de corte).

### 5.3. Estudio de Experiencias (Canvas Libre + Modo HTML con IA)
- **8 Tipos de Plantillas Base:** Enlaces simples, perfil profesional, menú digital, catálogo de productos, captura de leads/formulario, enlace a PDF, redirección instantánea y linkpage.
- **Lienzo Libre (Canvas):** Posicionamiento libre de bloques mediante unidades relativas de viewport (`--u = 100cqw / 390`), con capas, guías inteligentes y orden de lectura semántico accesible.
- **Modo HTML Sanitizado:**
  - Permite a usuarios avanzados o mediante IA diseñar páginas a medida.
  - Limpieza exhaustiva en el backend con AST usando `parse5` (HTML) y `css-tree` (CSS): elimina scripts, eventos `onload`/`onclick`, fuentes externas no autorizadas y `iframes`.
  - Renderizado seguro en el cliente dentro de un Shadow DOM declarativo (`contain: layout paint`).
  - **Integración con IA:** Asistente para generar landing pages usando Claude Sonnet (Anthropic API) o mediante un puente local de desarrollo (`scripts/dev/ai-bridge/`) para pruebas sin costo.

### 5.4. Disponibilidad en Vivo (ADR 017)
- Para menús y catálogos, permite alternar platillos o productos entre: **Disponible**, **Agotado**, **Oculto** o fijar inventario rápido (**Quedan N**).
- **Sin republicar:** Se almacena en `kardo_core.item_availability` y se sincroniza al Durable Object del Resolver mediante `/internal/item-availability`. El comensal ve el cambio al instante sin que el dueño deba crear una nueva versión inmutable.

### 5.5. Resumen y Analítica de Alto Rendimiento
- Tablero interactivo en rejilla de 12 columnas (`react-grid-layout`) personalizable por cada usuario con 13 tipos de widgets (KPIs con sparklines, series temporales, interacción NFC vs QR, mapa de calor día×hora, etc.).
- Consultas optimizadas a Supabase y Cloudflare Analytics Engine agrupadas en una sola ida y vuelta SQL para responder en < 500 ms.

### 5.6. Facturación y Cumplimiento Legal (ADR 019 / ADR 020)
- **Modelo Comercial:** Sin plan gratuito permanente. Prueba de 15 días completa al registrarse, seguida de suscripción de pago (Planes: *Esencial*, *Profesional*, *Negocio*).
- **Stripe:** Precios en MXN con IVA 16% desglosado/incluido, Checkout y Customer Portal.
- **Cumplimiento Legal (México - LFPC y LFPDPPP):**
  - Tarea horaria (`pg_cron` en `/internal/billing/tick`) que despacha avisos por correo (vía Resend) a los 7, 3 y 0 días previos al vencimiento o cobro recurrente.
  - Exportación de leads con sanitización de inyección de fórmulas CSV.
  - Cuadros de diálogo y aceptación explícita de Términos y Condiciones y Aviso de Privacidad.

### 5.7. Consola de Operaciones (`apps/operations-web` + `services/staff-api`)
- Panel interno para el equipo de Kardo.
- Requiere autenticación de dos factores con TOTP (AAL2) y rol de staff activo.
- Permite diagnosticar Touchpoints, suspender administrativamente páginas con contenido malicioso (usando clave criptográfica de suspensión de emergencia), reintentar publicaciones fallidas y otorgar cortesías o cambios de plan con motivo de auditoría.

---

## 6. Reglas de Desarrollo y Convenciones del Código

Si estás escribiendo o modificando código en este proyecto, sigue estas reglas estrictas:

1. **Seguridad y Parámetros en Base de Datos:**
   - El cliente PostgreSQL usa `postgres.js` con `prepare: false` para compatibilidad con el pooler de transacciones.
   - Para insertar o actualizar columnas `jsonb`, **siempre** usa `sql.json(objeto)`. Nunca uses `${JSON.stringify(x)}::jsonb` (causa que se guarden strings escapados en lugar de objetos JSON reales).
   - Siempre invoca las consultas dentro de la función de contexto RLS (`withCustomerContext` o `withStaffContext`), garantizando que `set_config` fije el rol y tenant.
2. **Estilos y Componentes Frontend:**
   - **Cero colores ad-hoc:** Todos los colores provienen de variables CSS definidas en `apps/customer-web/src/styles/tokens.css`.
   - **Íconos:** Solo a través del componente unificado `Icon` (`components/Icon.tsx`), basado en Lucide.
   - **Tipografía:** Títulos y números en `Geist` semibold; textos de interfaz en `DM Sans`.
   - **Seguridad DOM:** Nunca uses `dangerouslySetInnerHTML`. Para vistas previas de diseño o modo HTML se usa el componente seguro `PreviewFrame` con iframe sandboxed o Shadow DOM.
3. **Manejo de Errores y Validaciones:**
   - Todo esquema de entrada y salida debe estar tipado en `@kardo/contracts`.
   - Los errores de API deben devolver códigos semánticos claros (ej. `TOUCHPOINT_RETIRED`, `TARGETS_OVERRIDDEN`, `PLAN_LIMIT`, `ORGANIZATION_LIMIT`).
4. **Verificación y Pruebas:**
   - Para validar cambios antes de consolidar:
     ```sh
     pnpm format:check
     pnpm lint
     pnpm typecheck
     pnpm test
     ```
   - Pruebas E2E completas contra el entorno local/dev:
     ```sh
     node scripts/e2e/vertical-slice.mjs    # Flujo completo del cliente
     node scripts/e2e/operations.mjs        # Flujo de la consola de operaciones
     ```

---

## 7. Comandos de Ejecución Local Rápida

Para iniciar los servicios en modo desarrollo:

```sh
# 1. API de Clientes (puerto 3001)
cd services/customer-api && CUSTOMER_APP_ORIGIN=http://localhost:5175 pnpm exec tsx watch --env-file=../../.env src/index.ts

# 2. API de Operaciones (puerto 3002)
cd services/staff-api && OPERATIONS_APP_ORIGIN=http://localhost:5176 pnpm exec tsx watch --env-file=../../.env src/index.ts

# 3. Frontend Cliente (puerto 5175)
cd apps/customer-web && pnpm exec vite --port 5175

# 4. Frontend Operaciones (puerto 5176)
cd apps/operations-web && pnpm exec vite --port 5176

# 5. Sitio Web Público (puerto 5177)
pnpm --filter @kardo/website dev
```

*Nota: Para ejecutar el panel de clientes sin necesidad de backend local, se puede arrancar en modo demo interactivo con `VITE_DEMO_MODE=true pnpm --filter @kardo/customer-web dev`.*
