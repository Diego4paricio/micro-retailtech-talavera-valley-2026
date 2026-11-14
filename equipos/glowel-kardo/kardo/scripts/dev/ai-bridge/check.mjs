// Dev AI bridge helper: prints the exact validation report the real review
// loop would produce for a draft, so the agent answering a turn by hand (see
// README.md in this folder, and the .claude/skills/kardo-disenador skill)
// can check its own answer before writing the done file. Handles every
// turn contract: "custom-html" and "html-block" (the sanitizer report),
// "design" (the schema + checkDesign report) and, since relevo 37 (IA7),
// "design-concepts" (each idea against the idea schema, the way the real
// parser keeps or drops it).
//
// Usage (run with tsx, like other scripts/ that import workspace TypeScript
// sources directly — see scripts/e2e/billing-sync.mts):
//   pnpm exec tsx scripts/dev/ai-bridge/check.mjs <path-to-json> [options]
//
// <path-to-json> is a done file, `{ "text": "<raw model answer>" }` (the
// exact shape you write to done/<jobId>.turnN.json), or a plain object:
//   - `{ "html": "...", "css": "..." }` for "custom-html"/"html-block";
//   - `{ "design": { ... } }` for "design" (the whole PageDesign object).
//
// Options (design drafts only; read them from the pending file's system/
// user message — the Experience type and content ids are named there):
//   --type=<type>            Experience type, default "links" (one of
//                             links, profile, linkpage, menu, catalog,
//                             form, document, image).
//   --content-ids=a,b,c      Ids the design must not reuse (content links
//                             and socials).
//   --menu-sections=a,b,c    A Menú's real section ids, so a "menu" block's
//                             sectionIds is checked against them.
//   --help                   Show this usage and exit.
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import {
  checkDesign,
  designHtmlBlocks,
  designableExperienceTypes,
} from "../../../packages/contracts/src/design.ts";
import { prepareCustomHtml } from "../../../packages/page-render/src/custom-html/prepare.ts";
import { parseCustomHtmlResponse } from "../../../services/customer-api/src/custom-html/assistant.ts";
import {
  checkDesignSchemaShape,
  parseDesignGenerationResponse,
} from "../../../services/customer-api/src/design-ai/design-assistant.ts";
import { normalizeConcept } from "../../../services/customer-api/src/design-ai/design-concepts.ts";
import {
  DESIGN_CONCEPTS_COUNT,
  DesignConceptSchema,
} from "../../../packages/contracts/src/index.ts";

// TypeBox lives in the workspace packages, not next to this script.
const { Value } = await import(
  createRequire(
    new URL("../../../packages/contracts/package.json", import.meta.url),
  ).resolve("@sinclair/typebox/value")
);

function fail(message) {
  console.error(`error: ${message}`);
  process.exit(1);
}

function printHelp() {
  console.log(
    [
      "usage: pnpm exec tsx scripts/dev/ai-bridge/check.mjs <path-to-done-file-or-json> [options]",
      "",
      "options (design drafts only):",
      `  --type=<type>          one of ${designableExperienceTypes.join(", ")} (default links)`,
      "  --content-ids=a,b,c    ids the design must not reuse",
      "  --menu-sections=a,b,c  a Menu's real section ids",
      "  --help                 show this help",
    ].join("\n"),
  );
}

const args = process.argv.slice(2);
if (args.includes("--help")) {
  printHelp();
  process.exit(0);
}

const inputArg = args.find((arg) => !arg.startsWith("--"));
if (!inputArg) {
  printHelp();
  fail("missing <path-to-json>");
}

const flags = Object.fromEntries(
  args
    .filter((arg) => arg.startsWith("--") && arg.includes("="))
    .map((arg) => {
      const [key, ...rest] = arg.slice(2).split("=");
      return [key, rest.join("=")];
    }),
);

const inputPath = path.resolve(process.cwd(), inputArg);
let parsed;
try {
  parsed = JSON.parse(fs.readFileSync(inputPath, "utf8"));
} catch (error) {
  fail(`could not read/parse ${inputPath}: ${error.message}`);
}

/** Which contract the file looks like it answers: a bare `{ text }` done
 * file needs a peek at its parsed JSON; a direct file just has the key. */
function looksLikeDesign(value) {
  return (
    value !== null && typeof value === "object" && typeof value.design === "object" && value.design !== null
  );
}

let mode;
let design;
let htmlDraft;

/** The ideas of a "design-concepts" answer: `{ concepts: [...] }`, bare,
 * fenced or inside a done file's `text`. */
function conceptsOf(value) {
  if (value !== null && typeof value === "object" && Array.isArray(value.concepts))
    return value.concepts;
  if (typeof value?.text !== "string") return null;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(value.text)?.[1];
  for (const candidate of [fenced, value.text]) {
    if (!candidate) continue;
    try {
      const parsedText = JSON.parse(candidate.trim());
      if (Array.isArray(parsedText?.concepts)) return parsedText.concepts;
    } catch {}
  }
  return null;
}

