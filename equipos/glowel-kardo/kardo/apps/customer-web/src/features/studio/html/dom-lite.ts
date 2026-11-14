/**
 * Minimal HTML parsing shared by Bloques ↔ HTML sync (`from-design.ts`,
 * `to-design.ts`): a plain-object tree (never a real DOM node), so the same
 * comparison and formatting code runs the same in the panel (which parses
 * with `DOMParser`, the real browser parser, for anything the person wrote
 * by hand) and in tests (which have no `DOMParser`; `liteHtmlParser` is the
 * injectable fallback — tolerant, not a full HTML5 parser, but enough for
 * Kardo's own generated markup and ordinary hand edits of it).
 */

export type LiteElement = {
  type: "element";
  tag: string;
  attrs: Record<string, string>;
  children: LiteNode[];
};
export type LiteText = { type: "text"; value: string };
export type LiteComment = { type: "comment"; value: string };
export type LiteNode = LiteElement | LiteText | LiteComment;

/** Parses an HTML fragment into its top-level nodes. */
export type HtmlParser = (html: string) => LiteNode[];

const voidTags = new Set([
  "br",
  "hr",
  "img",
  "input",
  "meta",
  "link",
  "area",
  "base",
  "col",
  "embed",
  "source",
  "track",
  "wbr",
]);

// ---------------------------------------------------------------------------
// The lite parser: a tolerant, dependency-free tokenizer. Used directly by
// `from-design.ts` (to pretty-print Kardo's own, always well-formed output)
// and as the test/no-`DOMParser` fallback for `to-design.ts`.
// ---------------------------------------------------------------------------

function isNameChar(ch: string): boolean {
  return /[A-Za-z0-9:_-]/.test(ch);
}

function isSpace(ch: string | undefined): boolean {
  return ch !== undefined && /\s/.test(ch);
}

function skipQuoted(source: string, start: number): number {
  const quote = source[start];
  let i = start + 1;
  while (i < source.length && source[i] !== quote) i += 1;
  return i + 1;
}

/** Parses one fragment's worth of top-level nodes with a small tolerant
 * tokenizer: no entity decoding (text is kept exactly as written, which is
 * round-trip safe since nothing here re-decodes it either), tags close by
 * name (an unmatched closer is ignored), and any tag ending in `/>` is
 * treated as self-closed regardless of its name. */
function parseLite(source: string): LiteNode[] {
  const n = source.length;
  let i = 0;
  const root: LiteElement = {
    type: "element",
    tag: "#root",
    attrs: {},
    children: [],
  };
  const stack: LiteElement[] = [root];
  const top = () => stack[stack.length - 1] as LiteElement;

  while (i < n) {
    if (source[i] !== "<") {
      const start = i;
      while (i < n && source[i] !== "<") i += 1;
      top().children.push({ type: "text", value: source.slice(start, i) });
      continue;
    }

    if (source.startsWith("<!--", i)) {
      const end = source.indexOf("-->", i + 4);
      const stop = end === -1 ? n : end + 3;
      top().children.push({
        type: "comment",
        value: source.slice(i + 4, end === -1 ? n : end),
      });
      i = stop;
      continue;
    }

    if (source.startsWith("<!", i)) {
      const end = source.indexOf(">", i);
      i = end === -1 ? n : end + 1;
      continue;
    }

    if (source[i + 1] === "/") {
      const end = source.indexOf(">", i);
      const name = source
        .slice(i + 2, end === -1 ? n : end)
        .trim()
        .toLowerCase();
      i = end === -1 ? n : end + 1;
      for (let k = stack.length - 1; k > 0; k -= 1) {
        if (stack[k]?.tag === name) {
          stack.length = k;
          break;
        }
      }
      continue;
    }

    // An opening tag, or a stray "<" that is not one (treated as text).
    let j = i + 1;
    const tagStart = j;
    while (j < n && isNameChar(source[j] as string)) j += 1;
    const tag = source.slice(tagStart, j).toLowerCase();
    if (!tag) {
      top().children.push({ type: "text", value: "<" });
      i += 1;
      continue;
    }

    const attrs: Record<string, string> = {};
    let selfClose = false;
    while (j < n) {
      while (j < n && isSpace(source[j])) j += 1;
      if (source[j] === ">") {
        j += 1;
        break;
      }
      if (source[j] === "/" && source[j + 1] === ">") {
        selfClose = true;
        j += 2;
        break;
      }
      if (j >= n) break;
      const nameStart = j;
      while (
        j < n &&
        !isSpace(source[j]) &&
        source[j] !== "=" &&
        source[j] !== ">" &&
        source[j] !== "/"
      )
        j += 1;
      const name = source.slice(nameStart, j);
      if (!name) {
        j += 1;
        continue;
      }
      let afterName = j;
      while (afterName < n && isSpace(source[afterName])) afterName += 1;
      let value = "";
      if (source[afterName] === "=") {
        let k = afterName + 1;
        while (k < n && isSpace(source[k])) k += 1;
        const quote = source[k];
        if (quote === '"' || quote === "'") {
          const end = skipQuoted(source, k);
          value = source.slice(k + 1, Math.min(end - 1, n));
          k = end;
        } else {
          const start = k;
          while (k < n && !isSpace(source[k]) && source[k] !== ">") k += 1;
          value = source.slice(start, k);
        }
        j = k;
      } else {
        j = afterName;
      }
      attrs[name.toLowerCase()] = value;
    }
    i = j;

    const element: LiteElement = { type: "element", tag, attrs, children: [] };
    top().children.push(element);
    if (!selfClose && !voidTags.has(tag)) stack.push(element);
  }

  return root.children;
}

