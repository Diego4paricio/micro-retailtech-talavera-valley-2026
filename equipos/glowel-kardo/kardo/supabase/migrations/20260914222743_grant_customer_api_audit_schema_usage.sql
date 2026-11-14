-- The trusted Customer API writes audit events in the same transaction as
-- a publication intent. Table INSERT already exists; schema usage is required
-- by PostgreSQL before that grant can be exercised.
grant usage on schema kardo_audit to kardo_customer_api;
