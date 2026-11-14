# Home editorial: cierre de implementación

Branch: `AntigravityLanding`. Fecha: 2026-10-05.

## Cambios de esta fase

- `src/app/landing-editorial.css`: entrada escalonada del hero (300 ms, desfases de 50 ms), máscaras del manifiesto y galería (500 ms), activación escalonada (300 ms, desfases de 40 ms), transiciones de capacidades (220 ms), foco visible y respuesta al presionar (160 ms). Las transiciones espaciales se desactivan con movimiento reducido.
- `src/components/landing/HeroVideo.tsx`: video automático, silenciado y sin controles, a partir de 1024 px y solo sin preferencia de movimiento reducido. Poster para móvil y tablet. Pausa al salir de pantalla y al ocultarse la pestaña. Retirado el CSS del botón anterior.
- `src/components/sections/Capabilities.tsx`: una capacidad abierta en todo momento, accesible por teclado; paneles cerrados inertes. Se anima opacidad y transformación, no altura. No se añadió blur para mantener la restricción de propiedades animadas.
- `src/components/sections/ActivationPricing.tsx`: entrada por grupos mediante Reveal, conservando precios y destinos.
- Tablet: texto e imagen del hero separados para evitar recortar el logo.

## Verificación

- `pnpm lint`: aprobado.
- `pnpm typecheck`: aprobado.
- `pnpm test`: 155 pruebas aprobadas en 11 archivos.
- `pnpm build`: Turbopack bloqueado al abrir un puerto de su proceso interno, con `Operation not permitted`. Persiste en el intento con permiso ampliado.
- Alternativa `pnpm exec next build --webpack && node scripts/harden-export.mjs`: aprobada; exportación estática y CSP generadas. No se cambió el comando de build del proyecto.
- Vista previa revisada a 390, 768, 1280 y 1680 px. Corregido el recorte del hero en tablet. Sin desbordamiento horizontal observado en móvil y escritorio amplio.
- Confirmada ausencia del elemento video a 390 y 768 px y presencia a 1680 px.
- Confirmado cambio por teclado del acordeón y un único botón expandido.

## Límites de verificación

La preferencia de movimiento reducido está contemplada en CSS y en la condición de montaje del video; no se emuló en el navegador de esta sesión. Tampoco se realizó una auditoría automática integral de contraste ni pruebas en dispositivos físicos. El loop automático sin control de pausa se conserva por decisión expresa del propietario; no se afirma conformidad integral WCAG.

No se hizo commit, push ni despliegue. No se modificaron precios, textos legales ni comportamiento del Portal.
