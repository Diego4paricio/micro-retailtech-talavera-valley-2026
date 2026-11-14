-- Source of truth for an empty Kardo environment. Application data is not
-- exposed through PostgREST: Customer API and Staff API are the only callers.
create extension if not exists pgcrypto;

create schema if not exists kardo_core;
create schema if not exists kardo_staff;
create schema if not exists kardo_audit;
create schema if not exists private;
revoke all on schema public, kardo_core, kardo_staff, kardo_audit, private from public;
revoke all on schema kardo_core, kardo_staff, kardo_audit from anon, authenticated;

do $$ begin create role kardo_customer_api nologin noinherit nobypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role kardo_staff_api nologin noinherit nobypassrls; exception when duplicate_object then null; end $$;

create type kardo_core.workspace_kind as enum ('personal', 'organization');
create type kardo_core.membership_role as enum ('owner', 'admin', 'editor', 'viewer');
create type kardo_core.touchpoint_status as enum ('prepared', 'available', 'assigned', 'active', 'paused', 'lost', 'replaced', 'retired');
create type kardo_core.experience_type as enum ('redirect', 'links', 'profile', 'image', 'document', 'page', 'promotion', 'menu', 'catalog', 'form');
create type kardo_core.publication_status as enum ('pending', 'processing', 'published', 'failed', 'superseded');
create type kardo_staff.staff_status as enum ('invited', 'active', 'suspended', 'revoked');

