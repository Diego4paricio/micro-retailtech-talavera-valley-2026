import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.jsonc" },
      miniflare: {
        bindings: {
          ASSET_UPLOAD_SIGNING_KEY:
            "asset-test-command-key-that-is-long-enough",
        },
      },
    }),
  ],
});
