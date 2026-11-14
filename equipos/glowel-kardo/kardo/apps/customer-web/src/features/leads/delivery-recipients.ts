import type { WorkspaceMember } from "@kardo/contracts";

/** Cuántas personas pueden recibir el aviso por correo. */
export const maxLeadRecipients = 5;

export type RecipientChoice = {
  email: string;
  /** El nombre de la persona, o su correo si no tiene. */
  label: string;
};

/**
 * Las personas del equipo a las que se puede avisar: las que tienen
 * correo. El API solo acepta correos del equipo, así que esta lista es la
 * única fuente de destinatarios.
 */
export function recipientChoices(
  members: readonly WorkspaceMember[],
): RecipientChoice[] {
  const seen = new Set<string>();
  const choices: RecipientChoice[] = [];
  for (const member of members) {
    const email = member.email?.trim();
    if (!email || seen.has(email.toLowerCase())) continue;
    seen.add(email.toLowerCase());
    choices.push({ email, label: member.displayName?.trim() || email });
  }
  return choices;
}

/** De lo guardado, solo quien sigue en el equipo (alguien que salió no se
 * muestra ni se vuelve a guardar), sin repetidos y hasta el máximo. */
export function currentTeamRecipients(
  saved: readonly string[],
  members: readonly WorkspaceMember[],
): string[] {
  const team = new Set(
    recipientChoices(members).map((choice) => choice.email.toLowerCase()),
  );
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const email of saved) {
    const key = email.trim().toLowerCase();
    if (!team.has(key) || seen.has(key)) continue;
    seen.add(key);
    kept.push(email.trim());
  }
  return kept.slice(0, maxLeadRecipients);
}

/** Marca o desmarca a una persona; no pasa del máximo. */
export function toggleRecipient(
  selected: readonly string[],
  email: string,
): string[] {
  const key = email.toLowerCase();
  if (selected.some((item) => item.toLowerCase() === key))
    return selected.filter((item) => item.toLowerCase() !== key);
  return selected.length >= maxLeadRecipients
    ? [...selected]
    : [...selected, email];
}
