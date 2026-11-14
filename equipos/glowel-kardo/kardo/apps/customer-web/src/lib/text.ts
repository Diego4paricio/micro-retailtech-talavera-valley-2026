/**
 * Small text helpers the panel kept rewriting in each feature (domain audit
 * 2026-10-13, A2-72): folding for search and the count + word of a total.
 */

/** Lowercase and without accents, so «menu» finds «Menú». */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("es-MX")
    .trim();
}

/** The word for a total: «página» for 1, «páginas» otherwise. */
export function pluralWord(count: number, one: string, many: string): string {
  return count === 1 ? one : many;
}

/** A total with its word: «1 página», «3 páginas». */
export function countLabel(count: number, one: string, many: string): string {
  return `${count} ${pluralWord(count, one, many)}`;
}
