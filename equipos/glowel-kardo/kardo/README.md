# Kardo

Kardo connects a permanent physical Touchpoint (NFC, QR or other) — or a shareable Link page — with a published digital Experience.

## Development

Use Node `22.22.2` and pnpm `11.21.0` exactly. Copy `.env.example` to `.env` only for local development; it is intentionally ignored by Git.

```sh
pnpm install --frozen-lockfile
pnpm check
```

Run the stack locally against kardo-dev (ports 5173/5174 may be taken by other projects, hence 5175/5176):

```sh
cd services/customer-api && CUSTOMER_APP_ORIGIN=http://localhost:5175 pnpm exec tsx watch --env-file=../../.env src/index.ts
cd services/staff-api && OPERATIONS_APP_ORIGIN=http://localhost:5176 pnpm exec tsx watch --env-file=../../.env src/index.ts
cd apps/customer-web && VITE_TAP_RESOLVER_URL=<resolver origin> pnpm exec vite --port 5175
cd apps/operations-web && pnpm exec vite --port 5176
pnpm --filter @kardo/website dev      # public website on 5177, links to the panel on 5175
node scripts/demo/seed-demo.mjs        # demo business "Café Central" + demo accounts (dev only)
node scripts/e2e/vertical-slice.mjs    # customer end-to-end suite
node scripts/e2e/operations.mjs        # Kardo Operations end-to-end suite
```

Deployment (Cloud Run + Cloudflare Pages): `pnpm deploy:apis` and `pnpm deploy:web`, see the [deploy runbook](Docs/engineering/13-deploy-runbook.md).

Start with the [Claude Code handoff](Docs/engineering/12-claude-code-handoff.md). It links to the [implementation plan](Docs/engineering/06-implementation-plan.md), [build backlog](Docs/engineering/07-build-backlog.md), [customer MVP capabilities](Docs/engineering/11-customer-mvp-capabilities.md), [customer access/onboarding runbook](Docs/engineering/10-customer-auth-onboarding.md) and the design research in [`Docs/engineering/research/`](Docs/engineering/research/).
