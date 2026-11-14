/**
 * Minimal CSS block parsing shared by Bloques ↔ HTML sync: splits a
 * stylesheet into its top-level rules (and, for an at-rule like `@media`,
 * its nested rules), so `from-design.ts` can print one rule per line and
 * `to-design.ts` can pick out exactly the rules a changed element's classes
 * use. Not a CSS parser (no value grammar, no error recovery beyond "drop
 * what does not balance") — just enough structure for Kardo's own generated
 * stylesheets and ordinary hand-written CSS on top of them.
 */

export type CssBlock =
  | { prelude: string; declarations: string[]; rules?: undefined }
  | { prelude: string; declarations?: undefined; rules: CssBlock[] };

function skipQuoted(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length && source[i] !== quote) {
    if (source[i] === "\\") i += 1;
    i += 1;
  }
  return i + 1;
}

function splitDeclarations(body: string): string[] {
  const declarations: string[] = [];
  let depth = 0;
  let start = 0;
  let i = 0;
  while (i < body.length) {
    const ch = body[i];
    if (ch === '"' || ch === "'") {
      i = skipQuoted(body, i);
      continue;
    }
    if (ch === "(") depth += 1;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === ";" && depth === 0) {
      const decl = body.slice(start, i).trim();
      if (decl) declarations.push(decl);
      start = i + 1;
    }
    i += 1;
  }
  const last = body.slice(start).trim();
  if (last) declarations.push(last);
  return declarations;
}

/** Parses one level of `prelude { body }` statements. */
export function parseCssBlocks(css: string): CssBlock[] {
  const blocks: CssBlock[] = [];
  const n = css.length;
  let i = 0;

  while (i < n) {
    while (i < n && /\s/.test(css[i] as string)) i += 1;
    if (i >= n) break;
    if (css[i] === ";") {
      i += 1;
      continue;
    }

    const preludeStart = i;
    while (i < n && css[i] !== "{" && css[i] !== "}") {
      const ch = css[i];
      if (ch === '"' || ch === "'") {
        i = skipQuoted(css, i);
        continue;
      }
      i += 1;
    }
    if (i >= n || css[i] === "}") {
      i += 1;
      continue;
    }
    const prelude = css.slice(preludeStart, i).trim();
    // Read the balanced `{ ... }` body.
    let depth = 0;
    const bodyOuterStart = i;
    while (i < n) {
      const ch = css[i];
      if (ch === '"' || ch === "'") {
        i = skipQuoted(css, i);
        continue;
      }
      if (ch === "{") depth += 1;
      else if (ch === "}") {
        depth -= 1;
        if (depth === 0) {
          i += 1;
          break;
        }
      }
      i += 1;
    }
    const body = css.slice(
      bodyOuterStart + 1,
      Math.max(bodyOuterStart + 1, i - 1),
    );
    if (!prelude) continue;
    if (/\{/.test(body)) blocks.push({ prelude, rules: parseCssBlocks(body) });
    else blocks.push({ prelude, declarations: splitDeclarations(body) });
  }

  return blocks;
}

function printBlock(block: CssBlock, depth: number): string {
  const pad = "  ".repeat(depth);
  if (block.rules) {
    return `${pad}${block.prelude} {\n${printCssBlocks(block.rules, depth + 1)}\n${pad}}`;
  }
  const decls = block.declarations.map((decl) => `${pad}  ${decl};`).join("\n");
  return `${pad}${block.prelude} {\n${decls}\n${pad}}`;
}

export function printCssBlocks(blocks: readonly CssBlock[], depth = 0): string {
  return blocks.map((block) => printBlock(block, depth)).join("\n");
}

/** A readable, editable stylesheet: one rule per line, one declaration per
 * line inside it. */
export function formatCss(css: string): string {
  return printCssBlocks(parseCssBlocks(css));
}

function selectorClasses(prelude: string): Set<string> {
  const classes = new Set<string>();
  for (const match of prelude.matchAll(/\.([A-Za-z0-9_-]+)/g)) {
    const name = match[1];
    if (name) classes.add(name);
  }
  return classes;
}

function blockUsesAnyClass(
  block: CssBlock,
  classes: ReadonlySet<string>,
): boolean {
  for (const name of selectorClasses(block.prelude))
    if (classes.has(name)) return true;
  return false;
}

/** `@media`/`@supports` and friends keep only the nested rules that still
 * match; a leaf rule is kept or dropped whole. */
function filterCssBlocks(
  blocks: readonly CssBlock[],
  predicate: (block: CssBlock) => boolean,
): CssBlock[] {
  const kept: CssBlock[] = [];
  for (const block of blocks) {
    if (block.rules) {
      const nested = filterCssBlocks(block.rules, predicate);
      if (nested.length) kept.push({ prelude: block.prelude, rules: nested });
      continue;
    }
    if (predicate(block)) kept.push(block);
  }
  return kept;
}

/** Only the rules of `css` whose selector uses at least one of `classes` —
 * what a changed/new element's own `html` block CSS becomes. `""` when
 * `classes` is empty. */
export function cssRulesForClasses(
  css: string,
  classes: ReadonlySet<string>,
): string {
  if (classes.size === 0) return "";
  const matched = filterCssBlocks(parseCssBlocks(css), (block) =>
    blockUsesAnyClass(block, classes),
  );
  return printCssBlocks(matched);
}

/** The rest of `css` once every rule using one of `classes` is removed —
 * what is left over to compare "did anything global change". */
export function cssWithoutClasses(
  css: string,
  classes: ReadonlySet<string>,
): string {
  const kept = filterCssBlocks(
    parseCssBlocks(css),
    (block) => !blockUsesAnyClass(block, classes),
  );
  return printCssBlocks(kept);
}

/** Drops every at-rule (top level or nested) named in `names` (e.g.
 * `"font-face"`) — Kardo serves named webfonts itself, so a page's own
 * `@font-face` would only ever get stripped again by the modo HTML cleaner. */
export function removeAtRules(css: string, names: ReadonlySet<string>): string {
  const strip = (blocks: readonly CssBlock[]): CssBlock[] => {
    const kept: CssBlock[] = [];
    for (const block of blocks) {
      const atName = /^@([a-zA-Z-]+)/.exec(block.prelude)?.[1]?.toLowerCase();
      if (atName && names.has(atName)) continue;
      if (block.rules)
        kept.push({ prelude: block.prelude, rules: strip(block.rules) });
      else kept.push(block);
    }
    return kept;
  };
  return printCssBlocks(strip(parseCssBlocks(css)));
}

/**
 * Rewrites `position:fixed` to `position:absolute` in every rule whose
 * selector contains `substring` — every other declaration is left exactly as
 * written. The blurred backdrop (`.kd-ambient`) is `position:fixed` on the
 * designed page, but the modo HTML cleaner always strips `fixed`/`sticky`
 * positioning outright (`sanitize-css.ts`), so `designToCustomCode` calls
 * this first to keep the background instead of losing it silently.
 */
export function absolutePositionForSelector(
  css: string,
  substring: string,
): string {
  const isFixed = (decl: string) => /^position\s*:\s*fixed$/i.test(decl.trim());
  const rewrite = (blocks: readonly CssBlock[]): CssBlock[] =>
    blocks.map((block) => {
      if (block.rules) return { ...block, rules: rewrite(block.rules) };
      if (!block.prelude.includes(substring)) return block;
      return {
        ...block,
        declarations: block.declarations.map((decl) =>
          isFixed(decl) ? "position:absolute" : decl,
        ),
      };
    });
  return printCssBlocks(rewrite(parseCssBlocks(css)));
}
