// Stripe + Kardo catalog setup for subscriptions (ADR 019/020). Idempotent.
//
//   services/customer-api/node_modules/.bin/tsx scripts/stripe/setup-billing.mts [flags]
//
// Reads STRIPE_SECRET_KEY and SUPABASE_ADMIN_DATABASE_URL from the repo .env
// (never printed) and the plan catalog from
// Docs/engineering/config/billing-catalog.json. It:
//   1. finds or creates the manual "IVA 16%" Tax Rate (inclusive);
//   2. finds or creates one Product per paid plan (metadata.kardo_plan_code)
//      and one Price per interval (lookup_key kardo_<plan>_<interval>); a
//      changed amount creates a new Price and moves the lookup key, so
//      existing subscribers keep their price until migrated with notice;
//   3. finds or creates the conversion coupon (offers.conversionCoupon),
//      limited to the paid plans' Products;
//   4. configures the default Customer Portal (plan changes, card, cancel at
//      period end, invoices, tax ID) in Spanish-facing terms;
//   5. upserts plans and entitlements in kardo_core, retires the codes in
//      `retired` (inactive, hidden, never default) and mirrors the Prices;
//   6. uploads the Kardo logo and icon (Docs/Marca/png, made by
//      scripts/stripe/brand-png.mjs) with the Files API for Checkout's
//      branding_settings, once, and writes STRIPE_BRAND_LOGO_FILE_ID and
//      STRIPE_BRAND_ICON_FILE_ID into .env (values never printed).
//      `--refresh-brand` uploads them again after the PNGs change.
//
// Flags:
//   --dry-run         show what would change, touch nothing
//   --stripe-only     skip the database
//   --apply-default   also apply the catalog's isDefault flags. Without it no
//                     plan is default, so workspaces without a plan keep
//                     having no limits (safe for dev). ADR 020 has no default
//                     plan: access comes from the trial or a subscription.
//   --live            allow a live key (refused otherwise, and refused while
//                     the catalog is not `approved` by the owner)
//   --terms-url=URL --privacy-url=URL   shown in the Customer Portal
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBillingSync,
  createStripeGateway,
  STRIPE_API_VERSION,
} from "../../packages/billing/src/index.ts";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const requireFromBilling = createRequire(
  path.join(root, "packages/billing/package.json"),
);
const Stripe = requireFromBilling("stripe");
const postgres = requireFromBilling("postgres");

const args = new Set(process.argv.slice(2).filter((arg) => !arg.includes("=")));
const valued = Object.fromEntries(
  process.argv
    .slice(2)
    .filter((arg) => arg.includes("="))
    .map((arg) => [
      arg.slice(2, arg.indexOf("=")),
      arg.slice(arg.indexOf("=") + 1),
    ]),
);
const dryRun = args.has("--dry-run");
// The brand PNGs changed (Docs/Marca/png): upload them again.
const refreshBrand = args.has("--refresh-brand");

const envText = fs.readFileSync(path.join(root, ".env"), "utf8");
const env: Record<string, string> = Object.fromEntries(
  envText
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);
const secretKey = env.STRIPE_SECRET_KEY;
if (!secretKey) throw new Error("STRIPE_SECRET_KEY is missing in .env.");
if (/_live_/.test(secretKey) && !args.has("--live")) {
  throw new Error("Refusing a live key without --live.");
}

type CatalogPlan = {
  code: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isPublic: boolean;
  isDefault: boolean;
  trialDays: number | null;
  /** Sold by contact and assigned from Operations; never priced in Stripe. */
  contactOnly?: boolean;
  entitlements: Record<string, number | boolean | null>;
  prices: { interval: "month" | "year"; amount: number }[];
};
type Catalog = {
  approved: boolean;
  currency: string;
  retired?: string[];
  offers?: {
    conversionCoupon?: {
      id: string;
      name: string;
      percentOff: number;
      durationInMonths: number;
    };
  };
  plans: CatalogPlan[];
  /** ADR 024: extras as lines of the same subscription, with quantity. */
  extras?: CatalogExtra[];
};
type CatalogExtra = {
  code: string;
  name: string;
  description: string | null;
  prices: { interval: "month" | "year"; amount: number }[];
};
const catalog: Catalog = JSON.parse(
  fs.readFileSync(
    path.join(root, "Docs/engineering/config/billing-catalog.json"),
    "utf8",
  ),
);
if (/_live_/.test(secretKey) && catalog.approved !== true) {
  throw new Error(
    "Refusing a live key: billing-catalog.json is not approved by the owner.",
  );
}

