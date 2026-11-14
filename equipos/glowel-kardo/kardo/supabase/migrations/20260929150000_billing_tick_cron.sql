-- Tarea horaria de cobro (ADR 019) programada en Supabase, sin Cloud Scheduler.
--
-- pg_cron llama cada hora a una funcion que hace POST al Customer API
-- (/internal/billing/tick) con pg_net: avisos de fin de prueba 7 dias antes
-- (Stripe no los anuncia cuando no hay tarjeta) y reintentos de avisos.
--
-- La URL y la clave viven cifradas en Supabase Vault. Mientras no existan
-- (desarrollo, CI), la funcion no hace nada. Para activarla en produccion:
--   select vault.create_secret('https://<customer-api>/internal/billing/tick', 'kardo_billing_tick_url');
--   select vault.create_secret('<BILLING_CRON_KEY>', 'kardo_billing_cron_key');
-- (el mismo BILLING_CRON_KEY configurado en el Customer API).

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function kardo_private.billing_tick()
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url text;
  v_key text;
begin
  select decrypted_secret into v_url
  from vault.decrypted_secrets where name = 'kardo_billing_tick_url';
  select decrypted_secret into v_key
  from vault.decrypted_secrets where name = 'kardo_billing_cron_key';
  if v_url is null or v_key is null or v_url !~ '^https://' then
    return null;
  end if;
  return net.http_post(
    url := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_key,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;
revoke all on function kardo_private.billing_tick() from public;

-- Minuto 5 de cada hora (evita coincidir con otros trabajos en punto).
select cron.schedule(
  'kardo-billing-tick',
  '5 * * * *',
  'select kardo_private.billing_tick()'
);

-- pg_cron no limpia su historial: conservar solo 14 dias.
select cron.schedule(
  'kardo-cron-history-cleanup',
  '41 4 * * *',
  $cleanup$delete from cron.job_run_details where end_time < now() - interval '14 days'$cleanup$
);
