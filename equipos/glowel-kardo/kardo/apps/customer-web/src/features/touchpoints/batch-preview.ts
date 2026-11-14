/**
 * Pure helpers for the "Crear varios" flow: naming preview only, the server
 * is the source of truth for what actually gets created.
 */

/** e.g. `batchNames("Mesa", 1, 3)` → `["Mesa 1", "Mesa 2", "Mesa 3"]`. */
export function batchNames(
  namePrefix: string,
  start: number,
  count: number,
): string[] {
  const prefix = namePrefix.trim();
  if (!prefix || count <= 0) return [];
  return Array.from(
    { length: count },
    (_, index) => `${prefix} ${start + index}`,
  );
}

/**
 * A short, human summary of the batch: "Mesa 1", or "Mesa 1 … Mesa 20" when
 * there is more than one. Returns an empty string when there is nothing to
 * preview yet.
 */
export function batchPreviewSummary(
  namePrefix: string,
  start: number,
  count: number,
): string {
  const names = batchNames(namePrefix, start, count);
  if (!names.length) return "";
  if (names.length === 1) return names[0] ?? "";
  return `${names[0]} … ${names[names.length - 1]}`;
}
