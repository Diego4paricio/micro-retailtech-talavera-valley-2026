/*
 * Piezas de Kardo end to end against kardo-dev (ADR 026), with the real
 * Staff API and Customer API repositories over the real database, inside
 * one transaction that is always rolled back: nothing stays behind.
 *
 *   services/customer-api/node_modules/.bin/tsx scripts/e2e/kardo-pieces.mts
 *
 * The Resolver is a recorder here (its own tests cover /internal/pieces
 * and the «Esta pieza aún no está activada» page).
 */
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createPostgresKardoPieceRepository } from "../../services/customer-api/src/repositories/kardo-pieces.ts";
import { createPostgresTouchpointRepository } from "../../services/customer-api/src/repositories/touchpoints.ts";
import { createPostgresStaffPieceRepository } from "../../services/staff-api/src/repositories/pieces.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const require = createRequire(path.join(root, "services/customer-api/package.json"));
const postgres = require("postgres");
const envText = fs.readFileSync(path.join(root, ".env"), "utf8");
const env = Object.fromEntries(
  envText
    .split("\n")
    .filter((line) => line.includes("=") && !line.trim().startsWith("#"))
    .map((line) => [line.slice(0, line.indexOf("=")).trim(), line.slice(line.indexOf("=") + 1).trim()]),
);
const catalog = JSON.parse(
  fs.readFileSync(path.join(root, "Docs/engineering/config/kits-catalog.json"), "utf8"),
) as {
  panelDays: number;
  kits: { code: string; name: string; panelPlan: string; items: { piece: string; quantity: number }[] }[];
};
const sql = postgres(env.SUPABASE_ADMIN_DATABASE_URL, { max: 1, prepare: false, onnotice: () => {} });

const results: { step: string; ok: boolean; detail?: string }[] = [];
const check = (step: string, ok: boolean, detail?: unknown) =>
  results.push({ step, ok, detail: detail === undefined ? undefined : JSON.stringify(detail).slice(0, 400) });
const codeOf = (error: unknown) => (error as { code?: string } | null)?.code ?? String(error);
class Rollback extends Error {}

