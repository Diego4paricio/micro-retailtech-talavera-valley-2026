-- Phase 6: asset records remain private until a validator promotes a derivative.
alter table kardo_core.assets
  add column expected_byte_size bigint,
  add column expected_media_type text,
  add column derivative_key text unique,
  add column validated_at timestamptz,
  add column rejected_reason text check (char_length(rejected_reason) <= 500),
  add constraint assets_expected_size_matches check (
    expected_byte_size is null or expected_byte_size between 1 and 5242880
  ),
  add constraint assets_expected_media_type_matches check (
    expected_media_type is null or expected_media_type in ('image/png', 'application/pdf')
  ),
  add constraint assets_derivative_only_after_validation check (
    derivative_key is null or status in ('validated', 'published')
  );

create table kardo_core.experience_assets (
  experience_id uuid not null references kardo_core.experiences(id) on delete restrict,
  asset_id uuid not null references kardo_core.assets(id) on delete restrict,
  purpose text not null check (purpose in ('primary')),
  primary key (experience_id, asset_id),
  unique (experience_id, purpose)
);

create index experience_assets_asset_id_idx on kardo_core.experience_assets (asset_id);

alter table kardo_core.experience_assets enable row level security;
create policy "customer api experience assets" on kardo_core.experience_assets
  for all to kardo_customer_api using (true) with check (true);
create policy "publisher experience assets read" on kardo_core.experience_assets
  for select to kardo_publisher using (true);
grant select, insert, update on kardo_core.experience_assets to kardo_customer_api;
grant select on kardo_core.experience_assets to kardo_publisher;
