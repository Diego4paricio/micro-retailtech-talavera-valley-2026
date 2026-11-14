# Usuarios simulados (agentes Haiku que usan Kardo como un cliente)

Herramienta del estudio del [relevo 31](../../../Docs/engineering/31-relevo-usuarios-simulados.md); el informe es [`Docs/engineering/research/2026-10-03-usuarios-simulados.md`](../../../Docs/engineering/research/2026-10-03-usuarios-simulados.md).

Cada persona maneja su propio Google Chrome (playwright-core de `scripts/video`, `channel: "chrome"`) por medio de comandos. El agente solo ve la pantalla: las capturas, que mira con Read, y una lista de lo que se puede tocar. Nunca lee el repositorio ni llama la API. Solo funciona en desarrollo, con kardo-dev.

## Archivos

| Archivo | Qué hace |
|---|---|
| `personas.mjs` | Personas: puerto, dispositivo (celular 390 x 844 o laptop 1280 x 800) y negocio. Direcciones del panel, del API y del sitio. |
| `fichas/*.md` | La ficha de cada persona y sesión: quién es, sus datos y sus tareas. Los marcadores `{{correo}}`, `{{contrasena}}`, `{{registro}}` y `{{panel}}` se llenan al armar el prompt. |
| `instrucciones.md` | Instrucciones comunes a todos los agentes: comandos, cómo hacer cada tarea, reglas e informe final. |
| `prompt.mjs` | Junta ficha e instrucciones con la cuenta y escribe `.out/prompts/<persona>-<sesion>.md`, con permisos 600 porque lleva la contraseña. |
| `navegador.mjs` | El navegador de una persona: un servidor en `127.0.0.1:<puerto>` que recibe los comandos, deja una captura numerada por acción y escribe `.out/<sesion>/<persona>/registro.jsonl`. |
| `k.mjs` | El único comando que usa el agente: `node k.mjs <persona> <comando> [args] -p "lo que piensa"`. |
| `servidores.mjs` | Stack propio: `api` (Customer API en 3031, pooler 6543, IA por el puente de dev), `panel` (`vite build` + `preview` en 5196) y `sitio` (sitio público en 5197). |
| `archivos.mjs` | Logos con el nombre de cada negocio y fotos reales del sitio en `.out/archivos/<persona>/`, para el comando `subir`. |
| `visitas.mjs` | Clientes simulados: abre las páginas publicadas de una persona desde celulares nuevos, para que la analítica tenga datos. |
| `resumen.mjs` | Métricas tomadas del registro: resultado, acciones, fallidas, regresos y minutos por tarea, calificación, y errores del API. Con `--acciones`, cada paso con lo que pensaba el agente. |
| `prospectos.mjs` | Clientes simulados que llenan el formulario publicado de una persona («Nombre\|teléfono\|mensaje»), para que Leads tenga solicitudes en el día a día. |
| `puente-turno.mjs` | Para el diseñador del puente: `esperar` aparta el turno más antiguo sin chocar con otro diseñador (y guarda copia en `.out/puente-archivo/`); `entregar` escribe `done/` de un jalón. `.out/puente/ALTO` le dice que termine. |
| `disenador.md` | El prompt del agente Sonnet que contesta el puente durante una ronda, con los tiempos máximos por turno. |
| `vigilar.mjs` | Avisos para el coordinador mientras corre una ronda: tarea cerrada, error de la herramienta, pago bloqueado, persona quieta 5 minutos, turno de IA esperando. Pensado para `Monitor`. |

## Comandos del agente

`ver`, `abrir`, `tocar "<texto>" [n]`, `tocar-punto <x> <y>`, `escribir "<campo>" "<texto>" [n]`, `borrar`, `elegir`, `subir "<botón>" "<archivo>"`, `tecla`, `bajar`, `arriba`, `atras`, `recargar`, `esperar <s>`, `pestanas`, `pestana <n>`, `cerrar-pestana`, `celular <url>`, `escanear [archivo]`, `mi-correo`, `archivos`.

Para el estudio: `tarea <n>`, `termine`, `me-atore`, `califica <1-5>`, `nota` y `salir`.

- **`tocar`.** Busca primero por rol y nombre exacto, luego por etiqueta y texto. Solo toca lo que está **a la vista** y recibe el toque, no lo que tapa una ventana. Si el elemento está fuera de la pantalla, pide al agente bajar.
- **`mi-correo`.** El alta es la real (`signInWithOtp`) y el correo va a la bandeja de prueba de Resend. El comando cambia el hash del código pendiente en `auth.one_time_tokens` y `auth.users` por uno conocido, igual que `scripts/e2e/customer-second-factor.mjs`, y se lo da al agente.
- **`escanear`.** Lee el QR de la pantalla o de un PNG descargado con `jsqr` (del panel) y lo abre en «el celular de un cliente», un contexto sin sesión.
- **`subir`.** Toca el botón como una persona y elige el archivo en el selector. Si el botón maneja un `input[type=file]` cercano, usa ese.

## Cómo correr una sesión

