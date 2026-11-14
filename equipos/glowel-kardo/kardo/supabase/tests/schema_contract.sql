-- A single DO block on purpose: `supabase db query --file` (pnpm
-- test:database) sends the whole file as one prepared statement, and Postgres
-- refuses several commands in one. Add new checks as `begin … end;` blocks
-- inside it.
do $$
declare
  schema_count integer;
  rls_count integer;
begin
  select count(*) into schema_count
  from information_schema.schemata
  where schema_name in ('kardo_core', 'kardo_staff', 'kardo_audit', 'private');

  select count(*) into rls_count
  from pg_tables
  where schemaname in ('kardo_core', 'kardo_staff', 'kardo_audit', 'kardo_billing') and rowsecurity;

  if schema_count <> 4 then
    raise exception 'expected 4 Kardo schemas, found %', schema_count;
  end if;
  if rls_count <> 69 then
    raise exception 'expected RLS on 69 application tables, found %', rls_count;
  end if;
  if has_schema_privilege('authenticated', 'kardo_core', 'usage') then
    raise exception 'authenticated must not have direct kardo_core usage';
  end if;
  if has_schema_privilege('anon', 'kardo_staff', 'usage') then
    raise exception 'anon must not have direct kardo_staff usage';
  end if;
  if not exists (
    select 1 from information_schema.schemata where schema_name = 'kardo_private'
  ) then
    raise exception 'kardo_private schema must exist for customer RLS helpers';
  end if;
  if has_schema_privilege('authenticated', 'kardo_private', 'usage')
    or has_schema_privilege('anon', 'kardo_private', 'usage') then
    raise exception 'anon/authenticated must not have direct kardo_private usage';
  end if;
  if not has_table_privilege('kardo_customer_api', 'kardo_core.workspaces', 'select') then
    raise exception 'customer runtime role lost required core access';
  end if;
  if not has_table_privilege('kardo_staff_api', 'kardo_staff.staff_profiles', 'select') then
    raise exception 'staff runtime role lost required staff access';
  end if;
  if not has_schema_privilege('kardo_customer_api', 'kardo_audit', 'usage') then
    raise exception 'customer runtime role lost required audit schema usage';
  end if;
  if not has_schema_privilege('kardo_publisher', 'kardo_core', 'usage')
    or not has_table_privilege('kardo_publisher', 'kardo_core.publication_jobs', 'update') then
    raise exception 'publisher runtime role lost publication outbox access';
  end if;
  if not pg_has_role('postgres', 'kardo_publisher', 'member') then
    raise exception 'postgres cannot assume the publisher runtime role';
  end if;
  if not pg_has_role('kardo_publisher_runtime', 'kardo_publisher', 'member') then
    raise exception 'publisher worker runtime cannot assume the publisher role';
  end if;
  if not has_table_privilege('kardo_analytics', 'kardo_core.analytics_hourly', 'insert')
    or not has_table_privilege('kardo_analytics', 'kardo_core.leads', 'insert') then
    raise exception 'analytics role lost required aggregation or lead access';
  end if;
  if not pg_has_role('kardo_publisher_runtime', 'kardo_analytics', 'member') then
    raise exception 'worker pool cannot assume the analytics role';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'kardo_core'
      and table_name = 'experiences'
      and column_name = 'touchpoint_id'
  ) then
    raise exception 'experiences must retain their touchpoint relationship';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'kardo_core'
      and table_name = 'assets'
      and column_name = 'derivative_key'
  ) then
    raise exception 'assets must retain their verified derivative key';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'kardo_core'
      and table_name = 'profiles'
      and column_name = 'email'
  ) then
    raise exception 'profiles must retain a synced email column';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'kardo_core'
      and table_name = 'leads'
      and column_name = 'phone'
  ) then
    raise exception 'leads must retain an optional phone column';
  end if;

  -- Runtime login roles for the Customer and Staff APIs (CRITICO in the
  -- 2026-09-24 audit): dedicated, unprivileged logins that only assume the
  -- existing no-login service role, mirroring kardo_publisher_runtime and
  -- kardo_analytics_runtime.
  if not exists (
    select 1 from pg_roles
    where rolname = 'kardo_customer_api_runtime'
      and rolcanlogin and not rolsuper and not rolbypassrls
  ) then
    raise exception 'kardo_customer_api_runtime must exist as a restricted login role';
  end if;
  if not pg_has_role('kardo_customer_api_runtime', 'kardo_customer_api', 'member') then
    raise exception 'kardo_customer_api_runtime cannot assume the customer api role';
  end if;
  if not exists (
    select 1 from pg_roles
    where rolname = 'kardo_staff_api_runtime'
      and rolcanlogin and not rolsuper and not rolbypassrls
  ) then
    raise exception 'kardo_staff_api_runtime must exist as a restricted login role';
  end if;
  if not pg_has_role('kardo_staff_api_runtime', 'kardo_staff_api', 'member') then
    raise exception 'kardo_staff_api_runtime cannot assume the staff api role';
  end if;

  -- ALTO: draft_content/content must be JSON objects, and asset media_type
  -- must be restricted to the supported allow-list.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.experiences'::regclass
      and contype = 'c' and convalidated
      and pg_get_constraintdef(oid) ilike '%jsonb_typeof(draft_content)%object%'
  ) then
    raise exception 'experiences must enforce draft_content as a JSON object';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.experience_versions'::regclass
      and contype = 'c' and convalidated
      and pg_get_constraintdef(oid) ilike '%jsonb_typeof(content)%object%'
  ) then
    raise exception 'experience_versions must enforce content as a JSON object';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.assets'::regclass
      and contype = 'c' and convalidated
      and pg_get_constraintdef(oid) ilike '%media_type%image/png%application/pdf%'
  ) then
    raise exception 'assets.media_type must be restricted to the supported allow-list';
  end if;

  -- MEDIO: kardo_audit.events must be append-only via trigger, not just by
  -- omission of grants.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'kardo_audit.events'::regclass
      and not tgisinternal
      and tgname = 'audit_events_append_only'
  ) then
    raise exception 'kardo_audit.events must have an append-only guard trigger';
  end if;

  -- workspace_invitations must exist with RLS enabled and a customer runtime grant.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'workspace_invitations' and rowsecurity
  ) then
    raise exception 'workspace_invitations must exist with row level security enabled';
  end if;
  if not has_table_privilege('kardo_customer_api', 'kardo_core.workspace_invitations', 'select') then
    raise exception 'customer runtime role lost workspace invitation access';
  end if;

  -- ALTO: no decorative using(true)/with check(true) policy may remain for
  -- kardo_customer_api on the hardened tables.
  if exists (
    select 1
    from pg_policies
    where schemaname in ('kardo_core', 'kardo_audit')
      and tablename in (
        'profiles', 'workspaces', 'workspace_memberships', 'touchpoints',
        'experiences', 'experience_versions', 'publications', 'publication_jobs',
        'assets', 'experience_assets', 'leads', 'analytics_hourly',
        'analytics_daily', 'workspace_invitations', 'events'
      )
      and 'kardo_customer_api' = any(roles)
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'kardo_customer_api must not retain a decorative using(true) policy';
  end if;

  -- Every SECURITY DEFINER function on Kardo-owned schemas must pin an empty
  -- search_path (defence against search_path hijacking).
  if exists (
    select 1
    from pg_proc
    where pronamespace in (
        'kardo_core'::regnamespace, 'kardo_private'::regnamespace,
        'private'::regnamespace, 'kardo_audit'::regnamespace
      )
      and prosecdef
      and not exists (
        select 1 from unnest(coalesce(proconfig, '{}'::text[])) as cfg where cfg like 'search_path=%'
      )
  ) then
    raise exception 'every security definer function must pin an empty search_path';
  end if;
  if not exists (
    select 1 from pg_proc
    where proname = 'create_organization_workspace'
      and pronamespace = 'kardo_core'::regnamespace and prosecdef
  ) then
    raise exception 'kardo_core.create_organization_workspace must exist as security definer';
  end if;
  if not exists (
    select 1 from pg_proc
    where proname = 'accept_workspace_invitation'
      and pronamespace = 'kardo_core'::regnamespace and prosecdef
  ) then
    raise exception 'kardo_core.accept_workspace_invitation must exist as security definer';
  end if;

  -- Touchpoint groups: table, RLS, case-insensitive unique name among
  -- siblings (ADR 021), and the workspace-pinned composite FK from
  -- touchpoints.group_id.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'touchpoint_groups' and rowsecurity
  ) then
    raise exception 'touchpoint_groups must exist with row level security enabled';
  end if;
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'kardo_core' and tablename = 'touchpoint_groups'
      and indexname = 'touchpoint_groups_sibling_name_unique'
  ) then
    raise exception 'touchpoint_groups must enforce a case-insensitive unique name among siblings';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'kardo_core' and table_name = 'touchpoints' and column_name = 'group_id'
  ) then
    raise exception 'touchpoints must retain their optional group relationship';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'touchpoints_group_same_workspace'
      and conrelid = 'kardo_core.touchpoints'::regclass and contype = 'f'
  ) then
    raise exception 'touchpoints.group_id must be pinned to the same workspace via a composite FK';
  end if;

  -- Experience targets: table, RLS, exactly-one-destination CHECK, and the
  -- three workspace-pinned composite FKs (experience, touchpoint, group).
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'experience_targets' and rowsecurity
  ) then
    raise exception 'experience_targets must exist with row level security enabled';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.experience_targets'::regclass
      and contype = 'c' and convalidated
      and pg_get_constraintdef(oid) ilike '%num_nonnulls%'
  ) then
    raise exception 'experience_targets must require exactly one of touchpoint_id/group_id';
  end if;
  if (
    select count(*) from pg_constraint
    where conrelid = 'kardo_core.experience_targets'::regclass
      and contype = 'f'
      and conname in (
        'experience_targets_experience_workspace_fkey',
        'experience_targets_touchpoint_workspace_fkey',
        'experience_targets_group_workspace_fkey'
      )
  ) <> 3 then
    raise exception 'experience_targets must pin experience/touchpoint/group to the same workspace';
  end if;

  -- Publication requests: idempotency table plus the linking column on
  -- publications used to group a multi-touchpoint publish into one request.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'publication_requests' and rowsecurity
  ) then
    raise exception 'publication_requests must exist with row level security enabled';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'kardo_core' and table_name = 'publications'
      and column_name = 'request_idempotency_key'
  ) then
    raise exception 'publications must retain a link back to its publication request';
  end if;

  -- Organization creation must enforce the 3-organization owner limit.
  if not exists (
    select 1 from pg_proc
    where proname = 'create_organization_workspace'
      and pronamespace = 'kardo_core'::regnamespace
      and pg_get_functiondef(oid) ilike '%ORGANIZATION_LIMIT%'
  ) then
    raise exception 'create_organization_workspace must enforce the organization owner limit';
  end if;

  -- Lead delivery: settings + delivery log tables, plus the bounded custom
  -- fields column on leads.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'lead_delivery_settings' and rowsecurity
  ) then
    raise exception 'lead_delivery_settings must exist with row level security enabled';
  end if;
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'lead_deliveries' and rowsecurity
  ) then
    raise exception 'lead_deliveries must exist with row level security enabled';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'kardo_core' and table_name = 'leads' and column_name = 'fields'
  ) then
    raise exception 'leads must retain a bounded custom fields column';
  end if;

  -- No decorative using(true)/with check(true) policy for kardo_customer_api
  -- on any of the tables introduced in this batch.
  if exists (
    select 1
    from pg_policies
    where schemaname = 'kardo_core'
      and tablename in (
        'touchpoint_groups', 'experience_targets', 'publication_requests',
        'lead_delivery_settings', 'lead_deliveries'
      )
      and 'kardo_customer_api' = any(roles)
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'kardo_customer_api must not have a decorative using(true) policy on the new tables';
  end if;

  -- 2026-09-25 least privilege: the customer API never writes plans, never
  -- mutates immutable versions/publications and cannot touch staff columns.
  if has_table_privilege('kardo_customer_api', 'kardo_core.plans', 'INSERT')
     or has_table_privilege('kardo_customer_api', 'kardo_core.workspace_plans', 'UPDATE')
     or has_table_privilege('kardo_customer_api', 'kardo_core.experience_versions', 'UPDATE')
     or has_table_privilege('kardo_customer_api', 'kardo_core.experience_versions', 'DELETE')
     or has_table_privilege('kardo_customer_api', 'kardo_core.publications', 'DELETE')
     or has_table_privilege('kardo_customer_api', 'kardo_core.touchpoints', 'DELETE')
     or has_column_privilege('kardo_customer_api', 'kardo_core.touchpoints', 'suspended_at', 'UPDATE') then
    raise exception 'kardo_customer_api regained a privilege removed by the least-privilege audit';
  end if;

  -- Touchpoint lifecycle: retirement is terminal (trigger) and suspension is
  -- a staff-only overlay.
  if not exists (
    select 1 from pg_trigger
    where tgrelid = 'kardo_core.touchpoints'::regclass and tgname = 'touchpoints_retirement'
  ) then
    raise exception 'touchpoints must keep the terminal retirement trigger';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'kardo_core' and table_name = 'touchpoints' and column_name = 'suspended_at'
  ) then
    raise exception 'touchpoints must retain the staff suspension columns';
  end if;

  -- Lead management: follow-up status, per-workspace retention and the
  -- daily purge.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.leads'::regclass and conname = 'leads_status_allowed'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'kardo_core' and table_name = 'workspaces' and column_name = 'lead_retention_days'
  ) or to_regprocedure('kardo_private.purge_expired_leads()') is null then
    raise exception 'lead status, retention and purge must exist';
  end if;
  if to_regclass('cron.job') is not null and not exists (
    select 1 from cron.job where jobname = 'kardo-purge-expired-leads' and active
  ) then
    raise exception 'the daily lead retention purge must be scheduled';
  end if;

  -- Operations: RLS for kardo_staff_api is real (no using(true) on customer
  -- data) and staff can never read lead personal data.
  if exists (
    select 1 from pg_policies
    where schemaname = 'kardo_core'
      and 'kardo_staff_api' = any(roles)
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'kardo_staff_api must not retain a using(true) policy on customer data';
  end if;
  if has_column_privilege('kardo_staff_api', 'kardo_core.leads', 'email', 'SELECT')
     or has_column_privilege('kardo_staff_api', 'kardo_core.leads', 'phone', 'SELECT')
     or has_column_privilege('kardo_staff_api', 'kardo_core.leads', 'message', 'SELECT') then
    raise exception 'kardo_staff_api must never read lead personal data';
  end if;
  if to_regprocedure('kardo_private.staff_has_permission(text)') is null
     or to_regprocedure('kardo_private.is_active_staff()') is null then
    raise exception 'staff RLS helpers must exist';
  end if;

  -- 2026-09-25 redesign: one Touchpoint = one format; Links are a separate
  -- product (handle only on links, never grouped); link pages exist.
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.touchpoints'::regclass and conname = 'touchpoints_kind_allowed'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.touchpoints'::regclass and conname = 'touchpoints_handle_only_links'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.touchpoints'::regclass and conname = 'touchpoints_links_ungrouped'
  ) or to_regclass('kardo_core.touchpoints_handle_unique') is null then
    raise exception 'touchpoint kinds, link handles and link grouping rules must be enforced';
  end if;
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'kardo_core.experience_type'::regtype and enumlabel = 'linkpage'
  ) then
    raise exception 'experience_type must include linkpage';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.workspaces'::regclass and conname = 'workspaces_profile_bounded_object'
  ) then
    raise exception 'workspace profile must be a bounded JSON object';
  end if;