const stripe = new Stripe(secretKey, { apiVersion: STRIPE_API_VERSION });
const log = (message: string) =>
  console.log(`${dryRun ? "[dry-run] " : ""}${message}`);

// 1. Tax rate --------------------------------------------------------------
async function ensureTaxRate(): Promise<string | null> {
  for await (const rate of stripe.taxRates.list({ active: true, limit: 100 })) {
    if (rate.metadata?.kardo_tax === "iva16") {
      log(`Tax Rate IVA 16% (incluido): ${rate.id}`);
      return rate.id;
    }
  }
  if (dryRun) {
    log("Would create Tax Rate IVA 16% (incluido).");
    return null;
  }
  const rate = await stripe.taxRates.create({
    display_name: "IVA",
    description: "IVA 16% incluido en el precio",
    percentage: 16,
    inclusive: true,
    country: "MX",
    tax_type: "vat",
    metadata: { kardo_tax: "iva16" },
  });
  log(`Created Tax Rate IVA 16% (incluido): ${rate.id}`);
  return rate.id;
}

// 2. Products and prices -----------------------------------------------------
async function ensureProduct(plan: CatalogPlan): Promise<string | null> {
  // List, not Search: Search is eventually consistent and a quick re-run
  // could create a duplicate Product.
  let existing: any = null;
  for await (const product of stripe.products.list({ limit: 100 })) {
    if (product.metadata?.kardo_plan_code === plan.code) {
      existing = product;
      break;
    }
  }
  if (existing) {
    if (
      !dryRun &&
      (existing.name !== plan.name ||
        !existing.active ||
        (plan.description && existing.description !== plan.description))
    ) {
      await stripe.products.update(existing.id, {
        name: plan.name,
        active: true,
        ...(plan.description ? { description: plan.description } : {}),
      });
    }
    log(`Product ${plan.code}: ${existing.id}`);
    return existing.id;
  }
  if (dryRun) {
    log(`Would create Product ${plan.name}.`);
    return null;
  }
  const product = await stripe.products.create({
    name: plan.name,
    ...(plan.description ? { description: plan.description } : {}),
    metadata: { kardo_plan_code: plan.code },
    // Shows on invoices and the portal.
    statement_descriptor: "KARDO",
  });
  log(`Created Product ${plan.name}: ${product.id}`);
  return product.id;
}

async function ensurePrice(
  plan: CatalogPlan,
  productId: string | null,
  price: CatalogPlan["prices"][number],
): Promise<string | null> {
  const lookupKey = `kardo_${plan.code}_${price.interval}`;
  const unitAmount = Math.round(price.amount * 100);
  const existing = (
    await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })
  ).data[0];
  if (existing && existing.unit_amount === unitAmount && existing.active) {
    log(
      `  ${lookupKey}: ${existing.id} ($${price.amount} ${catalog.currency.toUpperCase()})`,
    );
    return existing.id;
  }
  if (dryRun || !productId) {
    log(
      `  Would ${existing ? "replace" : "create"} ${lookupKey} at $${price.amount}.`,
    );
    return null;
  }
  const created = await stripe.prices.create({
    product: productId,
    currency: catalog.currency,
    unit_amount: unitAmount,
    recurring: { interval: price.interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    tax_behavior: "inclusive",
    nickname: `${plan.name} ${price.interval === "month" ? "mensual" : "anual"}`,
    metadata: { kardo_plan_code: plan.code },
  });
  if (existing) await stripe.prices.update(existing.id, { active: false });
  log(
    `  ${existing ? "Replaced" : "Created"} ${lookupKey}: ${created.id} ($${price.amount})`,
  );
  return created.id;
}

