-- Domain audit 2026-10-13 (kardo-a2): Equipo and the copies of each request.
--
-- A2-49: the request emails (name, email, phone and message of a visitor) kept
--   going to a person after they left the team: the recipients were checked
--   only when the settings were saved. The list now drops a person's email in
--   the same transaction that removes them from the organization (or changes
--   their email), and today's stale entries are cleaned once. The Analytics
--   Worker reads the list as is, so nothing has to be redeployed.
-- A2-10: a pending ownership transfer is canceled when its recipient stops
--   being an Admin or leaves, and the recipient hears about a new one in the
--   bell (before, only from inside Equipo of that organization).
-- A2-11: inviting a person who already counts in the plan's pool (a member or
--   a pending invitation of another organization of the same account) no
--   longer takes one more place.

-- ---------------------------------------------------------------------------
-- A2-49: request emails only to current members
-- ---------------------------------------------------------------------------

create or replace function kardo_private.drop_lead_recipient(
  p_workspace_id uuid,
  p_email text
) returns void
language sql
security definer
set search_path = ''
as $$
  update kardo_core.lead_delivery_settings settings
  set notify_recipients = array(
        select recipient from unnest(settings.notify_recipients) as recipient
        where lower(recipient) <> lower(p_email)
      ),
      updated_at = now()
  where settings.workspace_id = p_workspace_id
    and p_email is not null
    and exists (
      select 1 from unnest(settings.notify_recipients) as recipient
      where lower(recipient) = lower(p_email)
    );
$$;
revoke all on function kardo_private.drop_lead_recipient(uuid, text) from public;

create or replace function kardo_private.lead_recipients_on_member_left()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text;
begin
  select email into v_email from kardo_core.profiles where id = old.profile_id;
  perform kardo_private.drop_lead_recipient(old.workspace_id, v_email);
  return old;
end;
$$;
revoke all on function kardo_private.lead_recipients_on_member_left() from public;

drop trigger if exists memberships_drop_lead_recipient on kardo_core.workspace_memberships;
create trigger memberships_drop_lead_recipient
  after delete on kardo_core.workspace_memberships
  for each row execute function kardo_private.lead_recipients_on_member_left();

-- A person who changes their email no longer receives at the old one.
create or replace function kardo_private.lead_recipients_on_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace uuid;
begin
  if old.email is not distinct from new.email or old.email is null then
    return new;
  end if;
  for v_workspace in
    select workspace_id from kardo_core.workspace_memberships
    where profile_id = new.id
  loop
    perform kardo_private.drop_lead_recipient(v_workspace, old.email);
  end loop;
  return new;
end;
$$;
revoke all on function kardo_private.lead_recipients_on_email_change() from public;

drop trigger if exists profiles_drop_old_lead_recipient on kardo_core.profiles;
create trigger profiles_drop_old_lead_recipient
  after update of email on kardo_core.profiles
  for each row execute function kardo_private.lead_recipients_on_email_change();

-- Once: today's recipients that are no longer members of their organization.
update kardo_core.lead_delivery_settings settings
set notify_recipients = array(
      select recipient from unnest(settings.notify_recipients) as recipient
      where exists (
        select 1
        from kardo_core.workspace_memberships membership
        join kardo_core.profiles profile on profile.id = membership.profile_id
        where membership.workspace_id = settings.workspace_id
          and lower(profile.email) = lower(recipient)
      )
    ),
    updated_at = now()
where exists (
  select 1 from unnest(settings.notify_recipients) as recipient
  where not exists (
    select 1
    from kardo_core.workspace_memberships membership
    join kardo_core.profiles profile on profile.id = membership.profile_id
    where membership.workspace_id = settings.workspace_id
      and lower(profile.email) = lower(recipient)
  )
);

-- ---------------------------------------------------------------------------
-- A2-10: ownership transfers follow the recipient's role, and are announced
-- ---------------------------------------------------------------------------

create or replace function kardo_private.cancel_transfer_on_member_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Becoming the Owner is how an accepted transfer ends: not a cancel.
  if tg_op = 'DELETE' or new.role not in ('admin', 'owner') then
    update kardo_core.ownership_transfers
    set status = 'canceled', responded_at = now()
    where workspace_id = old.workspace_id
      and to_profile = old.profile_id
      and status = 'pending';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function kardo_private.cancel_transfer_on_member_change() from public;

drop trigger if exists memberships_cancel_transfer on kardo_core.workspace_memberships;
create trigger memberships_cancel_transfer
  after update of role or delete on kardo_core.workspace_memberships
  for each row execute function kardo_private.cancel_transfer_on_member_change();

