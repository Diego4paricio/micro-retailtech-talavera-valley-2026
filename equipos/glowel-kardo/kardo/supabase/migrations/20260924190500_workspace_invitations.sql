-- Invitaciones de workspace: la fila guarda solo el hash (sha256 hex) del
-- token; el token en claro se devuelve una unica vez al invitador (ver
-- CreatedInvitationSchema en packages/contracts) y nunca se persiste.
create table if not exists kardo_core.workspace_invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  email text not null check (email = lower(email) and char_length(email) between 3 and 320),
  role kardo_core.membership_role not null check (role <> 'owner'),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  -- Nullable + SET NULL so deleting an account is never blocked by history.
  invited_by uuid references kardo_core.profiles(id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  accepted_by uuid references kardo_core.profiles(id) on delete set null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sola invitacion pendiente por (workspace, email) a la vez; una nueva
-- invitacion tras expirar/revocar/aceptar la anterior es un status distinto.
create unique index if not exists workspace_invitations_pending_unique
  on kardo_core.workspace_invitations (workspace_id, email)
  where status = 'pending';

create index if not exists workspace_invitations_workspace_id_idx
  on kardo_core.workspace_invitations (workspace_id);
create index if not exists workspace_invitations_invited_by_idx
  on kardo_core.workspace_invitations (invited_by);
create index if not exists workspace_invitations_accepted_by_idx
  on kardo_core.workspace_invitations (accepted_by);

alter table kardo_core.workspace_invitations enable row level security;
-- Las politicas para kardo_customer_api se agregan en
-- 20260924190700_customer_rls_membership.sql, junto con el resto del
-- endurecimiento de RLS.
