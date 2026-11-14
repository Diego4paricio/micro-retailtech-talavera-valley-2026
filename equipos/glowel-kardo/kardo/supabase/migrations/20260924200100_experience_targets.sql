-- Una Experience puede aplicarse a varios touchpoints y/o grupos. Cada fila
-- es exactamente un destino: un touchpoint o un grupo, nunca ambos ni
-- ninguno (CHECK num_nonnulls). experiences.touchpoint_id (columna legada)
-- deja de ser la unica fuente de verdad; a partir de ahora es solo el
-- destino "original" de cuando una experience tenia un unico touchpoint.
create table if not exists kardo_core.experience_targets (
  id uuid primary key default gen_random_uuid(),
  experience_id uuid not null references kardo_core.experiences(id) on delete cascade,
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  touchpoint_id uuid,
  group_id uuid,
  created_at timestamptz not null default now(),
  check (num_nonnulls(touchpoint_id, group_id) = 1)
);

-- Columnas (id, workspace_id) unicas para poder referenciarlas desde FKs
-- compuestas que fijan el mismo workspace en ambos extremos. No cambian
-- ningun comportamiento existente: id ya es PK por si solo en ambas tablas.
do $$ begin
  alter table kardo_core.touchpoints
    add constraint touchpoints_id_workspace_id_key unique (id, workspace_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table kardo_core.experiences
    add constraint experiences_id_workspace_id_key unique (id, workspace_id);
exception when duplicate_object then null;
end $$;

-- Match simple: exactamente una de estas dos FKs compuestas se evalua de
-- verdad por fila (la otra columna es null y la satisface trivialmente),
-- gracias al CHECK num_nonnulls de arriba. La tercera FK (experience_id,
-- workspace_id) es la que garantiza que el workspace_id declarado en la fila
-- coincide con el workspace real de la experience -- no basta con la FK
-- simple a experiences(id), que no dice nada sobre el workspace.
do $$ begin
  alter table kardo_core.experience_targets
    add constraint experience_targets_experience_workspace_fkey
    foreign key (experience_id, workspace_id)
    references kardo_core.experiences (id, workspace_id)
    on delete cascade;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table kardo_core.experience_targets
    add constraint experience_targets_touchpoint_workspace_fkey
    foreign key (touchpoint_id, workspace_id)
    references kardo_core.touchpoints (id, workspace_id)
    on delete cascade;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table kardo_core.experience_targets
    add constraint experience_targets_group_workspace_fkey
    foreign key (group_id, workspace_id)
    references kardo_core.touchpoint_groups (id, workspace_id)
    on delete cascade;
exception when duplicate_object then null;
end $$;

create unique index if not exists experience_targets_touchpoint_unique
  on kardo_core.experience_targets (experience_id, touchpoint_id)
  where touchpoint_id is not null;
create unique index if not exists experience_targets_group_unique
  on kardo_core.experience_targets (experience_id, group_id)
  where group_id is not null;
create index if not exists experience_targets_touchpoint_id_idx
  on kardo_core.experience_targets (touchpoint_id);
create index if not exists experience_targets_group_id_idx
  on kardo_core.experience_targets (group_id);
create index if not exists experience_targets_workspace_id_idx
  on kardo_core.experience_targets (workspace_id);

-- Backfill idempotente: toda experience existente con touchpoint_id ya
-- asignado obtiene su target explicito equivalente.
insert into kardo_core.experience_targets (experience_id, workspace_id, touchpoint_id)
select experience.id, experience.workspace_id, experience.touchpoint_id
from kardo_core.experiences experience
where experience.touchpoint_id is not null
  and not exists (
    select 1
    from kardo_core.experience_targets target
    where target.experience_id = experience.id
      and target.touchpoint_id = experience.touchpoint_id
  );

comment on column kardo_core.experiences.touchpoint_id is
  'Legado: unico touchpoint destino de cuando una experience solo podia apuntar a uno. La lista completa y actual de destinos (touchpoints y/o grupos) vive en kardo_core.experience_targets.';

alter table kardo_core.experience_targets enable row level security;

-- Mismo criterio que touchpoint_groups: lectura para cualquier miembro,
-- escritura para cualquier rol que no sea viewer. El Publisher sigue
-- publicando por touchpoint individual (kardo_core.publications.touchpoint_id)
-- y no necesita leer esta tabla.
create policy "customer api experience targets select" on kardo_core.experience_targets
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));
create policy "customer api experience targets insert" on kardo_core.experience_targets
  for insert to kardo_customer_api
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
create policy "customer api experience targets update" on kardo_core.experience_targets
  for update to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'))
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));
create policy "customer api experience targets delete" on kardo_core.experience_targets
  for delete to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin', 'editor'));

grant select, insert, update, delete on kardo_core.experience_targets to kardo_customer_api;

-- publication_requests: idempotencia para "publicar esta version hacia N
-- touchpoints destino" en una sola operacion logica, que crea N filas en
-- kardo_core.publications (una por touchpoint) con la misma
-- experience_version_id. El Publisher sigue trabajando fila a fila sobre
-- publications/publication_jobs y no necesita conocer esta tabla.
create table if not exists kardo_core.publication_requests (
  idempotency_key uuid primary key,
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  experience_id uuid not null references kardo_core.experiences(id) on delete cascade,
  experience_version_id uuid not null references kardo_core.experience_versions(id) on delete restrict,
  created_by uuid not null references kardo_core.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists publication_requests_workspace_id_idx
  on kardo_core.publication_requests (workspace_id);
create index if not exists publication_requests_experience_id_idx
  on kardo_core.publication_requests (experience_id);

alter table kardo_core.publications
  add column if not exists request_idempotency_key uuid
    references kardo_core.publication_requests (idempotency_key) on delete set null;

create index if not exists publications_request_idempotency_key_idx
  on kardo_core.publications (request_idempotency_key);

alter table kardo_core.publication_requests enable row level security;

create policy "customer api publication requests select" on kardo_core.publication_requests
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));
create policy "customer api publication requests insert" on kardo_core.publication_requests
  for insert to kardo_customer_api
  with check (kardo_private.is_workspace_member(workspace_id));

grant select, insert on kardo_core.publication_requests to kardo_customer_api;
