/**
 * Scrolls a field into view and focuses it, without `Element.scrollIntoView`
 * or the browser's own focus-scroll: both also move the whole page in
 * WebKit, because the Estudio's page is `position: fixed`
 * (`ai/BlocksAiPanel.tsx` hit the same thing scrolling its own rail). This
 * only scrolls the field's own rail panel or inspector, found by
 * `closest()`, with a plain `scrollTo` computed from its own coordinates.
 *
 * Used by `inspector/Inspector.tsx` ("Escribir mi WhatsApp", C5e) and
 * `panels/ContentPanel.tsx` (a failed save's first error field, C5c).
 */
export function focusField(id: string): boolean {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) return false;
  const container = element.closest<HTMLElement>(
    ".es-panel-body, .es-inspector-body, .es-inspector",
  );
  if (container) {
    const offset =
      element.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop -
      16;
    container.scrollTo({ top: Math.max(0, offset), behavior: "smooth" });
  }
  element.focus({ preventScroll: true });
  return true;
}
