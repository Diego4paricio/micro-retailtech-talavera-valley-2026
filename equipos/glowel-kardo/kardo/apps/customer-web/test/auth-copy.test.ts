import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const authDir = join(here, "../src/auth");
const libDir = join(here, "../src/lib");

const files = {
  signIn: join(authDir, "SignIn.tsx"),
  setPassword: join(authDir, "SetPassword.tsx"),
  onboarding: join(authDir, "Onboarding.tsx"),
  passwordRules: join(authDir, "PasswordRules.tsx"),
  authErrors: join(libDir, "auth-errors.ts"),
};

const sources = Object.fromEntries(
  Object.entries(files).map(([key, path]) => [key, readFileSync(path, "utf8")]),
) as Record<keyof typeof files, string>;

const forbiddenChars = ["—", "–", "·", "→"];

describe("access flow copy", () => {
  it("never uses em dash, en dash, middle dot or arrow characters", () => {
    for (const [name, source] of Object.entries(sources)) {
      for (const char of forbiddenChars) {
        expect(source.includes(char), `${name} contains "${char}"`).toBe(false);
      }
    }
  });

  it("never mentions Facebook sign-in", () => {
    for (const [name, source] of Object.entries(sources)) {
      expect(source.includes("Facebook"), `${name} mentions Facebook`).toBe(
        false,
      );
    }
  });

  it("never uses the stock phrase 'memorable'", () => {
    for (const [name, source] of Object.entries(sources)) {
      expect(
        source.toLowerCase().includes("memorable"),
        `${name} uses "memorable"`,
      ).toBe(false);
    }
  });

  it("never uses other rejected stock phrases", () => {
    const stockPhrases = [
      "potencia",
      "revoluciona",
      "sin límites",
      "experiencias únicas",
      "lleva tu negocio al siguiente nivel",
      "mágico",
    ];
    for (const [name, source] of Object.entries(sources)) {
      const normalized = source.toLowerCase();
      for (const phrase of stockPhrases) {
        expect(normalized.includes(phrase), `${name} uses "${phrase}"`).toBe(
          false,
        );
      }
    }
  });

  it("never uses gendered 'Bienvenido' greetings", () => {
    for (const [name, source] of Object.entries(sources)) {
      expect(source.includes("Bienvenido"), `${name} uses "Bienvenido"`).toBe(
        false,
      );
    }
  });

  it("drops the all-caps eyebrow labels above form titles", () => {
    expect(sources.signIn).not.toContain('className="eyebrow"');
    expect(sources.onboarding).not.toContain('className="eyebrow"');
  });

  it("keeps the sign-in email and password fields intact", () => {
    expect(sources.signIn).toContain('id="email"');
    expect(sources.signIn).toContain('autoComplete="email"');
    expect(sources.signIn).toContain('id="password"');
    expect(sources.signIn).toContain('autoComplete="current-password"');
    expect(sources.signIn).toContain("minLength={6}");
  });

  it("keeps the verification code input and its 60s resend countdown", () => {
    expect(sources.signIn).toContain('id="verification-code"');
    expect(sources.signIn).toContain('autoComplete="one-time-code"');
    expect(sources.signIn).toContain('inputMode="numeric"');
    expect(sources.signIn).toContain('pattern="[0-9]{6,10}"');
    expect(sources.signIn).toContain("setResendAfter(60)");
    expect(sources.signIn).toContain("Usar otro correo");
  });

  it("keeps the recovery entry point and mode switching", () => {
    expect(sources.signIn).toContain("¿La olvidaste?");
    expect(sources.signIn).toContain('switchMode("recover")');
    expect(sources.signIn).toContain("initialMode");
  });

  it("keeps the new-password and confirm-password fields in SetPassword", () => {
    expect(sources.setPassword).toContain('id="new-password"');
    expect(sources.setPassword).toContain('autoComplete="new-password"');
    expect(sources.setPassword).toContain('id="confirm-password"');
    expect(sources.setPassword).toContain(
      'variant: "new-account" | "recovery"',
    );
  });

  it("keeps the Onboarding business step, without the goal step", () => {
    // First question: personal or business (owner decision, 2026-10-01).
    expect(sources.onboarding).toContain("¿Cómo usarás Kardo?");
    expect(sources.onboarding).toContain('name="account-type"');
    expect(sources.onboarding).toContain(
      "...(accountType ? { accountType } : {})",
    );
    expect(sources.onboarding).toContain('id="business-name"');
    expect(sources.onboarding).toContain('id="business-type"');
    // «Objetivo» left the sign-up (relevo 37, C2): nothing used it.
    expect(sources.onboarding).not.toContain("primary-goal");
    expect(sources.onboarding).not.toContain("primary_goal");
  });

  it("keeps the auth error mapping logic untouched", () => {
    expect(sources.authErrors).toContain(
      'normalized.includes("password should be at least")',
    );
    expect(sources.authErrors).toContain(
      'normalized.includes("user already registered")',
    );
    expect(sources.authErrors).toContain('mode === "sign-in"');
  });

  it("no longer passes eyebrow or showSchematic to AuthLayout", () => {
    expect(sources.signIn).not.toContain("eyebrow=");
    expect(sources.signIn).not.toContain("showSchematic");
    expect(sources.setPassword).not.toContain("eyebrow=");
    expect(sources.setPassword).not.toContain("showSchematic");
  });
});
