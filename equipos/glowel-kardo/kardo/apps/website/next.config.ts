import type { NextConfig } from "next";
import { readSiteEnv } from "./config/site-env.mjs";

const site = readSiteEnv(process.env);

/**
 * Static export for Netlify (ADR 010): no server, no Server Actions, no API
 * routes. `scripts/harden-export.mjs` runs after the build to add the Content
 * Security Policy and the `_headers` file.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  poweredByHeader: false,
  // Do not let `next dev` write AGENTS.md/CLAUDE.md into the app folder.
  agentRules: false,
  images: { unoptimized: true },
  // Explicit allowlist of the public values the pages may read.
  env: {
    KARDO_ENV: site.environment,
    PUBLIC_WEBSITE_URL: site.websiteUrl,
    PUBLIC_CUSTOMER_APP_URL: site.customerAppUrl,
    PUBLIC_CONTACT_EMAIL: site.contactEmail ?? "",
    PUBLIC_WHATSAPP: site.whatsapp,
  },
};

export default nextConfig;
