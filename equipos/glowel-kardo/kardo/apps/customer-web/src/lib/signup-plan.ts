/**
 * The plan picked on the Website's /precios/ (ADR 020): its "Empieza gratis"
 * button opens `/registro?plan=profesional&periodo=anual`. The choice is kept
 * for this browser session and sent when sign up finishes, so the 15-day
 * trial is of that plan. Anything unexpected is ignored: the server falls
 * back to the trial plan anyway.
 */
export type SignupPlan = { plan: string; billingInterval: "month" | "year" };

const key = "kardo.signup-plan";
const planCode = /^[a-z0-9_-]{2,64}$/;

export function parseSignupPlan(search: string): SignupPlan | null {
  const query = new URLSearchParams(search);
  const plan = query.get("plan")?.trim().toLowerCase() ?? "";
  if (!planCode.test(plan)) return null;
  const period = query.get("periodo")?.trim().toLowerCase();
  return {
    plan,
    billingInterval: period === "anual" || period === "year" ? "year" : "month",
  };
}

export function captureSignupPlan(search: string): void {
  const choice = parseSignupPlan(search);
  if (!choice) return;
  try {
    window.sessionStorage.setItem(key, JSON.stringify(choice));
  } catch {
    // Without storage the trial simply uses the default plan.
  }
}

export function readSignupPlan(): SignupPlan | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<SignupPlan> | null;
    return value && typeof value.plan === "string" && planCode.test(value.plan)
      ? {
          plan: value.plan,
          billingInterval: value.billingInterval === "year" ? "year" : "month",
        }
      : null;
  } catch {
    return null;
  }
}

export function clearSignupPlan(): void {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    // Nothing stored.
  }
}
