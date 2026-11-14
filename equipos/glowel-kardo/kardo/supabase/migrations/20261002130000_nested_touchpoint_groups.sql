-- ADR 021: grupos anidados (locales, zonas, mesas). Un grupo puede vivir
-- dentro de otro del mismo workspace, hasta 4 niveles, y es "Local" o
-- "Grupo" (kind: solo cambia como se muestra). `path` guarda la cadena
-- raiz -> grupo (el ultimo elemento es el propio id): "esta en el arbol de G"
-- es `G = any(path)` y la distancia a un ancestro sale de array_position.
-- La mantiene el trigger de abajo; el API nunca la escribe.
--
-- Aditiva: los grupos existentes quedan como raiz con kind = 'group'.

alter table kardo_core.touchpoint_groups
  add column if not exists parent_id uuid,
  add column if not exists kind text not null default 'group',
  add column if not exists path uuid[];

do $$ begin
  alter table kardo_core.touchpoint_groups
    add constraint touchpoint_groups_kind_check
    check (kind in ('location', 'group'));
exception when duplicate_object then null;
end $$;

-- El padre siempre es del mismo workspace (FK compuesta, como la de
-- touchpoints.group_id). Sin ON DELETE: el API mueve los hijos al abuelo antes
-- de borrar un grupo; borrar el workspace completo sigue en cascada porque la
-- verificacion NO ACTION corre al final de la sentencia.
do $$ begin
  alter table kardo_core.touchpoint_groups
    add constraint touchpoint_groups_parent_same_workspace
    foreign key (parent_id, workspace_id)
    references kardo_core.touchpoint_groups (id, workspace_id);
exception when duplicate_object then null;
end $$;

create index if not exists touchpoint_groups_parent_id_idx
  on kardo_core.touchpoint_groups (parent_id) where parent_id is not null;

update kardo_core.touchpoint_groups set path = array[id] where path is null;
alter table kardo_core.touchpoint_groups alter column path set not null;

do $$ begin
  alter table kardo_core.touchpoint_groups
    add constraint touchpoint_groups_path_shape
    check (cardinality(path) between 1 and 4 and path[cardinality(path)] = id);
exception when duplicate_object then null;
end $$;

-- "Todo el arbol de G": path @> array[G].
create index if not exists touchpoint_groups_path_gin
  on kardo_core.touchpoint_groups using gin (path);

-- El nombre es unico entre hermanos (puede haber una "Mesa 1" en cada local).
drop index if exists kardo_core.touchpoint_groups_workspace_name_unique;
create unique index if not exists touchpoint_groups_sibling_name_unique
  on kardo_core.touchpoint_groups (
    workspace_id,
    coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid),
    lower(name)
  );

-- Calcula `path` desde el padre en cada insert/update (tambien cuando solo
-- cambia el nombre: asi nadie puede escribir un path a mano). Rechaza ciclos
-- y mas de 4 niveles. Corre con los permisos de quien escribe, bajo su RLS.
create or replace function kardo_core.touchpoint_group_path()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  parent_path uuid[];
begin
  if new.parent_id is null then
    new.path := array[new.id];
  else
    select g.path into parent_path
    from kardo_core.touchpoint_groups g
    where g.id = new.parent_id and g.workspace_id = new.workspace_id;
    if parent_path is null then
      raise exception using errcode = '23503', message = 'GROUP_PARENT_NOT_FOUND';
    end if;
    if new.id = any(parent_path) then
      raise exception using errcode = 'P0001', message = 'GROUP_CYCLE';
    end if;
    new.path := parent_path || new.id;
  end if;
  if cardinality(new.path) > 4 then
    raise exception using errcode = 'P0001', message = 'GROUP_TOO_DEEP';
  end if;
  return new;
end;
$$;
revoke all on function kardo_core.touchpoint_group_path() from public;

drop trigger if exists touchpoint_groups_path on kardo_core.touchpoint_groups;
create trigger touchpoint_groups_path
  before insert or update on kardo_core.touchpoint_groups
  for each row execute function kardo_core.touchpoint_group_path();

-- Cuando cambia el path de un grupo (se movio, o se movio un ancestro), sus
-- hijos lo recalculan: el update toca la fila y el trigger de arriba vuelve a
-- leer el path del padre. La recursion termina en las hojas (4 niveles).
create or replace function kardo_core.touchpoint_group_path_cascade()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update kardo_core.touchpoint_groups child
  set path = child.path
  where child.parent_id = new.id and child.workspace_id = new.workspace_id;
  return null;
end;
$$;
revoke all on function kardo_core.touchpoint_group_path_cascade() from public;

drop trigger if exists touchpoint_groups_path_cascade on kardo_core.touchpoint_groups;
create trigger touchpoint_groups_path_cascade
  after update on kardo_core.touchpoint_groups
  for each row
  when (old.path is distinct from new.path)
  execute function kardo_core.touchpoint_group_path_cascade();
