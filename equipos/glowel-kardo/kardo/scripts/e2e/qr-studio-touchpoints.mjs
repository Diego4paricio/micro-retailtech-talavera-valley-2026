// Every way a customer reaches, changes or downloads a QR (relevo 38 §4.1),
// so the Diseño del QR and the touchpoints never come apart again:
//
// 1. API, against kardo-dev: a download is recorded and marks «Descargar»
//    (QR) or «Respaldo» (an NFC's backup QR, model A); an NFC keeps its
//    backup's design; «Otro» has none; the nearest group up the tree gives
//    its design; a new format forgets the last download and keeps the
//    design; a retired code records nothing; a viewer downloads but does
//    not change designs.
// 2. Browser, in the real panel (E2E_PANEL_URL, against this API) at phone
//    (390) and laptop (1280) widths: download from «Conecta el objeto»,
//    «Tu QR», «⋯ → Descargar QR», «Reimprimir», the studio opened with
//    `?descargar` (what «Corregir» does), the gallery, «Crear un diseño»,
//    the backup QR of an NFC («Descargar», «Personaliza tu QR»), the list in
//    Diseño del QR, Primeros pasos («Pruébalo») and a Link's own QR; every
//    download marks its step and survives a reload; no sideways scroll.
// 3. The same screens in the demo (E2E_DEMO_URL), when it is running.
//
// A throwaway account e2e-qr-<stamp>@kardo.test (and a viewer) is created by
// SQL and erased at the end through «Borrar mi cuenta». Passwords are random
// and never printed. No email is sent. Development only.
//
// Usage (API without watch on 3011, panel on 5186, demo on 5185):
//   cd services/customer-api && E2E_API_URL=http://localhost:3011 \
//     E2E_PANEL_URL=http://localhost:5186 E2E_DEMO_URL=http://localhost:5185 \
//     pnpm exec tsx ../../scripts/e2e/qr-studio-touchpoints.mjs
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const rawEnv = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [
      line.slice(0, line.indexOf("=")).trim(),
      line.slice(line.indexOf("=") + 1).trim(),
    ]),
);
const env = Object.fromEntries(
  Object.entries(rawEnv).map(([key, value]) => [
    key,
    value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => rawEnv[name] ?? ""),
  ]),
);
if (!["local", "development", "test"].includes(env.KARDO_ENV ?? "local"))
  throw new Error("This check only runs outside production.");

const requireApi = createRequire(
  path.join(root, "services/customer-api/package.json"),
);
const postgres = requireApi("postgres");
const { createClient } = createRequire(
  path.join(root, "apps/customer-web/package.json"),
)("@supabase/supabase-js");
const { chromium } = await import(
  path.join(root, "scripts/video/node_modules/playwright-core/index.mjs")
);

const api = (process.env.E2E_API_URL ?? "http://localhost:3011").replace(
  /\/$/,
  "",
);
const panel = process.env.E2E_PANEL_URL?.replace(/\/$/, "") ?? null;
const demo = process.env.E2E_DEMO_URL?.replace(/\/$/, "") ?? null;
const stamp = new Date().toISOString().slice(5, 19).replace(/[-T:]/g, "");
const accounts = {
  owner: {
    email: `e2e-qr-${stamp}@kardo.test`,
    password: `E2e-${randomBytes(18).toString("base64url")}!9`,
    name: "E2E QR",
  },
  viewer: {
    email: `e2e-qr-viewer-${stamp}@kardo.test`,
    password: `E2e-${randomBytes(18).toString("base64url")}!9`,
    name: "E2E Lector",
  },
};
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

let currentPage = null;
const shots = process.env.E2E_SHOTS_DIR ?? null;
async function check(name, run) {
  try {
    const detail = await run();
    record(name, true, typeof detail === "string" ? detail : "");
  } catch (error) {
    record(
      name,
      false,
      error instanceof Error ? error.message.split("\n")[0] : String(error),
    );
    if (shots && currentPage)
      await currentPage
        .screenshot({ path: path.join(shots, `${results.length}.png`) })
        .catch(() => undefined);
  }
}