try {
  await sql.begin(async (outer: any) => {
    // `begin` inside a repository becomes a savepoint of this transaction.
    const shim = new Proxy(outer, {
      get(target, prop) {
        if (prop === "begin") return (fn: any) => target.savepoint(fn);
        return target[prop];
      },
    });
    const asAdmin = () => outer`select set_config('role', 'postgres', true)`;
    const stamp = Date.now();

    // 1. The kits the SQL knows are the catalog's.
    const kits = await outer`select code, name, panel_plan_code, panel_days, items from kardo_billing.kits order by code`;
    const byCode = new Map(kits.map((kit: any) => [kit.code, kit]));
    const sameItems = (a: any[], b: any[]) =>
      JSON.stringify([...a].sort((x, y) => x.piece.localeCompare(y.piece))) ===
      JSON.stringify([...b].sort((x, y) => x.piece.localeCompare(y.piece)));
    check(
      "kardo_billing.kits = kits-catalog.json (name, plan, days, pieces)",
      kits.length === catalog.kits.length &&
        catalog.kits.every((kit) => {
          const row: any = byCode.get(kit.code);
          return row && row.name === kit.name && row.panel_plan_code === kit.panelPlan &&
            row.panel_days === catalog.panelDays && sameItems(row.items, kit.items);
        }),
      kits,
    );

    // People: a staff member of Operations and two owners, made here.
    const newUser = async (email: string) => {
      const [user] = await outer`
        insert into auth.users (
          instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
          raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
          confirmation_token, recovery_token, email_change_token_new, email_change,
          email_change_token_current, reauthentication_token, phone_change, phone_change_token
        ) values (
          '00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated',
          ${email}, '', now(), '{"provider":"email","providers":["email"]}'::jsonb,
          '{"display_name":"Pieza"}'::jsonb, now(), now(), '', '', '', '', '', '', '', ''
        ) returning id`;
      const [workspace] = await outer`
        select workspace_id as id from kardo_core.workspace_memberships
        where profile_id = ${user.id} and role = 'owner' limit 1`;
      return { id: user.id as string, email, workspaceId: workspace.id as string };
    };
    // The staff role is for the Staff API's login only: this transaction
    // borrows it (the grant rolls back with everything else).
    await outer.unsafe("grant kardo_staff_api to current_user");
    const staff = await newUser(`pieces-staff-${stamp}@kardo.test`);
    await outer`insert into kardo_staff.staff_profiles (id, status) values (${staff.id}, 'active')`;
    await outer`
      insert into kardo_staff.role_assignments (staff_id, role_id)
      select ${staff.id}, id from kardo_staff.roles where code = 'operations'`;
    const ownerA = await newUser(`pieces-a-${stamp}@kardo.test`);
    const ownerB = await newUser(`pieces-b-${stamp}@kardo.test`);
    const identityA = { subject: ownerA.id, email: ownerA.email };
    const identityB = { subject: ownerB.id, email: ownerB.email };
    const startTrial = async (person: typeof ownerA) => {
      await outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${person.id}, true)`;
      await outer`select kardo_private.start_workspace_trial(${person.workspaceId}::uuid, 'profesional', 'profesional', 'month', 15)`;
      await asAdmin();
    };
    await startTrial(ownerA);
    await startTrial(ownerB);
    // A's 15 days ended two days ago: without a plan until the kit.
    await outer`update kardo_billing.trials set started_at = now() - interval '17 days', ends_at = now() - interval '2 days' where profile_id = ${ownerA.id}`;

    // 2. Operations creates a Kit Refri and two loose Cards.
    const staffRepo = createPostgresStaffPieceRepository(shim, {
      resolverOrigin: "https://t.kardo.test",
      websiteOrigin: "https://kardo.test",
    });
    const refri = await staffRepo.createBatch(staff.id, {
      kitCode: "refri",
      reference: `E2E Refri ${stamp}`,
      reason: "Prueba E2E de piezas",
    });
    await asAdmin();
    const loose = await staffRepo.createBatch(staff.id, {
      items: [{ piece: "card", quantity: 2 }],
      reference: `E2E Cards ${stamp}`,
      reason: "Prueba E2E de piezas",
    });
    await asAdmin();
    check(
      "a Kit Refri is born with 25 Magnets and 2 Stickers, without owner",
      refri.pieces.length === 27 &&
        refri.pieces.filter((piece) => piece.model === "magnet").length === 25 &&
        refri.pieces.every((piece) => piece.status === "available" && piece.workspaceName === null),
      refri.pieces.length,
    );
    check(
      "each piece has its address, its channel URLs and its own code",
      refri.pieces.every((piece) =>
        /^kp_[A-Za-z0-9]{20}$/.test(piece.publicId) &&
        piece.urls.nfc === `https://t.kardo.test/t/${piece.publicId}?src=nfc` &&
        piece.urls.qr === `https://t.kardo.test/t/${piece.publicId}?src=qr` &&
        /^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/.test(piece.code ?? "")),
      refri.pieces[0],
    );
    check(
      "the kit's code and the activation card's link come from the config",
      /^[0-9A-HJKMNP-TV-Z]{5}-[0-9A-HJKMNP-TV-Z]{5}$/.test(refri.code ?? "") &&
        refri.activationUrl === `https://kardo.test/activar/?codigo=${refri.code}`,
      { code: refri.code, url: refri.activationUrl },
    );
    const [unowned] = await outer`select count(*)::int as n from kardo_core.touchpoints where piece_batch_id = ${refri.batch.id} and workspace_id is null and status = 'available'`;
    check("the database holds them unowned and available", unowned.n === 27, unowned);

    // 3. The panel cannot read codes, and cannot create a piece.
    await outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${ownerA.id}, true)`;
    const readCodes = await outer.savepoint((sp: any) => sp`select count(*) from kardo_core.touchpoint_activations`).catch((error: unknown) => error);
    check("the Customer API role cannot read activation codes", codeOf(readCodes) === "42501", codeOf(readCodes));
    await asAdmin();

    const recorded: string[][] = [];
    const reconciled: string[] = [];
    const resolver = {
      setAvailability: async () => {},
      setAlias: async () => {},
      setPieces: async (input: { publicIds: string[]; claimed: boolean }) => {
        recorded.push(input.publicIds);
      },
    };
    const pieces = createPostgresKardoPieceRepository(shim, {
      resolver,
      reconcile: async (workspaceId) => {
        reconciled.push(workspaceId);
      },
    });

    // 4. A, without a plan, previews the kit's code: the 30 days apply on
    // activation, so it fits and needs no plan first.
    const previewA = await pieces.previewClaim(identityA, ownerA.workspaceId, (refri.code ?? "").toLowerCase(), "10.0.0.1");
    await asAdmin();
    check(
      "preview: 27 pieces of Kit Refri, 30 days of Profesional pending, no plan required",
      previewA.pieces.length === 27 && previewA.kit?.kitName === "Kit Refri" && previewA.kit.pending &&
        previewA.kit.outcome === "trial" && !previewA.planRequired && previewA.limit.fits === 27,
      { kit: previewA.kit, limit: previewA.limit, planRequired: previewA.planRequired },
    );

    // 5. A activates 20 of them; 7 stay for later.
    const chosen = previewA.pieces.slice(0, 20);
    const claimA = await pieces.claim(
      identityA,
      ownerA.workspaceId,
      {
        code: refri.code ?? "",
        pieces: chosen.map((piece, index) => ({ touchpointId: piece.touchpointId, name: `Magnet ${index + 1}` })),
      },
      "10.0.0.1",
    );
    await asAdmin();
    check(
      "claim: 20 Kardo pieces, assigned, ready, named",
      claimA.touchpoints.length === 20 &&
        claimA.touchpoints.every((touchpoint) => touchpoint.kind === "kardo" && touchpoint.pieceModel !== null &&
          touchpoint.status === "assigned" && touchpoint.object?.state === "ready"),
      claimA.touchpoints[0],
    );
    check("the Resolver hears the 20 activated addresses", recorded.flat().length === 20, recorded.flat().length);
    const [trialA] = await outer`select ends_at, (select code from kardo_core.plans where id = plan_id) as plan from kardo_billing.trials where profile_id = ${ownerA.id}`;
    const endsInDays = (new Date(trialA.ends_at).getTime() - Date.now()) / 86_400_000;
    check(
      "the kit's 30 days apply on their own: the trial lasts 30 days from today",
      claimA.panel?.outcome === "trial" && endsInDays > 29.9 && endsInDays < 30.1 && trialA.plan === "profesional",
      { panel: claimA.panel, endsInDays },
    );
    await outer`select set_config('role', 'kardo_customer_api', true), set_config('kardo.subject', ${ownerA.id}, true)`;
    const [accessA] = await outer`select state from kardo_billing.workspace_access(${ownerA.workspaceId}::uuid)`;
    await asAdmin();
    check("the organization is back in its trial, and its pages are reconciled", accessA.state === "trial" && reconciled.includes(ownerA.workspaceId), accessA);

    // 6. The same code again: the 7 left, the kit's days already used.
    const again = await pieces.previewClaim(identityA, ownerA.workspaceId, refri.code ?? "", "10.0.0.1");
    await asAdmin();
    check(
      "the kit's code still opens the 7 left, and its days apply only once",
      again.pieces.length === 7 && again.alreadyActive === 20 && again.kit?.pending === false,
      { left: again.pieces.length, kit: again.kit },
    );

    // 7. B cannot use A's kit code: the same answer as a made-up code.
    const stolen = await pieces.previewClaim(identityB, ownerB.workspaceId, refri.code ?? "", "10.0.0.2").catch((error) => error);
    await asAdmin();
    const madeUp = await pieces.previewClaim(identityB, ownerB.workspaceId, "ZZZZZ-ZZZZZ", "10.0.0.2").catch((error) => error);
    await asAdmin();
    check(
      "another organization's code answers like one that does not exist",
      codeOf(stolen) === "PIECE_CODE_INVALID" && codeOf(madeUp) === "PIECE_CODE_INVALID",
      { stolen: codeOf(stolen), madeUp: codeOf(madeUp) },
    );

    // 8. B activates one loose Card with its own code: no kit, no days.
    const looseCode = loose.pieces[0]?.code ?? "";
    const previewB = await pieces.previewClaim(identityB, ownerB.workspaceId, looseCode, "10.0.0.2");
    await asAdmin();
    const claimB = await pieces.claim(
      identityB,
      ownerB.workspaceId,
      { code: looseCode, pieces: [{ touchpointId: previewB.pieces[0]?.touchpointId ?? "", name: "Card de recepción" }] },
      "10.0.0.2",
    );
    await asAdmin();
    check(
      "a loose piece activates with its own code, without kit days",
      previewB.scope === "piece" && previewB.kit === null && claimB.touchpoints[0]?.pieceModel === "card" && claimB.panel === null,
      { scope: previewB.scope, panel: claimB.panel },
    );
    const reused = await pieces.previewClaim(identityB, ownerB.workspaceId, looseCode, "10.0.0.2").catch((error) => error);
    await asAdmin();
    check("a piece's code works once (again: already used here)", codeOf(reused) === "PIECE_CODE_USED", codeOf(reused));

    // 9. Over the plan: A moves to Esencial (15) with 20 pieces already;
    // activating the 7 left is refused whole.
    const [account] = await outer`select billing_account_id as id from kardo_core.workspaces where id = ${ownerA.workspaceId}`;
    await outer`
      insert into kardo_billing.account_plans (account_id, plan_id, override_until)
      select ${account.id}, id, null from kardo_core.plans where code = 'esencial'`;
    const tight = await pieces.previewClaim(identityA, ownerA.workspaceId, refri.code ?? "", "10.0.0.1");
    await asAdmin();
    const refused = await pieces
      .claim(
        identityA,
        ownerA.workspaceId,
        { code: refri.code ?? "", pieces: tight.pieces.map((piece, index) => ({ touchpointId: piece.touchpointId, name: `Extra ${index + 1}` })) },
        "10.0.0.1",
      )
      .catch((error) => error);
    await asAdmin();
    const [stillFree] = await outer`select count(*)::int as n from kardo_core.touchpoints where piece_batch_id = ${refri.batch.id} and workspace_id is null`;
    check(
      "over the plan: the preview says 0 fit and the claim activates none (PLAN_LIMIT)",
      tight.limit.fits === 0 && codeOf(refused) === "PLAN_LIMIT" && stillFree.n === 7,
      { limit: tight.limit, refused: codeOf(refused), stillFree: stillFree.n },
    );

    // 10. A piece never changes format.
    const touchpoints = createPostgresTouchpointRepository(shim);
    const first = claimA.touchpoints[0];
    const changed = await touchpoints
      .updateTouchpoint(identityA, ownerA.workspaceId, first?.id ?? "", { operationalName: "Magnet 1", kind: "qr" })
      .catch((error) => error);
    await asAdmin();
    check("a Kardo piece never changes format", codeOf(changed) === "PIECE_KIND_FIXED", codeOf(changed));

    // 11. Failed codes are limited per person: the 11th answers 429.
    let limited: unknown = null;
    for (let attempt = 0; attempt < 12 && !limited; attempt += 1) {
      const result = await pieces
        .previewClaim(identityB, ownerB.workspaceId, `YYYY-YY${String(attempt).padStart(2, "0").replace(/[01]/g, "2")}`, `10.0.1.${attempt}`)
        .catch((error) => error);
      await asAdmin();
      if (codeOf(result) === "PIECE_CODE_RATE_LIMITED") limited = attempt;
    }
    // B already failed 2 (A's code and a made-up one): the 9th more is the 11th.
    check("ten failed codes an hour per person, then PIECE_CODE_RATE_LIMITED", limited === 8, { limited });

    // 12. Operations sees who activated what.
    const detail = await staffRepo.getBatch(staff.id, refri.batch.id);
    await asAdmin();
    check(
      "Operations sees 20 activated in A's organization, the kit's days applied",
      detail.batch.claimed === 20 && detail.batch.panelOutcome === "trial" && detail.code === refri.code &&
        detail.pieces.filter((piece) => piece.code === null).length === 20,
      detail.batch,
    );
    const [audit] = await outer`select count(*)::int as n from kardo_audit.events where action in ('pieces.batch_created', 'pieces.claimed') and occurred_at > now() - interval '5 minutes' and (actor_subject = ${staff.id} or actor_subject = ${ownerA.id} or actor_subject = ${ownerB.id})`;
    check("each order and each activation is audited", audit.n === 4, audit);

    throw new Rollback();
  });
} catch (error) {
  if (!(error instanceof Rollback)) {
    console.error("FAILED:", (error as Error).message);
    process.exitCode = 1;
  }
} finally {
  await sql.end({ timeout: 5 });
}
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.step}${r.ok ? "" : `  ${r.detail ?? ""}`}`);
console.log(`${results.filter((r) => r.ok).length}/${results.length} (rolled back)`);
if (results.some((r) => !r.ok)) process.exitCode = 1;
