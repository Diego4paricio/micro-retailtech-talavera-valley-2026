import { describe, expect, it } from "vitest";
import { createPublisherKick } from "../src/publisher-kick.js";

describe("publisher kick", () => {
  it("posts an authorized run-once request without blocking", async () => {
    const calls: Request[] = [];
    const kick = createPublisherKick({
      publisherUrl: "https://publisher.test",
      commandKey: "test-command-key-123",
      fetchFn: async (input, init) => {
        calls.push(new Request(input, init));
        return new Response("{}");
      },
    });
    expect(kick()).toBeUndefined();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(calls[0]?.url).toBe("https://publisher.test/internal/run-once");
    expect(calls[0]?.headers.get("authorization")).toBe(
      "Bearer test-command-key-123",
    );
  });

  it("swallows network errors (the scheduled run is the guarantee)", async () => {
    let reported = false;
    const kick = createPublisherKick({
      publisherUrl: "https://publisher.test",
      commandKey: "test-command-key-123",
      fetchFn: async () => {
        throw new Error("offline");
      },
      onError: () => {
        reported = true;
      },
    });
    kick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(reported).toBe(true);
  });

  it("refuses a non-HTTPS publisher endpoint", () => {
    expect(() =>
      createPublisherKick({
        publisherUrl: "http://publisher.test",
        commandKey: "test-command-key-123",
      }),
    ).toThrow();
  });
});
