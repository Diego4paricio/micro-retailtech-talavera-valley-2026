-- Follow-up to 20261012180000 (code review of 3255ddb): accepting an ownership
-- transfer must re-check that the recipient is STILL an Admin, not just any
-- member. Otherwise the Owner could request a transfer to an Admin, later
-- demote that person to Viewer (which does not touch the pending transfer),
-- and they could still accept and become Owner — defeating the
-- "recipient must be an Admin" rule that create_ownership_transfer enforces.
create or replace function kardo_private.accept_ownership_transfer(p_transfer_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_transfer kardo_core.ownership_transfers;
  v_role kardo_core.membership_role;
begin
  select * into v_transfer from kardo_core.ownership_transfers
  where id = p_transfer_id for update;
  if v_transfer.id is null or v_transfer.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'NOT_FOUND';
  end if;
  if v_subject is null or v_transfer.to_profile <> v_subject then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  -- The recipient must still be an Admin at acceptance time (re-checked here,
  -- not only when the request was made): a demotion to Editor/Viewer in the
  -- meantime voids the ability to accept.
  select role into v_role
  from kardo_core.workspace_memberships
  where workspace_id = v_transfer.workspace_id and profile_id = v_subject;
  if v_role is null then
    raise exception using errcode = 'P0001', message = 'MEMBER_NOT_FOUND';
  end if;
  if v_role <> 'admin' then
    raise exception using errcode = 'P0001', message = 'RECIPIENT_MUST_BE_ADMIN';
  end if;

  update kardo_core.workspace_memberships
  set role = 'owner'
  where workspace_id = v_transfer.workspace_id and profile_id = v_subject;

  perform kardo_billing.move_workspace_to_owner(v_transfer.workspace_id, v_subject);

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
