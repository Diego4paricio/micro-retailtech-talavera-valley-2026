-- MEDIO (audit): kardo_audit.events era append-only solo porque ningun rol
-- tenia GRANT de UPDATE/DELETE. Eso es fragil (basta un GRANT futuro para
-- romperlo en silencio). Un trigger hace el invariante explicito: incluso el
-- propietario de la tabla no puede mutar ni truncar el historial de auditoria.
create or replace function kardo_audit.reject_event_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- `actor_subject` references auth.users ON DELETE SET NULL: deleting an
  -- account must still anonymize its audit trail. That is the only mutation
  -- allowed, and only when every other column stays identical.
  -- Nested so statement-level TRUNCATE never touches OLD/NEW.
  if tg_op = 'UPDATE' then
    if old.actor_subject is not null
      and new.actor_subject is null
      and (to_jsonb(new) - 'actor_subject') = (to_jsonb(old) - 'actor_subject') then
      return new;
    end if;
  end if;
  raise exception using errcode = 'P0001',
    message = 'AUDIT_APPEND_ONLY: kardo_audit.events rows cannot be updated, deleted or truncated';
end;
$$;
revoke all on function kardo_audit.reject_event_mutation() from public;

drop trigger if exists audit_events_append_only on kardo_audit.events;
create trigger audit_events_append_only
  before update or delete on kardo_audit.events
  for each row execute function kardo_audit.reject_event_mutation();

drop trigger if exists audit_events_no_truncate on kardo_audit.events;
create trigger audit_events_no_truncate
  before truncate on kardo_audit.events
  for each statement execute function kardo_audit.reject_event_mutation();