-- The trigger must provision the profile, personal workspace and ownership
-- membership atomically. A nested transaction makes this a single query and
-- rolls the fixture back, which keeps the test database deterministic.
  begin
    insert into auth.users (
      id, aud, role, email, raw_app_meta_data, raw_user_meta_data, created_at, updated_at
    ) values (
      '4e4b6721-302e-4a7a-a0d5-c55a4d9843a2',
      'authenticated',
      'authenticated',
      'phase3-trigger-verification@invalid.example',
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"display_name":"Phase 3 verification"}'::jsonb,
      now(), now()
    );

    if not exists (
      select 1
      from kardo_core.profiles
      where id = '4e4b6721-302e-4a7a-a0d5-c55a4d9843a2'
        and display_name = 'Phase 3 verification · Personal'
        and email = 'phase3-trigger-verification@invalid.example'
    ) then
      raise exception using errcode = 'KAR02', message = 'profile bootstrap failed';
    end if;

    if not exists (
      select 1
      from kardo_core.workspace_memberships membership
      join kardo_core.workspaces workspace on workspace.id = membership.workspace_id
      where membership.profile_id = '4e4b6721-302e-4a7a-a0d5-c55a4d9843a2'
        and workspace.kind = 'personal'
        and workspace.name = 'Phase 3 verification · Personal'
        and workspace.public_id ~ '^[A-Za-z0-9_-]{16,32}$'
        and membership.role = 'owner'
    ) then
      raise exception using errcode = 'KAR03', message = 'workspace bootstrap failed';
    end if;

    raise exception using errcode = 'KAR01', message = 'rollback verification fixture';
  exception
    when sqlstate 'KAR01' then null;
  end;

  -- 2026-09-25 Estudio QR: bounded per-Touchpoint designs and saved designs.
  begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'touchpoints_qr_design_bounded'
      and conrelid = 'kardo_core.touchpoints'::regclass
  ) then
    raise exception 'touchpoints.qr_design must stay a bounded schema-2 object';
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'qr_design_templates' and rowsecurity
  ) then
    raise exception 'qr_design_templates must exist with row level security enabled';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'kardo_core' and tablename = 'qr_design_templates'
      and 'kardo_customer_api' = any(roles)
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'kardo_customer_api must not have a decorative policy on qr_design_templates';
  end if;

  if has_column_privilege('kardo_customer_api', 'kardo_core.qr_design_templates', 'workspace_id', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.touchpoints', 'suspended_at', 'UPDATE')
  then
    raise exception 'kardo_customer_api may only update qr designs, never move templates or lift suspensions';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'qr_design_templates_limit'
      and tgrelid = 'kardo_core.qr_design_templates'::regclass
  ) then
    raise exception 'qr_design_templates must enforce the per-organization limit';
  end if;
  end;

  -- 2026-09-27 Estudio QR library: designs applied by reference, pinned to the
  -- same workspace, one design source per Touchpoint, valid print tracking.
  begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'touchpoints_qr_template_same_workspace'
      and conrelid = 'kardo_core.touchpoints'::regclass and contype = 'f'
  ) or not exists (
    select 1 from pg_constraint
    where conname = 'touchpoint_groups_qr_template_same_workspace'
      and conrelid = 'kardo_core.touchpoint_groups'::regclass and contype = 'f'
  ) then
    raise exception 'library designs must be pinned to the same workspace as their Touchpoints and groups';
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'touchpoints_qr_design_single_source'
      and conrelid = 'kardo_core.touchpoints'::regclass
  ) or not exists (
    select 1 from pg_constraint
    where conname = 'touchpoints_qr_last_export_valid'
      and conrelid = 'kardo_core.touchpoints'::regclass
  ) then
    raise exception 'touchpoints must keep one QR design source and a valid print record';
  end if;

  if not has_column_privilege('kardo_customer_api', 'kardo_core.qr_design_templates', 'design', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.qr_design_templates', 'workspace_id', 'UPDATE')
  then
    raise exception 'kardo_customer_api may edit library designs but never move them between workspaces';
  end if;

  -- Resumen dashboards are personal: only their owner, while a member.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'dashboard_layouts' and rowsecurity
  ) then
    raise exception 'dashboard_layouts must exist with row level security enabled';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'kardo_core' and tablename = 'dashboard_layouts'
      and 'kardo_customer_api' = any(roles)
      and (
        qual = 'true' or with_check = 'true'
        or coalesce(qual, with_check) not like '%current_customer_subject%'
      )
  ) then
    raise exception 'dashboard_layouts policies must be scoped to the signed-in member';
  end if;

  if has_column_privilege('kardo_customer_api', 'kardo_core.dashboard_layouts', 'profile_id', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.dashboard_layouts', 'workspace_id', 'UPDATE')
  then
    raise exception 'kardo_customer_api may edit a dashboard layout but never reassign it';
  end if;

  -- Disponibilidad: live item state, scoped by membership, never reassigned.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'item_availability' and rowsecurity
  ) then
    raise exception 'item_availability must exist with row level security enabled';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'kardo_core' and tablename = 'item_availability'
      and 'kardo_customer_api' = any(roles)
      and (
        qual = 'true' or with_check = 'true'
        or coalesce(qual, with_check) not like '%is_workspace_member%'
      )
  ) then
    raise exception 'item_availability policies must be scoped by workspace membership';
  end if;

  if not has_column_privilege('kardo_customer_api', 'kardo_core.item_availability', 'status', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.item_availability', 'experience_id', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.item_availability', 'workspace_id', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.item_availability', 'item_id', 'UPDATE')
  then
    raise exception 'kardo_customer_api may change item availability but never move it';
  end if;

  -- Modo HTML: daily Kardo AI usage, scoped by membership, never reassigned.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'custom_html_ai_usage' and rowsecurity
  ) then
    raise exception 'custom_html_ai_usage must exist with row level security enabled';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'kardo_core' and tablename = 'custom_html_ai_usage'
      and 'kardo_customer_api' = any(roles)
      and (
        qual = 'true' or with_check = 'true'
        or coalesce(qual, with_check) not like '%is_workspace_member%'
      )
  ) then
    raise exception 'custom_html_ai_usage policies must be scoped by workspace membership';
  end if;

  if not has_column_privilege('kardo_customer_api', 'kardo_core.custom_html_ai_usage', 'generations', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.custom_html_ai_usage', 'workspace_id', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.custom_html_ai_usage', 'usage_day', 'UPDATE')
    or has_table_privilege('kardo_customer_api', 'kardo_core.custom_html_ai_usage', 'DELETE')
  then
    raise exception 'kardo_customer_api may count AI generations but never move or erase them';
  end if;

  -- Modo HTML: Kardo's global daily AI budget. No policies and no direct
  -- privilege: only the kardo_private functions read and add to it.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'custom_html_ai_spend' and rowsecurity
  ) then
    raise exception 'custom_html_ai_spend must exist with row level security enabled';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'kardo_core' and tablename = 'custom_html_ai_spend'
  ) then
    raise exception 'custom_html_ai_spend must have no policies: only kardo_private functions may touch it';
  end if;

  if has_table_privilege('kardo_customer_api', 'kardo_core.custom_html_ai_spend', 'SELECT')
    or has_table_privilege('kardo_customer_api', 'kardo_core.custom_html_ai_spend', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_core.custom_html_ai_spend', 'UPDATE')
    or has_table_privilege('kardo_customer_api', 'kardo_core.custom_html_ai_spend', 'DELETE')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.custom_html_ai_spend_add(bigint)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_private.custom_html_ai_spend_add(bigint)', 'EXECUTE')
  then
    raise exception 'custom_html_ai_spend is reached only through kardo_private, by the Customer API';
  end if;

  -- Suscripciones (ADR 019): the Stripe mirror is written only by the
  -- webhook role; customers read their own workspace, never write it.
  if (
    select count(*) from pg_tables
    where schemaname = 'kardo_billing' and rowsecurity
      and tablename in ('customers', 'prices', 'subscriptions', 'invoices', 'refunds', 'webhook_events', 'notices', 'trials',
        'access_policy', 'internal_workspaces', 'access_states', 'fiscal_profiles', 'cfdi_requests',
        'workspace_deletions', 'deletion_cleanup')
  ) <> 15 then
    raise exception 'kardo_billing must have its 15 tables with row level security enabled';
  end if;

  if has_schema_privilege('anon', 'kardo_billing', 'usage')
    or has_schema_privilege('authenticated', 'kardo_billing', 'usage')
  then
    raise exception 'anon/authenticated must not reach kardo_billing';
  end if;

  if not exists (
    select 1 from pg_roles
    where rolname = 'kardo_billing_sync' and not rolcanlogin and not rolsuper and not rolbypassrls
  ) then
    raise exception 'kardo_billing_sync must be a nologin, non-bypassrls role';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'kardo_billing'
      and 'kardo_customer_api' = any(roles)
      -- The public catalog: plan prices and the extras (ADR 024).
      and tablename not in ('prices', 'extras')
      and (qual = 'true' or with_check = 'true')
  ) then
    raise exception 'kardo_billing customer policies must be scoped by workspace role';
  end if;

  if has_table_privilege('kardo_customer_api', 'kardo_billing.subscriptions', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.subscriptions', 'UPDATE')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.invoices', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.invoices', 'UPDATE')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.prices', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.customers', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_billing.customers', 'trial_consumed_at', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.refunds', 'SELECT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.webhook_events', 'SELECT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.notices', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.notices', 'UPDATE')
  then
    raise exception 'kardo_customer_api may read its billing mirror but never write it';
  end if;

  -- Prueba de Kardo (ADR 020): solo la funcion security definer la inicia;
  -- el API lee la prueba de sus organizaciones pero nunca el hash del correo.
  if has_table_privilege('kardo_customer_api', 'kardo_billing.trials', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.trials', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_billing.trials', 'email_sha256', 'SELECT')
    or has_column_privilege('kardo_staff_api', 'kardo_billing.trials', 'email_sha256', 'SELECT')
    or not has_column_privilege('kardo_customer_api', 'kardo_billing.trials', 'ends_at', 'SELECT')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.start_workspace_trial(uuid, text, text, text, integer)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_private.start_workspace_trial(uuid, text, text, text, integer)', 'EXECUTE')
    or has_function_privilege('kardo_staff_api', 'kardo_private.start_workspace_trial(uuid, text, text, text, integer)', 'EXECUTE')
    or not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'kardo_private' and p.proname = 'start_workspace_trial' and p.prosecdef
        and p.proconfig @> array['search_path=""']
    )
    or not exists (
      select 1 from pg_indexes
      where schemaname = 'kardo_billing' and indexname = 'billing_trials_email_unique'
    )
  then
    raise exception 'kardo trials: one per person, started only through kardo_private.start_workspace_trial';
  end if;

  -- Clickwrap (Terminos y Aviso de Privacidad): only the security definer
  -- function writes the acceptance, with the server's time.
  if has_column_privilege('kardo_customer_api', 'kardo_core.profiles', 'terms_accepted_at', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.profiles', 'terms_version', 'UPDATE')
    or not has_column_privilege('kardo_customer_api', 'kardo_core.profiles', 'display_name', 'UPDATE')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.accept_legal_terms(text, text)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_private.accept_legal_terms(text, text)', 'EXECUTE')
    or not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'kardo_private' and p.proname = 'accept_legal_terms' and p.prosecdef
        and p.proconfig @> array['search_path=""']
    )
  then
    raise exception 'terms acceptance must be written only through kardo_private.accept_legal_terms';
  end if;

  if has_function_privilege('kardo_customer_api', 'kardo_billing.resolve_effective_plan(uuid)', 'EXECUTE')
    or has_function_privilege('kardo_staff_api', 'kardo_billing.resolve_effective_plan(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_billing.effective_plan(uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_billing.effective_plan(uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_billing.workspace_usage(uuid)', 'EXECUTE')
  then
    raise exception 'billing plan functions must be granted exactly to the API roles';
  end if;

  -- ADR 020 §4 and §8: access state. Only staff marks internal accounts or
  -- extends a trial, through audited functions; the APIs read the state
  -- through the checked function, never the unchecked one.
  if has_function_privilege('kardo_customer_api', 'kardo_billing.resolve_workspace_access(uuid)', 'EXECUTE')
    or has_function_privilege('kardo_staff_api', 'kardo_billing.resolve_workspace_access(uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_billing_sync', 'kardo_billing.resolve_workspace_access(uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_billing.workspace_access(uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_staff_api', 'kardo_billing.workspace_access(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_billing.workspace_access(uuid)', 'EXECUTE')
    or has_function_privilege('kardo_customer_api', 'kardo_private.set_workspace_internal(uuid, boolean, text)', 'EXECUTE')
    or not has_function_privilege('kardo_staff_api', 'kardo_private.set_workspace_internal(uuid, boolean, text)', 'EXECUTE')
    or has_function_privilege('kardo_customer_api', 'kardo_private.extend_workspace_trial(uuid, integer, text)', 'EXECUTE')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.internal_workspaces', 'SELECT')
    or has_table_privilege('kardo_staff_api', 'kardo_billing.internal_workspaces', 'INSERT')
    or has_table_privilege('kardo_staff_api', 'kardo_billing.access_states', 'UPDATE')
    or has_column_privilege('kardo_billing_sync', 'kardo_core.touchpoints', 'qr_design', 'SELECT')
    or not has_column_privilege('kardo_billing_sync', 'kardo_core.touchpoints', 'public_id', 'SELECT')
  then
    raise exception 'access state: internal marks and trial extensions only through staff functions';
  end if;

  -- ADR 020 §6: fiscal data and CFDI requests are written only through
  -- security definer functions (Owner/Admin, staff with billing.write).
  if has_table_privilege('kardo_customer_api', 'kardo_billing.fiscal_profiles', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.fiscal_profiles', 'UPDATE')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.cfdi_requests', 'INSERT')
    or has_table_privilege('kardo_staff_api', 'kardo_billing.cfdi_requests', 'UPDATE')
    or has_table_privilege('anon', 'kardo_billing.fiscal_profiles', 'SELECT')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.upsert_fiscal_profile(uuid, text, text, text, text, text, text, boolean)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.request_cfdi(uuid, text)', 'EXECUTE')
    or has_function_privilege('kardo_customer_api', 'kardo_private.resolve_cfdi_request(uuid, text, text, text)', 'EXECUTE')
    or not has_function_privilege('kardo_staff_api', 'kardo_private.resolve_cfdi_request(uuid, text, text, text)', 'EXECUTE')
    or not exists (
      select 1 from pg_indexes
      where schemaname = 'kardo_billing' and indexname = 'billing_cfdi_requests_invoice_open'
    )
  then
    raise exception 'fiscal data and CFDI requests only through their functions';
  end if;

  -- ADR 020, addendum of 2026-10-01: only the hourly tick (billing sync
  -- role) runs the deletion; nobody writes the deletion record by hand, and
  -- the Customer API cannot mark an organization deleted.
  if has_function_privilege('kardo_customer_api', 'kardo_private.delete_workspace_data(uuid, text, boolean)', 'EXECUTE')
    or has_function_privilege('kardo_staff_api', 'kardo_private.delete_workspace_data(uuid, text, boolean)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_private.delete_workspace_data(uuid, text, boolean)', 'EXECUTE')
    or not has_function_privilege('kardo_billing_sync', 'kardo_private.delete_workspace_data(uuid, text, boolean)', 'EXECUTE')
    or has_table_privilege('kardo_billing_sync', 'kardo_billing.workspace_deletions', 'INSERT')
    or has_table_privilege('kardo_billing_sync', 'kardo_billing.deletion_cleanup', 'INSERT')
    or has_table_privilege('kardo_staff_api', 'kardo_billing.workspace_deletions', 'UPDATE')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.workspace_deletions', 'SELECT')
    or not exists (
      select 1 from pg_trigger
      where tgname = 'workspaces_deletion_mark'
        and tgrelid = 'kardo_core.workspaces'::regclass
    )
    -- The sign up turns the personal space into an organization, never back.
    or not exists (
      select 1 from pg_trigger
      where tgname = 'workspaces_kind_change'
        and tgrelid = 'kardo_core.workspaces'::regclass
    )
  then
    raise exception 'deletion only through the hourly tick and its function';
  end if;

  -- Security review 2026-10: the Customer API updates only these columns of
  -- an organization and only the role of a membership; only an Owner adds
  -- or removes an Owner; the last-owner guard locks before it counts.
  if has_table_privilege('kardo_customer_api', 'kardo_core.workspaces', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.workspaces', 'public_id', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.workspaces', 'deleted_at', 'UPDATE')
    or not has_column_privilege('kardo_customer_api', 'kardo_core.workspaces', 'profile', 'UPDATE')
    or has_table_privilege('kardo_customer_api', 'kardo_core.workspace_memberships', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.workspace_memberships', 'workspace_id', 'UPDATE')
    or not has_column_privilege('kardo_customer_api', 'kardo_core.workspace_memberships', 'role', 'UPDATE')
    or not exists (
      select 1 from pg_trigger
      where tgname = 'workspace_memberships_owner_change'
        and tgrelid = 'kardo_core.workspace_memberships'::regclass
    )
    or position('for update' in pg_get_functiondef('kardo_core.enforce_workspace_last_owner()'::regprocedure)) = 0
  then
    raise exception 'customer api column grants, owner change and last-owner lock';
  end if;
  end;

  -- ADR 022: notifications and service status. Customers read only what
  -- notification_visible allows and never who on staff wrote it; staff never
  -- learns who read what; audiences are locked after creation.
  begin
  if (
    select count(*) from pg_tables
    where schemaname = 'kardo_core' and rowsecurity
      and tablename in ('notifications', 'notification_reads', 'notification_inbox',
        'status_incidents', 'status_incident_updates')
  ) <> 5 then
    raise exception 'notifications and status tables must have row level security';
  end if;
  if has_column_privilege('kardo_customer_api', 'kardo_core.notifications', 'created_by', 'SELECT')
    or has_table_privilege('kardo_customer_api', 'kardo_core.notifications', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_core.notifications', 'UPDATE')
    or has_table_privilege('kardo_customer_api', 'kardo_core.status_incidents', 'SELECT')
    or has_column_privilege('kardo_staff_api', 'kardo_core.notification_reads', 'profile_id', 'SELECT')
    or has_column_privilege('kardo_staff_api', 'kardo_core.notifications', 'audience', 'UPDATE')
    or has_column_privilege('kardo_staff_api', 'kardo_core.notifications', 'roles', 'UPDATE')
    or has_function_privilege('kardo_customer_api', 'kardo_private.notification_audience_count(text, uuid, uuid, text[], text[], text[], kardo_core.membership_role[])', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.status_probe()', 'EXECUTE')
    or not exists (
      select 1 from pg_trigger
      where tgname = 'notifications_guard' and tgrelid = 'kardo_core.notifications'::regclass
    )
  then
    raise exception 'notification and status grants (ADR 022)';
  end if;
  end;

  -- Second factor of customers (relevo 28): the Customer API learns only a
  -- yes or a no per account; it never reads auth.mfa_factors itself.
  if to_regprocedure('kardo_private.customer_requires_second_factor(uuid)') is null
    or not has_function_privilege('kardo_customer_api', 'kardo_private.customer_requires_second_factor(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_private.customer_requires_second_factor(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'kardo_private.customer_requires_second_factor(uuid)', 'EXECUTE')
    or has_schema_privilege('kardo_customer_api', 'auth', 'USAGE')
    or not exists (
      select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'kardo_private' and p.proname = 'customer_requires_second_factor' and p.prosecdef
        and p.proconfig @> array['search_path=""']
    )
  then
    raise exception 'the second-factor check must be a security definer yes/no for the Customer API only';
  end if;

  -- Tu cuenta (ADR 023): sessions are read and closed only through
  -- functions bound to kardo.subject; the sign-in history is append-only by
  -- a trigger and readable only by its owner; preferences are the only new
  -- writable profile columns.
  if to_regprocedure('kardo_private.customer_session_state(uuid, uuid)') is null
    or not has_function_privilege('kardo_customer_api', 'kardo_private.customer_session_state(uuid, uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.customer_sessions()', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.customer_revoke_session(uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.customer_revoke_other_sessions(uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_private.customer_sessions()', 'EXECUTE')
    or has_function_privilege('authenticated', 'kardo_private.customer_revoke_session(uuid)', 'EXECUTE')
    or has_function_privilege('kardo_customer_api', 'kardo_private.record_customer_sign_in()', 'EXECUTE')
    or has_function_privilege('kardo_customer_api', 'kardo_private.purge_old_sign_ins()', 'EXECUTE')
    or has_table_privilege('kardo_customer_api', 'kardo_core.account_sign_ins', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_core.account_sign_ins', 'UPDATE')
    or has_table_privilege('kardo_customer_api', 'kardo_core.account_sign_ins', 'DELETE')
    or not has_column_privilege('kardo_customer_api', 'kardo_core.profiles', 'preferred_name', 'UPDATE')
    or not has_column_privilege('kardo_customer_api', 'kardo_core.profiles', 'marketing_emails', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.profiles', 'email', 'UPDATE')
    or not exists (
      select 1 from pg_trigger
      where tgname = 'kardo_record_customer_sign_in' and tgrelid = 'auth.sessions'::regclass
    )
  then
    raise exception 'account sessions, sign-in history and preferences grants (ADR 023)';
  end if;

  -- Downgrade option B (ADR 023): only security definer functions move a
  -- Touchpoint out of the plan; the customer chooses through one of them,
  -- the hourly task through another, and nobody else writes the window.
  if has_table_privilege('kardo_customer_api', 'kardo_billing.plan_overages', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.plan_overages', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.touchpoints', 'plan_excluded_at', 'UPDATE')
    or has_function_privilege('kardo_customer_api', 'kardo_billing.refresh_plan_overage(uuid)', 'EXECUTE')
    or has_function_privilege('kardo_customer_api', 'kardo_billing.apply_default_plan_selection(uuid, uuid[])', 'EXECUTE')
    or has_function_privilege('kardo_customer_api', 'kardo_billing.apply_plan_selection_internal(uuid, uuid[], boolean, uuid)', 'EXECUTE')
    or has_function_privilege('kardo_billing_sync', 'kardo_billing.save_plan_selection(uuid, uuid[])', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_billing.save_plan_selection(uuid, uuid[])', 'EXECUTE')
    or not has_function_privilege('kardo_billing_sync', 'kardo_billing.refresh_plan_overage(uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_billing_sync', 'kardo_billing.apply_default_plan_selection(uuid, uuid[])', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_billing.plan_selection_candidates(uuid)', 'EXECUTE')
  then
    raise exception 'plan overage grants (ADR 023, downgrade option B)';
  end if;

  -- Tus datos (ADR 023): deleting an account goes only through its security
  -- definer function, which erases lone spaces with the billing deletion.
  if not has_function_privilege('kardo_customer_api', 'kardo_private.delete_customer_account(uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.customer_account_deletion_check(uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.customer_factors()', 'EXECUTE')
    or has_function_privilege('kardo_customer_api', 'kardo_private.erase_workspace_data(uuid, text)', 'EXECUTE')
    or has_function_privilege('kardo_billing_sync', 'kardo_private.erase_workspace_data(uuid, text)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_private.delete_customer_account(uuid)', 'EXECUTE')
    or has_function_privilege('authenticated', 'kardo_private.delete_customer_account(uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_billing_sync', 'kardo_private.delete_workspace_data(uuid, text, boolean)', 'EXECUTE')
    or exists (
      select 1 from pg_constraint c
      where c.contype = 'f' and c.confrelid = 'kardo_core.profiles'::regclass and c.confdeltype = 'a'
    )
  then
    raise exception 'account deletion grants and author references (ADR 023)';
  end if;

  -- IA de Kardo (relevo 29): la última sesión de IA por Experience, por membresía, nunca cambia de organización.
  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'design_ai_sessions' and rowsecurity
  ) then
    raise exception 'design_ai_sessions must exist with row level security enabled';
  end if;

  if exists (
    select 1 from pg_policies
    where schemaname = 'kardo_core' and tablename = 'design_ai_sessions'
      and 'kardo_customer_api' = any(roles)
      and (
        qual = 'true' or with_check = 'true'
        or coalesce(qual, with_check) not like '%is_workspace_member%'
      )
  ) then
    raise exception 'design_ai_sessions policies must be scoped by workspace membership';
  end if;

  if not has_column_privilege('kardo_customer_api', 'kardo_core.design_ai_sessions', 'generation', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.design_ai_sessions', 'workspace_id', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.design_ai_sessions', 'experience_id', 'UPDATE')
  then
    raise exception 'kardo_customer_api may update an AI session but never move it to another Experience or organization';
  end if;

  -- Dirección pública del negocio (rediseño de Links, 2026-10-04): única sin
  -- guiones, elegida solo con set_workspace_slug, y su historial cerrado.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'kardo_core' and tablename = 'workspaces'
      and indexname = 'workspaces_slug_key_unique' and indexdef like '%UNIQUE%'
  ) then
    raise exception 'workspaces.slug_key must be unique';
  end if;

  if has_column_privilege('kardo_customer_api', 'kardo_core.workspaces', 'slug', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.workspaces', 'slug_changed_at', 'UPDATE')
  then
    raise exception 'kardo_customer_api changes a business address only through set_workspace_slug';
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'workspace_slug_history' and rowsecurity
  ) or has_table_privilege('kardo_customer_api', 'kardo_core.workspace_slug_history', 'SELECT')
    or has_table_privilege('kardo_customer_api', 'kardo_core.workspace_slug_history', 'INSERT')
  then
    raise exception 'workspace_slug_history must have RLS and no customer API grants';
  end if;

  if not has_function_privilege('kardo_customer_api', 'kardo_core.set_workspace_slug(uuid, text)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_core.workspace_slug_available(text, uuid)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_core.set_workspace_slug(uuid, text)', 'EXECUTE')
  then
    raise exception 'business address functions are only for kardo_customer_api';
  end if;

  -- Dirección de cada Link: única dentro de su negocio, solo con
  -- set_link_slug, con historial cerrado y el link principal fuera del API.
  if not exists (
    select 1 from pg_indexes
    where schemaname = 'kardo_core' and tablename = 'touchpoints'
      and indexname = 'touchpoints_link_slug_unique' and indexdef like '%UNIQUE%'
  ) then
    raise exception 'a link address must be unique within its business';
  end if;

  if has_column_privilege('kardo_customer_api', 'kardo_core.touchpoints', 'slug', 'UPDATE')
    or has_column_privilege('kardo_customer_api', 'kardo_core.workspaces', 'main_link_id', 'UPDATE')
  then
    raise exception 'kardo_customer_api changes link addresses only through their functions';
  end if;

  if not exists (
    select 1 from pg_tables
    where schemaname = 'kardo_core' and tablename = 'touchpoint_slug_history' and rowsecurity
  ) or has_table_privilege('kardo_customer_api', 'kardo_core.touchpoint_slug_history', 'SELECT')
  then
    raise exception 'touchpoint_slug_history must have RLS and no customer API grants';
  end if;

  if not has_function_privilege('kardo_customer_api', 'kardo_core.set_link_slug(uuid, text)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_core.link_slug_available(uuid, text, uuid)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_core.set_main_link(uuid, uuid)', 'EXECUTE')
  then
    raise exception 'link address functions must be executable by kardo_customer_api';
  end if;

  -- 2026-10-07 relevo 36: the object's own state, step by step.
  if not exists (
    select 1 from pg_constraint
    where conname = 'touchpoints_object_replace_steps'
      and conrelid = 'kardo_core.touchpoints'::regclass
  ) or not exists (
    select 1 from pg_constraint
    where conname = 'touchpoints_object_not_links'
      and conrelid = 'kardo_core.touchpoints'::regclass
  ) then
    raise exception 'touchpoints must keep the object setup constraints';
  end if;

  if not has_column_privilege('kardo_customer_api', 'kardo_core.touchpoints', 'object_placed_at', 'UPDATE')
    or not has_column_privilege('kardo_customer_api', 'kardo_core.touchpoints', 'object_replacing_at', 'UPDATE')
  then
    raise exception 'kardo_customer_api must be able to record the object setup steps';
  end if;

  -- 2026-10-09 ADR 024: the plan belongs to the person (billing account).
  if to_regclass('kardo_billing.accounts') is null
    or to_regclass('kardo_billing.extras') is null
    or to_regclass('kardo_billing.subscription_items') is null
    or to_regclass('kardo_billing.account_plans') is null then
    raise exception 'billing accounts, extras, subscription items and account plans must exist';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'kardo_core' and table_name = 'workspaces' and column_name = 'billing_account_id'
  ) then
    raise exception 'workspaces must belong to a billing account';
  end if;
  if has_table_privilege('kardo_customer_api', 'kardo_billing.account_plans', 'INSERT')
    or has_table_privilege('kardo_customer_api', 'kardo_billing.subscription_items', 'INSERT') then
    raise exception 'the customer API must never write account plans or subscription items';
  end if;
  if not exists (
    select 1 from pg_trigger
    where tgname = 'workspace_memberships_assign_account'
      and tgrelid = 'kardo_core.workspace_memberships'::regclass
  ) then
    raise exception 'a new organization must enter its owner''s billing account';
  end if;

  -- 2026-10-13 ADR 026: Kardo pieces are born in Operations and activated
  -- with a code. Codes are only read by staff and the security definer
  -- functions; the panel never creates a piece nor turns one into a QR.
  if to_regclass('kardo_core.piece_batches') is null
    or to_regclass('kardo_billing.kits') is null
    or to_regclass('kardo_private.piece_claim_attempts') is null then
    raise exception 'piece batches, kits and claim attempts must exist';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.touchpoints'::regclass and conname = 'touchpoints_piece_model_kind'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.touchpoints'::regclass and conname = 'touchpoints_unowned_only_pieces'
  ) or not exists (
    select 1 from pg_constraint
    where conrelid = 'kardo_core.touchpoints'::regclass and conname = 'touchpoints_piece_public_id'
  ) or not exists (
    select 1 from pg_trigger
    where tgname = 'touchpoints_piece_kind' and tgrelid = 'kardo_core.touchpoints'::regclass
  ) then
    raise exception 'a Kardo piece keeps its kind, its model and its address shape';
  end if;
  if has_table_privilege('kardo_customer_api', 'kardo_core.touchpoint_activations', 'SELECT')
    or has_table_privilege('kardo_customer_api', 'kardo_core.piece_batches', 'SELECT')
    or has_table_privilege('kardo_customer_api', 'kardo_private.piece_claim_attempts', 'SELECT') then
    raise exception 'the customer API must never read activation codes';
  end if;
  if not has_function_privilege('kardo_customer_api', 'kardo_private.preview_piece_claim(uuid, text, text)', 'EXECUTE')
    or not has_function_privilege('kardo_customer_api', 'kardo_private.claim_kardo_pieces(uuid, text, text, jsonb, uuid)', 'EXECUTE')
    or has_function_privilege('kardo_customer_api', 'kardo_private.create_piece_batch(text, jsonb, text, text, text, jsonb)', 'EXECUTE')
    or not has_function_privilege('kardo_staff_api', 'kardo_private.create_piece_batch(text, jsonb, text, text, text, jsonb)', 'EXECUTE')
    or has_function_privilege('anon', 'kardo_private.claim_kardo_pieces(uuid, text, text, jsonb, uuid)', 'EXECUTE')
    or has_function_privilege('kardo_customer_api', 'kardo_billing.grant_kit_panel(uuid, text)', 'EXECUTE') then
    raise exception 'only staff creates pieces and only the activation functions claim them';
  end if;
  if not exists (
    select 1 from pg_policies
    where schemaname = 'kardo_core' and tablename = 'touchpoints'
      and policyname = 'customer api touchpoints no pieces' and permissive = 'RESTRICTIVE'
  ) then
    raise exception 'the customer API must never insert a Kardo piece';
  end if;
end;
$$;
