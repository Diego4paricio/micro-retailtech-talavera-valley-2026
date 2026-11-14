import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

export const customerApiUrl = (
  import.meta.env.VITE_CUSTOMER_API_URL ?? "http://localhost:3001"
).replace(/\/$/, "");

const developmentResolverUrl =
  "https://kardo-poa-test-resolver.glowel-dev.workers.dev";

/**
 * Public by design: it is written to NFC chips and encoded in printed QR
 * codes, so it must be the permanent HTTPS Resolver origin of the environment
 * — never an API or storage URL and never a secret. A production build never
 * falls back to the test Resolver: a wrong origin would be printed forever.
 */
function resolveTapResolverUrl(): string {
  const configured = import.meta.env.VITE_TAP_RESOLVER_URL;
  if (!configured && import.meta.env.PROD)
    throw new Error("VITE_TAP_RESOLVER_URL is required for production builds.");
  const url = new URL(configured || developmentResolverUrl);
  if (url.protocol !== "https:" || url.username || url.password)
    throw new Error(
      "VITE_TAP_RESOLVER_URL must be a credential-free HTTPS URL.",
    );
  return url.origin;
}

export const tapResolverUrl = resolveTapResolverUrl();

export const supabase: SupabaseClient | null =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          // Never adopt a session from `#access_token=…` in the URL. No Kardo
          // flow relies on it (sign-in and email change use `verifyOtp` with a
          // code; invitations read their own `#token=` by hand), and leaving it
          // on let an attacker's link silently sign a victim into the
          // attacker's account — they would then print and pay for QRs the
          // attacker controls (security review 2026-10-12, login CSRF). PKCE is
          // the modern default for any future code exchange.
          detectSessionInUrl: false,
          flowType: "pkce",
        },
      })
    : null;

/**
 * Checks the password of the signed-in person without touching this tab's
 * session: a throwaway client signs in and out at once. Used to confirm it
 * is you before changing the email (ADR 023). The real protection stays on
 * the server (confirmation on both addresses).
 */
export async function verifyPassword(
  email: string,
  password: string,
): Promise<boolean> {
  if (!supabaseUrl || !supabasePublishableKey) return false;
  const probe = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
      storageKey: "kardo-reauthentication",
    },
  });
  const { error } = await probe.auth.signInWithPassword({ email, password });
  if (error) return false;
  await probe.auth.signOut({ scope: "local" });
  return true;
}