create table kardo_core.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text check (char_length(display_name) <= 120), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table kardo_core.workspaces (
  id uuid primary key default gen_random_uuid(), public_id text not null unique check (public_id ~ '^[A-Za-z0-9_-]{16,32}$'),
  kind kardo_core.workspace_kind not null, name text not null check (char_length(name) between 1 and 120), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table kardo_core.workspace_memberships (
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade, profile_id uuid not null references kardo_core.profiles(id) on delete cascade,
  role kardo_core.membership_role not null, created_at timestamptz not null default now(), primary key (workspace_id, profile_id)
);
create table kardo_core.plans (
  id uuid primary key default gen_random_uuid(), code text not null unique check (code ~ '^[a-z0-9_-]{2,64}$'), name text not null,
  is_active boolean not null default true, created_at timestamptz not null default now()
);
create table kardo_core.plan_entitlements (
  plan_id uuid not null references kardo_core.plans(id) on delete cascade, key text not null check (key ~ '^[a-z0-9_.-]{2,128}$'), value jsonb not null, primary key (plan_id, key)
);
create table kardo_core.workspace_plans (
  workspace_id uuid primary key references kardo_core.workspaces(id) on delete cascade, plan_id uuid not null references kardo_core.plans(id),
  assigned_at timestamptz not null default now(), assigned_by uuid references kardo_core.profiles(id)
);
create table kardo_core.touchpoints (
  id uuid primary key default gen_random_uuid(), public_id text not null unique check (public_id ~ '^[A-Za-z0-9_-]{16,32}$'), workspace_id uuid references kardo_core.workspaces(id) on delete restrict,
  status kardo_core.touchpoint_status not null default 'prepared', physical_type text not null check (physical_type in ('card', 'label', 'other')),
  operational_name text check (char_length(operational_name) <= 120), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((status in ('prepared', 'available') and workspace_id is null) or (status not in ('prepared', 'available') and workspace_id is not null))
);
create table kardo_core.touchpoint_activations (
  id uuid primary key default gen_random_uuid(), touchpoint_id uuid not null unique references kardo_core.touchpoints(id) on delete cascade,
  claim_secret_hash text not null unique, expires_at timestamptz, claimed_at timestamptz, claimed_by uuid references kardo_core.profiles(id), created_at timestamptz not null default now(),
  check ((claimed_at is null) = (claimed_by is null))
);
create table kardo_core.experiences (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade, type kardo_core.experience_type not null,
  name text not null check (char_length(name) between 1 and 120), draft_content jsonb not null default '{}'::jsonb, archived_at timestamptz,
  created_by uuid not null references kardo_core.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table kardo_core.experience_versions (
  id uuid primary key default gen_random_uuid(), experience_id uuid not null references kardo_core.experiences(id) on delete restrict, revision integer not null check (revision > 0),
  content jsonb not null, created_by uuid not null references kardo_core.profiles(id), created_at timestamptz not null default now(), unique (experience_id, revision)
);
create table kardo_core.publications (
  id uuid primary key default gen_random_uuid(), touchpoint_id uuid not null references kardo_core.touchpoints(id) on delete restrict,
  experience_version_id uuid not null references kardo_core.experience_versions(id) on delete restrict, revision integer not null check (revision > 0),
  status kardo_core.publication_status not null default 'pending', idempotency_key uuid not null unique, published_at timestamptz, superseded_at timestamptz,
  created_by uuid not null references kardo_core.profiles(id), created_at timestamptz not null default now(), unique (touchpoint_id, revision), check ((status = 'published') = (published_at is not null))
);
create unique index publications_one_active_per_touchpoint on kardo_core.publications (touchpoint_id) where status = 'published' and superseded_at is null;
create table kardo_core.publication_jobs (
  id uuid primary key default gen_random_uuid(), publication_id uuid not null references kardo_core.publications(id) on delete cascade, idempotency_key uuid not null unique,
  status text not null check (status in ('pending', 'running', 'succeeded', 'failed')), attempts integer not null default 0 check (attempts >= 0), last_error text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table kardo_core.assets (
  id uuid primary key default gen_random_uuid(), workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade, storage_key text not null unique,
  original_filename text not null check (char_length(original_filename) <= 255), media_type text not null check (char_length(media_type) <= 128), byte_size bigint not null check (byte_size >= 0),
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'), status text not null check (status in ('quarantined', 'validated', 'rejected', 'published')),
  created_by uuid not null references kardo_core.profiles(id), created_at timestamptz not null default now()
);

create table kardo_staff.staff_profiles (
  id uuid primary key references auth.users(id) on delete restrict, status kardo_staff.staff_status not null default 'invited',
  display_name text check (char_length(display_name) <= 120), created_at timestamptz not null default now(), updated_at timestamptz not null default now(), revoked_at timestamptz
);
create table kardo_staff.roles (
  id uuid primary key default gen_random_uuid(), code text not null unique check (code ~ '^[a-z0-9_-]{2,64}$'), name text not null check (char_length(name) between 1 and 120), created_at timestamptz not null default now()
);
create table kardo_staff.permissions (
  role_id uuid not null references kardo_staff.roles(id) on delete cascade, permission text not null check (permission ~ '^[a-z0-9_.-]{2,128}$'), primary key (role_id, permission)
);
create table kardo_staff.role_assignments (
  staff_id uuid not null references kardo_staff.staff_profiles(id) on delete cascade, role_id uuid not null references kardo_staff.roles(id) on delete restrict,
  assigned_by uuid references kardo_staff.staff_profiles(id) on delete set null, assigned_at timestamptz not null default now(), primary key (staff_id, role_id)
);
create table kardo_audit.events (
  id uuid primary key default gen_random_uuid(), workspace_id uuid references kardo_core.workspaces(id) on delete restrict, actor_subject uuid references auth.users(id) on delete set null,
  actor_type text not null check (actor_type in ('customer', 'staff', 'service')), action text not null check (char_length(action) <= 128), target_type text not null check (char_length(target_type) <= 128),
  target_id uuid, request_id uuid, result text not null check (result in ('succeeded', 'denied', 'failed')), reason text check (char_length(reason) <= 500), metadata jsonb not null default '{}'::jsonb, occurred_at timestamptz not null default now()
);

create index touchpoints_workspace_id_idx on kardo_core.touchpoints (workspace_id);
create index experiences_workspace_id_idx on kardo_core.experiences (workspace_id);
create index assets_workspace_id_idx on kardo_core.assets (workspace_id);
create index audit_events_workspace_time_idx on kardo_audit.events (workspace_id, occurred_at desc);

create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from kardo_core.workspace_memberships membership where membership.workspace_id = target_workspace_id and membership.profile_id = (select auth.uid()));
$$;
revoke all on function private.is_workspace_member(uuid) from public;

alter table kardo_core.profiles enable row level security;
alter table kardo_core.workspaces enable row level security;
alter table kardo_core.workspace_memberships enable row level security;
alter table kardo_core.plans enable row level security;
alter table kardo_core.plan_entitlements enable row level security;
alter table kardo_core.workspace_plans enable row level security;
alter table kardo_core.touchpoints enable row level security;
alter table kardo_core.touchpoint_activations enable row level security;
alter table kardo_core.experiences enable row level security;
alter table kardo_core.experience_versions enable row level security;
alter table kardo_core.publications enable row level security;
alter table kardo_core.publication_jobs enable row level security;
alter table kardo_core.assets enable row level security;
alter table kardo_staff.staff_profiles enable row level security;
alter table kardo_staff.roles enable row level security;
alter table kardo_staff.permissions enable row level security;
alter table kardo_staff.role_assignments enable row level security;
alter table kardo_audit.events enable row level security;

-- Defence in depth for any future deliberate direct access. Browser roles have no grants today.
create policy "profiles read self" on kardo_core.profiles for select to authenticated using ((select auth.uid()) = id);
create policy "workspaces read membership" on kardo_core.workspaces for select to authenticated using (private.is_workspace_member(id));
create policy "memberships read workspace" on kardo_core.workspace_memberships for select to authenticated using (private.is_workspace_member(workspace_id));
create policy "touchpoints read workspace" on kardo_core.touchpoints for select to authenticated using (private.is_workspace_member(workspace_id));
create policy "experiences read workspace" on kardo_core.experiences for select to authenticated using (private.is_workspace_member(workspace_id));
create policy "assets read workspace" on kardo_core.assets for select to authenticated using (private.is_workspace_member(workspace_id));

grant usage on schema kardo_core to kardo_customer_api, kardo_staff_api;
grant usage on schema kardo_staff, kardo_audit to kardo_staff_api;
grant select, insert, update, delete on all tables in schema kardo_core to kardo_customer_api;
grant select on kardo_core.workspaces, kardo_core.touchpoints, kardo_core.experiences, kardo_core.publications to kardo_staff_api;
grant select on all tables in schema kardo_staff to kardo_staff_api;
grant insert on kardo_audit.events to kardo_customer_api, kardo_staff_api;
alter default privileges in schema kardo_core revoke all on tables from public, anon, authenticated;
alter default privileges in schema kardo_staff revoke all on tables from public, anon, authenticated;
alter default privileges in schema kardo_audit revoke all on tables from public, anon, authenticated;
