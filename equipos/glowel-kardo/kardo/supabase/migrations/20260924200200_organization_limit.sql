-- Limite de negocio: un usuario puede ser owner de a lo sumo 3 workspaces de
-- tipo 'organization' (los personales no cuentan). Redefine la funcion
-- completa (mismo nombre/firma, create or replace conserva los grants ya
-- otorgados en 20260924190700) para anadir el chequeo y, de paso, mover la
-- validacion de nombre/public_id que antes dependia solo de los CHECK de la
-- tabla a un error explicito antes de tocar el lock.
create or replace function kardo_core.create_organization_workspace(
  p_subject uuid,
  p_name text,
  p_public_id text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := btrim(p_name);
  v_owned_organizations integer;
  v_workspace_id uuid;
begin
  if p_subject is null or p_subject is distinct from kardo_private.current_customer_subject() then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if v_name is null or char_length(v_name) < 1 or char_length(v_name) > 120 then
    raise exception using errcode = 'P0001', message = 'INVALID_NAME';
  end if;

  if p_public_id is null or p_public_id !~ '^[A-Za-z0-9_-]{16,32}$' then
    raise exception using errcode = 'P0001', message = 'INVALID_PUBLIC_ID';
  end if;

  -- Serializa por sujeto: dos solicitudes concurrentes del mismo usuario no
  -- pueden colarse ambas bajo el limite leyendo el mismo conteo "viejo". El
  -- lock es transaccional (se libera solo al terminar la transaccion, con
  -- commit o rollback), no hace falta liberarlo a mano.
  perform pg_advisory_xact_lock(hashtextextended(p_subject::text, 0));

  select count(*) into v_owned_organizations
  from kardo_core.workspace_memberships membership
  join kardo_core.workspaces workspace on workspace.id = membership.workspace_id
  where membership.profile_id = p_subject
    and membership.role = 'owner'
    and workspace.kind = 'organization';

  if v_owned_organizations >= 3 then
    raise exception using errcode = 'P0001', message = 'ORGANIZATION_LIMIT';
  end if;

  insert into kardo_core.workspaces (id, public_id, kind, name)
  values (gen_random_uuid(), p_public_id, 'organization', v_name)
  returning id into v_workspace_id;

  insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
  values (v_workspace_id, p_subject, 'owner');

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result
  ) values (
    v_workspace_id, p_subject, 'customer', 'workspace.created', 'workspace', v_workspace_id, 'succeeded'
  );

  return v_workspace_id;
end;
$$;
revoke all on function kardo_core.create_organization_workspace(uuid, text, text) from public;
grant execute on function kardo_core.create_organization_workspace(uuid, text, text) to kardo_customer_api;
