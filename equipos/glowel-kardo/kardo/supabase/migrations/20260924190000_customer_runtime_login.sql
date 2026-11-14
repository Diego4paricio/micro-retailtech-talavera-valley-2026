-- CRITICO (audit): Customer API y Staff API se conectaban como el
-- superusuario `postgres` y solo asumian su rol de servicio via
-- `set local role`. Un superusuario bypassea RLS por completo, asi que
-- cualquier bug que olvide el `set local role` quedaba sin ninguna barrera.
-- Creamos un login dedicado, sin privilegios, para cada API -- igual que
-- kardo_publisher_runtime (20260915031857) y kardo_analytics_runtime
-- (20260915155027) -- que solo puede asumir su rol de servicio existente.
--
-- La contrasena NUNCA se fija aqui. Se establece manualmente, una vez, desde
-- el SQL editor de Supabase (o `psql`) y se guarda solo en el secret store:
--   alter role kardo_customer_api_runtime password '<secreto-generado>';
--   alter role kardo_staff_api_runtime password '<secreto-generado>';
-- Luego se actualiza SUPABASE_DATABASE_URL (Customer API) y el equivalente
-- del Staff API para apuntar a estos logins en vez de a `postgres`.
do $$ begin
  create role kardo_customer_api_runtime login noinherit nosuperuser nobypassrls
    nocreatedb nocreaterole noreplication;
exception when duplicate_object then null;
end $$;

grant kardo_customer_api to kardo_customer_api_runtime;

do $$ begin
  create role kardo_staff_api_runtime login noinherit nosuperuser nobypassrls
    nocreatedb nocreaterole noreplication;
exception when duplicate_object then null;
end $$;

grant kardo_staff_api to kardo_staff_api_runtime;

-- No revocamos todavia `grant kardo_customer_api to postgres;`
-- (20260914182509_grant_customer_api_runtime_role.sql): el entorno actual
-- sigue conectando como `postgres`. Una vez ambos servicios usen los logins
-- de arriba y las credenciales de `postgres` como conexion de aplicacion se
-- hayan rotado, revocar explicitamente:
--   revoke kardo_customer_api from postgres;
--   revoke kardo_staff_api from postgres; -- si el Staff API tambien migra
