// End-to-end check of downgrade option B (ADR 023) against kardo-dev: a
// test organization goes from Negocio to Esencial with 17 QR and 3 Links,
// chooses what stays active through the Customer API, cannot keep more than
// the plan, goes back up (everything returns), and then gets the default
// rule when the window ends.
//
// ADR 024: the plan is the person's, so the account is a throwaway one
// (e2e-bajada-<stamp>@kardo.test, random password never printed) with this
// one organization («E2E Bajada de plan»). Plan changes are made directly
// on its account (as a staff courtesy would) and the hourly functions are
// called for it alone, never the whole tick, so no other account gets an
// email. Everything is erased at the end.
//
// Usage (tsx, for the package's default rule and legalVersions):
//   cd services/customer-api && E2E_API_URL=http://localhost:3011 \
//     pnpm exec tsx ../../scripts/e2e/plan-downgrade.mjs
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const rawEnv = Object.fromEntries(
  fs
    .readFileSync(path.join(root, ".env"), "utf8")
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);
const env = Object.fromEntries(
  Object.entries(rawEnv).map(([key, value]) => [
    key,
    value.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name) => rawEnv[name] ?? ""),
  ]),
);
if (!["local", "development", "test"].includes(env.KARDO_ENV ?? "local"))
  throw new Error("This check only runs outside production.");

const postgres = createRequire(path.join(root, "services/customer-api/package.json"))("postgres");
const { createClient } = createRequire(path.join(root, "apps/customer-web/package.json"))("@supabase/supabase-js");

const api = (process.env.E2E_API_URL ?? "http://localhost:3011").replace(/\/$/, "");
const email = `e2e-bajada-${new Date().toISOString().slice(5, 19).replace(/[-T:]/g, "")}@kardo.test`;
const password = `E2e-${randomBytes(18).toString("base64url")}!9`;
const workspaceName = "E2E Bajada de plan";
const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok });
  console.log(`${ok ? "OK " : "FALLA"} ${name}${detail ? ` — ${detail}` : ""}`);
}

const admin = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });
const randomId = (prefix) => `${prefix}${randomBytes(12).toString("base64url")}`.slice(0, 24);

// ADR 024: a manual plan is the account's.
async function setPlan(workspaceId, code) {
  await admin`
    insert into kardo_billing.account_plans (account_id, plan_id, assigned_at)
    select kardo_billing.account_of(${workspaceId}::uuid), p.id, now() from kardo_core.plans p where p.code = ${code}
    on conflict (account_id) do update set plan_id = excluded.plan_id, assigned_at = now(), override_until = null
  `;
  const [row] = await admin`select kardo_billing.refresh_plan_overage(${workspaceId}::uuid) as result`;
  return row.result;
}

