# Dev AI bridge — protocol for the agent that answers

This lets you (a Claude Code session, or any human/agent on the owner's own
machine) stand in for the real Kardo AI ("Pídele a la IA de Kardo", Estudio
de Experiences, ADR 018, extended by "AI in blocks", addendum 3, 2026-09-30)
while developing locally, with no `ANTHROPIC_API_KEY` at all. The Customer
API writes one JSON file per turn under a job folder and waits for you to
answer it.

**If you are a Claude Code agent answering a turn, load the
`.claude/skills/kardo-disenador` skill first.** It has the full step-by-step
process (read the turn, detect what is being asked, design with the Kardo
guide, check your draft, draw it with `preview.mjs`, write `done/`), the
design guide itself, structure examples per page type, and the sanitizer's
most common complaints. This README stays the lower-level protocol
reference; the skill is the "how to actually design well" guide.

There are three turn contracts, all going through the exact same files and
protocol below; the pending file's `responseContract` field says which one
a given turn expects (see step 3):

- `"custom-html"`: the modo HTML page (a whole `<links|profile|linkpage>`
  page as free HTML/CSS). Answer `{"html":"...","css":"...","notes":"..."}`.
- `"design"`: a full block design (`PageDesign`, schema 1 or 2, with
  sections, columns or a canvas, and the type's bound blocks). Answer
  `{"design":{...},"notes":"..."}`, where `design` is the whole `PageDesign`
  object (not a string).
- `"html-block"`: one `html` block's source, sized for a block instead of a
  whole page (`DESIGN_LIMITS.htmlBlockHtml`/`htmlBlockCss`, much smaller than
  modo HTML's limits). Answer `{"html":"...","css":"...","notes":"..."}`,
  same shape as `"custom-html"` but shorter.
- `"design-concepts"` (2026-10-03, "3 ideas, then 1 design"): three ideas
  before the design. Answer `{"concepts":[...]}` with the idea contract in
  `system`. It shares the system prompt with `"design"`; the design request
  that follows carries the chosen idea in its user message. A `"design"`
  answer for a Menú or Catálogo may add `"itemPhotos":[{"itemId","imageRef"}]`
  (the owner's photos matched to dishes or products without one); image
  blocks and gallery photos without `imageRef` are photo spaces the owner
  fills in the Estudio.

**Only for local development.** The Customer API refuses to build with
`CUSTOM_HTML_AI_PROVIDER=dev-bridge` at all when `NODE_ENV=production`, so
this can never accidentally run in a real deployment.

## Turning it on

In `services/customer-api`'s environment (never in `.env` committed to the
repo — export these in your shell, or in a local, gitignored env file):

```sh
CUSTOM_HTML_AI_PROVIDER=dev-bridge
KARDO_AI_BRIDGE_DIR=/absolute/path/to/a/scratch/folder
# optional, default 240000 (4 minutes) per turn:
KARDO_AI_BRIDGE_TIMEOUT_MS=600000
```

`KARDO_AI_BRIDGE_DIR` **must be an absolute path**. The Customer API creates
`pending/`, `working/` and `done/` inside it the first time it needs them.

## Directory layout

```
$KARDO_AI_BRIDGE_DIR/
  pending/<jobId>.turn<N>.json   — the question, written by the Customer API
  pending/<jobId>.img<i>.<ext>   — brand images, written once on turn 1
  working/<jobId>.turn<N>        — an empty marker: "someone picked this up"
  done/<jobId>.turn<N>.json      — your answer
```

`<jobId>` is a UUID, one per generation (every turn of the same review loop
shares it). `<N>` is 1-based (turn 1 is the first draft; turn 2 and 3, if
they happen, are fixes after the sanitizer removed something).

Every file for a turn — pending, working, done, and (on turn 1) the images —
is **deleted by the Customer API** the moment that turn ends, succeeds or
fails, so nothing about a customer's page design is ever left on disk
longer than it takes to answer one turn.

## What to do, per turn

1. **Watch `pending/` for a new `<jobId>.turnN.json` file.**

2. **As soon as you start working on it**, create an empty file at
   `working/<jobId>.turnN` (any content, even empty, is fine — its mere
   existence is the signal). Until you do this, the Customer API's caller
   sees stage `"queued"`; once the marker exists, it stops reporting that,
   assuming you are actively on it.

3. **Read the pending file.** Its shape:

   ```json
   {
     "jobId": "…",
     "turn": 1,
     "maxTurns": 3,
     "createdAt": "2026-09-29T…Z",
     "responseContract": "custom-html",
     "system": "…the fixed rules and allowlist for this Experience type…",
     "messages": [
       {
         "role": "user",
         "content": [
           { "type": "image_file", "path": "/abs/path/…/img1.png" },
           { "type": "text", "text": "…the business's brief and content…" }
         ]
       }
     ]
   }
   ```

   - `responseContract` is `"custom-html"`, `"design"` or `"html-block"`
     (see the intro above) — it tells you the shape of the `done/` file
     without having to infer it from `system`'s prose. Older payloads
     without this field mean `"custom-html"`.
   - `system` is the same static prompt `buildCustomHtmlMessages`
     (`"custom-html"`), `buildDesignMessages` (`"design"`) or
     `buildHtmlBlockMessages` (`"html-block"`) builds in
     `packages/contracts/src/custom-html-prompt.ts` /
     `packages/contracts/src/design-prompt.ts` — it never contains the
     customer's own words. Treat it exactly like the system prompt Claude
     would get: it is the actual rulebook (the JSON response contract, the
     allowed tags/attributes for HTML, the exact `PageDesign` contract for a
     design, the Kardo design guide, the injection-safety rule), not a
     summary of it.
   - `messages` is the full conversation so far. A `text` block is plain
     text. An `image_file` block replaces what would be a base64 image for
     the real API — read the file at `path` yourself (only present in
     turn 1's message; later turns reuse the same paths in history even
     after the files are gone, since you already saw them).
   - On turn 2 or 3, the last message is a **new user turn in Spanish**
     asking for a fix, and asking for the **full corrected JSON**, not just
     the changed part:
     - for `"custom-html"`/`"html-block"`, listing exactly what Kardo's
       sanitizer removed from your previous answer and why (script tags,
       disallowed attributes, external images or links, forbidden CSS, …);
     - for `"design"`, listing exactly which `checkDesign` rule(s) your
       `PageDesign` broke (an invalid block, a missing required bound block,
       a block placed where its kind is not allowed, …).

4. **Design**, following `system` exactly, as if you were the model —
   see the `kardo-disenador` skill for how to actually design well (the
   guide, structure examples, common sanitizer complaints). Respond with the
   exact JSON contract `system` asks for (see `responseContract` above):
   `{ "html", "css", "notes" }` for `"custom-html"`/`"html-block"`, or
   `{ "design", "notes" }` (a whole `PageDesign` object under `design`, not a
   string) for `"design"`.

5. **Check your draft before answering** (optional but recommended): run

   ```sh
   pnpm exec tsx scripts/dev/ai-bridge/check.mjs path/to/your-draft.json
   ```

   For `"custom-html"`/`"html-block"`, pass a `{ "html": "...", "css": "..." }`
   file (or a done-file shape, `{ "text": "..." }`) to see the exact
   sanitizer report the Publisher would produce. For `"design"`, pass a
   `{ "design": {...} }` file (or `{ "text": "..." }`) with `--type=<type>`
   (the Experience type from the pending file's `system`/data block, e.g.
   `links`, `menu`, `catalog`) to see the exact `checkDesign` report the
   review loop uses — run `pnpm exec tsx scripts/dev/ai-bridge/check.mjs
   --help` for every flag (content item ids, real menu section ids). Either
   way, this is the same check the real review loop uses to decide whether
   to ask you for a fix: fixing it yourself first means you are less likely
   to burn a second or third turn. For a design, also look at it before
   answering — see `preview.mjs` below. For `"design-concepts"`, pass your
   `{ "concepts": [...] }` (or the done file): it says which ideas the real
   parser keeps, which it drops and why, and which palettes it had to make
   readable (relevo 37, IA7).

6. **Draw your draft and look at it** (recommended for `"design"` and
   `"html-block"`, and any `"custom-html"` page): run

   ```sh
   pnpm exec tsx scripts/dev/ai-bridge/preview.mjs path/to/your-draft.json out/prefix
   ```

   It renders your draft with the real `@kardo/page-render` (the same code
   the Resolver serves pages with) to `out/prefix-phone.png` (390×844) and
   `out/prefix-desktop.png` (1280×800), using a placeholder for any real
   content it cannot know about outside the panel. Read the two PNGs with
   your own image-reading tool before writing `done/`: this is the only way
   to actually catch what checking JSON alone cannot (cramped spacing, bad
   contrast, an ugly default, the "look de IA" the design guide warns
   against). Photo spaces (an image block, gallery photo, dish or
   background without `imageRef`) are drawn as the Estudio draws them; add
   `--public` to see the published page, where they are absent or show
   their fallback color.

7. **Write your answer** to `done/<jobId>.turnN.json`:

   ```json
   { "text": "{\"html\":\"...\",\"css\":\"...\",\"notes\":\"...\"}" }
   ```

   (or, for `"design"`, `{ "text": "{\"design\":{...},\"notes\":\"...\"}" }`).

   `text` is your **raw** answer, exactly what you would have replied as
   the model — normally the JSON object above, serialized as a string. The
   Customer API parses it with the same tolerant parser the real provider's
   answers go through (a bare JSON object, or one fenced in ` ```json `; for
   `"custom-html"`/`"html-block"` only, separate ` ```html `/` ```css `
   blocks also work), so you do not have to get the exact formatting
   perfect.

   Write it in one shot (not incrementally) — the Customer API only reads
   this file once it is fully there.

8. **Stop watching that turn.** The Customer API polls for the done file
   once a second, for up to `KARDO_AI_BRIDGE_TIMEOUT_MS` (default 4
   minutes); once it reads it, or once the timeout passes, it deletes every
   file for that turn (and, for turn 1, the images) and either finishes the
   generation or writes the next turn's pending file for you to pick up.

## Notes

- Usage for dev-bridge turns is always free (zero cost, zero tokens): the
  daily USD budget and the audit trail both record it as such.
- If nothing ever answers a turn, the whole generation fails the same way
  a real API outage would (`AI_UNAVAILABLE`), and the daily generation
  count for that organization is given back.
- Never write real production content into `$KARDO_AI_BRIDGE_DIR` outside
  of what this protocol writes there itself.
