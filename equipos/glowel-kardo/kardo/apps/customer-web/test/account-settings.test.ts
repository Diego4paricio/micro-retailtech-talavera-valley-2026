import type { CustomerProfile } from "@kardo/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { describeDevice } from "../src/features/settings/account/device.js";
import { timeZoneLabel } from "../src/features/settings/account/PreferencesPage.js";
import { greetingName } from "../src/lib/account-profile.js";
import { setDatePreferences } from "../src/lib/date-preferences.js";
import { handleAccountDemo } from "../src/lib/demo/account.js";
import { formatDateTime, formatTime } from "../src/lib/format.js";

const base: CustomerProfile = {
  subject: "e6abf26a-3263-4149-9d75-9b7441165d29",
  email: "ana@kardo.test",
  displayName: "Ana María López",
};

afterEach(() =>
  setDatePreferences({ timeZone: undefined, hourCycle: undefined }),
);

describe("greetingName", () => {
  it("uses the preferred name first", () => {
    expect(greetingName({ ...base, preferredName: "  Anita " })).toBe("Anita");
  });

  it("falls back to the whole name, never a first-word cut", () => {
    expect(greetingName({ ...base, preferredName: null })).toBe(
      "Ana María López",
    );
  });

  it("has nothing to say without a profile or a name", () => {
    expect(greetingName(null)).toBeNull();
    expect(greetingName({ ...base, displayName: "  " })).toBeNull();
  });
});

describe("dates follow the person's preferences", () => {
  const instant = "2026-10-03T21:30:00.000Z";

  it("formats in the chosen zone", () => {
    setDatePreferences({ timeZone: "America/Mexico_City", hourCycle: "h23" });
    expect(formatDateTime(instant)).toContain("15:30");
    setDatePreferences({ timeZone: "Europe/Madrid", hourCycle: "h23" });
    expect(formatDateTime(instant)).toContain("23:30");
  });

  it("formats in 12 or 24 hours", () => {
    setDatePreferences({ timeZone: "America/Mexico_City", hourCycle: "h12" });
    expect(formatTime(instant)).toMatch(/3:30\s?p/);
    setDatePreferences({ timeZone: "America/Mexico_City", hourCycle: "h23" });
    expect(formatTime(instant)).toBe("15:30");
  });
});

describe("timeZoneLabel", () => {
  it("shows the zone with spaces and its offset", () => {
    expect(timeZoneLabel("America/Mexico_City")).toMatch(
      /^America\/Mexico City \(GMT[-−]0?6(:00)?\)$/,
    );
  });
});

describe("describeDevice", () => {
  it.each([
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      "Chrome en macOS",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1",
      "Safari en iPhone",
    ],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36 Edg/139.0.0.0",
      "Edge en Windows",
    ],
    [
      "Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36",
      "Chrome en Android",
    ],
    ["node", "Programa"],
  ])("%s", (userAgent, expected) => {
    expect(describeDevice(userAgent)).toBe(expected);
  });

  it("says so when there is no User-Agent", () => {
    expect(describeDevice(null)).toBe("Dispositivo desconocido");
  });
});

describe("demo account", () => {
  it("keeps the preferences it is given", () => {
    handleAccountDemo("/v1/me/profile", "PATCH", { preferredName: "Mar" });
    const profile = handleAccountDemo("/v1/me/profile", "GET", {}) as {
      preferredName: string;
    };
    expect(profile.preferredName).toBe("Mar");
  });

  it("closes one session, then the others, never the current one", () => {
    const list = () =>
      (
        handleAccountDemo("/v1/me/sessions", "GET", {}) as {
          items: { id: string; current: boolean }[];
        }
      ).items;
    const other = list().find((session) => !session.current);
    expect(
      handleAccountDemo(`/v1/me/sessions/${other?.id}`, "DELETE", {}),
    ).toEqual({ closed: 1 });
    handleAccountDemo("/v1/me/sessions/close-others", "POST", {});
    expect(list()).toHaveLength(1);
    expect(list()[0]?.current).toBe(true);
  });
});