export function liteHtmlParser(): HtmlParser {
  return (html) => parseLite(html);
}

// ---------------------------------------------------------------------------
// The browser parser: delegates to `DOMParser`, then converts into the same
// plain-object shape so every other helper here never branches on the source.
// ---------------------------------------------------------------------------

function fromDomNode(node: ChildNode): LiteNode | null {
  if (node.nodeType === 3)
    return { type: "text", value: node.textContent ?? "" };
  if (node.nodeType === 8)
    return { type: "comment", value: node.textContent ?? "" };
  if (node.nodeType !== 1) return null;
  const el = node as Element;
  const attrs: Record<string, string> = {};
  for (const attr of Array.from(el.attributes)) attrs[attr.name] = attr.value;
  const children: LiteNode[] = [];
  for (const child of Array.from(el.childNodes)) {
    const converted = fromDomNode(child);
    if (converted) children.push(converted);
  }
  return { type: "element", tag: el.tagName.toLowerCase(), attrs, children };
}

export function domParserAdapter(): HtmlParser {
  return (html) => {
    const doc = new DOMParser().parseFromString(
      `<body>${html}</body>`,
      "text/html",
    );
    const nodes: LiteNode[] = [];
    for (const child of Array.from(doc.body.childNodes)) {
      const converted = fromDomNode(child);
      if (converted) nodes.push(converted);
    }
    return nodes;
  };
}

/** `DOMParser` in the panel (a real browser); the lite parser anywhere else
 * (tests, or a render without one). Always inject the lite parser directly
 * in a test rather than relying on this fallback, so results stay the same
 * regardless of the environment running them. */
export function defaultHtmlParser(): HtmlParser {
  return typeof DOMParser !== "undefined"
    ? domParserAdapter()
    : liteHtmlParser();
}

// ---------------------------------------------------------------------------
// Tree helpers
// ---------------------------------------------------------------------------

export function isElement(node: LiteNode): node is LiteElement {
  return node.type === "element";
}

export function getAttr(el: LiteElement, name: string): string | null {
  return Object.hasOwn(el.attrs, name) ? (el.attrs[name] as string) : null;
}

function containsMarked(node: LiteNode, attr: string): boolean {
  if (!isElement(node)) return false;
  if (getAttr(node, attr) !== null) return true;
  return node.children.some((child) => containsMarked(child, attr));
}

/** Every element anywhere under `nodes` that carries `attr`, not descending
 * past a match (so a block's own inner markup is never mistaken for
 * another). Used to find every `data-section-id` in a whole document. */
