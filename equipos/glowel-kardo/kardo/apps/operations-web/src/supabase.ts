import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * The Staff API origin. Required in production builds: an Operations bundle
 * shipped without it would silently talk to nothing (there is no safe public
 * default, unlike the Resolver's permanent tap-routing origin).
 */
function resolveStaffApiUrl(): string {
  const configured = import.meta.env.VITE_STAFF_API_URL;
  if (!configured && import.meta.env.PROD)
    throw new Error("VITE_STAFF_API_URL is required for production builds.");
  return (configured || "http://localhost:3002").replace(/\/$/, "");
}

export const staffApiUrl = resolveStaffApiUrl();

// Staff sessions live in sessionStorage under their own key: they end when
// the tab closes and never share storage with the customer panel.
export const supabase: SupabaseClient | null =
  supabaseUrl && supabasePublishableKey
    ? createClient(supabaseUrl, supabasePublishableKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          // Never adopt a session from the URL fragment (login CSRF, security
          // review 2026-10-12); staff sign in with a password and a code.
          detectSessionInUrl: false,
          flowType: "pkce",
          storageKey: "kardo-operations-auth",
          ...(typeof window === "undefined"
            ? {}
            : { storage: window.sessionStorage }),
        },
      })
    : null;
