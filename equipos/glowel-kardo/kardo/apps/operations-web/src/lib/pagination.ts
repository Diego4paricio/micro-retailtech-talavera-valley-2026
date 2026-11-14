/**
 * Pure cursor-pagination helpers shared by every "Cargar más" list screen
 * (Clientes, Touchpoints, Publicaciones, Auditoría). Kept dependency-free so
 * they can be unit tested directly.
 */

export type CursorPage<T> = { items: readonly T[]; nextCursor: string | null };

export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined
>;

/** Builds a `?a=b&c=d` query string, skipping null/undefined/empty values. */
export function buildQuery(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `?${query}` : "";
}

/**
 * Appends a freshly-fetched page to an existing list, de-duplicating by `id`
 * (a retried request or an overlapping cursor must not double an item).
 */
export function appendPage<T extends { id: string }>(
  existing: readonly T[],
  page: CursorPage<T>,
): T[] {
  const seen = new Set(existing.map((item) => item.id));
  const merged = existing.slice();
  for (const item of page.items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    merged.push(item);
  }
  return merged;
}

/** True when a page has more results to load. */
export function hasMore<T>(page: CursorPage<T> | null): boolean {
  return page !== null && page.nextCursor !== null;
}
