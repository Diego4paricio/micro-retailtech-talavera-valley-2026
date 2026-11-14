-- Auth owns auth.users. This trigger creates the minimum customer identity and
-- workspace atomically, so a new session can immediately resolve its tenant.
-- User metadata only affects display text; it is never used for authorization.
create or replace function private.bootstrap_customer_workspace()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  workspace_name text;
  workspace_id uuid := gen_random_uuid();
begin
  workspace_name := left(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Kardo'
    ),
    108
  ) || ' · Personal';

  insert into kardo_core.profiles (id, display_name)
  values (new.id, left(workspace_name, 120));

  insert into kardo_core.workspaces (id, public_id, kind, name)
  values (workspace_id, replace(gen_random_uuid()::text, '-', ''), 'personal', workspace_name);

  insert into kardo_core.workspace_memberships (workspace_id, profile_id, role)
  values (workspace_id, new.id, 'owner');

  return new;
end;
$$;

revoke all on function private.bootstrap_customer_workspace() from public;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure private.bootstrap_customer_workspace();
