-- The server connection starts as postgres, then each Customer API transaction
-- explicitly assumes this no-login, non-BYPASSRLS role. Production will replace
-- this bootstrap membership with a dedicated login credential in its secret store.
grant kardo_customer_api to postgres;