// 2b. Extras (ADR 024): one Product each (metadata.kardo_extra_code), one
// Price per interval (lookup_key kardo_extra_<code>_<interval>). They are
// not in the portal: the panel adds and removes them (several lines).
async function ensureExtraProduct(extra: CatalogExtra): Promise<string | null> {
  let existing: any = null;
  for await (const product of stripe.products.list({ limit: 100 })) {
    if (product.metadata?.kardo_extra_code === extra.code) {
      existing = product;
      break;
    }
  }
  if (existing) {
    if (
      !dryRun &&
      (existing.name !== extra.name ||
        !existing.active ||
        (extra.description && existing.description !== extra.description))
    ) {
      await stripe.products.update(existing.id, {
        name: extra.name,
        active: true,
        ...(extra.description ? { description: extra.description } : {}),
      });
    }
    log(`Extra ${extra.code}: ${existing.id}`);
    return existing.id;
  }
  if (dryRun) {
    log(`Would create the extra ${extra.name}.`);
    return null;
  }
  const product = await stripe.products.create({
    name: extra.name,
    ...(extra.description ? { description: extra.description } : {}),
    metadata: { kardo_extra_code: extra.code },
    statement_descriptor: "KARDO",
  });
  log(`Created the extra ${extra.name}: ${product.id}`);
  return product.id;
}

async function ensureExtraPrice(
  extra: CatalogExtra,
  productId: string | null,
  price: CatalogExtra["prices"][number],
): Promise<string | null> {
  const lookupKey = `kardo_extra_${extra.code}_${price.interval}`;
  const unitAmount = Math.round(price.amount * 100);
  const existing = (
    await stripe.prices.list({ lookup_keys: [lookupKey], limit: 1 })
  ).data[0];
  if (existing && existing.unit_amount === unitAmount && existing.active) {
    log(`  ${lookupKey}: ${existing.id} ($${price.amount})`);
    return existing.id;
  }
  if (dryRun || !productId) {
    log(`  Would ${existing ? "replace" : "create"} ${lookupKey} at $${price.amount}.`);
    return null;
  }
  const created = await stripe.prices.create({
    product: productId,
    currency: catalog.currency,
    unit_amount: unitAmount,
    recurring: { interval: price.interval },
    lookup_key: lookupKey,
    transfer_lookup_key: true,
    tax_behavior: "inclusive",
    nickname: `${extra.name} ${price.interval === "month" ? "mensual" : "anual"}`,
    metadata: { kardo_extra_code: extra.code },
  });
  if (existing) await stripe.prices.update(existing.id, { active: false });
  log(`  ${existing ? "Replaced" : "Created"} ${lookupKey}: ${created.id} ($${price.amount})`);
  return created.id;
}

// 3. Conversion coupon ---------------------------------------------------------
async function ensureCoupon(productIds: string[]) {
  const offer = catalog.offers?.conversionCoupon;
  if (!offer) return;
  const existing = await stripe.coupons
    .retrieve(offer.id)
    .catch((error: { statusCode?: number }) => {
      if (error.statusCode === 404) return null;
      throw error;
    });
  if (existing) {
    // Coupons are immutable: a different offer needs a new id.
    if (
      existing.percent_off !== offer.percentOff ||
      existing.duration !== "repeating" ||
      existing.duration_in_months !== offer.durationInMonths
    ) {
      throw new Error(
        `Coupon ${offer.id} exists with other terms; give the new offer another id.`,
      );
    }
    log(
      `Coupon ${offer.id}: ${offer.percentOff}% x ${offer.durationInMonths} meses`,
    );
    return;
  }
  if (dryRun || productIds.length === 0) {
    log(`Would create coupon ${offer.id}.`);
    return;
  }
  await stripe.coupons.create({
    id: offer.id,
    name: offer.name,
    percent_off: offer.percentOff,
    duration: "repeating",
    duration_in_months: offer.durationInMonths,
    applies_to: { products: productIds },
    metadata: { kardo_offer: "conversion" },
  });
  log(`Created coupon ${offer.id}.`);
}

