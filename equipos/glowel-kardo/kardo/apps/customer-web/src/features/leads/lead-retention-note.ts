/** La línea sobre cuánto tiempo guarda Kardo las solicitudes, para la
 * lista (A2-53 d). `days: null` es «sin límite». */
export function leadRetentionNote(days: number | null): string {
  return days === null
    ? "Kardo guarda tus solicitudes sin límite de tiempo."
    : `Kardo guarda tus solicitudes ${days} días y después las borra.`;
}
