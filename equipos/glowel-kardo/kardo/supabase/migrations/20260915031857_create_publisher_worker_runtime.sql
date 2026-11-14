-- This login is reserved for a worker-side connection pool. Its password is
-- provisioned outside migrations and stored only by the runtime configuration.
do $$ begin
  create role kardo_publisher_runtime login noinherit nobypassrls
    nocreatedb nocreaterole noreplication;
exception when duplicate_object then null;
end $$;

grant kardo_publisher to kardo_publisher_runtime;