```sh
# 0. Una vez: archivos de las personas
node scripts/research/usuarios-simulados/archivos.mjs
# 1. Servidores (cada uno en segundo plano; avisa antes a las otras sesiones)
node scripts/research/usuarios-simulados/servidores.mjs api
node scripts/research/usuarios-simulados/servidores.mjs panel
node scripts/research/usuarios-simulados/servidores.mjs sitio
# 2. Navegador de la persona (crea su cuenta en .out/cuentas.json la primera vez)
node scripts/research/usuarios-simulados/navegador.mjs lupe primera
#    Días después, con su sesión guardada (celular) o sin ella (laptop, vuelve a entrar):
node scripts/research/usuarios-simulados/navegador.mjs lupe dia2 --continuar
# 3. Prompt para el agente Haiku (le pides que lea ese archivo y lo siga)
node scripts/research/usuarios-simulados/prompt.mjs lupe [dia2]
# 4. Métricas
node scripts/research/usuarios-simulados/resumen.mjs primera lupe paco --acciones
```

- **IA:** el API escribe los turnos en `.out/puente/pending/`. Alguien los contesta con la skill `kardo-disenador`; en el estudio del 2026-10-03 lo hizo la sesión coordinadora.
- **Paralelo:** en el primer estudio, máximo 2 agentes a la vez. La ronda 2 (relevo 35) corrió 5 a la vez (piloto: 1,770 comandos con 5 navegadores, 0 fallas), con las personas en los puertos 8930 a 8949.
- **Ronda 4 (relevo 39):** las mismas 20 personas con la clave `<persona>-r4` (puertos 8962 a 8981) y fichas `fichas/<persona>-r4.md`; el día a día, `fichas/<persona>-r4-dia2.md`. Para una ronda nueva con cuentas nuevas, copia las fichas con otro sufijo y agrega las claves en `personas.mjs`.
- **Una persona, dos agentes:** con ~150 acciones el contexto de Haiku se llena. La parte A hace las tareas 1 a 5 y no apaga el navegador; la parte B sigue desde la 6 con un resumen verificado de la A.
- **Arranca los navegadores uno por uno** (`sleep 3`): `cuentas.json` ya se fusiona al escribir, pero así no hay carreras.

## Lo que aprendimos de la herramienta

- **Lo que dice la herramienta lo toma el agente como verdad sobre Kardo.**
  - Un «Timeout» de Playwright lo reportan como «Kardo se congela».
  - Por eso los errores de un toque dicen «algo lo tapa» y se registran aparte como `tool-error`.
- **Toques:** un botón animado nunca está «quieto». Si recibe el toque en su centro, se toca forzado.
- **Escribir:** con varios campos del mismo nombre, el comando avisa cuántos hay y permite elegir el n.º.
- **Lista de pantalla:** recorta cada texto a 70 caracteres. Un «Image» en esa lista era «Imagen» cortado.
- **Verificar:** revisa siempre el «terminada» del agente contra lo que de verdad quedó, en kardo-dev y en las capturas. Haiku a veces inventa.
- **Listas nativas (`select`):** un navegador sin ventana no dibuja sus opciones abiertas. `tocar` y `tocar-punto` sobre una lista dicen sus opciones y piden `elegir`.
- **`bajar`** desplaza el panel que la persona tocó al último o, si nada se mueve, el panel más grande que se pueda desplazar (los paneles del Estudio y la hoja inferior del celular).
- **El navegador arranca en una «pantalla de inicio»,** no en blanco: una pantalla vacía se leía como «Kardo no carga».
- **Stripe bloqueado:** la página de pago muestra un aviso del estudio y queda anotado como `payment-blocked`.
- **`escribir`, `borrar` y `elegir` solo usan campos que se llenan** (texto, área de texto, lista o área editable). Antes, `escribir "Fondo"` caía en el selector de color y fallaba con «Malformed value» (ronda 4).
- **Opciones con el círculo escondido:** si el `radio` o la casilla mide menos de 4 px y está dentro de un `label` (las tarjetas de «¿Qué muestra?»), `tocar` toca el `label`. Antes Paty no podía elegir «Menú» (ronda 4).
- **Informe final, punto 10:** cada agente dice qué cree que es cada palabra de Kardo, solo si la vio. Así se mide si se entienden los nombres (D2).
- **La IA en las fichas:** con «úsala en tu página», 0 de 5 la publicaron («la tarea no lo pedía»); con «úsala para que tus clientes ya la vean», 4 de 5. Escribe la tarea con lo que de verdad quiere la persona (ronda 4, §11).

## Probar a mano en Chrome (con el dueño mirando)

1. Levanta `servidores.mjs api` y `servidores.mjs panel` (3031 y 5196).
2. En Chrome abre `http://localhost:5196/registro` con un correo `delivered+kardo-sim-<algo>@resend.dev`. Guarda la contraseña en `.out/cuentas.json`; nunca la escribas en el chat.
3. Cuando Kardo pida el código: `node scripts/research/usuarios-simulados/codigo.mjs <correo>`. Imprime el código y lo deja válido en kardo-dev.

## Datos y limpieza

- `.out/` no se versiona: cuentas y contraseñas, capturas, registros, prompts, sesiones guardadas y el puente.
- Las cuentas creadas están en el informe de cada ronda: sección 10 del primero y [§13 de la ronda 4](../../../Docs/engineering/research/2026-10-12-usuarios-simulados-ronda-4.md).
