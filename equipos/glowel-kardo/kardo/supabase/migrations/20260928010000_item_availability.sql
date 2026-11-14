-- Disponibilidad (2026-09-28): estado en vivo de los artículos de un Menú o
-- Catálogo: disponible, agotado u oculto, y opcionalmente cuántas piezas
-- quedan. No forma parte del contenido versionado: cambiarlo nunca crea una
-- versión ni pasa por publicar. El Customer API guarda aquí la fuente de
-- verdad y empuja el conjunto completo al Resolver, que lo aplica sobre el
-- snapshot publicado de cada Touchpoint que muestra esa Experience.

-- Orden global de cambios: el Resolver descarta un envío con versión menor o
-- igual a la que ya tiene, así que un reintento tardío nunca pisa un cambio
-- más nuevo.
create sequence if not exists kardo_core.item_availability_version_seq;

create table if not exists kardo_core.item_availability (
  experience_id uuid not null,
  workspace_id uuid not null,
  item_id text not null check (item_id ~ '^[a-zA-Z0-9_-]{1,64}$'),
  status text not null check (status in ('available', 'sold_out', 'hidden')),
  quantity integer check (quantity is null or quantity between 0 and 9999),
  version bigint not null check (version > 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references kardo_core.profiles(id) on delete set null,
  primary key (experience_id, item_id),
  constraint item_availability_experience_fk
    foreign key (experience_id, workspace_id)
    references kardo_core.experiences (id, workspace_id) on delete cascade
);

create index if not exists item_availability_workspace_idx
  on kardo_core.item_availability (workspace_id);
create index if not exists item_availability_updated_by_idx
  on kardo_core.item_availability (updated_by);

alter table kardo_core.item_availability enable row level security;

drop policy if exists "customer api item availability" on kardo_core.item_availability;
create policy "customer api item availability" on kardo_core.item_availability
  for all to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id))
  with check (kardo_private.is_workspace_member(workspace_id));

-- El rol del API nunca mueve un registro a otra Experience u organización:
-- solo cambia el estado, la cantidad y quién/cuándo.
grant select, insert, delete on kardo_core.item_availability to kardo_customer_api;
grant update (status, quantity, version, updated_at, updated_by)
  on kardo_core.item_availability to kardo_customer_api;
grant usage on sequence kardo_core.item_availability_version_seq to kardo_customer_api;
