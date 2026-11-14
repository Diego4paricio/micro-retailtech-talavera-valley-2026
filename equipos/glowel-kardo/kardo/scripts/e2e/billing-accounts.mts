// The plan is the person's (ADR 024, relevo 38), against kardo-dev, the
// Customer API (no watch, E2E_API_URL) and the REAL Stripe test mode:
//
// - the 15-day trial (Profesional) covers 3 organizations; a 4th is refused;
// - limits are one pool: QR in two organizations add up;
// - paying Esencial (1 organization) for 3 opens the 14-day window with 2
//   organizations over;
// - 2 extra organizations (preview first: what is charged today and at the
//   next renewal) close it; changing plan with extras goes through Kardo;
// - choosing which organizations stay pauses the others (state «paused»,
//   source «excluded»), and they stop counting;
// - transferring an organization moves it to the receiver's plan;
// - going up again brings back what was out.
//
// Throwaway accounts e2e-cuenta-<stamp>@kardo.test (and a receiver), with
// random passwords never printed. The Stripe subscription is canceled and
// the accounts are erased at the end. Webhooks are not needed: the script
// mirrors the first subscription itself, and the API mirrors its changes.
//
// With E2E_PANEL_URL (the real panel against that API) it also walks the
// screens on a laptop and a phone: Plan y facturación in the trial, «Crear
// organización» at the cap, the 14-day banner, «Agregar extras» (applied
// from the panel), «Elige qué sigue» and the organization left out.
// E2E_SHOTS_DIR keeps a screenshot of each screen.
//
// Usage (API without watch on 3011, panel on 5186):
//   cd services/customer-api && E2E_API_URL=http://localhost:3011 \
//     E2E_PANEL_URL=http://localhost:5186 pnpm exec tsx ../../scripts/e2e/billing-accounts.mts
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const requireFromBilling = createRequire(
  path.join(root, "packages/billing/package.json"),
);
const Stripe = requireFromBilling("stripe");
const postgres = requireFromBilling("postgres");
const { createClient } = createRequire(
  path.join(root, "apps/customer-web/package.json"),
)("@supabase/supabase-js");
const { createStripeGateway, createBillingSync } = await import(
  path.join(root, "packages/billing/src/index.ts")
);
const { legalVersions } = await import(
  path.join(root, "packages/contracts/src/index.ts")
);

const rawEnv: Record<string, string> = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);
const env: Record<string, string> = Object.fromEntries(
  Object.entries(rawEnv).map(([key, value]) => [
    key,
    value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => rawEnv[name] ?? ""),
  ]),
);
if (!/^(sk|rk)_test_/.test(env.STRIPE_SECRET_KEY ?? ""))
  throw new Error("A Stripe TEST key is required.");
if (!["local", "development", "test"].includes(env.KARDO_ENV ?? "local"))
  throw new Error("This check only runs outside production.");

const api = (process.env.E2E_API_URL ?? "http://localhost:3011").replace(
  /\/$/,
  "",
);
const panel = process.env.E2E_PANEL_URL?.replace(/\/$/, "") ?? null;
const shots = process.env.E2E_SHOTS_DIR ?? null;
const { chromium } = panel
  ? await import(
      path.join(root, "scripts/video/node_modules/playwright-core/index.mjs")
    )
  : { chromium: null };
const sizes = [
  { label: "laptop", width: 1280, height: 860 },
  { label: "celular", width: 390, height: 844 },
];
const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
  apiVersion: "2026-08-26.dahlia",
});
const sql = postgres(env.SUPABASE_ADMIN_DATABASE_URL, {
  max: 2,
  prepare: false,
  onnotice: () => {},
});
const sync = createBillingSync(
  sql,
  createStripeGateway({ secretKey: env.STRIPE_SECRET_KEY }),
);

