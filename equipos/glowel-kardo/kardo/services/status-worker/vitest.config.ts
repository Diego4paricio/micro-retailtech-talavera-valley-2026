import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: "./wrangler.test.jsonc" },
      miniflare: {
        bindings: {
          STATUS_COMMAND_KEY: "status-test-command-key-0123456789abcdef",
          STATUS_PROBE_KEY: "status-test-probe-key-0123456789abcdef",
        },
      },
    }),
  ],
});
