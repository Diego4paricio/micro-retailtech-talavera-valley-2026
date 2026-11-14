/// <reference types="vite/client" />

// Every VITE_ variable is compiled into the public bundle: never add secrets.
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_CUSTOMER_API_URL?: string;
  readonly VITE_TAP_RESOLVER_URL?: string;
  /** Where Links live (kardo.com.mx/<negocio>/<link>); defaults to
   * https://kardo.com.mx. Only for local tests. */
  readonly VITE_LINKS_BASE_URL?: string;
  /** Status Worker (ADR 022), e.g. https://kardo-status.<cuenta>.workers.dev. */
  readonly VITE_STATUS_URL?: string;
  readonly VITE_ASSET_UPLOAD_ORIGIN?: string;
  readonly VITE_DEMO_MODE?: string;
  readonly VITE_WEBSITE_URL?: string;
  /** Stripe publishable key (pk_test_ / pk_live_) for the embedded Checkout;
   * vite.config.ts falls back to STRIPE_PUBLISHABLE_KEY. Empty unless the
   * build sets VITE_STRIPE_EMBEDDED_CHECKOUT=true (the hosted Checkout is
   * the default). */
  readonly VITE_STRIPE_PUBLISHABLE_KEY?: string;
  readonly VITE_STRIPE_EMBEDDED_CHECKOUT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
