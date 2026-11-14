import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv, type Plugin } from "vite";

function origin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

/**
 * Production-only Content Security Policy. The session lives in browser
 * storage, so script injection is the main risk: only same-origin scripts run
 * and the page may only talk to Supabase Auth, the Customer API and the asset
 * upload Worker. Development skips it because Vite's HMR needs inline scripts.
 * With a Stripe publishable key the embedded Checkout also needs Stripe.js
 * (always from js.stripe.com, never bundled) and its frames: the directives
 * of docs.stripe.com/security/guide for Stripe.js, Checkout and Link.
 * `frame-ancestors` cannot be set by <meta>; send it as a response header
 * (with HSTS) from the hosting platform.
 */
/**
 * Owner decision (2026-10-01): customers pay on Stripe's hosted Checkout,
 * branded in the Stripe Dashboard. The embedded Checkout stays available
 * behind VITE_STRIPE_EMBEDDED_CHECKOUT=true; only then the publishable key
 * (public by design; STRIPE_PUBLISHABLE_KEY in the root .env is the
 * fallback) reaches the bundle and the CSP opens to Stripe.
 */
function stripePublishableKey(env: Record<string, string>): string {
  if (env.VITE_STRIPE_EMBEDDED_CHECKOUT !== "true") return "";
  const key = (
    env.VITE_STRIPE_PUBLISHABLE_KEY ||
    env.STRIPE_PUBLISHABLE_KEY ||
    ""
  ).trim();
  return /^pk_(test|live)_[A-Za-z0-9]+$/.test(key) ? key : "";
}

function contentSecurityPolicy(env: Record<string, string>): Plugin {
  const connect = [
    "'self'",
    origin(env.VITE_SUPABASE_URL),
    origin(env.VITE_CUSTOMER_API_URL),
    // Uploads go straight to the asset Worker with a single-object capability.
    origin(env.VITE_ASSET_UPLOAD_ORIGIN || env.ASSET_WORKER_URL),
    // Service status (ADR 022): public JSON, no session.
    origin(env.VITE_STATUS_URL),
  ].filter(Boolean);
  const stripe = Boolean(stripePublishableKey(env));
  const stripeScripts = stripe
    ? " https://js.stripe.com https://*.js.stripe.com"
    : "";
  const stripeConnect = stripe
    ? " https://api.stripe.com https://checkout.stripe.com https://link.com https://*.link.com"
    : "";
  const frames = stripe
    ? "https://js.stripe.com https://*.js.stripe.com https://hooks.stripe.com https://checkout.stripe.com https://link.com https://*.link.com"
    : "'none'";
  const policy = [
    "default-src 'self'",
    `script-src 'self'${stripeScripts}`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    `img-src 'self' data: blob:${stripe ? " https://*.stripe.com https://*.link.com" : ""}`,
    `connect-src ${connect.join(" ")}${stripeConnect}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    `frame-src ${frames}`,
  ].join("; ");
  return {
    name: "kardo-content-security-policy",
    apply: "build",
    transformIndexHtml: () => [
      {
        tag: "meta",
        attrs: { "http-equiv": "Content-Security-Policy", content: policy },
        injectTo: "head-prepend",
      },
      {
        tag: "meta",
        attrs: { name: "referrer", content: "strict-origin-when-cross-origin" },
        injectTo: "head-prepend",
      },
    ],
  };
}

export default defineConfig(({ mode }) => {
  // Only public origins are read here; nothing from `env` is exposed to the
  // bundle except through Vite's own `VITE_` mechanism.
  const env = loadEnv(mode, "../../", [
    "VITE_",
    "ASSET_WORKER_URL",
    "STRIPE_PUBLISHABLE_KEY",
  ]);
  // Demo mode serves a fabricated session and data (and the `?acceso=`
  // states): it must never ship in a production build, where anyone with
  // the URL would reach it. Same guard as Kardo Operations (security review
  // 2026-10, V17).
  if (mode === "production" && env.VITE_DEMO_MODE === "true")
    throw new Error(
      "VITE_DEMO_MODE must not be enabled for a production build of the Kardo panel.",
    );
  return {
    envDir: "../../",
    // Only the publishable key reaches the bundle (never STRIPE_SECRET_KEY).
    define: {
      "import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY": JSON.stringify(
        stripePublishableKey(env),
      ),
    },
    plugins: [react(), contentSecurityPolicy(env)],
    publicDir: "../../Docs/Marca",
    build: { sourcemap: false },
  };
});
