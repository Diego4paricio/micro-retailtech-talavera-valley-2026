import { type PageDesign, sectionBlocks } from "@kardo/contracts";

/**
 * Ids for new sections and blocks. They follow the contract's pattern
 * (`^[a-zA-Z0-9_-]{1,64}$`) and never collide with an id already in the
 * design or with a content link or social (the server rejects repeated ids,
 * because tracked clicks are keyed by them).
 */

export type NewId = (prefix: "s" | "b") => string;

/** Every id a design uses: sections and blocks (canvas items included). */
export function designIds(design: PageDesign | null): string[] {
  if (!design) return [];
  return design.sections.flatMap((section) => [
    section.id,
    ...sectionBlocks(section).map((block) => block.id),
  ]);
}

function randomToken(): string {
  return crypto.randomUUID().replaceAll("-", "").slice(0, 10);
}

/**
 * Returns a generator that remembers what it handed out, so several ids
 * created for one operation (a duplicated section) are unique too.
 */
export function createIdFactory(
  taken: Iterable<string>,
  random: () => string = randomToken,
): NewId {
  const used = new Set(taken);
  return (prefix) => {
    for (let attempt = 0; attempt < 1_000; attempt += 1) {
      const id = `${prefix}-${random()}`.slice(0, 64);
      if (/^[a-zA-Z0-9_-]{1,64}$/.test(id) && !used.has(id)) {
        used.add(id);
        return id;
      }
    }
    // A broken `random` must never produce a repeated id.
    let counter = used.size + 1;
    while (used.has(`${prefix}-${counter}`)) counter += 1;
    const id = `${prefix}-${counter}`;
    used.add(id);
    return id;
  };
}

/** An id factory for edits to `design` of content with `contentIds`. */
export function idFactoryFor(
  design: PageDesign | null,
  contentIds: readonly string[],
): NewId {
  return createIdFactory([...designIds(design), ...contentIds]);
}
