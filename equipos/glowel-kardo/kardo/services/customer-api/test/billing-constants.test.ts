import { liveSubscriptionStatuses } from "@kardo/billing";
import { LIVE_SUBSCRIPTION_STATUSES } from "@kardo/contracts";
import { describe, expect, it } from "vitest";

// The panel reads the list from contracts and the billing package keeps its
// own (it does not depend on contracts): both must stay the same three
// states (domain audit A2-62).
describe("live subscription states", () => {
  it("are the same in contracts and in the billing package", () => {
    expect([...LIVE_SUBSCRIPTION_STATUSES]).toEqual([
      ...liveSubscriptionStatuses,
    ]);
  });
});
