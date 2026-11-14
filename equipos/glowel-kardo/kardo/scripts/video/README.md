# Videos de demostración (Playwright + Chrome, con subtítulos)

Herramienta local para grabar recorridos del producto con subtítulos, reloj en hora de México y un recuadro que resalta lo importante. Salen en MP4 con hojas de contacto para revisarlos antes de entregarlos. Solo desarrollo: kardo-dev y Stripe en modo prueba.

## Preparación (una vez por máquina)

```bash
cd scripts/video && npm install --no-save --no-package-lock playwright-core@1.63.0
```

- Usa el Google Chrome instalado (`channel: "chrome"`); no descarga navegadores.
- Necesita `ffmpeg` en el PATH (`/opt/homebrew/bin/ffmpeg`).
- `scripts/video/node_modules` y `scripts/video/.out/` no se versionan.
- Si `npm install` falla dentro del monorepo ("Cannot read properties of null (reading 'matches')"), instálalo en otra carpeta (`npm install playwright-core@1.63.0` en un directorio con su propio `package.json`) y enlaza solo el paquete: `mkdir -p scripts/video/node_modules && ln -s <carpeta>/node_modules/playwright-core scripts/video/node_modules/playwright-core`.

## Stack local para grabar

En la máquina del dueño, 5173 y 5174 los ocupa otro proyecto (RFB-V2), y 3001 y 3002 los usa un `tsx watch` suyo que se reinicia con cada edición. **No los toques.** Levanta una copia aparte, sin watch, en este orden:

```bash
# 1. Webhooks de Stripe hacia la copia (reescribe STRIPE_WEBHOOK_SECRET en .env)
node scripts/stripe/listen.mjs --port=3011
# 2. APIs (después de listen, para que lean el secreto nuevo)
cd services/customer-api && CUSTOMER_API_PORT=3011 CUSTOMER_APP_ORIGIN=http://localhost:5185 BILLING_TERMS_URL=http://localhost:5177/terminos/ pnpm exec tsx --env-file=../../.env src/index.ts
cd services/staff-api && STAFF_API_PORT=3012 OPERATIONS_APP_ORIGIN=http://localhost:5186 pnpm exec tsx --env-file=../../.env src/index.ts
# 3. Webs
cd apps/customer-web && VITE_CUSTOMER_API_URL=http://localhost:3011 VITE_WEBSITE_URL=http://localhost:5177 pnpm exec vite --port 5185 --strictPort
cd apps/operations-web && VITE_STAFF_API_URL=http://localhost:3012 pnpm exec vite --port 5186 --strictPort
cd apps/website && PUBLIC_CUSTOMER_APP_URL=http://localhost:5185 pnpm exec next dev --port 5177
```

- Córrelos en segundo plano, con la salida a un log. `curl` a localhost está bloqueado: para comprobar `/health`, usa `node -e 'fetch(...)'`.
- CORS es de un solo origen: si cambias un puerto web, cambia también el `*_APP_ORIGIN` del API.
- Antes de levantar nada, avisa a la otra sesión (SendMessage) y apaga todo al terminar (TaskStop).
- Si hace falta, la tarea horaria se dispara a mano con un `POST http://localhost:3011/internal/billing/tick` y `Authorization: Bearer <BILLING_CRON_KEY de .env>`, desde un script de node que no imprima la llave.
- `listen.mjs` escribe en su salida el secreto de firma de la CLI: no compartas ese log.

### Resolver local para la pausa por cobro (video 2)

El Resolver con la pausa no está desplegado; para mostrarla de verdad, corre una copia local y apunta **solo la pausa** hacia ella con `BILLING_RESOLVER_URL` (las publicaciones siguen yendo a `TAP_RESOLVER_URL`). Las tres llaves son locales y aleatorias, distintas entre sí; guárdalas en un archivo fuera del repo, nunca en `.env`:

```bash
# Llaves locales (una vez), en un archivo privado fuera del repo
node -e 'const k=()=>require("crypto").randomBytes(24).toString("base64url");console.log(`export LOCAL_PUBLISH_KEY=${k()}\nexport LOCAL_BILLING_KEY=${k()}\nexport LOCAL_SUSPENSION_KEY=${k()}`)' > /ruta/privada/video.env
source /ruta/privada/video.env
cd services/resolver && pnpm exec wrangler dev --port 8787 --ip 127.0.0.1 \
  --var "PUBLISH_COMMAND_KEY:$LOCAL_PUBLISH_KEY" --var "BILLING_COMMAND_KEY:$LOCAL_BILLING_KEY" \
  --var "SUSPENSION_COMMAND_KEY:$LOCAL_SUSPENSION_KEY" --persist-to /ruta/privada/wrangler-state
# APIs con la pausa hacia el Resolver local (agrega a los comandos de arriba)
BILLING_RESOLVER_URL=http://localhost:8787 BILLING_COMMAND_KEY=$LOCAL_BILLING_KEY
```

`trial-tour.mjs` crea fuera de cámara el Touchpoint "Mesa 1" (SQL) y publica su página en ese Resolver con `POST /internal/publish` y `VIDEO_LOCAL_PUBLISH_KEY`.

## Grabar

```bash
node scripts/video/accounts.mjs owner friend      # cuentas nuevas por toma
node scripts/video/billing-tour.mjs                # video 1: alta, Checkout, Operations
node scripts/video/accounts.mjs owner friend demo
VIDEO_LOCAL_PUBLISH_KEY=$LOCAL_PUBLISH_KEY node scripts/video/trial-tour.mjs   # video 2: prueba de 15 días
```

