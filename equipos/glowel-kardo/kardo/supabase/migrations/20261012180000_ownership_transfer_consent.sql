-- Two-step ownership transfer (security review 2026-10-12, #2). Handing an
-- organization to another person moves it onto their billing account and can
-- open their 14-day overage window (ADR 024), so it must not happen without
-- their consent. The Owner now *requests* a transfer; the recipient accepts or
-- declines. Until then nothing changes. The earlier one-shot transfer (and its
-- "recipient must already be an Admin" guard, 82b8408) is replaced by this.

create table if not exists kardo_core.ownership_transfers (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  from_profile uuid not null references kardo_core.profiles(id) on delete cascade,
  to_profile uuid not null references kardo_core.profiles(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'canceled', 'superseded')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint ownership_transfers_distinct check (from_profile <> to_profile)
);
-- At most one pending transfer per organization.
create unique index if not exists ownership_transfers_one_pending
  on kardo_core.ownership_transfers (workspace_id) where status = 'pending';
create index if not exists ownership_transfers_to_pending_idx
  on kardo_core.ownership_transfers (to_profile) where status = 'pending';

alter table kardo_core.ownership_transfers enable row level security;

-- The recipient sees transfers addressed to them; members of the organization
-- see its pending transfer. Writes go only through the functions below.
drop policy if exists "customer api ownership transfer read" on kardo_core.ownership_transfers;
create policy "customer api ownership transfer read"
  on kardo_core.ownership_transfers for select to kardo_customer_api
  using (
    to_profile = kardo_private.current_customer_subject()
    or kardo_private.is_workspace_member(workspace_id)
  );

grant select on kardo_core.ownership_transfers to kardo_customer_api;

-- The Owner requests the transfer to a member who is already an Admin (someone
-- they deliberately trusted). Supersedes any previous pending request. Returns
-- the new request id. No role or billing change happens here.
create or replace function kardo_private.create_ownership_transfer(
  p_workspace_id uuid,
  p_to_profile uuid
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_kind text;
  v_target_role kardo_core.membership_role;
  v_id uuid;
begin
  if v_subject is null or kardo_private.workspace_role(p_workspace_id) <> 'owner' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  if p_to_profile = v_subject then
    raise exception using errcode = 'P0001', message = 'CANNOT_TRANSFER_TO_SELF';
  end if;
  select kind into v_kind from kardo_core.workspaces where id = p_workspace_id;
  if v_kind is distinct from 'organization' then
    raise exception using errcode = 'P0001', message = 'NOT_AN_ORGANIZATION';
  end if;
  select role into v_target_role
  from kardo_core.workspace_memberships
  where workspace_id = p_workspace_id and profile_id = p_to_profile;
  if v_target_role is null then
    raise exception using errcode = 'P0001', message = 'MEMBER_NOT_FOUND';
  end if;
  if v_target_role <> 'admin' then
    raise exception using errcode = 'P0001', message = 'RECIPIENT_MUST_BE_ADMIN';
  end if;

  update kardo_core.ownership_transfers
  set status = 'superseded', responded_at = now()
  where workspace_id = p_workspace_id and status = 'pending';

  insert into kardo_core.ownership_transfers (workspace_id, from_profile, to_profile)
  values (p_workspace_id, v_subject, p_to_profile)
  returning id into v_id;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    p_workspace_id, v_subject, 'customer', 'workspace.ownership_transfer_requested', 'profile',
    p_to_profile, 'succeeded', '{}'::jsonb
  );
  return v_id;
end;
$$;
revoke all on function kardo_private.create_ownership_transfer(uuid, uuid) from public;
grant execute on function kardo_private.create_ownership_transfer(uuid, uuid) to kardo_customer_api;

-- The Owner who asked (or any current Owner of the organization) cancels a
-- pending request.
create or replace function kardo_private.cancel_ownership_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_transfer kardo_core.ownership_transfers;
begin
  select * into v_transfer from kardo_core.ownership_transfers
  where id = p_transfer_id for update;
  if v_transfer.id is null or v_transfer.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if v_subject is null or kardo_private.workspace_role(v_transfer.workspace_id) <> 'owner' then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  update kardo_core.ownership_transfers
  set status = 'canceled', responded_at = now() where id = p_transfer_id;
  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    v_transfer.workspace_id, v_subject, 'customer', 'workspace.ownership_transfer_canceled',
    'profile', v_transfer.to_profile, 'succeeded', '{}'::jsonb
  );
end;
$$;
revoke all on function kardo_private.cancel_ownership_transfer(uuid) from public;
grant execute on function kardo_private.cancel_ownership_transfer(uuid) to kardo_customer_api;

-- The recipient declines.
create or replace function kardo_private.decline_ownership_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_transfer kardo_core.ownership_transfers;
begin
  select * into v_transfer from kardo_core.ownership_transfers
  where id = p_transfer_id for update;
  if v_transfer.id is null or v_transfer.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if v_subject is null or v_transfer.to_profile <> v_subject then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  update kardo_core.ownership_transfers
  set status = 'declined', responded_at = now() where id = p_transfer_id;
  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    v_transfer.workspace_id, v_subject, 'customer', 'workspace.ownership_transfer_declined',
    'profile', v_transfer.from_profile, 'succeeded', '{}'::jsonb
  );
end;
$$;
revoke all on function kardo_private.decline_ownership_transfer(uuid) from public;
grant execute on function kardo_private.decline_ownership_transfer(uuid) to kardo_customer_api;

-- The recipient accepts: becomes Owner, the organization moves onto their
-- billing account, and the old Owner becomes Admin — the same effect the old
-- one-shot transfer had, but now with consent. The recipient is promoted to
-- Owner first so that `move_workspace_to_owner` (which authorizes a current
-- Owner of the organization) runs with the billing logic unchanged.
create or replace function kardo_private.accept_ownership_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_transfer kardo_core.ownership_transfers;
begin
  select * into v_transfer from kardo_core.ownership_transfers
  where id = p_transfer_id for update;
  if v_transfer.id is null or v_transfer.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if v_subject is null or v_transfer.to_profile <> v_subject then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  -- The recipient must still be a member (any role) to receive it.
  if not exists (
    select 1 from kardo_core.workspace_memberships
    where workspace_id = v_transfer.workspace_id and profile_id = v_subject
  ) then
    raise exception using errcode = 'P0001', message = 'MEMBER_NOT_FOUND';
  end if;

  -- Promote the recipient to Owner (two Owners for a moment), so the billing
  -- move authorizes them as a current Owner.
  update kardo_core.workspace_memberships
  set role = 'owner'
  where workspace_id = v_transfer.workspace_id and profile_id = v_subject;

  perform kardo_billing.move_workspace_to_owner(v_transfer.workspace_id, v_subject);

  -- The old Owner steps down to Admin (there are two Owners, so the
  -- last-owner guard does not fire).
  update kardo_core.workspace_memberships
  set role = 'admin'
  where workspace_id = v_transfer.workspace_id
    and profile_id = v_transfer.from_profile
    and role = 'owner';

  update kardo_core.ownership_transfers
  set status = 'accepted', responded_at = now() where id = p_transfer_id;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, metadata
  ) values (
    v_transfer.workspace_id, v_subject, 'customer', 'workspace.ownership_transferred',
    'profile', v_transfer.from_profile, 'succeeded',
    jsonb_build_object('viaConsent', true)
  );
end;
$$;
revoke all on function kardo_private.accept_ownership_transfer(uuid) from public;
grant execute on function kardo_private.accept_ownership_transfer(uuid) to kardo_customer_api;