-- The recipient learns about a new request in the bell (category «Tu
-- cuenta», addressed to them only). A failing notice never blocks the
-- request itself.
create or replace function kardo_private.notify_ownership_transfer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace text;
  v_from text;
begin
  if new.status <> 'pending' then
    return new;
  end if;
  select name into v_workspace from kardo_core.workspaces where id = new.workspace_id;
  select coalesce(nullif(btrim(display_name), ''), 'Alguien de tu equipo')
    into v_from
    from kardo_core.profiles where id = new.from_profile;
  begin
    insert into kardo_core.notifications (
      category, title, body, action_label, action_url, audience, profile_id
    ) values (
      'account',
      'Te quieren pasar una organización',
      left(
        coalesce(v_from, 'Alguien de tu equipo') || ' quiere que seas la persona dueña de «'
          || coalesce(v_workspace, 'su organización')
          || '». Nada cambia hasta que la aceptes. Ábrela y entra a Equipo para aceptar o rechazar.',
        4000
      ),
      'Ir a Equipo',
      '/organization',
      'profile',
      new.to_profile
    );
  exception when others then
    raise warning 'notify_ownership_transfer: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function kardo_private.notify_ownership_transfer() from public;

drop trigger if exists ownership_transfers_notify on kardo_core.ownership_transfers;
create trigger ownership_transfers_notify
  after insert on kardo_core.ownership_transfers
  for each row execute function kardo_private.notify_ownership_transfer();

-- ---------------------------------------------------------------------------
-- A2-11: is this email already a person of the plan's pool?
-- ---------------------------------------------------------------------------

-- True when `p_email` already counts in `members.max` for the pool of
-- `p_workspace_id` (same rule as kardo_billing.usage_of: members and pending
-- invitations of every organization of the account). Only a member of the
-- workspace may ask, and the answer is a single yes or no.
create or replace function kardo_billing.email_counts_in_pool(
  p_workspace_id uuid,
  p_email text
) returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_ids uuid[];
begin
  if not kardo_private.is_workspace_member(p_workspace_id) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_account := kardo_billing.account_of(p_workspace_id);
  if v_account is null
    or kardo_billing.is_internal_workspace(p_workspace_id)
    or not exists (
      select 1 from kardo_billing.account_workspaces(v_account) x
      where x = p_workspace_id
    ) then
    v_ids := array[p_workspace_id];
  else
    v_ids := array(select kardo_billing.account_workspaces(v_account));
  end if;
  return exists (
    select 1
    from kardo_core.workspace_memberships m
    join kardo_core.profiles pr on pr.id = m.profile_id
    where m.workspace_id = any(v_ids) and lower(pr.email) = lower(p_email)
  ) or exists (
    select 1 from kardo_core.workspace_invitations i
    where i.workspace_id = any(v_ids) and i.status = 'pending'
      and i.expires_at > now() and lower(i.email) = lower(p_email)
  );
end;
$$;
revoke all on function kardo_billing.email_counts_in_pool(uuid, text) from public;
grant execute on function kardo_billing.email_counts_in_pool(uuid, text) to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- A2-17: what an invitation link is, before accepting it
-- ---------------------------------------------------------------------------

-- The organization, the role, who invited and the state of the invitation
-- whose token hash is `p_token_hash`, for the signed-in person holding the
-- link (the token is the secret, as for accepting). `email_matches` says
-- whether it is addressed to the signed-in email; the address itself only
-- leaves masked (the API hides most of it). Unknown token: no row.
create or replace function kardo_core.preview_workspace_invitation(p_token_hash text)
returns table (
  workspace_name text,
  role kardo_core.membership_role,
  invited_by text,
  state text,
  email text,
  email_matches boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_email text := kardo_private.current_customer_email();
begin
  if v_subject is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    return;
  end if;
  return query
    select w.name::text,
           i.role,
           nullif(btrim(p.display_name), '')::text,
           case
             when i.status = 'pending' and i.expires_at <= now() then 'expired'
             else i.status::text
           end,
           i.email::text,
           v_email is not null and i.email = lower(v_email)
    from kardo_core.workspace_invitations i
    join kardo_core.workspaces w on w.id = i.workspace_id
    left join kardo_core.profiles p on p.id = i.invited_by
    where i.token_hash = p_token_hash;
end;
$$;
revoke all on function kardo_core.preview_workspace_invitation(text) from public;
grant execute on function kardo_core.preview_workspace_invitation(text) to kardo_customer_api;
