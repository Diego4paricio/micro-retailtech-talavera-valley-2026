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
 * Production-only Content Security Policy. The staff session lives in
 * browser storage, so script injection is the main risk: only same-origin
 * scripts run and the page may only talk to Supabase Auth and the Staff API.
 * Development skips it because Vite's HMR needs inline scripts.
 * `frame-ancestors` cannot be set by <meta>; send it as a response header
 * (with HSTS) from the hosting platform, alongside Cloudflare Access.
 */
function contentSecurityPolicy(env: Record<string, string>): Plugin {
  const connect = [
    "'self'",
    origin(env.VITE_SUPABASE_URL),
    origin(env.VITE_STAFF_API_URL),
  ].filter(Boolean);
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob:",
    `connect-src ${connect.join(" ")}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-src 'none'",
  ].join("; ");
  return {
    name: "kardo-operations-content-security-policy",
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
  const env = loadEnv(mode, "../../", ["VITE_"]);
  // Demo mode serves fabricated staff/customer data: it must never ship in a
  // production build, where it would be reachable by anyone with the URL.
  if (mode === "production" && env.VITE_DEMO_MODE === "true")
    throw new Error(
      "VITE_DEMO_MODE must not be enabled for a production build of Kardo Operations.",
    );
  return {
    envDir: "../../",
    plugins: [react(), contentSecurityPolicy(env)],
    publicDir: "../../Docs/Marca",
    server: { port: 5174 },
    build: { sourcemap: false },
  };
});