- **Cuentas:** `accounts.mjs` crea usuarios `delivered+kardo-<clave>-<fecha>@resend.dev`. Es la bandeja de prueba de Resend, así que nada llega a nadie. Guarda correo, contraseña y id de su espacio personal en `.out/accounts.json` (modo 600). Usa cuentas nuevas en cada toma: el alta y la prueba solo pasan una vez por persona.
- **Salida:** `.out/<nombre>.mp4` y `.out/<nombre>-sheet*.jpg`. **Revisa las hojas de contacto** (con la herramienta Read) antes de entregar. Rehaz la toma si un subtítulo tapa lo que explica, si hay más de 20 s muertos o si algo falló. El MP4 final se copia al escritorio del dueño.
- **Herramientas de `lib.mjs`:** `say(paso, etiqueta, título, texto, ms, locator, día)`. Las etiquetas son `HOY`, `PENDIENTE`, `PRUEBA` y `SIMULADO`; el día aparece junto al reloj. También hay `slide(html, ms)`, `wheel(px)`, `unmark()`, `repaint()`, `offCameraSession()`, `totp()` y `finishVideo()`.

### Video 3 (relevo 20): Checkout en el panel, factura, reloj de Stripe y borrado

- **Resolver local:** `node scripts/video/resolver-local.mjs /ruta/privada/video.env`. Usa la `PUBLISH_COMMAND_KEY` de `.env`, para que la copia del API retire páginas al borrar, y las llaves locales `LOCAL_BILLING_KEY` y `LOCAL_SUSPENSION_KEY` del archivo privado. wrangler las muestra como `(hidden)`.
- **Customer API de la copia:** como arriba, más `BILLING_RESOLVER_URL=http://localhost:8787 BILLING_COMMAND_KEY=$LOCAL_BILLING_KEY BILLING_DELETE_ENABLED=true`. El borrado se enciende **solo en esa copia**. Antes de cada tarea horaria el guion se detiene si en kardo-dev vence para borrarse cualquier organización distinta de la suya.
- **Panel:** el video 3 muestra el Checkout integrado. Desde el 1-oct el panel usa la página de Stripe por omisión, así que para volver a grabarlo arranca el panel con `VITE_STRIPE_EMBEDDED_CHECKOUT=true`.
- **Grabar:**
  1. `node scripts/video/accounts.mjs owner guest`;
  2. `node scripts/video/round2-tour.mjs`.
  Con `FACTURAPI_KEY` (`sk_test_`) emite el CFDI con Facturapi; sin ella, captura un folio de prueba. El reloj de prueba de Stripe se borra al terminar.

## Recetas que ya funcionan

- **El código por correo sin enviar correo:**
  1. Muestra `/registro` con el correo y la casilla de Términos marcada. El subtítulo dice que el código se salta.
  2. Inyecta la sesión obtenida fuera de cámara (`offCameraSession`), más `localStorage["kardo.pendingTermsAcceptance"] = {"terms":"1.0","privacy":"1.0"}` y `sessionStorage["kardo.registration-stage"] = "password"`.
  3. Recarga `/`. Aparecen "Elige tu contraseña" y luego el alta (`#business-name`, `#business-type`).
  4. El plan elegido en `/precios/` viaja en `sessionStorage["kardo.signup-plan"]`.
- **Checkout de Stripe (hosted):**
  - campos `#cardNumber`, `#cardExpiry` (teclea `1234`), `#cardCvc` y `#billingName`;
  - botón `button[type=submit]`;
  - tarjeta de prueba `4242 4242 4242 4242` (solo modo prueba).
  - Espera el regreso al panel y recarga: el webhook tarda unos segundos.
- **Portal de Stripe:**
  - `getByText("Seleccionar").nth(i)` elige el plan;
  - `getByTestId("continue-button")`, luego `getByTestId("confirm")` y `getByTestId("return-to-business-link")`;
  - la pantalla de confirmación muestra "Importe adeudado: hoy".
- **Operations:**
  - `Correo de trabajo` y `Contraseña` salen de `E2E_STAFF_*` en `.env`;
  - `Código de 6 dígitos` sale de `totp(E2E_STAFF_TOTP_SECRET)`.
  - Cada carga completa pasa unos 2 s por "Verificando tu sesión" y hasta 4 s más por los datos. **Espera un texto** de la página (por ejemplo "MRR" o "Avisos al cliente"), no una respuesta de red.
- **Franja, diálogo y confirmación de plan (panel):** `.access-strip` (franja; botón "Elegir plan"), el diálogo por rol `dialog` con "Elige un plan para seguir editando", y `.plan-choice` (tarjeta "Confirma tu plan" con "Continuar a pago").
- **Operations, acceso y CFDI:** tarjetas "En prueba · Limitadas · En pausa · Por borrar · Internas" en `/billing`, sección "Acceso" en `/billing/workspaces/<id>` (interruptor "Cuenta interna (demo)") y `/billing/facturas` ("Marcar emitida", campo "Folio fiscal (UUID)").
- **Tiempo simulado (prueba en día 8, 12, 15, 22…):**
  1. Mueve `started_at` y `ends_at` de `kardo_billing.trials` con SQL (MCP `supabase-kardo` o un script de node con `SUPABASE_ADMIN_DATABASE_URL`).
  2. Dispara la tarea horaria y recarga.
  3. Márcalo en pantalla con la etiqueta `SIMULADO` y el día ("Día 15 de la prueba").
- **Resaltar:** `say()` centra el elemento antes de dibujar el recuadro. El subtítulo ocupa unos 120 px abajo, así que desplaza las listas largas antes de hablar de ellas.

## Limpieza al terminar

- Cancela las suscripciones de prueba creadas en la toma, con un script de node y la llave de prueba. Déjalas si el dueño las va a ver en Operations.
- Apaga los procesos que levantaste.
- Anota en el relevo qué cuentas quedaron en kardo-dev.
