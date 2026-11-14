import { type CustomerProfile, legalVersions } from "@kardo/contracts";

export const pendingTermsKey = "kardo.pendingTermsAcceptance";

type Versions = { terms: string; privacy: string };

/** Whether the profile still has to accept the current Terms and Privacy. */
export function needsTermsAcceptance(
  profile: Pick<CustomerProfile, "termsVersion" | "privacyVersion">,
): boolean {
  return (
    profile.termsVersion !== legalVersions.terms ||
    profile.privacyVersion !== legalVersions.privacy
  );
}

/** First time (never accepted) reads "Antes de continuar"; otherwise an update. */
export function termsGateTitle(
  profile: Pick<CustomerProfile, "termsAcceptedAt">,
): string {
  return profile.termsAcceptedAt
    ? "Actualizamos nuestros Términos"
    : "Antes de continuar";
}

/** True only when the stored mark carries exactly the current versions. */
export function isPendingMarkCurrent(raw: string | null): boolean {
  if (!raw) return false;
  try {
    const mark = JSON.parse(raw) as Partial<Versions> | null;
    return (
      mark?.terms === legalVersions.terms &&
      mark?.privacy === legalVersions.privacy
    );
  } catch {
    return false;
  }
}

export function writePendingMark(): void {
  try {
    window.localStorage.setItem(
      pendingTermsKey,
      JSON.stringify({
        terms: legalVersions.terms,
        privacy: legalVersions.privacy,
      }),
    );
  } catch {
    // Without storage the gate simply asks again after sign-in.
  }
}

export function readPendingMark(): boolean {
  try {
    return isPendingMarkCurrent(window.localStorage.getItem(pendingTermsKey));
  } catch {
    return false;
  }
}

export function clearPendingMark(): void {
  try {
    window.localStorage.removeItem(pendingTermsKey);
  } catch {
    // Nothing to clear.
  }
}
