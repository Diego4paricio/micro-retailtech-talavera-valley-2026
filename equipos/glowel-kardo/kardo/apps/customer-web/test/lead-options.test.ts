import { describe, expect, it } from "vitest";
import {
  leadRetentionLabel,
  leadStatusFilterLabels,
  leadStatusFilters,
  leadStatusLabels,
} from "../src/features/leads/labels.js";

describe("lead status labels and filters", () => {
  it("labels every lead status in Spanish", () => {
    expect(leadStatusLabels).toEqual({
      new: "Nueva",
      contacted: "Atendida",
      closed: "Cerrada",
    });
  });

  it("offers a filter chip for every status plus 'all'", () => {
    expect(leadStatusFilters).toEqual(["all", "new", "contacted", "closed"]);
    for (const filter of leadStatusFilters)
      expect(leadStatusFilterLabels[filter]).toBeTruthy();
    expect(leadStatusFilterLabels.all).toBe("Todas");
  });
});

describe("lead retention option labels", () => {
  it("describes every fixed retention window in days", () => {
    expect(leadRetentionLabel(30)).toBe("30 días");
    expect(leadRetentionLabel(90)).toBe("90 días");
    expect(leadRetentionLabel(180)).toBe("180 días");
    expect(leadRetentionLabel(365)).toBe("365 días");
    expect(leadRetentionLabel(730)).toBe("730 días");
  });

  it("describes indefinite retention", () => {
    expect(leadRetentionLabel(null)).toBe("Conservar indefinidamente");
  });
});
