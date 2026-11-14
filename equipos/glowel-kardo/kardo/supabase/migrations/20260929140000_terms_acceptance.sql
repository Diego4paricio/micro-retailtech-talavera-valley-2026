-- Aceptacion de Terminos y Aviso de Privacidad (clickwrap) con evidencia.
--
-- Codigo de Comercio arts. 89 y ss. y LFPC: la aceptacion electronica vale si
-- se puede demostrar quien acepto, que version y cuando. La hora es del
-- servidor (nunca del navegador) y cada aceptacion queda en la auditoria en
-- la misma transaccion. El Customer API ya no puede escribir estas columnas
-- directamente: solo por kardo_private.accept_legal_terms().

alter table kardo_core.profiles
  add column if not exists terms_accepted_at timestamptz,
  add column if not exists terms_version text,
  add column if not exists privacy_version text;

do $$ begin
  alter table kardo_core.profiles
    add constraint profiles_legal_versions_format check (
      (terms_version is null or terms_version ~ '^[0-9]{1,3}\.[0-9]{1,3}$')
      and (privacy_version is null or privacy_version ~ '^[0-9]{1,3}\.[0-9]{1,3}$')
    );
exception when duplicate_object then null;
end $$;

-- Antes el rol del API podia actualizar cualquier columna del propio perfil.
-- Ahora solo las que edita el panel.
revoke update on kardo_core.profiles from kardo_customer_api;
grant update (display_name, updated_at) on kardo_core.profiles to kardo_customer_api;

create or replace function kardo_private.accept_legal_terms(
  p_terms_version text,
  p_privacy_version text
) returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_at timestamptz := now();
begin
  if v_subject is null then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_terms_version is null or p_terms_version !~ '^[0-9]{1,3}\.[0-9]{1,3}$'
    or p_privacy_version is null or p_privacy_version !~ '^[0-9]{1,3}\.[0-9]{1,3}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_LEGAL_VERSION';
  end if;

  update kardo_core.profiles
  set terms_accepted_at = v_at,
      terms_version = p_terms_version,
      privacy_version = p_privacy_version,
      updated_at = v_at
  where id = v_subject;
  if not found then
    raise exception using errcode = 'P0001', message = 'PROFILE_NOT_FOUND';
  end if;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    null, v_subject, 'customer', 'account.terms_accepted', 'profile', v_subject, 'succeeded',
    jsonb_build_object('termsVersion', p_terms_version, 'privacyVersion', p_privacy_version)
  );

  return v_at;
end;
$$;
revoke all on function kardo_private.accept_legal_terms(text, text) from public;
grant execute on function kardo_private.accept_legal_terms(text, text) to kardo_customer_api;
