// Minimal Markdown reader for the legal texts in Docs/legal (the single
// source of truth). It covers what those files use: headings, paragraphs,
// lists, bold, italics, links, tables, rules and quotes. It returns plain
// data; the page renders it as React elements, never as raw HTML.

export type Inline =
  | { kind: "text"; value: string }
  | { kind: "strong" | "em" | "code"; children: Inline[] }
  | { kind: "link"; href: string; children: Inline[] }
  /** A missing titular datum such as [RFC]: marked while the text is a draft. */
  | { kind: "placeholder"; value: string };

export type Block =
  | { kind: "heading"; level: 1 | 2 | 3 | 4; id: string; inline: Inline[] }
  | { kind: "paragraph"; inline: Inline[] }
  | {
      kind: "list";
      ordered: boolean;
      items: { level: 0 | 1; inline: Inline[] }[];
    }
  | { kind: "table"; header: Inline[][]; rows: Inline[][][] }
  | { kind: "quote"; inline: Inline[] }
  | { kind: "rule" };

/** Titular data the owner must fill before publishing (Docs/legal). */
export const LEGAL_PLACEHOLDERS = [
  "NOMBRE DEL TITULAR",
  "RFC",
  "DOMICILIO FISCAL",
  "CORREO DE CONTACTO",
  "CORREO DE PRIVACIDAD",
  "TELÉFONO",
  "DOMINIO",
  "CIUDAD Y ESTADO PARA JURISDICCIÓN",
  "FECHA DE ENTRADA EN VIGOR",
] as const;

const placeholderPattern = new RegExp(
  `\\[(${LEGAL_PLACEHOLDERS.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\](?!\\()`,
);

export function missingPlaceholders(markdown: string): string[] {
  return LEGAL_PLACEHOLDERS.filter((name) => markdown.includes(`[${name}]`));
}

export function slugify(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Only these link targets are rendered as links; anything else is text. */
export function safeHref(href: string): string | null {
  if (/^https:\/\/[^\s]+$/i.test(href)) return href;
  if (/^mailto:[^\s@]+@[^\s@]+$/i.test(href)) return href;
  if (/^\/(?!\/)[^\s]*$/.test(href) || /^#[\w-]+$/.test(href)) return href;
  return null;
}

const inlinePattern =
  /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*([^*\s][^*]*?)\*/;

export function parseInline(text: string): Inline[] {
  const out: Inline[] = [];
  let rest = text;
  while (rest.length > 0) {
    const match = inlinePattern.exec(rest);
    const placeholder = placeholderPattern.exec(rest);
    const next =
      placeholder && (!match || placeholder.index < match.index)
        ? placeholder
        : match;
    if (!next) {
      out.push({ kind: "text", value: rest });
      break;
    }
    if (next.index > 0)
      out.push({ kind: "text", value: rest.slice(0, next.index) });
    if (next === placeholder) {
      out.push({ kind: "placeholder", value: placeholder[1] ?? "" });
    } else if (match?.[1] !== undefined) {
      out.push({ kind: "strong", children: parseInline(match[1]) });
    } else if (match?.[2] !== undefined && match[3] !== undefined) {
      const href = safeHref(match[3]);
      out.push(
        href
          ? { kind: "link", href, children: parseInline(match[2]) }
          : { kind: "text", value: match[2] },
      );
    } else if (match?.[4] !== undefined) {
      out.push({ kind: "code", children: [{ kind: "text", value: match[4] }] });
    } else if (match?.[5] !== undefined) {
      out.push({ kind: "em", children: parseInline(match[5]) });
    }
    rest = rest.slice(next.index + next[0].length);
  }
  return out;
}

const bullet = /^(\s*)[-*]\s+(.*)$/;
const ordered = /^(\s*)\d+\.\s+(.*)$/;

function isBlockStart(line: string): boolean {
  return (
    /^#{1,4}\s/.test(line) ||
    /^(-{3,}|\*{3,})\s*$/.test(line) ||
    line.trimStart().startsWith("|") ||
    bullet.test(line) ||
    ordered.test(line) ||
    line.startsWith(">")
  );
}

function tableCells(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

export function parseLegalMarkdown(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const blocks: Block[] = [];
  const usedIds = new Set<string>();
  let index = 0;
  while (index < lines.length) {
    const line = lines[index] ?? "";
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const heading = /^(#{1,4})\s+(.*)$/.exec(line);
    if (heading) {
      const text = (heading[2] ?? "").trim();
      let id = slugify(text) || "seccion";
      for (let n = 2; usedIds.has(id); n += 1) id = `${slugify(text)}-${n}`;
      usedIds.add(id);
      blocks.push({
        kind: "heading",
        level: (heading[1]?.length ?? 2) as 1 | 2 | 3 | 4,
        id,
        inline: parseInline(text),
      });
      index += 1;
      continue;
    }
    if (/^(-{3,}|\*{3,})\s*$/.test(line)) {
      blocks.push({ kind: "rule" });
      index += 1;
      continue;
    }
    if (line.trimStart().startsWith("|")) {
      const tableLines: string[] = [];
      while (
        index < lines.length &&
        (lines[index] ?? "").trimStart().startsWith("|")
      ) {
        tableLines.push(lines[index] ?? "");
        index += 1;
      }
      const [first, second, ...others] = tableLines;
      const hasSeparator =
        second !== undefined && /^\s*\|?\s*:?-{3,}/.test(second);
      const body = hasSeparator
        ? others
        : [second, ...others].filter((row) => row !== undefined);
      blocks.push({
        kind: "table",
        header: tableCells(first ?? "").map(parseInline),
        rows: body.map((row) => tableCells(row ?? "").map(parseInline)),
      });
      continue;
    }
    const listMatch = bullet.exec(line) ?? ordered.exec(line);
    if (listMatch) {
      const isOrdered = !bullet.test(line);
      const items: { level: 0 | 1; text: string }[] = [];
      while (index < lines.length) {
        const current = lines[index] ?? "";
        const item = isOrdered ? ordered.exec(current) : bullet.exec(current);
        if (item) {
          items.push({
            level: (item[1]?.length ?? 0) >= 2 ? 1 : 0,
            text: item[2] ?? "",
          });
          index += 1;
        } else if (/^\s{2,}\S/.test(current) && items.length > 0) {
          const last = items[items.length - 1];
          if (last) last.text += ` ${current.trim()}`;
          index += 1;
        } else {
          break;
        }
      }
      blocks.push({
        kind: "list",
        ordered: isOrdered,
        items: items.map((item) => ({
          level: item.level,
          inline: parseInline(item.text),
        })),
      });
      continue;
    }
    if (line.startsWith(">")) {
      const quote: string[] = [];
      while (index < lines.length && (lines[index] ?? "").startsWith(">")) {
        quote.push((lines[index] ?? "").replace(/^>\s?/, ""));
        index += 1;
      }
      blocks.push({ kind: "quote", inline: parseInline(quote.join(" ")) });
      continue;
    }
    const paragraph = [line.trim()];
    index += 1;
    while (
      index < lines.length &&
      (lines[index] ?? "").trim() &&
      !isBlockStart(lines[index] ?? "")
    ) {
      paragraph.push((lines[index] ?? "").trim());
      index += 1;
    }
    blocks.push({
      kind: "paragraph",
      inline: parseInline(paragraph.join(" ")),
    });
  }
  return blocks;
}
