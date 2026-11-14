import * as csstree from "css-tree";
import type { CssRemoval } from "./report.js";
import { parseKardoAssetToken } from "./tokens.js";

type CssReasons = Partial<Record<CssRemoval, number>>;

function note(reasons: CssReasons, reason: CssRemoval): void {
  reasons[reason] = (reasons[reason] ?? 0) + 1;
}

// ---------------------------------------------------------------------------
// CSS sanitizer for "modo HTML" (ADR 018, extended 2026-09-29). Implements
// exactly `customCssForbidden` from `@kardo/contracts/custom-html.ts`, plus
// the two extra rules the owner's brief calls out: `@namespace` (grouped with
// `@import`/`@font-face` in the contract's summary) and a `:host-context()`
// selector, which reaches outside the shadow root the customer's CSS is
// always scoped into.
//
// Two layers, deliberately:
//  1. An AST pass (css-tree) removes the disallowed at-rule/rule/declaration
//     while keeping the rest of the customer's CSS intact — the common case.
//  2. A string-level pass over the *regenerated* CSS is the actual safety
//     gate: every `url(...)` in the final text must be exactly
//     `kardo-asset:<ref>`, and a fixed set of dangerous substrings must be
//     entirely absent. This also catches what step 1 cannot reach by AST
//     shape alone — e.g. an unparsed custom-property value (`--x: ...`) is
//     kept as a raw, unparsed token by css-tree, so a nested `url(...)`
//     inside one would slip past a purely AST-based check. Because this pass
//     is an *allowlist* on the literal url() contents (must match
//     `kardo-asset:<ref>` exactly) rather than a blocklist on `javascript:`,
//     it is not defeated by CSS escape obfuscation either: an escaped
//     `javascript:` never matches the required token shape, obfuscated or
//     not. On any hit, the WHOLE stylesheet is rejected (returns `""`) rather
//     than trying to surgically patch text nobody parsed — the same
//     fail-closed default this package's `url-safety.ts` documents for hrefs.
// ---------------------------------------------------------------------------

const forbiddenAtRules = new Set(["import", "font-face", "namespace"]);
const forbiddenProperties = new Set(["behavior", "-moz-binding"]);
// Functions that load an image (or a script-like worklet) without `url(`:
// `image-set("https://…" 1x)` would otherwise reach outside the library.
const forbiddenValueFunctions = new Set([
  "expression",
  "image-set",
  "-webkit-image-set",
  "image",
  "cross-fade",
  "-webkit-cross-fade",
  "element",
  "-moz-element",
  "src",
  "paint",
]);

const forbiddenCssSubstrings = [
  "@import",
  "@font-face",
  "@namespace",
  "javascript:",
  "vbscript:",
  "expression(",
  "-moz-binding",
  "behavior:",
  "</",
];

function isKardoAssetUrlValue(raw: string): boolean {
  return parseKardoAssetToken(raw.trim()) !== null;
}

function badValueReason(value: csstree.CssNode): CssRemoval | null {
  let reason: CssRemoval | null = null;
  csstree.walk(value, {
    enter(node: csstree.CssNode) {
      if (reason) return;
      if (node.type === "Url" && !isKardoAssetUrlValue(node.value))
        reason = "external-url";
      if (node.type === "Function") {
        const name = node.name.toLowerCase();
        if (name === "expression") reason = "expression";
        else if (forbiddenValueFunctions.has(name)) reason = "external-url";
      }
    },
  });
  return reason;
}

function valueHasFixedOrStickyPosition(value: csstree.CssNode): boolean {
  let bad = false;
  csstree.walk(value, {
    enter(node: csstree.CssNode) {
      if (node.type !== "Identifier") return;
      const name = node.name.toLowerCase();
      if (name === "fixed" || name === "sticky") bad = true;
    },
  });
  return bad;
}

function forbiddenDeclarationReason(
  node: csstree.Declaration,
): CssRemoval | null {
  const property = node.property.toLowerCase();
  if (forbiddenProperties.has(property)) return "binding";
  if (property === "position" && valueHasFixedOrStickyPosition(node.value))
    return "position";
  return badValueReason(node.value);
}

