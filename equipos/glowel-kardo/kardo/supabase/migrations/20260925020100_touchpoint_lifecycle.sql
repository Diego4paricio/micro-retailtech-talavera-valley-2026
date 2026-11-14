-- Ciclo de vida de Touchpoints:
--   * retired: retiro permanente por el cliente (Owner/Admin). Es terminal: el
--     public ID nunca vuelve a servir contenido ni se reutiliza.
--   * suspension: capa independiente que solo Kardo (staff) activa o levanta;
--     el cliente no puede reanudar un Touchpoint suspendido.

alter table kardo_core.touchpoints
  add column if not exists retired_at timestamptz,
  add column if not exists suspended_at timestamptz,
  add column if not exists suspension_reason text,
  add column if not exists suspended_by uuid references kardo_staff.staff_profiles(id) on delete set null;

do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_suspension_consistent
    check ((suspended_at is null) = (suspension_reason is null)
      and (suspension_reason is null or char_length(suspension_reason) between 5 and 500));
exception when duplicate_object then null;
end $$;

update kardo_core.touchpoints set retired_at = coalesce(retired_at, updated_at)
where status = 'retired' and retired_at is null;

do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_retired_consistent
    check ((status = 'retired') = (retired_at is not null)) not valid;
exception when duplicate_object then null;
end $$;
alter table kardo_core.touchpoints validate constraint touchpoints_retired_consistent;

create index if not exists touchpoints_suspended_idx on kardo_core.touchpoints (suspended_at)
  where suspended_at is not null;

-- El retiro es terminal y saca al Touchpoint de su grupo. El trigger escribe
-- retired_at aunque el rol que actualiza no tenga privilegio sobre esa columna
-- (los privilegios de columna solo aplican a la lista SET de la sentencia).
create or replace function kardo_core.enforce_touchpoint_retirement()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'retired' and new.status is distinct from 'retired' then
    raise exception 'TOUCHPOINT_RETIRED' using errcode = 'check_violation';
  end if;
  if new.status = 'retired' and old.status is distinct from 'retired' then
    new.retired_at := now();
    new.group_id := null;
  end if;
  return new;
end;
$$;

drop trigger if exists touchpoints_retirement on kardo_core.touchpoints;
create trigger touchpoints_retirement
  before update on kardo_core.touchpoints
  for each row execute function kardo_core.enforce_touchpoint_retirement();