const concepts = conceptsOf(parsed);
if (concepts) {
  console.log(`Checking ${concepts.length} idea(s) (design-concepts).`);
  let kept = 0;
  concepts.forEach((raw, index) => {
    const normalized = normalizeConcept(raw);
    if (normalized) {
      kept += 1;
      const changed = ["text", "muted", "accent"].filter(
        (token) => normalized.palette[token] !== raw?.palette?.[token]?.toLowerCase?.(),
      );
      console.log(
        `- idea ${index + 1} «${normalized.name}»: kept${changed.length ? ` (palette made readable: ${changed.join(", ")})` : ""}`,
      );
      return;
    }
    console.log(`- idea ${index + 1}: DROPPED by the real parser. First problems:`);
    for (const error of [...Value.Errors(DesignConceptSchema, raw)].slice(0, 5))
      console.log(`    ${error.path || "(idea)"}: ${error.message}`);
  });
  const enough = kept >= DESIGN_CONCEPTS_COUNT;
  console.log();
  console.log(
    enough
      ? `${kept} valid idea(s): the real panel would show them.`
      : `Only ${kept} of ${DESIGN_CONCEPTS_COUNT} ideas would reach the owner.`,
  );
  process.exit(enough ? 0 : 1);
}

if (typeof parsed.text === "string") {
  let asJson;
  try {
    asJson = JSON.parse(parsed.text);
  } catch {
    asJson = null;
  }
  if (looksLikeDesign(asJson)) {
    mode = "design";
    ({ design } = parseDesignGenerationResponse(parsed.text));
  } else {
    mode = "html";
    htmlDraft = parseCustomHtmlResponse(parsed.text);
  }
} else if (looksLikeDesign(parsed)) {
  mode = "design";
  design = parsed.design;
} else {
  mode = "html";
  htmlDraft = {
    html: typeof parsed.html === "string" ? parsed.html : "",
    css: typeof parsed.css === "string" ? parsed.css : "",
    notes: typeof parsed.notes === "string" ? parsed.notes : "",
  };
}

if (mode === "html") {
  const prepared = prepareCustomHtml({ html: htmlDraft.html, css: htmlDraft.css });

  console.log(
    `html: ${htmlDraft.html.length} chars -> ${prepared.html.length} chars after sanitizing`,
  );
  console.log(
    `css: ${htmlDraft.css.length} chars -> ${prepared.css.length} chars after sanitizing`,
  );
  console.log();
  console.log("Sanitizer report (same shape the real review loop reads):");
  console.log(JSON.stringify(prepared.report, null, 2));

  const removedSomething =
    Object.keys(prepared.report.removedTags).length > 0 ||
    Object.keys(prepared.report.removedAttributes).length > 0 ||
    prepared.report.removedCssRules > 0 ||
    prepared.report.blockedLinks > 0 ||
    prepared.report.blockedImages > 0;

  console.log();
  console.log(
    removedSomething
      ? "The sanitizer removed something: the real review loop would ask you for a fix here."
      : "Clean: nothing would be removed.",
  );
  process.exit(removedSomething ? 1 : 0);
}

// mode === "design"
const type = flags.type ?? "links";
if (!designableExperienceTypes.includes(type)) {
  fail(
    `--type=${type} is not designable; use one of ${designableExperienceTypes.join(", ")}`,
  );
}
const contentItemIds = flags["content-ids"]
  ? flags["content-ids"].split(",").filter(Boolean)
  : [];
const menuSectionIds = flags["menu-sections"]
  ? flags["menu-sections"].split(",").filter(Boolean)
  : undefined;

console.log(`Checking a "${type}" design (schema ${design?.schema ?? "?"}).`);
console.log();

const schemaCheck = checkDesignSchemaShape(design);
if (!schemaCheck.ok) {
  console.log("Schema check FAILED — this is not a valid PageDesign shape.");
  console.log("First few problems:");
  for (const error of schemaCheck.errors) console.log(`- ${error}`);
  process.exit(1);
}

const issues = checkDesign(
  type,
  design,
  contentItemIds,
  menuSectionIds ? { menuSectionIds } : {},
);

console.log(
  issues.length === 0
    ? "checkDesign: no issues. The real review loop would accept this draft."
    : `checkDesign found ${issues.length} issue(s) — the real review loop would ask for a fix:`,
);
for (const issue of issues) {
  console.log(`- ${issue.path || "(design)"}: ${issue.message}`);
}

const htmlBlocks = designHtmlBlocks(design);
if (htmlBlocks.length > 0) {
  console.log();
  console.log(`${htmlBlocks.length} html block(s) in this design — sanitizer report per block:`);
  for (const block of htmlBlocks) {
    const prepared = prepareCustomHtml({ html: block.html, css: block.css });
    const removed =
      Object.keys(prepared.report.removedTags).length > 0 ||
      Object.keys(prepared.report.removedAttributes).length > 0 ||
      prepared.report.removedCssRules > 0 ||
      prepared.report.blockedLinks > 0 ||
      prepared.report.blockedImages > 0;
    console.log(`- ${block.id}: ${removed ? "the sanitizer would remove something" : "clean"}`);
  }
}

process.exit(issues.length === 0 ? 0 : 1);
