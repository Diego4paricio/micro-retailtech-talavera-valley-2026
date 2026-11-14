/**
 * Where a verified email session still needs to go before the workspace:
 * - `password`: new account, choose a password, then onboarding.
 * - `onboarding`: new account, configure the first workspace.
 * - `recovery`: existing account proved email control, choose a new password.
 */
export type RegistrationStage = "password" | "onboarding" | "recovery" | null;

const key = "kardo.registration-stage";

export function readRegistrationStage(): RegistrationStage {
  try {
    const value = window.sessionStorage.getItem(key);
    return value === "password" ||
      value === "onboarding" ||
      value === "recovery"
      ? value
      : null;
  } catch {
    return null;
  }
}

export function writeRegistrationStage(stage: RegistrationStage) {
  try {
    if (stage) window.sessionStorage.setItem(key, stage);
    else window.sessionStorage.removeItem(key);
  } catch {
    // Storage may be unavailable (private mode); the flow still works in memory.
  }
}
