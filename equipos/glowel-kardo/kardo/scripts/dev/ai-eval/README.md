# Kardo AI test bench

Measures how Kardo's AI designs each Experience type from a normal person's
request: quality (screenshots plus a plain-person rubric), tokens, turns,
what `checkDesign` or the sanitizer had to correct, and cost with the
production price table (`services/customer-api/src/custom-html/pricing.ts`).

- `cases.mts`: 14 organizations, one Experience each (every type, many
  giros, never only restaurants), written the way people type.
  `html: true` also runs modo HTML (links, profile, linkpage).
- `assets.mts`: draws logos, the barbershop poster and the PDF pages into
  `out/assets/`. Photos come from `apps/website/public/media`.
- `run.mts`: the runner (see its header). Same prompt builders, review
  loops, `checkDesign` and sanitizer as production; the model is a pair of
  files per turn that an agent answers.
- `organization.mts`: what the `perfil` mode passes on its own (giro, city,
  "Sobre tu negocio", brand colors, logo and cover).
- `report.mts`: joins results and evaluations into `out/report-<name>.md`.
- `sheet.mjs`: the first screen of every case of a round in one image.
- `compare.mjs`: the same cases side by side across rounds.

Everything it writes goes to `out/` (gitignored).

## Modes

- `base`: what the panel sends today. Blocks AI: only the description.
  Modo HTML: the description plus the brand colors (BrandForm pre-fills
  them). No images.
- `perfil`: the organization profile goes in on its own (giro recipe,
  city, "Sobre tu negocio", brand colors, logo and cover as images).
- `ideas` (2026-10-03): `perfil` plus "3 ideas, then 1 design". The design
  path first asks for ideas (`<case>.ideas`, contract `design-concepts`),
  saves them in `results/<case>.ideas.json` and designs with the first one
  (`<case>.design`, whose turn 1 reads the cache the ideas wrote, since
  both share the system prompt). The result's cost is both steps.

Flags added 2026-10-03 (relevo 29):
- `--visual` (fixed when the round is created): after the design
  validates, the review loop draws it (`preview.mjs`, first screen and
  whole page, in `out/<round>/review/`) and asks one more turn with the
  rubric of `design-ai/design-visual-review.ts`; the answer is
  `{"ok": true}` or a few JSON Pointer changes. Its pending file says
  `responseContract: "design-review"` and lists both screenshots as
  `image_file`.
- A case's `photoMode` ("auto", "with", "without") goes into the prompt
  and into the layout review, like the panel's "Fotos" control. Two cases
  test it: `taqueria-menu-sinfotos` and `antojitos-menu-confotos`.
- Results now record `layoutFixes` (what the layout review moved) and,
  with `--visual`, `visualReview`.

Fixed 2026-10-03: in `ideas` mode the design prompt was frozen on the
first run, before the ideas existed, so the design never received the
chosen idea (`ideas-sonnet` and `antes-ideas` designed without it). It
is now frozen only once the ideas are in. `base-ideas` is the corrected
baseline (the same ideas, the design with its idea, the code of
2026-10-03 before relevo 29).

## Running a round

```sh
pnpm exec tsx scripts/dev/ai-eval/run.mts --round=base-sonnet --model=sonnet --mode=base
# an agent answers out/base-sonnet/pending/*.json (see below), then again:
pnpm exec tsx scripts/dev/ai-eval/run.mts --round=base-sonnet
# repeat until "0 pending"
```

Each run replays the recorded answers through the real loop, writes the
next turn's pending file when the loop asks for a fix, and, when a case
ends, writes `results/<key>.json`, `drafts/<key>.json` and
`shots/<key>-phone.png` / `-desktop.png` (drawn by
`scripts/dev/ai-bridge/preview.mjs` with the case's real content and
photos).

## Cost is an estimate

There is no API key in development (the owner chose the bridge, 2026-10-02),
so tokens are estimated: text at 3 characters per token, images at
width x height / 750 after the API's downscale, the system prompt written
to the cache on turn 1 and read on turns 2 and 3 (only when it reaches the
model's minimum cacheable size: 1024 tokens on Sonnet 5, 4096 on Haiku 4.5).
Production also bills adaptive thinking as output (medium effort on
Sonnet 5), which no answer file shows; the report gives a sensitivity
column for it.

## What has run (2026-10-02)

Six rounds: `base-*`, `perfil-*` and `final-*`, each with `sonnet` and
`haiku`. Results and the owner's report:
`Docs/engineering/research/2026-10-02-banco-de-pruebas-ia.md`.

**The Haiku judge is lenient and biased toward Haiku's own pages** (almost
everything scores 4 or 5, it once described gray placeholders that were not
there). Use it to spot gross failures; to compare models, use a judge from
a different model and look at the sheets yourself.

## Prompt for an answering agent

Replace `<ROUND>`, `<MODEL>` and the file list. Use `model: sonnet` or
`model: haiku` to match `<MODEL>`.

> Eres `<MODEL>` y contestas, como si fueras la API, los turnos de la IA de
> Kardo de la ronda `<ROUND>`. No lances subagentes. Para cada archivo de esta
> lista, en orden: `<lista de out/<ROUND>/pending/*.json>`
> 1. Lee el archivo pendiente. `systemFile` es tu mensaje de sistema: léelo
>    completo (si ya lo leíste para otro caso, no hace falta otra vez).
>    `messages` es la conversación; mira con Read cada `image_file`.
> 2. Responde exactamente lo que respondería el modelo: solo el objeto JSON
>    que pide el sistema, sin texto antes ni después y sin bloques de código.
> 3. Escribe esa respuesta, tal cual, con Write en `answerFile` (texto plano).
> Reglas: un solo intento por turno; no corras scripts ni revises tu diseño
> con herramientas; no leas código del repo, skills ni respuestas de otros
> casos o rondas. Solo Read del pendiente, del sistema y de las imágenes, y
> Write de la respuesta. Al final, di qué archivos escribiste.

## Prompt for the evaluating agent (Haiku)

> Eres una persona normal, dueña de un negocio pequeño en México, que pidió
> ayuda para hacer su página. No eres diseñador ni programador. No lances
> subagentes. Para cada caso de la lista: lee `out/<ROUND>/results/<key>.json`
> (qué pidió la persona y los datos del negocio) y mira
> `out/<ROUND>/shots/<key>-phone.png` y `-desktop.png`. Califica del 1 al 5:
> `entiende` (¿en 3 segundos se entiende qué negocio es y qué hacer?),
> `boton` (¿el botón o la acción principal es clara?), `celular` (¿se lee
> bien en el celular: tamaño, contraste, espacios?), `marca` (¿usa la marca
> del negocio: logo, colores, fotos?), `profesional` (5 = se ve hecho por un
> profesional, 1 = se ve "hecho por IA" o de plantilla), `contenido` (¿muestra
> lo que la persona pidió, sin inventar?). Escribe con Write
> `out/<ROUND>/evals/<key>.json` con
> `{"entiende":n,"boton":n,"celular":n,"marca":n,"profesional":n,"contenido":n,"comentario":"una o dos frases, como lo diría el dueño"}`.
