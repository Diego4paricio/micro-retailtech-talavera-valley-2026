-- Estudio de Experiences, IA de Kardo (relevo 29, decisión del dueño del
-- 2026-10-03): una generación sigue en el servidor aunque el cliente recargue
-- o cierre el Estudio, y lo que estaba mostrando (las 3 ideas o el diseño)
-- lo espera aquí al volver. Una fila por Experience (la última sesión),
-- compartida por quienes pueden editarla, que vence a los 7 días.
--
-- No guarda nada que no esté ya en la Experience o en su biblioteca: la
-- descripción que el cliente escribió para la IA, las ideas y el diseño que
-- la IA propuso (sin aplicar). El costo y el conteo siguen donde estaban
-- (`kardo_audit.events` y `kardo_core.custom_html_ai_usage`).

create table if not exists kardo_core.design_ai_sessions (
  experience_id uuid primary key,
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  started_by uuid references kardo_core.profiles(id) on delete set null,
  -- La generación que escribe esta fila. Una generación más nueva (o
  -- cancelar) la cambia, y la anterior ya no puede escribir su resultado.
  job_id uuid,
  step text not null check (step in ('ideas', 'design')),
  status text not null check (status in ('running', 'ready', 'failed')),
  brief jsonb not null,
  photo_mode text not null default 'auto' check (photo_mode in ('auto', 'with', 'without')),
  refine_current boolean not null default false,
  progress jsonb,
  concepts jsonb,
  concept jsonb,
  generation jsonb,
  error_code text check (error_code is null or char_length(error_code) <= 64),
  started_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  constraint design_ai_sessions_experience_fkey
    foreign key (experience_id, workspace_id)
    references kardo_core.experiences(id, workspace_id) on delete cascade,
  -- Un diseño completo cabe en 64 mil caracteres (DESIGN_LIMITS.bytes); el
  -- tope de la fila deja espacio para las ideas y la descripción.
  constraint design_ai_sessions_size check (
    pg_column_size(brief) + coalesce(pg_column_size(concepts), 0)
      + coalesce(pg_column_size(concept), 0)
      + coalesce(pg_column_size(generation), 0) <= 262144
  )
);

create index if not exists design_ai_sessions_workspace_idx
  on kardo_core.design_ai_sessions (workspace_id);
create index if not exists design_ai_sessions_expires_idx
  on kardo_core.design_ai_sessions (expires_at);

alter table kardo_core.design_ai_sessions enable row level security;

drop policy if exists "customer api design ai sessions" on kardo_core.design_ai_sessions;
create policy "customer api design ai sessions" on kardo_core.design_ai_sessions
  for all to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id))
  with check (kardo_private.is_workspace_member(workspace_id));

-- Una sesión nunca cambia de Experience ni de organización: el API solo
-- actualiza su contenido.
grant select, insert, delete on kardo_core.design_ai_sessions to kardo_customer_api;
grant update (
  started_by, job_id, step, status, brief, photo_mode, refine_current,
  progress, concepts, concept, generation, error_code, started_at,
  updated_at, expires_at
) on kardo_core.design_ai_sessions to kardo_customer_api;
