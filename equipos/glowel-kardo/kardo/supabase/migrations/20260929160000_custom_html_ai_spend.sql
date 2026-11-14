-- Estudio de Experiences, modo HTML (ADR 018, adenda 2026-09-29): tope de
-- gasto diario en USD para "Pídele a la IA de Kardo", encima del cupo por
-- organizacion (kardo_core.custom_html_ai_usage, migracion 20260929010000) y
-- del limite mensual por plan (billing). Un dia es un dia UTC.
--
-- La tabla no tiene ninguna policy ni grant directo para kardo_customer_api:
-- solo se lee y se escribe a traves de las funciones SECURITY DEFINER de
-- kardo_private de abajo, que ya tiene "grant usage on schema kardo_private
-- to kardo_customer_api" desde 20260924190700. Esto obliga a que el Customer
-- API siempre revise el tope antes de llamar al proveedor y solo sume el
-- costo real despues, nunca al reves.

create table if not exists kardo_core.custom_html_ai_spend (
  day date primary key,
  spent_micro_usd bigint not null default 0 check (spent_micro_usd >= 0),
  generations integer not null default 0 check (generations >= 0),
  updated_at timestamptz not null default now()
);

alter table kardo_core.custom_html_ai_spend enable row level security;

-- Sin policies: ni siquiera un select directo desde kardo_customer_api. Las
-- funciones de abajo son SECURITY DEFINER (corren como el dueno de la tabla,
-- que no esta sujeto a RLS) y son la unica puerta de entrada.

create or replace function kardo_private.custom_html_ai_spend_today()
returns bigint
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(
    (
      select spent_micro_usd
      from kardo_core.custom_html_ai_spend
      where day = (now() at time zone 'utc')::date
    ),
    0
  );
$$;
revoke all on function kardo_private.custom_html_ai_spend_today() from public;
grant execute on function kardo_private.custom_html_ai_spend_today() to kardo_customer_api;

create or replace function kardo_private.custom_html_ai_spend_add(
  p_cost_micro_usd bigint
) returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_total bigint;
begin
  if p_cost_micro_usd is null or p_cost_micro_usd < 0 then
    raise exception using errcode = 'P0001', message = 'INVALID_COST';
  end if;

  insert into kardo_core.custom_html_ai_spend (day, spent_micro_usd, generations)
  values ((now() at time zone 'utc')::date, p_cost_micro_usd, 1)
  on conflict (day) do update
    set spent_micro_usd = kardo_core.custom_html_ai_spend.spent_micro_usd + excluded.spent_micro_usd,
        generations = kardo_core.custom_html_ai_spend.generations + 1,
        updated_at = now()
  returning spent_micro_usd into v_total;

  return v_total;
end;
$$;
revoke all on function kardo_private.custom_html_ai_spend_add(bigint) from public;
grant execute on function kardo_private.custom_html_ai_spend_add(bigint) to kardo_customer_api;
