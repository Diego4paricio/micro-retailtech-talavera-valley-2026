-- Analytics deliberately stores only server-issued, pseudonymous event IDs.
-- There are no IP addresses, user agents, referrers, URL query strings, or
-- persistent visitor identifiers in this model.
do $$ begin
  create role kardo_analytics nologin noinherit nobypassrls;
exception when duplicate_object then null;
end $$;

do $$ begin
  create role kardo_analytics_runtime login noinherit nobypassrls
    nocreatedb nocreaterole noreplication;
exception when duplicate_object then null;
end $$;

grant kardo_analytics to kardo_analytics_runtime, postgres;

create type kardo_core.analytics_event_type as enum ('tap', 'view', 'click');
create type kardo_core.analytics_channel as enum ('nfc', 'qr', 'link');

create table kardo_core.analytics_ingest_batches (
  batch_hash text primary key check (batch_hash ~ '^[a-f0-9]{64}$'),
  processed_at timestamptz not null default now()
);

create table kardo_core.analytics_event_dedup (
  event_id uuid primary key,
  occurred_at timestamptz not null,
  expires_at timestamptz not null
);

create table kardo_core.analytics_raw_events (
  event_id uuid primary key references kardo_core.analytics_event_dedup(event_id) on delete cascade,
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  touchpoint_id uuid not null references kardo_core.touchpoints(id) on delete cascade,
  publication_revision integer not null check (publication_revision > 0),
  event_type kardo_core.analytics_event_type not null,
  channel kardo_core.analytics_channel not null,
  is_test boolean not null,
  occurred_at timestamptz not null,
  ingested_at timestamptz not null default now()
);

create table kardo_core.analytics_hourly (
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  touchpoint_id uuid not null references kardo_core.touchpoints(id) on delete cascade,
  publication_revision integer not null check (publication_revision > 0),
  bucket_start timestamptz not null,
  event_type kardo_core.analytics_event_type not null,
  channel kardo_core.analytics_channel not null,
  is_test boolean not null,
  event_count bigint not null check (event_count >= 0),
  primary key (touchpoint_id, publication_revision, bucket_start, event_type, channel, is_test)
);

create table kardo_core.analytics_daily (
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  touchpoint_id uuid not null references kardo_core.touchpoints(id) on delete cascade,
  publication_revision integer not null check (publication_revision > 0),
  bucket_start date not null,
  event_type kardo_core.analytics_event_type not null,
  channel kardo_core.analytics_channel not null,
  is_test boolean not null,
  event_count bigint not null check (event_count >= 0),
  primary key (touchpoint_id, publication_revision, bucket_start, event_type, channel, is_test)
);

create table kardo_core.leads (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references kardo_core.workspaces(id) on delete cascade,
  touchpoint_id uuid not null references kardo_core.touchpoints(id) on delete restrict,
  publication_revision integer not null check (publication_revision > 0),
  email text not null check (char_length(email) between 3 and 320),
  name text check (char_length(name) between 1 and 120),
  message text check (char_length(message) between 1 and 2000),
  consented_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index analytics_raw_events_retention_idx on kardo_core.analytics_raw_events (occurred_at);
create index analytics_event_dedup_retention_idx on kardo_core.analytics_event_dedup (expires_at);
create index analytics_hourly_workspace_time_idx on kardo_core.analytics_hourly (workspace_id, bucket_start desc);
create index analytics_daily_workspace_time_idx on kardo_core.analytics_daily (workspace_id, bucket_start desc);
create index leads_workspace_created_idx on kardo_core.leads (workspace_id, created_at desc);

alter table kardo_core.analytics_ingest_batches enable row level security;
alter table kardo_core.analytics_event_dedup enable row level security;
alter table kardo_core.analytics_raw_events enable row level security;
alter table kardo_core.analytics_hourly enable row level security;
alter table kardo_core.analytics_daily enable row level security;
alter table kardo_core.leads enable row level security;

grant usage on schema kardo_core, kardo_audit to kardo_analytics;
grant select on kardo_core.touchpoints, kardo_core.publications to kardo_analytics;
grant insert on kardo_core.analytics_ingest_batches, kardo_core.analytics_event_dedup,
  kardo_core.analytics_raw_events, kardo_core.analytics_hourly, kardo_core.analytics_daily,
  kardo_core.leads to kardo_analytics;
grant update on kardo_core.analytics_hourly, kardo_core.analytics_daily to kardo_analytics;
grant delete on kardo_core.analytics_ingest_batches, kardo_core.analytics_event_dedup,
  kardo_core.analytics_raw_events, kardo_core.analytics_hourly, kardo_core.analytics_daily to kardo_analytics;
grant insert on kardo_audit.events to kardo_analytics;
grant select on kardo_core.leads, kardo_core.analytics_hourly, kardo_core.analytics_daily to kardo_customer_api;

create policy "analytics batches append" on kardo_core.analytics_ingest_batches for insert to kardo_analytics with check (true);
create policy "analytics batches delete" on kardo_core.analytics_ingest_batches for delete to kardo_analytics using (true);
create policy "analytics dedup append" on kardo_core.analytics_event_dedup for insert to kardo_analytics with check (true);
create policy "analytics dedup delete" on kardo_core.analytics_event_dedup for delete to kardo_analytics using (true);
create policy "analytics raw append" on kardo_core.analytics_raw_events for insert to kardo_analytics with check (true);
create policy "analytics raw delete" on kardo_core.analytics_raw_events for delete to kardo_analytics using (true);
create policy "analytics hourly append" on kardo_core.analytics_hourly for insert to kardo_analytics with check (true);
create policy "analytics hourly update" on kardo_core.analytics_hourly for update to kardo_analytics using (true) with check (true);
create policy "analytics hourly delete" on kardo_core.analytics_hourly for delete to kardo_analytics using (true);
create policy "analytics daily append" on kardo_core.analytics_daily for insert to kardo_analytics with check (true);
create policy "analytics daily update" on kardo_core.analytics_daily for update to kardo_analytics using (true) with check (true);
create policy "analytics daily delete" on kardo_core.analytics_daily for delete to kardo_analytics using (true);
create policy "analytics touchpoints read" on kardo_core.touchpoints for select to kardo_analytics using (true);
create policy "analytics publications read" on kardo_core.publications for select to kardo_analytics using (true);
create policy "analytics leads append" on kardo_core.leads for insert to kardo_analytics with check (true);
create policy "analytics audit append" on kardo_audit.events for insert to kardo_analytics with check (true);
create policy "customer api leads read" on kardo_core.leads for select to kardo_customer_api using (true);
create policy "customer api hourly read" on kardo_core.analytics_hourly for select to kardo_customer_api using (true);
create policy "customer api daily read" on kardo_core.analytics_daily for select to kardo_customer_api using (true);

create or replace function kardo_core.purge_analytics_retention()
returns void language plpgsql security invoker set search_path = '' as $$
begin
  delete from kardo_core.analytics_raw_events where occurred_at < now() - interval '7 days';
  delete from kardo_core.analytics_event_dedup where expires_at < now();
  delete from kardo_core.analytics_ingest_batches where processed_at < now() - interval '8 days';
  delete from kardo_core.analytics_hourly where bucket_start < date_trunc('hour', now() - interval '90 days');
  delete from kardo_core.analytics_daily where bucket_start < (current_date - interval '13 months')::date;
end;
$$;
revoke all on function kardo_core.purge_analytics_retention() from public;
grant execute on function kardo_core.purge_analytics_retention() to kardo_analytics;