const stamp = new Date().toISOString().slice(5, 19).replace(/[-T:]/g, "");
const people = {
  owner: {
    email: `e2e-cuenta-${stamp}@kardo.test`,
    password: `E2e-${randomBytes(18).toString("base64url")}!9`,
    name: "E2E Cuenta",
  },
  receiver: {
    email: `e2e-cuenta-recibe-${stamp}@kardo.test`,
    password: `E2e-${randomBytes(18).toString("base64url")}!9`,
    name: "E2E Recibe",
  },
};
const ids: Record<string, string> = {};
const results: { name: string; ok: boolean }[] = [];
const record = (name: string, ok: boolean, detail = "") => {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
};
async function check(name: string, run: () => Promise<string | void>) {
  try {
    record(name, true, String((await run()) ?? ""));
  } catch (error) {
    record(
      name,
      false,
      error instanceof Error ? error.message.split("\n")[0] : String(error),
    );
  }
}
function expect(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function call(
  token: string,
  method: string,
  url: string,
  body?: unknown,
) {
  const response = await fetch(`${api}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => null)) as any,
  };
}
async function signIn(person: { email: string; password: string }) {
  const client = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await client.auth.signInWithPassword(person);
  if (error) throw error;
  return data.session.access_token as string;
}

let browser: any = null;
let storage: Record<string, string> = {};
let shot = 0;
/** A page of the panel on one size, signed in, on organization `ws`. */
async function openPanel(
  size: (typeof sizes)[number],
  ws: string,
  route: string,
) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
  });
  await context.addInitScript(
    ([entries, workspace]: [Record<string, string>, string]) => {
      for (const [key, value] of Object.entries(entries))
        localStorage.setItem(key, value);
      localStorage.setItem("kardo.workspace", workspace);
    },
    [storage, ws],
  );
  const page = await context.newPage();
  await page.goto(`${panel}${route}`);
  await page.waitForLoadState("networkidle").catch(() => undefined);
  // A panel that opens alone (notifications) closes with Escape.
  await page.keyboard.press("Escape");
  return { page, close: () => context.close() };
}
async function screen(page: any, name: string) {
  if (!shots) return;
  fs.mkdirSync(shots, { recursive: true });
  shot += 1;
  await page.screenshot({
    path: path.join(shots, `${String(shot).padStart(2, "0")}-${name}.png`),
    fullPage: true,
  });
}
/** Text of the page, spaces folded, to look for whole sentences. */
const textOf = async (page: any) =>
  ((await page.locator("body").innerText()) as string).replace(/\s+/g, " ");
async function panelSteps(
  name: string,
  run: (size: (typeof sizes)[number]) => Promise<void>,
) {
  if (!panel) return;
  for (const size of sizes)
    await check(`[${size.label}] ${name}`, () => run(size));
}

let subscriptionId: string | null = null;
let customerId: string | null = null;
let erased = false;
try {
  for (const [role, person] of Object.entries(people)) {
    await sql.begin(async (tx: any) => {
      const [user] = await tx`
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          email_change_token_current, reauthentication_token, phone_change, phone_change_token
        ) values (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          ${person.email}, extensions.crypt(${person.password}, extensions.gen_salt('bf')), now(),
          ${tx.json({ provider: "email", providers: ["email"] })},
          ${tx.json({ display_name: person.name })}, now(), now(),
          '', '', '', '', '', '', '', ''
        )
        returning id
      `;
      await tx`
        insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (${user.id}, ${user.id}::text, ${tx.json({ sub: user.id, email: person.email, email_verified: true })}, 'email', now(), now(), now())
      `;
      ids[role] = user.id;
    });
    await sql`
      update kardo_core.profiles set terms_version = ${legalVersions.terms}, privacy_version = ${legalVersions.privacy}, terms_accepted_at = now()
      where id = ${ids[role]}::uuid
    `;
  }
  const token = await signIn(people.owner);
  const [first] = (await call(token, "GET", "/v1/workspaces")).body ?? [];
  const a = first?.id as string;
  const onboarded = await call(
    token,
    "PATCH",
    `/v1/workspaces/${a}/onboarding`,
    {
      workspaceName: "Estética Brillo E2E",
      accountType: "business",
    },
  );
  record(
    "El alta inicia la prueba de Profesional",
    onboarded.status === 200,
    `${onboarded.status}`,
  );
  if (panel) {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const login = await browser.newContext({
      viewport: { width: 1280, height: 860 },
    });
    const page = await login.newPage();
    await page.goto(`${panel}/`);
    await page.getByLabel("Correo electrónico").fill(people.owner.email);
    await page
      .getByLabel("Contraseña", { exact: true })
      .fill(people.owner.password);
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => Object.keys(localStorage).some((key) => key.includes("auth-token")),
      undefined,
      { timeout: 30_000 },
    );
    storage = await page.evaluate(() =>
      Object.fromEntries(Object.entries(localStorage)),
    );
    await login.close();
  }
  const billing = (ws: string) =>
    call(token, "GET", `/v1/workspaces/${ws}/billing`);
  const selection = (ws: string) =>
    call(token, "GET", `/v1/workspaces/${ws}/plan-selection`);
  const access = (ws: string) =>
    call(token, "GET", `/v1/workspaces/${ws}/access`);

  let b = "";
  let c = "";
  await check(
    "La prueba cubre 3 organizaciones; la cuarta se rechaza",
    async () => {
      const second = await call(token, "POST", "/v1/organizations", {
        name: "Brillo Angelópolis E2E",
      });
      const third = await call(token, "POST", "/v1/organizations", {
        name: "Academia Brillo E2E",
      });
      expect(
        second.status === 201 && third.status === 201,
        `crear ${second.status}/${third.status} ${second.body?.code ?? ""}`,
      );
      b = second.body.id;
      c = third.body.id;
      const fourth = await call(token, "POST", "/v1/organizations", {
        name: "Cuarta E2E",
      });
      expect(
        fourth.status === 409,
        `la cuarta respondió ${fourth.status} ${fourth.body?.code ?? ""}`,
      );
      const state = (await access(b)).body;
      expect(
        state?.state === "trial",
        `la segunda está en ${state?.state}/${state?.source}`,
      );
      return "3 de 3";
    },
  );

  await check(
    "Una sola bolsa: los QR de dos organizaciones suman y la Owner cuenta una vez",
    async () => {
      for (const [ws, name] of [
        [a, "Mostrador"],
        [a, "Espejo 1"],
        [b, "Recepción"],
      ] as const) {
        const created = await call(
          token,
          "POST",
          `/v1/workspaces/${ws}/touchpoints`,
          { operationalName: name, kind: "qr" },
        );
        expect(
          created.status === 201,
          `crear QR ${created.status} ${created.body?.code ?? ""}`,
        );
      }
      const fromA = (await billing(a)).body;
      const fromB = (await billing(b)).body;
      expect(
        fromA.usage["touchpoints.max"] === 3 &&
          fromB.usage["touchpoints.max"] === 3,
        `uso ${fromA.usage["touchpoints.max"]}/${fromB.usage["touchpoints.max"]}`,
      );
      // People, not seats: the Owner of three organizations counts once.
      expect(
        fromA.usage["members.max"] === 1,
        `miembros ${fromA.usage["members.max"]}`,
      );
      expect(
        fromA.account?.isHolder &&
          fromA.account.organizationsUsed === 3 &&
          fromA.account.organizationsLimit === 3,
        `cuenta ${JSON.stringify(fromA.account).slice(0, 160)}`,
      );
    },
  );

  await panelSteps(
    "Plan y facturación en la prueba: 3 de 3, la bolsa repartida, extras con plan",
    async (size) => {
      const { page, close } = await openPanel(size, a, "/settings/plan");
      try {
        await page
          .getByText("Organizaciones", { exact: true })
          .first()
          .waitFor({ timeout: 20_000 });
        const text = await textOf(page);
        expect(text.includes("3 de 3"), "no dice «3 de 3»");
        expect(
          text.includes("Entre tus 3 organizaciones"),
          "no dice «Entre tus 3 organizaciones»",
        );
        expect(
          text.includes("Elige un plan para agregar extras."),
          "no pide plan para los extras",
        );
        expect(
          /Te quedan \d+ días de prueba de Profesional/.test(text),
          "falta la franja de la prueba",
        );
        await screen(page, `prueba-${size.label}`);
      } finally {
        await close();
      }
    },
  );
  await panelSteps(
    "«Crear organización» en el tope de la prueba ofrece subir de plan",
    async (size) => {
      const { page, close } = await openPanel(size, a, "/settings/equipo");
      try {
        await page
          .getByRole("button", { name: "Crear organización" })
          .first()
          .click({ timeout: 20_000 });
        const dialog = page.locator("dialog[open]");
        await dialog
          .getByText("Subir a", { exact: false })
          .waitFor({ timeout: 20_000 });
        const text = ((await dialog.innerText()) as string).replace(
          /\s+/g,
          " ",
        );
        expect(
          text.includes(
            "Tu prueba de Profesional incluye 3 organizaciones y ya las usas.",
          ),
          `línea: ${text.slice(0, 160)}`,
        );
        expect(text.includes("Subir a Negocio"), "no ofrece Negocio");
        expect(
          !text.includes("Agregar una organización"),
          "ofrece extras en la prueba",
        );
        await screen(page, `tope-prueba-${size.label}`);
      } finally {
        await close();
      }
    },
  );

  // Paying Esencial in Stripe (test card), as Checkout would.
  const prices = await sql<
    { stripe_price_id: string; code: string; billing_interval: string }[]
  >`
    select pr.stripe_price_id, p.code, pr.billing_interval from kardo_billing.prices pr
    join kardo_core.plans p on p.id = pr.plan_id
    where pr.active and not pr.livemode and p.code in ('esencial', 'profesional', 'negocio')
  `;
  const priceOf = (code: string) =>
    prices.find((row) => row.code === code && row.billing_interval === "month")
      ?.stripe_price_id as string;
  const [{ billing_account_id: accountId }] = await sql<
    { billing_account_id: string }[]
  >`
    select billing_account_id from kardo_core.workspaces where id = ${a}::uuid
  `;
  await check(
    "Pagar Esencial (1 organización) con 3 abre los 14 días con 2 de más",
    async () => {
      const customer = await stripe.customers.create({
        email: people.owner.email,
        name: "E2E Cuenta",
        metadata: { kardo_account_id: accountId, kardo_workspace_id: a },
      });
      customerId = customer.id;
      await sql`
      insert into kardo_billing.customers (workspace_id, account_id, stripe_customer_id, livemode, email)
      values (${a}::uuid, ${accountId}::uuid, ${customer.id}, false, ${people.owner.email})
    `;
      const method = await stripe.paymentMethods.attach("pm_card_visa", {
        customer: customer.id,
      });
      await stripe.customers.update(customer.id, {
        invoice_settings: { default_payment_method: method.id },
      });
      const subscription = await stripe.subscriptions.create({
        customer: customer.id,
        items: [{ price: priceOf("esencial"), quantity: 1 }],
        metadata: {
          kardo_account_id: accountId,
          kardo_workspace_id: a,
          kardo_profile_id: ids.owner,
        },
      });
      subscriptionId = subscription.id;
      const synced = await sync.syncSubscription(subscription.id);
      expect(
        synced.status === "processed",
        `mirror ${synced.status} ${synced.note ?? ""}`,
      );
      const view = (await billing(b)).body;
      expect(
        view.plan?.code === "esencial" && view.account.organizationsLimit === 1,
        `plan ${view.plan?.code} tope ${view.account?.organizationsLimit}`,
      );
      const window = (await selection(a)).body;
      expect(
        window.overage && !window.overage.resolved,
        "no se abrió el plazo",
      );
      expect(
        window.limits.organizations === 1,
        `tope ${window.limits.organizations}`,
      );
      expect(
        window.candidates.filter((item: any) => item.kind === "organization")
          .length === 3,
        "faltan organizaciones para elegir",
      );
    },
  );

  await panelSteps(
    "Con Esencial aparece el plazo para elegir qué organización sigue",
    async (size) => {
      const { page, close } = await openPanel(size, a, "/settings/plan");
      try {
        await page
          .getByText("Con Esencial te queda 1 organización", { exact: false })
          .first()
          .waitFor({ timeout: 20_000 });
        await screen(page, `plazo-${size.label}`);
      } finally {
        await close();
      }
    },
  );

  await check(
    "2 organizaciones extra: primero cuánto se cobra hoy, luego se aplican y cierran el plazo",
    async () => {
      const preview = await call(
        token,
        "PUT",
        `/v1/workspaces/${a}/billing/extras`,
        { quantities: { organization: 2 }, confirm: false },
      );
      expect(
        preview.status === 200 && preview.body.status === "preview",
        `vista previa ${preview.status} ${preview.body?.code ?? ""} ${preview.body?.message ?? ""}`,
      );
      expect(
        preview.body.amountDueToday > 0 && preview.body.amountDueToday <= 19800,
        `hoy ${preview.body.amountDueToday}`,
      );
      expect(
        preview.body.nextAmount === 19900 + 19800,
        `siguiente ${preview.body.nextAmount}`,
      );
      if (panel) {
        // From the panel: «Agregar» on «Organización extra», then 2.
        const { page, close } = await openPanel(sizes[0], a, "/settings/plan");
        try {
          await page
            .locator(
              'section[aria-labelledby="billing-extras-heading"] .settings-row',
            )
            .filter({ hasText: "Organización extra" })
            .getByRole("button", { name: "Agregar" })
            .click({ timeout: 20_000 });
          const dialog = page.locator("dialog[open]");
          // It opens on 1; once «Más» makes 2.
          await dialog.getByRole("button", { name: "Más" }).click();
          await dialog
            .getByText("Hoy pagas", { exact: false })
            .waitFor({ timeout: 20_000 });
          const line = ((await dialog.innerText()) as string).replace(
            /\s+/g,
            " ",
          );
          expect(
            line.includes("por lo que falta del mes") &&
              line.includes("al mes con tu plan"),
            `línea: ${line.slice(0, 200)}`,
          );
          await screen(page, "extras-dialogo-laptop");
          await dialog
            .getByRole("button", { name: "Agregar", exact: true })
            .click();
          await page
            .locator("dialog[open]")
            .waitFor({ state: "detached", timeout: 30_000 })
            .catch(() => undefined);
          await page.waitForFunction(
            () => !document.querySelector("dialog[open]"),
            undefined,
            { timeout: 30_000 },
          );
        } finally {
          await close();
        }
      } else {
        const applied = await call(
          token,
          "PUT",
          `/v1/workspaces/${a}/billing/extras`,
          { quantities: { organization: 2 }, confirm: true },
        );
        expect(
          applied.status === 200 && applied.body.status === "applied",
          `aplicar ${applied.status} ${applied.body?.message ?? ""}`,
        );
      }
      const view = (await billing(a)).body;
      const extra = view.account.extras.find(
        (item: any) => item.code === "organization",
      );
      expect(
        extra?.quantity === 2 && view.account.organizationsLimit === 3,
        `extra ${extra?.quantity} tope ${view.account.organizationsLimit}`,
      );
      expect(
        (await selection(a)).body.overage?.resolved,
        "el plazo sigue abierto",
      );
      return `hoy $${(preview.body.amountDueToday / 100).toFixed(2)}`;
    },
  );

  await check(
    "Cambiar de plan con extras va por Kardo (con el monto antes)",
    async () => {
      const preview = await call(
        token,
        "POST",
        `/v1/workspaces/${a}/billing/plan-change`,
        { priceId: priceOf("profesional"), confirm: false },
      );
      expect(
        preview.status === 200 && preview.body.amountDueToday > 0,
        `vista ${preview.status} ${preview.body?.message ?? ""}`,
      );
      const applied = await call(
        token,
        "POST",
        `/v1/workspaces/${a}/billing/plan-change`,
        { priceId: priceOf("profesional"), confirm: true },
      );
      expect(
        applied.status === 200 && applied.body.status === "applied",
        `aplicar ${applied.status}`,
      );
      const view = (await billing(a)).body;
      expect(
        view.plan?.code === "profesional" &&
          view.account.organizationsLimit === 5,
        `plan ${view.plan?.code} tope ${view.account.organizationsLimit}`,
      );
    },
  );

  await check(
    "Quitar extras y bajar a Esencial abre otra vez el plazo; elegir pausa las demás",
    async () => {
      await call(token, "PUT", `/v1/workspaces/${a}/billing/extras`, {
        quantities: { organization: 0 },
        confirm: true,
      });
      const down = await call(
        token,
        "POST",
        `/v1/workspaces/${a}/billing/plan-change`,
        { priceId: priceOf("esencial"), confirm: true },
      );
      expect(down.status === 200, `bajar ${down.status}`);
      const window = (await selection(a)).body;
      expect(
        window.overage && !window.overage.resolved,
        "no se abrió el plazo",
      );
      if (panel) {
        // From the panel: «Elegir cuáles siguen activos», the first
        // organization only (radio), «Guardar».
        const { page, close } = await openPanel(sizes[1], a, "/settings/plan");
        try {
          await page
            .getByRole("button", { name: "Elegir cuáles siguen activos" })
            .click({ timeout: 20_000 });
          const dialog = page.locator("dialog[open]");
          await dialog
            .getByText("Las demás se pausan", { exact: false })
            .waitFor({ timeout: 20_000 });
          await dialog
            .getByLabel("Estética Brillo E2E", { exact: false })
            .check();
          await screen(page, "elige-que-sigue-celular");
          await dialog.getByRole("button", { name: "Guardar" }).click();
          await page.waitForFunction(
            () => !document.querySelector("dialog[open]"),
            undefined,
            { timeout: 30_000 },
          );
        } finally {
          await close();
        }
      } else {
        const keep = [
          a,
          ...window.candidates
            .filter(
              (item: any) =>
                item.workspaceId === a && item.kind === "touchpoint",
            )
            .map((item: any) => item.id),
        ];
        const saved = await call(
          token,
          "PUT",
          `/v1/workspaces/${a}/plan-selection`,
          { keep },
        );
        expect(
          saved.status === 200,
          `guardar ${saved.status} ${saved.body?.code ?? ""}`,
        );
      }
      const out = (await access(b)).body;
      expect(
        out.state === "paused" && out.source === "excluded",
        `B quedó ${out.state}/${out.source}`,
      );
      const stays = (await access(a)).body;
      expect(stays.state === "active", `A quedó ${stays.state}`);
      const usage = (await billing(a)).body.usage;
      expect(
        usage["organizations.max"] === 1 && usage["touchpoints.max"] === 2,
        `uso ${JSON.stringify(usage)}`,
      );
    },
  );

  await panelSteps(
    "La organización que quedó fuera lo dice y no se puede editar",
    async (size) => {
      const { page, close } = await openPanel(size, b, "/");
      try {
        await page
          .getByText("quedó fuera de tu plan", { exact: false })
          .first()
          .waitFor({ timeout: 20_000 });
        await screen(page, `fuera-del-plan-${size.label}`);
      } finally {
        await close();
      }
    },
  );

  await check(
    "Transferir una organización la mueve al plan de quien la recibe",
    async () => {
      await sql`
      insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
      values (${c}::uuid, ${ids.receiver}::uuid, 'admin')
    `;
      const moved = await call(
        token,
        "POST",
        `/v1/workspaces/${c}/ownership-transfer`,
        { profileId: ids.receiver },
      );
      expect(
        moved.status === 200,
        `transferir ${moved.status} ${moved.body?.code ?? ""}`,
      );
      const [row] = await sql<{ moved: boolean }[]>`
      select w.billing_account_id = a.id as moved
      from kardo_core.workspaces w, kardo_billing.accounts a
      where w.id = ${c}::uuid and a.profile_id = ${ids.receiver}::uuid
    `;
      expect(row?.moved, "sigue en la cuenta de quien la dio");
      const receiver = await signIn(people.receiver);
      const theirs = (
        await call(receiver, "GET", `/v1/workspaces/${c}/billing`)
      ).body;
      expect(
        theirs.account?.isHolder && theirs.account.holderName === "E2E Recibe",
        `cuenta ${JSON.stringify(theirs.account).slice(0, 120)}`,
      );
    },
  );

  await check("Subir a Negocio devuelve lo que estaba fuera", async () => {
    const up = await call(
      token,
      "POST",
      `/v1/workspaces/${a}/billing/plan-change`,
      { priceId: priceOf("negocio"), confirm: true },
    );
    expect(up.status === 200, `subir ${up.status}`);
    const back = (await access(b)).body;
    expect(back.state === "active", `B quedó ${back.state}/${back.source}`);
  });

  // Clean up: cancel in Stripe, mirror it, then «Borrar mi cuenta».
  if (subscriptionId) {
    await stripe.subscriptions.cancel(subscriptionId);
    await sync.syncSubscription(subscriptionId);
  }
  const owner = await call(await signIn(people.owner), "DELETE", "/v1/me", {
    confirm: "BORRAR MI CUENTA",
  });
  const receiver = await call(
    await signIn(people.receiver),
    "DELETE",
    "/v1/me",
    { confirm: "BORRAR MI CUENTA" },
  );
  erased = owner.status === 200 && receiver.status === 200;
  record(
    "Limpieza: suscripción cancelada y cuentas borradas",
    erased,
    `${owner.status}/${receiver.status} ${owner.body?.code ?? ""}`,
  );
} finally {
  await browser?.close().catch(() => undefined);
  if (subscriptionId)
    await stripe.subscriptions.cancel(subscriptionId).catch(() => undefined);
  if (customerId) await stripe.customers.del(customerId).catch(() => undefined);
  if (!erased) {
    for (const id of Object.values(ids)) {
      const spaces =
        await sql`select workspace_id from kardo_core.workspace_memberships where profile_id = ${id}::uuid`.catch(
          () => [],
        );
      await sql`delete from auth.users where id = ${id}::uuid`.catch(
        () => undefined,
      );
      for (const { workspace_id } of spaces as { workspace_id: string }[])
        await sql`select kardo_private.erase_workspace_data(${workspace_id}::uuid, 'e2e cuenta cleanup')`.catch(
          () => undefined,
        );
    }
  }
  await sql.end();
}

const failed = results.filter((item) => !item.ok).length;
console.log(`\n${results.length - failed}/${results.length} pasos bien`);
process.exit(failed ? 1 : 0);
