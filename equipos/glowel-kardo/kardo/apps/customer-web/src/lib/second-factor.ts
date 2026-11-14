/** The Customer API answered 401 MFA_REQUIRED: this session only proved the
 * password (a factor was added on another device, or the panel missed it).
 * The access gate listens and asks for the code instead of signing out. */
export const SECOND_FACTOR_REQUIRED_EVENT = "kardo:second-factor-required";

export function requestSecondFactor() {
  window.dispatchEvent(new Event(SECOND_FACTOR_REQUIRED_EVENT));
}