function isHostContextSelector(prelude: csstree.Rule["prelude"]): boolean {
  let bad = false;
  csstree.walk(prelude, {
    visit: "PseudoClassSelector",
    enter(node) {
      if (node.name.toLowerCase() === "host-context") bad = true;
    },
  });
  return bad;
}

function unquote(text: string): string {
  const quote = text[0];
  return (quote === '"' || quote === "'") && text.endsWith(quote)
    ? text.slice(1, -1)
    : text;
}

/** Walks the CSS the way a browser tokenizes it, so what it checks is what
 * the browser will see: every `url(...)` (unquoted url token or `url(` with
 * a string) must hold exactly `kardo-asset:<ref>`; a function or at-rule
 * name written with CSS escapes (`u\72l(`, `@\69mport`) is refused, since
 * its decoded name could be anything; image-loading functions and bad
 * tokens are refused too. Strings and selectors may still use escapes
 * (`content: "\201C"`). */
function tokensAreSafe(css: string): boolean {
  const tokens: { type: number; text: string }[] = [];
  csstree.tokenize(css, (type, start, end) => {
    tokens.push({ type, text: css.slice(start, end) });
  });
  const types = csstree.tokenTypes;
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token) continue;
    if (token.type === types.BadUrl || token.type === types.BadString)
      return false;
    if (
      (token.type === types.Function ||
        token.type === types.AtKeyword ||
        token.type === types.Url) &&
      token.text.includes("\\")
    )
      return false;
    if (token.type === types.Url) {
      const inner = token.text.slice(token.text.indexOf("(") + 1, -1);
      if (!isKardoAssetUrlValue(inner)) return false;
      continue;
    }
    if (token.type !== types.Function) continue;
    const name = token.text.slice(0, -1).toLowerCase();
    if (forbiddenValueFunctions.has(name)) return false;
    if (name !== "url") continue;
    // `url(` + optional whitespace + one string + optional whitespace + `)`.
    let next = index + 1;
    while (tokens[next]?.type === types.WhiteSpace) next += 1;
    const argument = tokens[next];
    if (argument?.type !== types.String) return false;
    if (!isKardoAssetUrlValue(unquote(argument.text))) return false;
    next += 1;
    while (tokens[next]?.type === types.WhiteSpace) next += 1;
    if (tokens[next]?.type !== types.RightParenthesis) return false;
    index = next;
  }
  return true;
}

/** The final, authoritative gate over the regenerated CSS text: every
 * `url(...)` must be `kardo-asset:<ref>` and none of the fixed dangerous
 * substrings may appear anywhere. Returns `null` (reject the whole
 * stylesheet) rather than ever trying to patch unparsed text. */
function enforceCssStringSafety(css: string): string | null {
  const lower = css.toLowerCase();
  for (const needle of forbiddenCssSubstrings) {
    if (lower.includes(needle)) return null;
  }
  return tokensAreSafe(css) ? css : null;
}

export type CssSanitizeResult = {
  css: string;
  removedRules: number;
  removedCss: CssReasons;
};

function countTopLevelRules(ast: csstree.CssNode): number {
  let count = 0;
  csstree.walk(ast, {
    enter(node: csstree.CssNode) {
      if (node.type === "Rule" || node.type === "Atrule") count += 1;
    },
  });
  return count;
}

const documentRootNames = new Set(["html", "body"]);

function isDocumentRoot(node: csstree.CssNode): boolean {
  return (
    (node.type === "TypeSelector" &&
      documentRootNames.has(node.name.toLowerCase())) ||
    (node.type === "PseudoClassSelector" && node.name.toLowerCase() === "root")
  );
}

/**
 * `:root`, `html` and `body` match nothing inside the shadow root the page's
 * CSS lives in, yet nearly every AI (and most pasted code) puts its color
 * variables and page background there, so the page silently lost them
 * (Kardo AI test bench, 2026-10-02). A selector that starts with any run of
 * them (`:root`, `body`, `html body`, `html > body .card`) starts with
 * `:host` instead, the page's own root. A compound that adds anything to
 * them (`body.dark`, `html[lang]`) is left as is. Returns how many
 * selectors changed.
 */