// 4. Customer Portal ---------------------------------------------------------
async function configurePortal(
  products: { product: string; prices: string[] }[],
) {
  const features = {
    customer_update: {
      enabled: true,
      allowed_updates: ["email", "address", "tax_id", "name"],
    },
    invoice_history: { enabled: true },
    payment_method_update: { enabled: true },
    subscription_cancel: {
      enabled: true,
      mode: "at_period_end",
      proration_behavior: "none",
      cancellation_reason: {
        enabled: true,
        options: [
          "too_expensive",
          "missing_features",
          "switched_service",
          "unused",
          "other",
        ],
      },
    },
    subscription_update: {
      enabled: products.length > 0,
      default_allowed_updates: ["price", "promotion_code"],
      // Upgrades charge the prorated difference now (the portal shows it
      // before confirming); downgrades leave a credit for the next charge.
      // Verified with scripts/e2e/billing-proration.mts.
      proration_behavior: "always_invoice",
      // Changing plan during the trial keeps the trial (no charge today).
      trial_update_behavior: "continue_trial",
      products,
    },
  };
  const businessProfile = {
    headline: "Kardo: administra tu plan, tu forma de pago y tus facturas.",
    ...(valued["terms-url"]
      ? { terms_of_service_url: valued["terms-url"] }
      : {}),
    ...(valued["privacy-url"]
      ? { privacy_policy_url: valued["privacy-url"] }
      : {}),
  };
  const current = (
    await stripe.billingPortal.configurations.list({
      is_default: true,
      limit: 1,
    })
  ).data[0];
  if (dryRun) {
    log(
      `Would ${current ? "update" : "create"} the default Customer Portal configuration.`,
    );
    return;
  }
  if (current) {
    await stripe.billingPortal.configurations.update(current.id, {
      features,
      business_profile: businessProfile,
      metadata: { kardo: "v1" },
    });
    log(`Updated Customer Portal configuration ${current.id}.`);
  } else {
    const created = await stripe.billingPortal.configurations.create({
      features,
      business_profile: businessProfile,
      metadata: { kardo: "v1" },
    });
    log(`Created Customer Portal configuration ${created.id}.`);
  }
}

