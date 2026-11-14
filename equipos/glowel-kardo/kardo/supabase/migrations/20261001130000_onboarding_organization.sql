-- El alta crea una organizacion (decision del dueno, 2026-10-01; relevo 20,
-- T3). Hasta hoy el negocio del alta era el espacio personal renombrado, que
-- no admite equipo, invitaciones ni perfil de negocio: para tener equipo
-- habia que crear otra organizacion, sin prueba y con otro plan, aunque los
-- planes venden 3 / 10 / 30 miembros. Ahora el alta (y "Crear mi propio
-- negocio") convierte ese espacio en organizacion con el mismo plan.

-- Un espacio solo pasa de personal a organizacion, nunca de regreso.
create or replace function kardo_core.enforce_workspace_kind()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.kind is distinct from old.kind
    and not (old.kind = 'personal' and new.kind = 'organization') then
    raise exception using errcode = 'P0001', message = 'WORKSPACE_KIND_LOCKED';
  end if;
  return new;
end;
$$;
revoke all on function kardo_core.enforce_workspace_kind() from public;

drop trigger if exists workspaces_kind_change on kardo_core.workspaces;
create trigger workspaces_kind_change
  before update of kind on kardo_core.workspaces
  for each row execute function kardo_core.enforce_workspace_kind();

-- Los negocios que ya existen: espacios personales que hicieron el alta o
-- que ya tienen prueba, suscripcion, cortesia o marca interna.
update kardo_core.workspaces w
set kind = 'organization', updated_at = now()
where w.kind = 'personal'
  and w.deleted_at is null
  and (
    exists (
      select 1 from kardo_audit.events e
      where e.workspace_id = w.id and e.action = 'workspace.onboarded'
    )
    or exists (select 1 from kardo_billing.trials t where t.workspace_id = w.id)
    or exists (select 1 from kardo_billing.subscriptions s where s.workspace_id = w.id)
    or exists (select 1 from kardo_core.workspace_plans p where p.workspace_id = w.id)
    or exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)
  );