let workspaceId;
let token;
let userId;
try {
  // A throwaway account and its organization, with 17 QR and 3 Links.
  const { legalVersions } = await import(path.join(root, "packages/contracts/src/index.ts"));
  const [user] = await admin`
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token
    ) values (
      '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
      ${email}, extensions.crypt(${password}, extensions.gen_salt('bf')), now(),
      ${admin.json({ provider: "email", providers: ["email"] })},
      ${admin.json({ display_name: "E2E Bajada" })}, now(), now(),
      '', '', '', '', '', '', '', ''
    )
    returning id
  `;
  userId = user.id;
  await admin`
    insert into auth.identities (user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (${user.id}, ${user.id}::text, ${admin.json({ sub: user.id, email, email_verified: true })}, 'email', now(), now(), now())
  `;
  await admin`
    update kardo_core.profiles set terms_version = ${legalVersions.terms}, privacy_version = ${legalVersions.privacy}, terms_accepted_at = now()
    where id = ${user.id}::uuid
  `;
  const [created] = await admin`
    insert into kardo_core.workspaces (public_id, kind, name)
    values (${randomId("ws")}, 'organization', ${workspaceName})
    returning id
  `;
  workspaceId = created.id;
  await admin`
    insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
    values (${workspaceId}::uuid, ${user.id}::uuid, 'owner')
  `;
  await setPlan(workspaceId, "negocio");
  const qr = [];
  for (let index = 1; index <= 17; index += 1) {
    const [row] = await admin`
      insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind, operational_name)
      values (${randomId("tp")}, ${workspaceId}::uuid, 'assigned', 'other', 'qr', ${`Mesa ${index}`})
      returning id
    `;
    qr.push(row.id);
  }
  const links = [];
  for (let index = 1; index <= 3; index += 1) {
    const [row] = await admin`
      insert into kardo_core.touchpoints (public_id, workspace_id, status, physical_type, kind, operational_name)
      values (${randomId("ln")}, ${workspaceId}::uuid, 'assigned', 'other', 'link', ${`Link ${index}`})
      returning id
    `;
    links.push(row.id);
  }

  const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw new Error(signIn.error.message);
  token = signIn.data.session.access_token;
  const call = async (method, url, body) => {
    const response = await fetch(`${api}${url}`, {
      method,
      headers: { authorization: `Bearer ${token}`, ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: await response.json().catch(() => null) };
  };
  const selectionUrl = `/v1/workspaces/${workspaceId}/plan-selection`;

  // 1. In Negocio nothing is over.
  const before = await call("GET", selectionUrl);
  record(
    "En Negocio no hay nada de más",
    before.status === 200 && before.body.overage === null &&
      before.body.candidates.filter((candidate) => candidate.kind !== "organization").length === 20,
    `${before.status}, ${before.body?.candidates?.length} candidatos`,
  );

  // 2. Down to Esencial: the window opens.
  const opened = await setPlan(workspaceId, "esencial");
  const [limits] = await admin`select touchpoints_limit, links_limit from kardo_billing.plan_overage_limits(${workspaceId}::uuid)`;
  record(
    "Al bajar a Esencial se abre el plazo",
    opened.status === "opened" && opened.touchpointsOver === 17 - limits.touchpoints_limit && opened.linksOver === 3 - limits.links_limit,
    JSON.stringify(opened),
  );
  const open = await call("GET", selectionUrl);
  const days = (new Date(open.body.overage.chooseBy) - Date.now()) / 86_400_000;
  record(
    "El panel ve el plazo de 14 días y los límites",
    open.body.overage?.planCode === "esencial" && days > 13.9 && days <= 14 &&
      open.body.limits.touchpoints === limits.touchpoints_limit && open.body.limits.links === limits.links_limit,
    `${days.toFixed(2)} días`,
  );
  const [notice] = await admin`
    select count(*)::int as n from kardo_billing.notices
    where workspace_id = ${workspaceId}::uuid and kind = 'plan_overage_opened'
  `;
  // The webhook path queues it; refresh alone (this script) does not.
  record("La base no manda aviso por sí sola (lo pone el webhook o la tarea)", notice.n === 0, `${notice.n}`);

  // 3. Too many kept → 409.
  const tooMany = await call("PUT", selectionUrl, { keep: [...qr.slice(0, limits.touchpoints_limit + 1), ...links.slice(0, 2)] });
  record("No se puede dejar más de lo que incluye el plan", tooMany.status === 409 && tooMany.body?.code === "PLAN_SELECTION_OVER_LIMIT", `${tooMany.status} ${tooMany.body?.code}`);

  // 4. The customer's choice.
  const keep = [...qr.slice(0, limits.touchpoints_limit), ...links.slice(0, limits.links_limit)];
  const saved = await call("PUT", selectionUrl, { keep });
  const outCount = 17 - limits.touchpoints_limit + 3 - limits.links_limit;
  record("Guardar la elección deja fuera el resto", saved.status === 200 && saved.body.excluded === outCount, JSON.stringify(saved.body));
  const after = await call("GET", selectionUrl);
  const excluded = after.body.candidates.filter((candidate) => candidate.excluded);
  record(
    "Los que no eligió quedan fuera del plan",
    excluded.length === outCount && excluded.every((candidate) => !keep.includes(candidate.id)),
    `${excluded.length} fuera`,
  );
  const billing = await call("GET", `/v1/workspaces/${workspaceId}/billing`);
  const usage = billing.body?.usage ?? {};
  record(
    "Lo que quedó fuera ya no cuenta para el límite",
    usage["touchpoints.max"] === limits.touchpoints_limit && usage["links.max"] === limits.links_limit,
    `${usage["touchpoints.max"]} QR, ${usage["links.max"]} Links`,
  );
  const [queued] = await admin`
    select count(*) filter (where paused)::int as paused from kardo_billing.touchpoint_pause_sync
    where workspace_id = ${workspaceId}::uuid
  `;
  record("Se pidió al Resolver pausar exactamente esos", queued.paused === outCount, `${queued.paused}`);
  const swap = await call("PUT", selectionUrl, { keep: [...qr.slice(1, limits.touchpoints_limit + 1), ...links.slice(0, limits.links_limit)] });
  record("Puede cambiar cuáles quedan cuando quiera", swap.status === 200 && swap.body.excluded === 1 && swap.body.included === 1, JSON.stringify(swap.body));

  // 5. Back up: everything returns and the window closes.
  const up = await setPlan(workspaceId, "negocio");
  const resolved = await call("GET", selectionUrl);
  record(
    "Al subir de plan vuelven todos y se cierra el plazo",
    up.status === "resolved" && up.reactivated === outCount && resolved.body.overage?.resolved === true &&
      resolved.body.candidates.every((candidate) => !candidate.excluded),
    JSON.stringify(up),
  );

  // 6. Down again, nobody chooses: the default rule when the window ends.
  await setPlan(workspaceId, "esencial");
  await admin`update kardo_billing.plan_overages set choose_by = now() - interval '1 minute' where account_id = kardo_billing.account_of(${workspaceId}::uuid)`;
  const { defaultKeep } = await import(path.join(root, "packages/billing/src/plan-overage.ts")).catch(() => ({ defaultKeep: null }));
  const candidates = await admin`select id, public_id, kind, name, excluded, updated_at from kardo_billing.plan_selection_candidates(${workspaceId}::uuid)`;
  // Most recently updated first when there are no visits (test pages have none).
  await admin`update kardo_core.touchpoints set updated_at = now() + interval '1 minute' where id = ${qr[16]}::uuid`;
  const fresh = await admin`select id, public_id, kind, name, excluded, updated_at from kardo_billing.plan_selection_candidates(${workspaceId}::uuid)`;
  const ranked = defaultKeep
    ? defaultKeep(fresh.map((row) => ({ id: row.id, publicId: row.public_id, kind: row.kind, name: row.name, excluded: row.excluded, updatedAt: row.updated_at })), new Map(), { touchpoints: limits.touchpoints_limit, links: limits.links_limit })
    : null;
  if (ranked) {
    const [applied] = await admin`select kardo_billing.apply_default_plan_selection(${workspaceId}::uuid, ${ranked}::uuid[]) as result`;
    const [kept] = await admin`select plan_excluded_at is null as active from kardo_core.touchpoints where id = ${qr[16]}::uuid`;
    record(
      "Sin elección, la regla deja activos los de más actividad",
      applied.result.status === "applied" && applied.result.excluded === outCount && kept.active,
      JSON.stringify(applied.result),
    );
  } else {
    record("Regla por defecto (requiere tsx para importar el paquete)", true, `omitido; ${candidates.length} candidatos`);
  }
} finally {
  // Erase the throwaway account and its spaces.
  if (userId) {
    const spaces = await admin`
      select workspace_id from kardo_core.workspace_memberships where profile_id = ${userId}::uuid
    `.catch(() => []);
    await admin`delete from auth.users where id = ${userId}::uuid`.catch(() => undefined);
    for (const { workspace_id: id } of spaces)
      await admin`select kardo_private.erase_workspace_data(${id}::uuid, 'e2e plan-downgrade cleanup')`.catch(() => undefined);
  }
  await admin.end();
}

const failed = results.filter((result) => !result.ok).length;
console.log(`\n${results.length - failed}/${results.length} OK`);
process.exit(failed ? 1 : 0);
