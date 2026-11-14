# Postgres local para probar migraciones

Antes de aplicar una migración en kardo-dev, pruébala aquí junto con todas las anteriores, en orden. Así se probaron las de Links (2026-10-04).

## Una vez

Homebrew trae `postgresql@15`, que sirve. Crea un clúster propio en una carpeta temporal y arráncalo solo por TCP en 127.0.0.1. Usa un puerto libre que no choque con nadie, por ejemplo 55435:

```sh
PG=/opt/homebrew/opt/postgresql@15/bin
$PG/initdb -D /tmp/kardo-pg -U postgres --auth=trust
$PG/pg_ctl -D /tmp/kardo-pg -o "-p 55435 -k '' -c listen_addresses=127.0.0.1" -l /tmp/kardo-pg.log start
```

## Cada vez

```sh
scripts/dev/local-postgres/apply-all.sh 55435
```

Borra y vuelve a crear la base `kardo`, carga `stubs.sql` y aplica cada archivo de `supabase/migrations/` en orden.
- `stubs.sql` imita lo que Supabase ya trae: roles, `auth.users`, `auth.uid()`, `cron.*`, `net.*` y los factores de 2FA.
- `stubs-sessions.sql` agrega `auth.sessions` antes de la migración que la usa.

Si una migración falla, el script dice cuál y muestra el error.

Después prueba tus escenarios con `psql -h 127.0.0.1 -p 55435 -U postgres -d kardo`. Para actuar como el API:

```sql
set role kardo_customer_api;
select set_config('kardo.subject', '<uuid del usuario>', true);
```

## Límites

- `supabase/tests/schema_contract.sql` revisa `cron.job` y aquí no existe. Córrelo contra kardo-dev después de aplicar la migración.
- No hay `pg_cron` ni `pg_net` reales: lo que dependa de ellos solo se prueba en kardo-dev.
