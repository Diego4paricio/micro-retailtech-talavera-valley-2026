// Mid-cycle plan changes against the real Stripe test mode (ADR 019/020):
// upgrade on day 15 charges the prorated difference at once, downgrade
// leaves a credit for the next charge, and the next renewal bills the new
// price. Uses a test clock; nothing stays behind (the clock is deleted).
//
//   services/customer-api/node_modules/.bin/tsx scripts/e2e/billing-proration.mts
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const Stripe = createRequire(path.join(root, "packages/billing/package.json"))(
  "stripe",
);
const env: Record<string, string> = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);
if (!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? ""))
  throw new Error("A Stripe TEST key is required.");
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-08-26.dahlia",
});
const DAY = 86_400;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

async function price(lookupKey: string): Promise<string> {
  const found = await stripe.prices.list({
    lookup_keys: [lookupKey],
    limit: 1,
  });
  if (!found.data[0])
    throw new Error(`Missing price ${lookupKey}; run setup-billing.mts.`);
  return found.data[0].id;
}

async function advance(clock: string, to: number) {
  await stripe.testHelpers.testClocks.advance(clock, { frozen_time: to });
  for (let i = 0; i < 60; i += 1) {
    if (
      (await stripe.testHelpers.testClocks.retrieve(clock)).status === "ready"
    )
      return;
    await sleep(2000);
  }
  throw new Error("test clock did not settle");
}

const [low, high] = [
  await price("kardo_esencial_month"),
  await price("kardo_profesional_month"),
];
const results: string[] = [];
for (const behavior of ["always_invoice", "create_prorations"] as const) {
  const start = Math.floor(Date.now() / 1000);
  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: start,
    name: `proration ${behavior}`,
  });
  try {
    const customer = await stripe.customers.create({
      email: "delivered@resend.dev",
      test_clock: clock.id,
    });
    const pm = await stripe.paymentMethods.attach("pm_card_visa", {
      customer: customer.id,
    });
    await stripe.customers.update(customer.id, {
      invoice_settings: { default_payment_method: pm.id },
    });
    const taxRates = env.STRIPE_TAX_RATE_ID
      ? [env.STRIPE_TAX_RATE_ID]
      : undefined;
    const sub = await stripe.subscriptions.create({
      customer: customer.id,
      items: [{ price: low, ...(taxRates ? { tax_rates: taxRates } : {}) }],
      ...(taxRates ? { default_tax_rates: taxRates } : {}),
    });
    await advance(clock.id, start + 15 * DAY);
    const item = sub.items.data[0];
    const upgraded = await stripe.subscriptions.update(sub.id, {
      items: [{ id: item.id, price: high }],
      proration_behavior: behavior,
    });
    const invoices = await stripe.invoices.list({
      customer: customer.id,
      limit: 10,
    });
    const upgradeInvoice = invoices.data.find(
      (inv: { billing_reason: string }) =>
        inv.billing_reason === "subscription_update",
    );
    const preview = await stripe.invoices.createPreview({
      customer: customer.id,
      subscription: sub.id,
    });
    results.push(
      `${behavior}: upgrade day 15 → ${upgradeInvoice ? `invoice now ${money(upgradeInvoice.total)} (${upgradeInvoice.status})` : "no invoice now"}; next invoice ${money(preview.total)}`,
    );
    // Downgrade back on day 20.
    await advance(clock.id, start + 20 * DAY);
    await stripe.subscriptions.update(sub.id, {
      items: [{ id: upgraded.items.data[0].id, price: low }],
      proration_behavior: behavior,
    });
    const after = await stripe.customers.retrieve(customer.id);
    const preview2 = await stripe.invoices.createPreview({
      customer: customer.id,
      subscription: sub.id,
    });
    results.push(
      `${behavior}: downgrade day 20 → customer balance ${money(after.balance)} (negative = credit); next invoice ${money(preview2.total)} due ${money(preview2.amount_due)}`,
    );
  } finally {
    await stripe.testHelpers.testClocks.del(clock.id).catch(() => undefined);
  }
}
for (const line of results) console.log(line);
