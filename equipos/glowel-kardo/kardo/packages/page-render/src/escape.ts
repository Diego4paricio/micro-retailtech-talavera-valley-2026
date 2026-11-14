/** Escapes text for safe interpolation into HTML content or a double-quoted
 * HTML attribute. Mirrors `services/resolver/src/render.ts`'s `escapeHtml` —
 * applied to every piece of user-authored text this package renders. */
export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}
