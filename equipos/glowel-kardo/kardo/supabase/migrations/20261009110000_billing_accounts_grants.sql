-- Cobro por persona (ADR 024): la tarea horaria y el webhook revisan la
-- bajada por cuenta de cobro.
grant execute on function kardo_billing.refresh_account_overage(uuid) to kardo_billing_sync;
