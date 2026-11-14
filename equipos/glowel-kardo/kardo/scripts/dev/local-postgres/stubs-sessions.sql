do $$ begin
  if not exists (select 1 from pg_type t join pg_namespace n on n.oid=t.typnamespace where n.nspname='auth' and t.typname='aal_level') then
    create type auth.aal_level as enum ('aal1','aal2','aal3');
  end if;
end $$;
create table if not exists auth.sessions (id uuid primary key, user_id uuid not null references auth.users(id) on delete cascade, created_at timestamptz default now(), updated_at timestamptz default now(), factor_id uuid, aal auth.aal_level, not_after timestamptz, refreshed_at timestamp, user_agent text, ip inet, tag text);
