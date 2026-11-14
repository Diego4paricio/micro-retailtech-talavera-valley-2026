-- Cuenta de la persona (ADR 023): preferencias en el servidor, sesiones
-- activas que se pueden cerrar una por una e historial de inicios de sesión
-- de 90 días.

-- ---------------------------------------------------------------------------
-- 1. Preferencias, en el mismo perfil (una fila por persona)
-- ---------------------------------------------------------------------------

alter table kardo_core.profiles
  -- Cómo te saluda Kardo. Nulo = la primera palabra del nombre.
  add column if not exists preferred_name text
    check (preferred_name is null or char_length(btrim(preferred_name)) between 1 and 60),
  -- Zona IANA; el API la valida con Intl. Nulo = la del navegador.
  add column if not exists time_zone text
    check (time_zone is null or time_zone ~ '^[A-Za-z_]+(/[A-Za-z0-9_+-]+){0,2}$'),
  -- h12 = 3:30 p. m.; h23 = 15:30. Nulo = el del idioma.
  add column if not exists hour_cycle text
    check (hour_cycle is null or hour_cycle in ('h12', 'h23')),
  -- Hoy la interfaz solo existe en español de México.
  add column if not exists locale text not null default 'es-MX'
    check (locale in ('es-MX')),
  -- Permiso para recibir novedades de Kardo por correo. Los avisos de
  -- seguridad y de cobro no dependen de esto.
  add column if not exists marketing_emails boolean not null default false,
  add column if not exists marketing_emails_at timestamptz;

grant update (preferred_name, time_zone, hour_cycle, locale, marketing_emails, marketing_emails_at)
  on kardo_core.profiles to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- 2. Estado de la sesión para el Customer API
-- ---------------------------------------------------------------------------

-- Sustituye a customer_requires_second_factor: además dice si la sesión
-- sigue viva, para que cerrar una sesión la corte en el API al instante.
create or replace function kardo_private.customer_session_state(p_subject uuid, p_session uuid)
returns table (session_alive boolean, requires_second_factor boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select
    exists (
      select 1
      from auth.sessions session
      where session.id = p_session
        and session.user_id = p_subject
        and (session.not_after is null or session.not_after > now())
    ),
    exists (
      select 1
      from auth.mfa_factors factor
      where factor.user_id = p_subject
        and factor.status = 'verified'
    );
$$;
revoke all on function kardo_private.customer_session_state(uuid, uuid) from public;
grant execute on function kardo_private.customer_session_state(uuid, uuid) to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- 3. Sesiones activas de la persona (siempre la del contexto del API)
-- ---------------------------------------------------------------------------

create or replace function kardo_private.customer_sessions()
returns table (
  id uuid,
  created_at timestamptz,
  last_active_at timestamptz,
  user_agent text,
  ip text,
  aal text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    session.id,
    session.created_at,
    coalesce(session.refreshed_at::timestamptz, session.updated_at, session.created_at),
    left(session.user_agent, 512),
    host(session.ip),
    session.aal::text
  from auth.sessions session
  where session.user_id = kardo_private.current_customer_subject()
    and (session.not_after is null or session.not_after > now())
  order by 3 desc
  limit 50;
$$;
revoke all on function kardo_private.customer_sessions() from public;
grant execute on function kardo_private.customer_sessions() to kardo_customer_api;

-- Cierra una sesión propia (borrarla invalida su refresh token). Devuelve
-- cuántas cerró: 0 si no era de la persona o ya no existía.
create or replace function kardo_private.customer_revoke_session(p_session uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  delete from auth.sessions session
  where session.id = p_session
    and session.user_id = kardo_private.current_customer_subject();
  get diagnostics closed = row_count;
  return closed;
end;
$$;
revoke all on function kardo_private.customer_revoke_session(uuid) from public;
grant execute on function kardo_private.customer_revoke_session(uuid) to kardo_customer_api;

-- Cierra todas menos la que hace la petición.
create or replace function kardo_private.customer_revoke_other_sessions(p_keep uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  closed integer;
begin
  delete from auth.sessions session
  where session.user_id = kardo_private.current_customer_subject()
    and session.id <> p_keep;
  get diagnostics closed = row_count;
  return closed;
end;
$$;
revoke all on function kardo_private.customer_revoke_other_sessions(uuid) from public;
grant execute on function kardo_private.customer_revoke_other_sessions(uuid) to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- 4. Historial de inicios de sesión (90 días)
-- ---------------------------------------------------------------------------

-- Supabase no deja su bitácora de Auth en la base (auth.audit_log_entries
-- está vacía), así que Kardo anota cada sesión nueva.
create table if not exists kardo_core.account_sign_ins (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references kardo_core.profiles(id) on delete cascade,
  session_id uuid not null,
  signed_in_at timestamptz not null default now(),
  user_agent text check (user_agent is null or char_length(user_agent) <= 512),
  ip inet
);
create index if not exists account_sign_ins_profile_time
  on kardo_core.account_sign_ins (profile_id, signed_in_at desc);

alter table kardo_core.account_sign_ins enable row level security;
revoke all on kardo_core.account_sign_ins from public, anon, authenticated;
grant select on kardo_core.account_sign_ins to kardo_customer_api;

drop policy if exists "customer api own sign-ins" on kardo_core.account_sign_ins;
create policy "customer api own sign-ins" on kardo_core.account_sign_ins
  for select to kardo_customer_api
  using (profile_id = kardo_private.current_customer_subject());

-- Nunca bloquea un inicio de sesión: si anotar falla, se omite.
create or replace function kardo_private.record_customer_sign_in()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  begin
    insert into kardo_core.account_sign_ins (profile_id, session_id, signed_in_at, user_agent, ip)
    select new.user_id, new.id, coalesce(new.created_at, now()), left(new.user_agent, 512), new.ip
    where exists (select 1 from kardo_core.profiles profile where profile.id = new.user_id);
  exception when others then
    null;
  end;
  return new;
end;
$$;
revoke all on function kardo_private.record_customer_sign_in() from public;

drop trigger if exists kardo_record_customer_sign_in on auth.sessions;
create trigger kardo_record_customer_sign_in
  after insert on auth.sessions
  for each row execute function kardo_private.record_customer_sign_in();

create or replace function kardo_private.purge_old_sign_ins()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer;
begin
  delete from kardo_core.account_sign_ins where signed_in_at < now() - interval '90 days';
  get diagnostics purged = row_count;
  return purged;
end;
$$;
revoke all on function kardo_private.purge_old_sign_ins() from public;

select cron.schedule(
  'kardo-purge-old-sign-ins',
  '27 3 * * *',
  'select kardo_private.purge_old_sign_ins()'
);
