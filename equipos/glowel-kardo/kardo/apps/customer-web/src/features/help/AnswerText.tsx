import { Fragment } from "react";

type Block =
  | { id: number; kind: "p"; lines: string[] }
  | { id: number; kind: "ul" | "ol"; items: string[] };

const bullet = /^[-*•]\s+/;
const numbered = /^\d+[.)]\s+/;

/** Drops light Markdown decoration; the result is always plain text. */
function clean(line: string): string {
  return line
    .replace(/^#{1,6}\s+/, "")
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function parse(text: string): Block[] {
  const blocks: Block[] = [];
  let id = 0;
  // A blank line closes the current block; the next line starts a new one.
  let isLastOpen = false;
  for (const raw of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      isLastOpen = false;
      continue;
    }
    const last = isLastOpen ? blocks[blocks.length - 1] : undefined;
    if (bullet.test(line) || numbered.test(line)) {
      const kind = bullet.test(line) ? "ul" : "ol";
      const item = clean(line.replace(kind === "ul" ? bullet : numbered, ""));
      if (last && last.kind === kind) last.items.push(item);
      else blocks.push({ id: id++, kind, items: [item] });
    } else if (last && last.kind === "p") last.lines.push(clean(line));
    else blocks.push({ id: id++, kind: "p", lines: [clean(line)] });
    isLastOpen = true;
  }
  return blocks;
}

/**
 * Renders an assistant answer as plain text — paragraphs and simple lists
 * only. No HTML from the model ever reaches the DOM.
 */
export function AnswerText({ text }: { text: string }) {
  return (
    <div className="help-answer">
      {parse(text).map((block) =>
        block.kind === "p" ? (
          <p key={block.id}>
            {block.lines.map((line, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: lines of an immutable answer
              <Fragment key={index}>
                {index > 0 ? <br /> : null}
                {line}
              </Fragment>
            ))}
          </p>
        ) : block.kind === "ul" ? (
          <ul key={block.id}>
            {block.items.map((item, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items of an immutable answer
              <li key={index}>{item}</li>
            ))}
          </ul>
        ) : (
          <ol key={block.id}>
            {block.items.map((item, index) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: items of an immutable answer
              <li key={index}>{item}</li>
            ))}
          </ol>
        ),
      )}
    </div>
  );
}