// 5. Kardo database ---------------------------------------------------------
async function seedDatabase() {
  const url = env.SUPABASE_ADMIN_DATABASE_URL;
  if (!url) throw new Error("SUPABASE_ADMIN_DATABASE_URL is missing in .env.");
  const sql = postgres(url, { max: 1, prepare: false, onnotice: () => {} });
  const applyDefault = args.has("--apply-default");
  try {
    if (!dryRun) {
      await sql.begin(async (tx: any) => {
        if (applyDefault)
          await tx`update kardo_core.plans set is_default = false where is_default`;
        for (const plan of catalog.plans) {
          const [row] = await tx`
            insert into kardo_core.plans (code, name, description, is_active, is_public, is_default, sort_order, trial_days)
            values (${plan.code}, ${plan.name}, ${plan.description}, true, ${plan.isPublic},
              ${applyDefault && plan.isDefault}, ${plan.sortOrder}, ${plan.trialDays})
            on conflict (code) do update set
              name = excluded.name, description = excluded.description, is_active = true,
              is_public = excluded.is_public, sort_order = excluded.sort_order,
              trial_days = excluded.trial_days
              ${applyDefault ? tx`, is_default = excluded.is_default` : tx``}
            returning id`;
          await tx`delete from kardo_core.plan_entitlements where plan_id = ${row.id}`;
          for (const [key, value] of Object.entries(plan.entitlements)) {
            // Absent key = no limit (a JSON null would be SQL NULL here).
            if (value === null) continue;
            await tx`insert into kardo_core.plan_entitlements (plan_id, key, value) values (${row.id}, ${key}, ${tx.json(value)})`;
          }
        }
        const retired = catalog.retired ?? [];
        if (retired.length > 0) {
          const rows = await tx`
            update kardo_core.plans set is_active = false, is_public = false, is_default = false
            where code = any(${retired}::text[]) and (is_active or is_public or is_default)
            returning code`;
          if (rows.length > 0)
            log(
              `Retired plans: ${rows.map((r: { code: string }) => r.code).join(", ")}.`,
            );
        }
      });
      log(
        `Plans and entitlements upserted${applyDefault ? " (default plan applied)" : " (no default plan)"}.`,
      );
      const gateway = createStripeGateway({ secretKey });
      const result = await createBillingSync(sql, gateway).syncCatalog();
      log(
        `Mirrored ${result.prices} Stripe prices, ${result.mappedToPlans} mapped to plans.`,
      );
    } else {
      log(`Would upsert ${catalog.plans.length} plans and their entitlements.`);
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
}

// 6. Brand files for Checkout ------------------------------------------------
/** Sets or replaces `KEY=value` lines in .env, keeping everything else. */
function writeEnv(updates: Record<string, string>) {
  const envPath = path.join(root, ".env");
  let text = fs.readFileSync(envPath, "utf8");
  for (const [key, value] of Object.entries(updates)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, "m");
    text = pattern.test(text)
      ? text.replace(pattern, line)
      : `${text.replace(/\n?$/, "\n")}${line}\n`;
  }
  fs.writeFileSync(envPath, text);
}

async function ensureBrandFiles() {
  const files = [
    {
      envKey: "STRIPE_BRAND_LOGO_FILE_ID",
      purpose: "business_logo",
      file: "kardo-logo.png",
    },
    {
      envKey: "STRIPE_BRAND_ICON_FILE_ID",
      purpose: "business_icon",
      file: "kardo-icono.png",
    },
  ] as const;
  const updates: Record<string, string> = {};
  for (const entry of files) {
    const current = env[entry.envKey];
    if (current && !refreshBrand) {
      const found = await stripe.files
        .retrieve(current)
        .then((file: { purpose: string }) => file.purpose === entry.purpose)
        .catch(() => false);
      if (found) {
        log(`Brand file ${entry.file}: already uploaded (${entry.envKey}).`);
        continue;
      }
    }
    const source = path.join(root, "Docs/Marca/png", entry.file);
    if (!fs.existsSync(source)) {
      log(`Missing ${source}: run node scripts/stripe/brand-png.mjs first.`);
      continue;
    }
    if (dryRun) {
      log(`Would upload ${entry.file} as ${entry.purpose}.`);
      continue;
    }
    const uploaded = await stripe.files.create({
      purpose: entry.purpose,
      file: {
        data: fs.readFileSync(source),
        name: entry.file,
        type: "image/png",
      },
    });
    updates[entry.envKey] = uploaded.id;
    log(`Uploaded ${entry.file} as ${entry.purpose}.`);
  }
  if (Object.keys(updates).length > 0) {
    writeEnv(updates);
    log(`.env updated: ${Object.keys(updates).join(", ")} (values not shown).`);
  }
}

const taxRateId = await ensureTaxRate();
const portalProducts: { product: string; prices: string[] }[] = [];
for (const plan of catalog.plans) {
  if (plan.prices.length === 0 || plan.contactOnly) continue;
  const productId = await ensureProduct(plan);
  const priceIds: string[] = [];
  for (const price of plan.prices) {
    const id = await ensurePrice(plan, productId, price);
    if (id) priceIds.push(id);
  }
  if (productId && priceIds.length > 0)
    portalProducts.push({ product: productId, prices: priceIds });
}
for (const extra of catalog.extras ?? []) {
  const productId = await ensureExtraProduct(extra);
  for (const price of extra.prices) await ensureExtraPrice(extra, productId, price);
}
await ensureCoupon(portalProducts.map((entry) => entry.product));
await configurePortal(portalProducts);
await ensureBrandFiles();
if (!args.has("--stripe-only")) await seedDatabase();

console.log("");
console.log(`Listo (${/_live_/.test(secretKey) ? "VIVO" : "modo prueba"}).`);
if (taxRateId) console.log(`Agrega a .env: STRIPE_TAX_RATE_ID=${taxRateId}`);
