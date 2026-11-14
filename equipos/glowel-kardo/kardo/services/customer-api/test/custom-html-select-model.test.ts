import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { selectCustomHtmlModel } from "../src/custom-html/select-model.js";

const baseConfig = {
  ANTHROPIC_API_KEY: undefined,
  CUSTOM_HTML_AI_PROVIDER: undefined,
  CUSTOM_HTML_AI_ENABLED: undefined,
  KARDO_AI_BRIDGE_DIR: undefined,
  KARDO_AI_BRIDGE_TIMEOUT_MS: 240_000,
} as const;

describe("selectCustomHtmlModel", () => {
  it("is null when nothing is configured", () => {
    expect(
      selectCustomHtmlModel({ config: baseConfig, modelId: "claude-sonnet-5" }),
    ).toBeNull();
  });

  it("defaults to anthropic once ANTHROPIC_API_KEY is set", () => {
    const model = selectCustomHtmlModel({
      config: {
        ...baseConfig,
        ANTHROPIC_API_KEY: "sk-ant-test-key-1234567890",
      },
      modelId: "claude-sonnet-5",
    });
    expect(model?.provider).toBe("anthropic");
    expect(model?.model).toBe("claude-sonnet-5");
  });

  it("builds the dev bridge when explicitly requested with a valid directory, outside production", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "kardo-ai-bridge-"));
    const model = selectCustomHtmlModel({
      config: {
        ...baseConfig,
        CUSTOM_HTML_AI_PROVIDER: "dev-bridge",
        KARDO_AI_BRIDGE_DIR: dir,
      },
      modelId: "claude-sonnet-5",
    });
    expect(model?.provider).toBe("dev-bridge");
  });

  it("infers dev-bridge from KARDO_AI_BRIDGE_DIR alone when no key is set", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "kardo-ai-bridge-"));
    const model = selectCustomHtmlModel({
      config: { ...baseConfig, KARDO_AI_BRIDGE_DIR: dir },
      modelId: "claude-sonnet-5",
    });
    expect(model?.provider).toBe("dev-bridge");
  });

  it("prefers anthropic over dev-bridge when both are configured and no explicit provider is set", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "kardo-ai-bridge-"));
    const model = selectCustomHtmlModel({
      config: {
        ...baseConfig,
        ANTHROPIC_API_KEY: "sk-ant-test-key-1234567890",
        KARDO_AI_BRIDGE_DIR: dir,
      },
      modelId: "claude-sonnet-5",
    });
    expect(model?.provider).toBe("anthropic");
  });

  it("throws (refuses to build) when dev-bridge is requested without a directory", () => {
    expect(() =>
      selectCustomHtmlModel({
        config: { ...baseConfig, CUSTOM_HTML_AI_PROVIDER: "dev-bridge" },
        modelId: "claude-sonnet-5",
      }),
    ).toThrow();
  });

  it("CUSTOM_HTML_AI_ENABLED=false turns the feature off even with a key configured", () => {
    const model = selectCustomHtmlModel({
      config: {
        ...baseConfig,
        ANTHROPIC_API_KEY: "sk-ant-test-key-1234567890",
        CUSTOM_HTML_AI_ENABLED: "false",
      },
      modelId: "claude-sonnet-5",
    });
    expect(model).toBeNull();
  });

  it("in production the AI stays off unless it is turned on on purpose", () => {
    const key = {
      ...baseConfig,
      ANTHROPIC_API_KEY: "sk-ant-test-key-1234567890",
    };
    expect(
      selectCustomHtmlModel({
        config: { ...key, KARDO_ENV: "production" },
        modelId: "claude-sonnet-5",
      }),
    ).toBeNull();
    expect(
      selectCustomHtmlModel({
        config: {
          ...key,
          KARDO_ENV: "production",
          CUSTOM_HTML_AI_ENABLED: "true",
        },
        modelId: "claude-sonnet-5",
      })?.provider,
    ).toBe("anthropic");
    // Outside production nothing changes: the key alone turns it on.
    expect(
      selectCustomHtmlModel({
        config: { ...key, KARDO_ENV: "test" },
        modelId: "claude-sonnet-5",
      })?.provider,
    ).toBe("anthropic");
  });

  it("refuses the dev bridge in production even when NODE_ENV says otherwise", () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), "kardo-ai-bridge-"));
    expect(() =>
      selectCustomHtmlModel({
        config: {
          ...baseConfig,
          KARDO_ENV: "production",
          CUSTOM_HTML_AI_ENABLED: "true",
          CUSTOM_HTML_AI_PROVIDER: "dev-bridge",
          KARDO_AI_BRIDGE_DIR: dir,
        },
        modelId: "claude-sonnet-5",
      }),
    ).toThrow(/never runs in production/);
  });
});