function expect(condition, message) {
  if (!condition) throw new Error(message);
}

async function call(token, method, url, body, headers = {}) {
  const response = await fetch(`${api}${url}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body ? { "content-type": "application/json" } : {}),
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: response.status,
    body: await response.json().catch(() => null),
  };
}

async function signIn(account) {
  const client = createClient(
    env.VITE_SUPABASE_URL,
    env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await client.auth.signInWithPassword(account);
  if (error) throw error;
  return data.session.access_token;
}

const qrDesign = {
  schema: 2,
  errorCorrection: "H",
  minVersion: null,
  quietZone: 4,
  modules: { shape: "rounded", fill: { kind: "solid", color: "#0a6c78" } },
  eyes: {
    frameShape: "rounded",
    ballShape: "circle",
    topLeft: { frame: null, ball: null },
    topRight: { frame: null, ball: null },
    bottomLeft: { frame: null, ball: null },
  },
  background: { color: "#ffffff", transparent: false },
  logo: null,
  frame: {
    style: "panel-bottom",
    color: "#16232e",
    textColor: "#ffffff",
    text: "Escanea aquí",
    font: "sans",
    uppercase: false,
    icon: "none",
  },
};
const fingerprint = "b".repeat(64);

const { legalVersions } = await import(
  path.join(root, "packages/contracts/src/index.ts")
);
const admin = postgres(env.SUPABASE_ADMIN_DATABASE_URL, {
  max: 1,
  prepare: false,
  onnotice: () => {},
});
const userIds = {};
let deleted = false;
let browser;
try {
  for (const [role, account] of Object.entries(accounts)) {
    await admin.begin(async (tx) => {
      const [user] = await tx`
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          email_change_token_current, reauthentication_token, phone_change, phone_change_token
        ) values (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          ${account.email}, extensions.crypt(${account.password}, extensions.gen_salt('bf')), now(),
          ${tx.json({ provider: "email", providers: ["email"] })},
          ${tx.json({ display_name: account.name })}, now(), now(),
          '', '', '', '', '', '', '', ''
        )
        returning id
      `;
      await tx`
        insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
        values (${user.id}, ${user.id}::text, ${tx.json({ sub: user.id, email: account.email, email_verified: true })}, 'email', now(), now(), now())
      `;
      userIds[role] = user.id;
    });
    await admin`
      update kardo_core.profiles set terms_version = ${legalVersions.terms}, privacy_version = ${legalVersions.privacy}, terms_accepted_at = now()
      where id = ${userIds[role]}::uuid
    `;
  }

  const token = await signIn(accounts.owner);
  const [personal] = (await call(token, "GET", "/v1/workspaces")).body ?? [];
  const workspaceId = personal?.id;
  const base = `/v1/workspaces/${workspaceId}`;
  const onboarded = await call(token, "PATCH", `${base}/onboarding`, {
    workspaceName: "Florería Lirio E2E",
    accountType: "business",
  });
  record(
    "Termina el alta (usa su prueba)",
    onboarded.status === 200,
    `${onboarded.status}`,
  );
  // The viewer joins the same organization (as an accepted invitation would).
  await admin`
    insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
    values (${workspaceId}::uuid, ${userIds.viewer}::uuid, 'viewer')
  `;

  const create = async (operationalName, kind, extra = {}) => {
    const created = await call(token, "POST", `${base}/touchpoints`, {
      operationalName,
      kind,
      ...extra,
    });
    expect(
      created.status === 201,
      `crear «${operationalName}» HTTP ${created.status} ${created.body?.code ?? ""}`,
    );
    return created.body;
  };
  const listed = async (id) =>
    ((await call(token, "GET", `${base}/touchpoints`)).body ?? []).find(
      (item) => item.id === id,
    );
  const design = (id, who = token) =>
    call(who, "GET", `${base}/touchpoints/${id}/qr-design`);
  const exportOf = (ids, who = token) =>
    call(who, "POST", `${base}/qr-exports`, {
      format: "png",
      items: ids.map((touchpointId) => ({ touchpointId, fingerprint })),
    });

  // --- 1. API ---------------------------------------------------------------
  const template = await call(token, "POST", `${base}/qr-templates`, {
    name: "Lirio",
    design: qrDesign,
  });
  record(
    "Un diseño en la biblioteca",
    template.status === 201,
    `${template.status} ${template.body?.code ?? ""}`,
  );
  const templateId = template.body?.id;
  const parent = (
    await call(token, "POST", `${base}/touchpoint-groups`, {
      name: "Sucursal Centro",
      kind: "location",
    })
  ).body;
  const child = (
    await call(token, "POST", `${base}/touchpoint-groups`, {
      name: "Vitrina",
      parentId: parent?.id,
    })
  ).body;

  await check(
    "Un QR recibe el diseño del grupo más cercano hacia arriba (ADR 021)",
    async () => {
      const put = await call(
        token,
        "PUT",
        `${base}/touchpoint-groups/${parent.id}/qr-design`,
        { templateId },
      );
      expect(put.status === 204, `diseño del grupo HTTP ${put.status}`);
      const inChild = await create("Vitrina 1", "qr", { groupId: child.id });
      const state = (await design(inChild.id)).body;
      expect(
        state?.source === "group" && state.template?.id === templateId,
        `origen ${state?.source}`,
      );
      return "Vitrina › Sucursal Centro";
    },
  );

  await check(
    "Una descarga de un QR marca «Descargar» y queda guardada",
    async () => {
      const qr = await create("Mostrador E2E", "qr");
      expect(
        (await listed(qr.id))?.object?.downloadedAt === null,
        "ya venía marcada",
      );
      const recorded = await exportOf([qr.id]);
      expect(recorded.status === 204, `registrar HTTP ${recorded.status}`);
      const after = await listed(qr.id);
      expect(after?.object?.downloadedAt, "no se marcó «Descargar»");
      expect(
        (await design(qr.id)).body?.lastExport?.fingerprint === fingerprint,
        "sin «Última descarga»",
      );
    },
  );

  let nfcApi;
  await check(
    "El QR de respaldo de un NFC guarda su propio diseño (modelo A)",
    async () => {
      nfcApi = await create("Tarjeta de caja E2E", "nfc");
      const linked = await call(
        token,
        "PUT",
        `${base}/touchpoints/${nfcApi.id}/qr-design`,
        { templateId },
      );
      expect(
        linked.status === 200 && linked.body?.source === "library",
        `PUT HTTP ${linked.status} ${linked.body?.code ?? ""}`,
      );
      const own = await call(
        token,
        "PUT",
        `${base}/touchpoints/${nfcApi.id}/qr-design`,
        { design: qrDesign },
      );
      expect(
        own.status === 200 && own.body?.source === "custom",
        `propio HTTP ${own.status}`,
      );
      const overview =
        (await call(token, "GET", `${base}/qr-designs`)).body ?? [];
      expect(
        overview.some((row) => row.touchpointId === nfcApi.id),
        "no aparece en la lista de Diseño del QR",
      );
    },
  );

  await check(
    "Descargar el respaldo marca «Respaldo» (una vez) y no cuenta como touchpoint aparte",
    async () => {
      const before = (await call(token, "GET", `${base}/touchpoints`)).body
        .length;
      await exportOf([nfcApi.id]);
      const first = await listed(nfcApi.id);
      expect(
        first?.object?.backupAt && first.object.downloadedAt,
        "no se marcó «Respaldo»",
      );
      await exportOf([nfcApi.id]);
      expect(
        (await listed(nfcApi.id))?.object?.backupAt === first.object.backupAt,
        "la hora de «Respaldo» cambió",
      );
      expect(
        (await call(token, "GET", `${base}/touchpoints`)).body.length ===
          before,
        "apareció otro touchpoint",
      );
    },
  );

  await check(
    "Aplicar un diseño a varios incluye los respaldos de NFC",
    async () => {
      const other = await create("Etiqueta de pared E2E", "nfc");
      const applied = await call(
        token,
        "POST",
        `${base}/qr-templates/${templateId}/applications`,
        {
          touchpointIds: [other.id],
          groupIds: [],
        },
      );
      expect(
        applied.status === 200 && applied.body?.touchpoints === 1,
        `aplicar ${JSON.stringify(applied.body)}`,
      );
    },
  );

  await check("«Otro» no lleva QR: su diseño se rechaza", async () => {
    const other = await create("Letrero de puerta E2E", "other");
    const put = await call(
      token,
      "PUT",
      `${base}/touchpoints/${other.id}/qr-design`,
      { templateId },
    );
    expect(
      put.status === 409 && put.body?.code === "TOUCHPOINT_NOT_QR",
      `HTTP ${put.status} ${put.body?.code}`,
    );
  });

  await check(
    "Cambiar de formato reinicia la descarga y los pasos; el diseño se guarda",
    async () => {
      const qr = await create("Cambia de formato E2E", "qr");
      await call(token, "PUT", `${base}/touchpoints/${qr.id}/qr-design`, {
        templateId,
      });
      await exportOf([qr.id]);
      const switched = await call(
        token,
        "PATCH",
        `${base}/touchpoints/${qr.id}`,
        { operationalName: "Cambia de formato E2E", kind: "nfc" },
      );
      expect(switched.status === 200, `PATCH HTTP ${switched.status}`);
      const after = await listed(qr.id);
      expect(
        after?.object?.downloadedAt === null &&
          after.object.preparedAt === null,
        "la descarga vieja siguió marcada",
      );
      const state = (await design(qr.id)).body;
      expect(
        state?.source === "library" && state.lastExport === null,
        `diseño ${state?.source}, última descarga ${state?.lastExport?.at}`,
      );
    },
  );

  await check("Un QR retirado no registra descargas", async () => {
    const qr = await create("Retirado E2E", "qr");
    const retired = await call(
      token,
      "POST",
      `${base}/touchpoints/${qr.id}/retire`,
    );
    expect(retired.status === 200, `retirar HTTP ${retired.status}`);
    await exportOf([qr.id]);
    expect((await design(qr.id)).body?.lastExport === null, "se registró");
  });

  await check(
    "Viewer: descarga y registra, pero no cambia diseños",
    async () => {
      const viewer = await signIn(accounts.viewer);
      const qr = await create("Para el lector E2E", "qr");
      const put = await call(
        viewer,
        "PUT",
        `${base}/touchpoints/${qr.id}/qr-design`,
        { templateId },
      );
      expect(put.status === 403, `PUT del viewer HTTP ${put.status}`);
      const recorded = await exportOf([qr.id], viewer);
      expect(
        recorded.status === 204,
        `registro del viewer HTTP ${recorded.status}`,
      );
    },
  );

  // --- 2. Browser -------------------------------------------------------------
  const sizes = [
    { label: "laptop", width: 1280, height: 860 },
    { label: "celular", width: 390, height: 844 },
  ];
  const screens = async (page, where) => {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    );
    expect(overflow <= 1, `${where}: se desborda ${overflow}px de lado`);
  };
  const dialog = (page) =>
    page.getByRole("dialog", { name: "Descargar tu QR" });
  const downloadFromDialog = async (page) => {
    const button = dialog(page).getByRole("button", {
      name: /^Descargar (PNG|SVG|PDF)/,
    });
    await button.waitFor({ state: "visible", timeout: 15_000 });
    // Enabled once the code is checked with the camera reader.
    const until = Date.now() + 45_000;
    while (!(await button.isEnabled())) {
      expect(Date.now() < until, "la descarga nunca se habilitó");
      await page.waitForTimeout(400);
    }
    const [file] = await Promise.all([
      page.waitForEvent("download", { timeout: 30_000 }),
      button.click(),
    ]);
    return file.suggestedFilename();
  };
  const closeDialog = async (page) => {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(300);
  };
  const markSteps = async (id, steps) => {
    for (const stepName of steps)
      await call(token, "POST", `${base}/touchpoints/${id}/object`, {
        action: "done",
        step: stepName,
      });
  };

  browser = await chromium.launch({ channel: "chrome", headless: true });

  if (panel) {
    // One session for every width (the panel keeps it in localStorage).
    const login = await browser.newContext({
      viewport: { width: 1280, height: 860 },
    });
    const loginPage = await login.newPage();
    await loginPage.goto(`${panel}/`);
    await loginPage.getByLabel("Correo electrónico").fill(accounts.owner.email);
    await loginPage
      .getByLabel("Contraseña", { exact: true })
      .fill(accounts.owner.password);
    await loginPage.keyboard.press("Enter");
    await loginPage.waitForFunction(
      () => Object.keys(localStorage).some((key) => key.includes("auth-token")),
      undefined,
      { timeout: 30_000 },
    );
    const storage = await loginPage.evaluate(() =>
      Object.fromEntries(Object.entries(localStorage)),
    );
    await login.close();

    // A page published on a QR, for Primeros pasos («Pruébalo»).
    const experience = await call(token, "POST", `${base}/experiences`, {
      type: "redirect",
      name: "Catálogo de arreglos",
      content: { destinationUrl: "https://kardo.test/arreglos" },
    });

    for (const size of sizes) {
      const tag = size.label === "laptop" ? "L" : "C";
      const qrA = await create(`Mostrador ${tag}`, "qr");
      const qrB = await create(`Mesa de regalos ${tag}`, "qr");
      await markSteps(qrB.id, ["prepared", "tested", "placed"]);
      const qrD = await create(`Aparador ${tag}`, "qr");
      const nfc = await create(`Tarjeta de caja ${tag}`, "nfc");
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        acceptDownloads: true,
      });
      await context.addInitScript((entries) => {
        for (const [key, value] of Object.entries(entries))
          localStorage.setItem(key, value);
      }, storage);
      const page = await context.newPage();
      currentPage = page;
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      // Escape closes a panel that opens alone; not when a dialog is expected.
      const open = async (route, escape = true) => {
        await page.goto(`${panel}${route}`);
        await page.waitForLoadState("networkidle").catch(() => undefined);
        if (escape) await page.keyboard.press("Escape");
      };
      const where = `[${size.label}]`;

      await check(
        `${where} «Conecta el objeto» → Descargar: abre con este QR, baja y marca el paso (sigue al recargar)`,
        async () => {
          await open(`/touchpoints/${qrA.id}`);
          await page
            .getByRole("heading", { name: "Descarga tu QR" })
            .waitFor({ timeout: 20_000 });
          await screens(page, "ficha QR");
          await page
            .locator(".tp-step-actions")
            .getByRole("button", { name: "Descargar" })
            .first()
            .click();
          await dialog(page).waitFor();
          const name = await downloadFromDialog(page);
          await page
            .getByRole("heading", { name: "Imprímelo" })
            .waitFor({ timeout: 15_000 });
          await page.reload();
          await page.keyboard.press("Escape");
          await page
            .getByRole("heading", { name: "Imprímelo" })
            .waitFor({ timeout: 20_000 });
          return name;
        },
      );

      await check(
        `${where} «Tu QR» → Descargar y «⋯ → Descargar QR» abren la descarga de este QR`,
        async () => {
          await page.locator("#tp-qr-title").waitFor();
          await page
            .locator("section", { has: page.locator("#tp-qr-title") })
            .getByRole("button", { name: "Descargar" })
            .click();
          await dialog(page).waitFor();
          await closeDialog(page);
          await page
            .getByRole("button", { name: `Más acciones de Mostrador ${tag}` })
            .click();
          await page.getByRole("menuitem", { name: "Descargar QR" }).click();
          await dialog(page).waitFor();
          await closeDialog(page);
        },
      );

      await check(
        `${where} Galería: elegir un diseño de la biblioteca y «Crear un diseño» abre su Diseño del QR`,
        async () => {
          await page
            .locator("section", { has: page.locator("#tp-qr-title") })
            .getByRole("button", { name: "Cambiar diseño" })
            .click();
          const gallery = page.getByRole("dialog", {
            name: "Diseño de este QR",
          });
          await gallery.waitFor();
          await gallery.getByRole("button", { name: "Lirio" }).click();
          await page
            .getByText("Este QR usa «Lirio»")
            .waitFor({ timeout: 15_000 });
          expect(
            (await design(qrA.id)).body?.template?.id === templateId,
            "no quedó con «Lirio»",
          );
          await gallery
            .getByRole("button", { name: "Crear un diseño" })
            .click();
          await page.waitForURL(`**/touchpoints/${qrA.id}/qr`, {
            timeout: 15_000,
          });
          await page
            .locator(".qrs-header-kicker", { hasText: "Diseño del QR" })
            .waitFor();
        },
      );

      await check(
        `${where} «Reimprimir» en un QR colocado abre la descarga ahí mismo`,
        async () => {
          await open(`/touchpoints/${qrB.id}`);
          await page.getByRole("button", { name: "Reimprimir" }).click();
          await dialog(page).waitFor();
          await downloadFromDialog(page);
          await closeDialog(page);
          expect(
            page.url().endsWith(`/touchpoints/${qrB.id}`),
            `se fue a ${page.url()}`,
          );
        },
      );

      await check(
        `${where} El Diseño del QR con ?descargar (lo que hace «Corregir») abre la descarga de ese QR y marca el paso`,
        async () => {
          await open(`/touchpoints/${qrD.id}/qr?descargar`, false);
          await dialog(page).waitFor({ timeout: 20_000 });
          expect(
            !page.url().includes("descargar"),
            "la dirección siguió con ?descargar",
          );
          await screens(page, "Diseño del QR");
          await downloadFromDialog(page);
          await closeDialog(page);
          await page
            .getByRole("link", { name: `Volver a Aparador ${tag}` })
            .click();
          await page
            .getByRole("heading", { name: "Imprímelo" })
            .waitFor({ timeout: 15_000 });
        },
      );

      await check(
        `${where} NFC: el QR de respaldo baja con su diseño, marca «Respaldo» y «Personaliza tu QR» abre su diseño`,
        async () => {
          await open(`/touchpoints/${nfc.id}`);
          const card = page.locator("section", {
            has: page.locator("#tp-backup-title"),
          });
          await card.waitFor({ timeout: 20_000 });
          await screens(page, "ficha NFC");
          await card.getByRole("button", { name: "Descargar" }).click();
          await dialog(page).waitFor();
          await downloadFromDialog(page);
          await closeDialog(page);
          expect(
            (await listed(nfc.id))?.object?.backupAt,
            "«Respaldo» no se marcó",
          );
          await card.getByRole("button", { name: "Personaliza tu QR" }).click();
          await page.waitForURL(`**/touchpoints/${nfc.id}/qr`, {
            timeout: 15_000,
          });
          await page
            .locator(".qrs-header-kicker", {
              hasText: "QR de respaldo del NFC",
            })
            .waitFor();
        },
      );

      await check(
        `${where} La lista de Diseño del QR muestra cada QR y los respaldos de NFC`,
        async () => {
          await open("/qr");
          await page
            .getByRole("link", { name: `Tarjeta de caja ${tag}` })
            .first()
            .waitFor({ timeout: 20_000 });
          await page.getByText("QR de respaldo ·").first().waitFor();
          await screens(page, "Diseño del QR (lista)");
        },
      );

      if (size.label === "laptop" && experience.status === 201) {
        await check(
          `${where} Primeros pasos «Pruébalo»: baja con el diseño real y marca «Descargar»`,
          async () => {
            const tryQr = await create("Primer QR E2E", "qr");
            await call(
              token,
              "PUT",
              `${base}/experiences/${experience.body.id}/targets`,
              { touchpointIds: [tryQr.id], groupIds: [] },
            );
            await call(
              token,
              "POST",
              `${base}/experiences/${experience.body.id}/publication-intents`,
              undefined,
              { "idempotency-key": randomUUID() },
            );
            await page.evaluate(
              ([key, value]) => localStorage.setItem(key, value),
              [
                `kardo.firstSteps.${workspaceId}`,
                JSON.stringify({
                  publishedHere: true,
                  touchpointId: tryQr.id,
                  experienceId: experience.body.id,
                }),
              ],
            );
            await open("/primeros-pasos?paso=try");
            const button = page.getByRole("button", {
              name: "Descargar para imprimir",
            });
            await button.waitFor({ timeout: 20_000 });
            await button.click();
            await dialog(page).waitFor();
            await downloadFromDialog(page);
            await closeDialog(page);
            expect(
              (await listed(tryQr.id))?.object?.downloadedAt,
              "«Descargar» no se marcó",
            );
          },
        );
      }

      record(
        `${where} Sin errores de la página`,
        errors.length === 0,
        errors.slice(0, 2).join(" | "),
      );
      await context.close();
    }
  }

  // --- 3. Demo ---------------------------------------------------------------
  if (demo) {
    for (const size of sizes) {
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
        acceptDownloads: true,
      });
      const page = await context.newPage();
      currentPage = page;
      const where = `[demo ${size.label}]`;
      const open = async (route, escape = true) => {
        await page.goto(`${demo}${route}`);
        await page.waitForTimeout(1200);
        if (escape) await page.keyboard.press("Escape");
        await page.waitForTimeout(300);
      };
      await check(
        `${where} QR: Descargar marca el paso; NFC: respaldo con su diseño; ?descargar abre la descarga`,
        async () => {
          await open("/touchpoints/5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a03");
          await page
            .locator(".tp-step-actions")
            .getByRole("button", { name: "Descargar" })
            .first()
            .click();
          await dialog(page).waitFor();
          await downloadFromDialog(page);
          await page
            .getByRole("heading", { name: "Imprímelo" })
            .waitFor({ timeout: 15_000 });
          await open("/touchpoints/5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0a01");
          await page.locator("#tp-backup-title").waitFor();
          await screens(page, "demo NFC");
          await open(
            "/touchpoints/5b0b1f36-6f4d-4d5b-9d0a-1c6f3f1f0b01/qr?descargar",
            false,
          );
          await dialog(page).waitFor({ timeout: 15_000 });
          await screens(page, "demo Diseño del QR");
        },
      );
      await check(`${where} Un Link baja su propio QR`, async () => {
        await open("/links");
        await page
          .getByRole("link", { name: /\/menu/ })
          .first()
          .click();
        const qrButton = page.getByRole("button", { name: /QR/ }).first();
        await qrButton.waitFor({ timeout: 15_000 });
        await screens(page, "demo Link");
      });
      await context.close();
    }
  }

  // Clean up: «Borrar mi cuenta» erases the organization; the viewer goes too.
  const ownerToken = await signIn(accounts.owner);
  await admin`
    delete from kardo_core.workspace_memberships
    where workspace_id = ${workspaceId}::uuid and profile_id = ${userIds.viewer}::uuid
  `;
  const erased = await call(ownerToken, "DELETE", "/v1/me", {
    confirm: "BORRAR MI CUENTA",
  });
  const viewerErased = await call(
    await signIn(accounts.viewer),
    "DELETE",
    "/v1/me",
    { confirm: "BORRAR MI CUENTA" },
  );
  deleted = erased.status === 200 && viewerErased.status === 200;
  record(
    "Limpieza: las cuentas y su organización se borran",
    deleted,
    `${erased.status}/${viewerErased.status}`,
  );
} finally {
  await browser?.close().catch(() => undefined);
  if (!deleted) {
    for (const id of Object.values(userIds)) {
      const spaces = await admin`
        select workspace_id from kardo_core.workspace_memberships where profile_id = ${id}::uuid
      `.catch(() => []);
      await admin`delete from auth.users where id = ${id}::uuid`.catch(
        () => undefined,
      );
      // Same erase as «Borrar mi cuenta» (tombstones, cleanup queued).
      for (const { workspace_id: id } of spaces)
        await admin`select kardo_private.erase_workspace_data(${id}::uuid, 'e2e qr cleanup')`.catch(
          () => undefined,
        );
    }
  }
  await admin.end();
}

const failed = results.filter((item) => !item.ok).length;
console.log(`\n${results.length - failed}/${results.length} pasos bien`);
process.exit(failed ? 1 : 0);