export function findMarked(
  nodes: readonly LiteNode[],
  attr: string,
): LiteElement[] {
  const found: LiteElement[] = [];
  const walk = (list: readonly LiteNode[]) => {
    for (const node of list) {
      if (!isElement(node)) continue;
      if (getAttr(node, attr) !== null) {
        found.push(node);
        continue;
      }
      walk(node.children);
    }
  };
  walk(nodes);
  return found;
}

export type Unit = { id: string | null; el: LiteElement };

/**
 * The "block-sized" units directly inside `root`'s subtree: an element that
 * carries `attr` is one unit (its own subtree is never split further); a
 * wrapper with no `attr` anywhere inside it (Kardo's own `.kd-col`/
 * `.kd-canvas-frame`/`.kd-ci` structure) is transparent — its children are
 * walked instead; a wrapper with no `attr` anywhere inside it is itself one
 * new, unmarked unit (`id: null`) — new content the person added. Document
 * order throughout.
 */
export function topUnits(root: LiteElement, attr: string): Unit[] {
  const units: Unit[] = [];
  const walk = (node: LiteElement) => {
    for (const child of node.children) {
      if (!isElement(child)) continue;
      const id = getAttr(child, attr);
      if (id !== null) {
        units.push({ id, el: child });
        continue;
      }
      if (containsMarked(child, attr)) {
        walk(child);
        continue;
      }
      units.push({ id: null, el: child });
    }
  };
  walk(root);
  return units;
}

/** Every `class` token on `node` and its descendants. */
export function collectClasses(
  node: LiteNode,
  out: Set<string> = new Set(),
): Set<string> {
  if (!isElement(node)) return out;
  const value = getAttr(node, "class");
  if (value) for (const token of value.split(/\s+/)) if (token) out.add(token);
  for (const child of node.children) collectClasses(child, out);
  return out;
}

function attrsString(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([name, value]) => (value === "" ? ` ${name}` : ` ${name}="${value}"`))
    .join("");
}

/** Canonical re-serialization (the "HTML normalizado" the sync compares):
 * always double-quoted attributes in source order, text kept verbatim. Used
 * both for equality checks and as the literal source of a converted `html`
 * block. */
export function serialize(node: LiteNode): string {
  if (node.type === "text") return node.value;
  if (node.type === "comment") return `<!--${node.value}-->`;
  const attrs = attrsString(node.attrs);
  if (voidTags.has(node.tag) && node.children.length === 0)
    return `<${node.tag}${attrs}>`;
  return `<${node.tag}${attrs}>${node.children.map(serialize).join("")}</${node.tag}>`;
}

/** A readable, editable rendering: one line per tag, indented by nesting —
 * except an element whose only children are text, which stays on one line. */
export function prettyPrintHtml(nodes: readonly LiteNode[]): string {
  const lines: string[] = [];

  const onlyText = (el: LiteElement): string | null => {
    if (
      el.children.length > 0 &&
      el.children.every((child) => child.type === "text")
    )
      return el.children.map((child) => (child as LiteText).value).join("");
    return el.children.length === 0 ? "" : null;
  };

  const printNode = (node: LiteNode, depth: number) => {
    const pad = "  ".repeat(depth);
    if (node.type === "text") {
      const trimmed = node.value.trim();
      if (trimmed) lines.push(pad + trimmed);
      return;
    }
    if (node.type === "comment") {
      lines.push(`${pad}<!--${node.value}-->`);
      return;
    }
    const attrs = attrsString(node.attrs);
    if (voidTags.has(node.tag) && node.children.length === 0) {
      lines.push(`${pad}<${node.tag}${attrs}>`);
      return;
    }
    const text = onlyText(node);
    if (text !== null) {
      lines.push(`${pad}<${node.tag}${attrs}>${text}</${node.tag}>`);
      return;
    }
    lines.push(`${pad}<${node.tag}${attrs}>`);
    for (const child of node.children) printNode(child, depth + 1);
    lines.push(`${pad}</${node.tag}>`);
  };

  for (const node of nodes) printNode(node, 0);
  return lines.join("\n");
}
