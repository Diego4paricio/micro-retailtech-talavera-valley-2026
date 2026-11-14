import { describe, expect, it } from "vitest";
import {
  isAutomatedRequest,
  isAutomatedRequestSignal,
} from "../src/bot-filter.js";

describe("isAutomatedRequestSignal", () => {
  it("flags a HEAD request regardless of user agent", () => {
    expect(
      isAutomatedRequestSignal({
        method: "HEAD",
        userAgent: "Mozilla/5.0",
        purposeHeaderValues: [null, null, null],
      }),
    ).toBe(true);
  });

  it("flags a sec-purpose prefetch header", () => {
    expect(
      isAutomatedRequestSignal({
        method: "GET",
        userAgent: "Mozilla/5.0",
        purposeHeaderValues: ["prefetch;prerender", null, null],
      }),
    ).toBe(true);
  });

  it("flags a purpose or x-purpose preview header", () => {
    expect(
      isAutomatedRequestSignal({
        method: "GET",
        userAgent: "Mozilla/5.0",
        purposeHeaderValues: [null, "preview", null],
      }),
    ).toBe(true);
    expect(
      isAutomatedRequestSignal({
        method: "GET",
        userAgent: "Mozilla/5.0",
        purposeHeaderValues: [null, null, "preview"],
      }),
    ).toBe(true);
  });

  const knownBotUserAgents = [
    "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
    "Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)",
    "Mozilla/5.0 (compatible; Applebot/0.1; +http://www.apple.com/go/applebot)",
    "Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)",
    "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
    "Facebot",
    "WhatsApp/2.23.20.0",
    "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
    "Slack-ImgProxy (+https://api.slack.com/robots)",
    "TelegramBot (like TwitterBot)",
    "Mozilla/5.0 (compatible; Discordbot/2.0; +https://discordapp.com)",
    "Mozilla/5.0 (compatible; LinkedInBot/1.0; +http://www.linkedin.com)",
    "Twitterbot/1.0",
    "Mozilla/5.0 (compatible; SkypeUriPreview) Chrome",
    "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/119.0.0.0 Safari/537.36",
    "python-requests/2.31.0",
    "curl/8.4.0",
    "Wget/1.21.3",
    "Go-http-client/1.1",
    "okhttp/4.9.0",
    "SomeCustomCrawler/1.0",
    "GenericSpider/1.0",
  ];
  for (const userAgent of knownBotUserAgents) {
    it(`flags known bot/crawler/link-unfurler user agent: ${userAgent}`, () => {
      expect(
        isAutomatedRequestSignal({
          method: "GET",
          userAgent,
          purposeHeaderValues: [null, null, null],
        }),
      ).toBe(true);
    });
  }

  it("does not flag a normal mobile Safari user agent", () => {
    expect(
      isAutomatedRequestSignal({
        method: "GET",
        userAgent:
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
        purposeHeaderValues: [null, null, null],
      }),
    ).toBe(false);
  });

  it("does not flag a normal desktop Chrome user agent", () => {
    expect(
      isAutomatedRequestSignal({
        method: "GET",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        purposeHeaderValues: [null, null, null],
      }),
    ).toBe(false);
  });

  it("does not flag Node's default fetch user agent ('node')", () => {
    expect(
      isAutomatedRequestSignal({
        method: "GET",
        userAgent: "node",
        purposeHeaderValues: [null, null, null],
      }),
    ).toBe(false);
  });

  it("does not flag a request with no User-Agent header at all", () => {
    expect(
      isAutomatedRequestSignal({
        method: "GET",
        userAgent: null,
        purposeHeaderValues: [null, null, null],
      }),
    ).toBe(false);
  });
});

describe("isAutomatedRequest", () => {
  it("flags a real Request from a known bot user agent", () => {
    const request = new Request("https://resolver.test/t/x", {
      headers: { "user-agent": "curl/8.4.0" },
    });
    expect(isAutomatedRequest(request)).toBe(true);
  });

  it("flags a real Request carrying a sec-purpose prefetch header", () => {
    const request = new Request("https://resolver.test/t/x", {
      headers: {
        "user-agent": "Mozilla/5.0 Chrome/120.0 Safari/537.36",
        "sec-purpose": "prefetch",
      },
    });
    expect(isAutomatedRequest(request)).toBe(true);
  });

  it("does not flag an ordinary browser GET request", () => {
    const request = new Request("https://resolver.test/t/x", {
      headers: { "user-agent": "Mozilla/5.0 Chrome/120.0 Safari/537.36" },
    });
    expect(isAutomatedRequest(request)).toBe(false);
  });

  it("does not flag a request with no headers set (Node fetch default)", () => {
    const request = new Request("https://resolver.test/t/x");
    expect(isAutomatedRequest(request)).toBe(false);
  });
});
