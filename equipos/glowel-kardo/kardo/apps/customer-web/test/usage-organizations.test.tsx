import type { WorkspaceBilling } from "@kardo/contracts";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { UsageMeters } from "../src/features/billing/UsageMeters.js";

const billing = (isHolder: boolean) =>
  ({
    entitlements: {
      "organizations.max": 3,
      "touchpoints.max": 60,
      "links.max": 10,
    },
    usage: { "organizations.max": 2, "touchpoints.max": 7, "links.max": 1 },
    account: {
      holderName: "Luis Pérez",
      isHolder,
      organizationsUsed: 2,
      organizationsLimit: 3,
      organizations: [],
      extras: [],
    },
  }) as unknown as WorkspaceBilling;

describe("usage meters with the person's account", () => {
  it("starts with «Organizaciones 2 de 3» and notes the shared pool", () => {
    const html = renderToStaticMarkup(<UsageMeters billing={billing(true)} />);
    // First meter, before the QR one (whatever its label says).
    expect(html.indexOf("Organizaciones")).toBeLessThan(
      html.indexOf("7 de 60"),
    );
    expect(html).toContain("2 de 3");
    expect(html).toContain("7 de 60");
    expect(html).toContain("Entre tus 2 organizaciones");
  });

  it("reads the shared meters of someone else's plan", () => {
    const html = renderToStaticMarkup(<UsageMeters billing={billing(false)} />);
    expect(html).toContain("Entre las organizaciones de Luis Pérez");
    expect(html).toContain("Solo Luis Pérez puede cambiar el plan.");
  });

  it("hides the organizations meter when the API reports none", () => {
    const old = { entitlements: {}, usage: { "touchpoints.max": 3 } };
    const html = renderToStaticMarkup(
      <UsageMeters billing={old as unknown as WorkspaceBilling} />,
    );
    expect(html).not.toContain("Organizaciones");
  });
});