function rewriteDocumentRoots(ast: csstree.CssNode): number {
  let rewritten = 0;
  csstree.walk(ast, {
    visit: "Selector",
    enter(selector) {
      const items = selector.children.toArray();
      let index = 0;
      let consumed = 0;
      for (;;) {
        const node = items[index];
        const next = items[index + 1];
        if (!node || !isDocumentRoot(node)) break;
        if (next && next.type !== "Combinator") break;
        consumed = index + 1;
        if (!next) break;
        const after = items[index + 2];
        if (!after || !isDocumentRoot(after)) break;
        index += 2;
      }
      if (consumed === 0) return;
      const host: csstree.PseudoClassSelector = {
        type: "PseudoClassSelector",
        name: "host",
        children: null,
      };
      selector.children = new csstree.List<csstree.CssNode>().fromArray([
        host,
        ...items.slice(consumed),
      ]);
      rewritten += 1;
    },
  });
  return rewritten;
}

/**
 * Sanitizes a full stylesheet (the "modo HTML" `css` source, or the contents
 * of a top-level `<style>` — not currently allowed inline but kept generic).
 * Always scoped by the caller inside the page's declarative shadow root, so
 * this never needs to worry about the customer's selectors reaching outside
 * their own page — only `:host-context()` explicitly reaches back out to the
 * host's *ancestors*, which is why it alone is rejected.
 */
export function sanitizeStylesheet(source: string): CssSanitizeResult {
  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(source, { positions: false, onParseError: () => {} });
  } catch {
    return { css: "", removedRules: 0, removedCss: {} };
  }
  const totalRules = countTopLevelRules(ast);
  let removedRules = 0;
  const removedCss: CssReasons = {};

  csstree.walk(ast, {
    visit: "Atrule",
    enter(node, item, list) {
      const name = node.name.toLowerCase();
      if (list && forbiddenAtRules.has(name)) {
        list.remove(item);
        removedRules += 1;
        note(removedCss, name as "import" | "font-face" | "namespace");
      }
    },
  });

  csstree.walk(ast, {
    visit: "Rule",
    enter(node, item, list) {
      if (list && node.prelude && isHostContextSelector(node.prelude)) {
        list.remove(item);
        removedRules += 1;
        note(removedCss, "host-context");
      }
    },
  });

  rewriteDocumentRoots(ast);

  csstree.walk(ast, {
    visit: "Declaration",
    enter(node, item, list) {
      const reason = list ? forbiddenDeclarationReason(node) : null;
      if (list && reason) {
        list.remove(item);
        removedRules += 1;
        note(removedCss, reason);
      }
    },
  });

  const generated = csstree.generate(ast);
  const safe = enforceCssStringSafety(generated);
  if (safe === null)
    return {
      css: "",
      removedRules: Math.max(1, totalRules),
      removedCss: { stylesheet: 1 },
    };
  return { css: safe, removedRules, removedCss };
}

/** Sanitizes a `style="..."` attribute value (a declaration list, not a full
 * stylesheet — no selectors, no at-rules). Returns `null` when nothing safe
 * is left (or the value fails the string-level gate), in which case the
 * caller drops the whole attribute. */
export function sanitizeDeclarationList(
  source: string,
  removedCss: CssReasons = {},
): string | null {
  let ast: csstree.CssNode;
  try {
    ast = csstree.parse(source, {
      context: "declarationList",
      positions: false,
      onParseError: () => {},
    });
  } catch {
    return null;
  }
  csstree.walk(ast, {
    visit: "Declaration",
    enter(node, item, list) {
      const reason = list ? forbiddenDeclarationReason(node) : null;
      if (list && reason) {
        list.remove(item);
        note(removedCss, reason);
      }
    },
  });
  const generated = csstree.generate(ast);
  if (!generated) return "";
  return enforceCssStringSafety(generated);
}
