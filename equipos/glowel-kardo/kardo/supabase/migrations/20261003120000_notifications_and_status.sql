-- Notificaciones de Kardo y estado del servicio (ADR 022).
--
-- 1. Notificaciones: el staff las escribe desde Operations y cada persona las
--    lee en la campana del panel. La audiencia se evalua AL LEER (sin una fila
--    por destinatario): una organizacion que entra a un plan despues tambien
--    ve los avisos vigentes de ese plan. La lectura es por persona.
-- 2. Incidentes y mantenimientos: el staff los escribe y la Staff API los
--    envia al Worker de estado, que es quien responde al panel.
-- 3. Prueba de la base para GET /health/ready del Customer API.

-- ---------------------------------------------------------------------------
-- 1. Notificaciones
-- ---------------------------------------------------------------------------

create table if not exists kardo_core.notifications (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('news', 'maintenance', 'account', 'tip')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  -- Texto plano: el panel nunca lo interpreta como HTML.
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  action_label text check (action_label is null or char_length(btrim(action_label)) between 1 and 40),
  -- Ruta del panel ("/billing") o https normalizada por la Staff API.
  action_url text check (
    action_url is null
    or (char_length(action_url) <= 500
        and (action_url ~ '^/[A-Za-z0-9/_-]*([?][A-Za-z0-9=&_-]*)?$' or action_url ~ '^https://[^\s<>"]+$'))
  ),
  audience text not null check (audience in ('all', 'segment', 'workspace', 'profile')),
  workspace_id uuid references kardo_core.workspaces(id) on delete cascade,
  profile_id uuid references kardo_core.profiles(id) on delete cascade,
  plan_codes text[] check (plan_codes is null or cardinality(plan_codes) between 1 and 20),
  -- Segun kardo_billing.resolve_effective_plan: trial = prueba de Kardo,
  -- subscribed = suscripcion de Stripe viva, manual = plan puesto por staff,
  -- none = plan por defecto o ninguno.
  billing_states text[] check (
    billing_states is null
    or (cardinality(billing_states) between 1 and 4
        and billing_states <@ array['trial', 'subscribed', 'manual', 'none']::text[])
  ),
  account_types text[] check (
    account_types is null
    or (cardinality(account_types) between 1 and 2
        and account_types <@ array['personal', 'business']::text[])
  ),
  roles kardo_core.membership_role[] check (roles is null or cardinality(roles) between 1 and 4),
  pinned boolean not null default false,
  publish_at timestamptz not null default now(),
  expires_at timestamptz,
  created_by uuid references kardo_staff.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references kardo_staff.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  -- Se corrigio el texto despues de publicar (no vuelve a avisar).
  edited_at timestamptz,
  retired_at timestamptz,
  retired_by uuid references kardo_staff.staff_profiles(id) on delete set null,
  constraint notifications_action_pair check ((action_label is null) = (action_url is null)),
  constraint notifications_expiry check (expires_at is null or expires_at > publish_at),
  constraint notifications_audience_shape check (
    case audience
      when 'all' then workspace_id is null and profile_id is null
        and plan_codes is null and billing_states is null and account_types is null
      when 'segment' then workspace_id is null and profile_id is null
        and (plan_codes is not null or billing_states is not null or account_types is not null)
      when 'workspace' then workspace_id is not null and profile_id is null
        and plan_codes is null and billing_states is null and account_types is null
      when 'profile' then profile_id is not null and workspace_id is null
        and plan_codes is null and billing_states is null and account_types is null and roles is null
      else false
    end
  )
);

create index if not exists notifications_live_idx
  on kardo_core.notifications (publish_at desc, id desc) where retired_at is null;
create index if not exists notifications_workspace_idx
  on kardo_core.notifications (workspace_id) where workspace_id is not null;
create index if not exists notifications_profile_idx
  on kardo_core.notifications (profile_id) where profile_id is not null;
create index if not exists notifications_created_by_idx on kardo_core.notifications (created_by);
create index if not exists notifications_updated_by_idx on kardo_core.notifications (updated_by);
create index if not exists notifications_retired_by_idx on kardo_core.notifications (retired_by);

create table if not exists kardo_core.notification_reads (
  notification_id uuid not null references kardo_core.notifications(id) on delete cascade,
  profile_id uuid not null references kardo_core.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, profile_id)
);
create index if not exists notification_reads_profile_idx
  on kardo_core.notification_reads (profile_id);

-- Ultima vez que la persona abrio la campana: decide si se abre sola.
create table if not exists kardo_core.notification_inbox (
  profile_id uuid primary key references kardo_core.profiles(id) on delete cascade,
  opened_at timestamptz not null default now()
);

-- La audiencia no cambia despues de crear la notificacion (para cambiarla se
-- retira y se crea otra), una retirada ya no se toca y la fecha de
-- publicacion solo se mueve mientras no se haya publicado.
create or replace function kardo_core.guard_notification_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.retired_at is not null then
    raise exception using errcode = 'P0001', message = 'NOTIFICATION_RETIRED';
  end if;
  if new.audience is distinct from old.audience
    or new.workspace_id is distinct from old.workspace_id
    or new.profile_id is distinct from old.profile_id
    or new.plan_codes is distinct from old.plan_codes
    or new.billing_states is distinct from old.billing_states
    or new.account_types is distinct from old.account_types
    or new.roles is distinct from old.roles
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception using errcode = 'P0001', message = 'NOTIFICATION_AUDIENCE_LOCKED';
  end if;
  if new.publish_at is distinct from old.publish_at and old.publish_at <= now() then
    raise exception using errcode = 'P0001', message = 'NOTIFICATION_ALREADY_PUBLISHED';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists notifications_guard on kardo_core.notifications;
create trigger notifications_guard
  before update on kardo_core.notifications
  for each row execute function kardo_core.guard_notification_update();

-- Reglas de visibilidad en un solo lugar (ADR 022 §1). La usan la politica
-- RLS del Customer API y la consulta de la bandeja.
create or replace function kardo_private.notification_visible(
  p_profile uuid,
  p_audience text,
  p_workspace uuid,
  p_target_profile uuid,
  p_plan_codes text[],
  p_billing_states text[],
  p_account_types text[],
  p_roles kardo_core.membership_role[],
  p_pinned boolean,
  p_publish_at timestamptz,
  p_expires_at timestamptz,
  p_retired_at timestamptz
) returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_profile is not null
    and p_retired_at is null
    and p_publish_at <= now()
    and (p_expires_at is null or p_expires_at > now())
    and case p_audience
      when 'profile' then p_target_profile = p_profile
      when 'workspace' then exists (
        select 1 from kardo_core.workspace_memberships membership
        where membership.workspace_id = p_workspace
          and membership.profile_id = p_profile
          and (p_roles is null or membership.role = any (p_roles))
      )
      when 'all' then
        (p_pinned or p_publish_at >= (select profile.created_at from kardo_core.profiles profile where profile.id = p_profile))
        and exists (
          select 1 from kardo_core.workspace_memberships membership
          where membership.profile_id = p_profile
            and (p_roles is null or membership.role = any (p_roles))
        )
      when 'segment' then
        (p_pinned or p_publish_at >= (select profile.created_at from kardo_core.profiles profile where profile.id = p_profile))
        and exists (
          select 1
          from kardo_core.workspace_memberships membership
          join kardo_core.workspaces workspace on workspace.id = membership.workspace_id
          left join lateral kardo_billing.resolve_effective_plan(membership.workspace_id) effective on true
          left join kardo_core.plans plan on plan.id = effective.plan_id
          where membership.profile_id = p_profile
            and (p_roles is null or membership.role = any (p_roles))
            and (p_account_types is null or workspace.account_type = any (p_account_types))
            and (p_plan_codes is null or plan.code = any (p_plan_codes))
            and (
              p_billing_states is null
              or (case effective.source
                    when 'trial' then 'trial'
                    when 'subscription' then 'subscribed'
                    when 'manual' then 'manual'
                    else 'none'
                  end) = any (p_billing_states)
            )
        )
      else false
    end;
$$;
revoke all on function kardo_private.notification_visible(
  uuid, text, uuid, uuid, text[], text[], text[], kardo_core.membership_role[], boolean, timestamptz, timestamptz, timestamptz
) from public;
grant execute on function kardo_private.notification_visible(
  uuid, text, uuid, uuid, text[], text[], text[], kardo_core.membership_role[], boolean, timestamptz, timestamptz, timestamptz
) to kardo_customer_api;

-- A cuantas personas y organizaciones llegaria hoy una audiencia. Solo staff
-- con notifications.read; nunca dice quienes son.
create or replace function kardo_private.notification_audience_count(
  p_audience text,
  p_workspace uuid,
  p_target_profile uuid,
  p_plan_codes text[],
  p_billing_states text[],
  p_account_types text[],
  p_roles kardo_core.membership_role[]
) returns table (profiles bigint, workspaces bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not kardo_private.staff_has_permission('notifications.read') then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  if p_audience = 'profile' then
    return query
    select count(distinct profile.id), count(distinct membership.workspace_id)
    from kardo_core.profiles profile
    left join kardo_core.workspace_memberships membership on membership.profile_id = profile.id
    where profile.id = p_target_profile;
    return;
  end if;

  return query
  select count(distinct membership.profile_id), count(distinct membership.workspace_id)
  from kardo_core.workspace_memberships membership
  join kardo_core.workspaces workspace on workspace.id = membership.workspace_id
  left join lateral kardo_billing.resolve_effective_plan(membership.workspace_id) effective on true
  left join kardo_core.plans plan on plan.id = effective.plan_id
  where (p_roles is null or membership.role = any (p_roles))
    and case p_audience
      when 'all' then true
      when 'workspace' then membership.workspace_id = p_workspace
      when 'segment' then
        (p_account_types is null or workspace.account_type = any (p_account_types))
        and (p_plan_codes is null or plan.code = any (p_plan_codes))
        and (
          p_billing_states is null
          or (case effective.source
                when 'trial' then 'trial'
                when 'subscription' then 'subscribed'
                when 'manual' then 'manual'
                else 'none'
              end) = any (p_billing_states)
        )
      else false
    end;
end;
$$;
revoke all on function kardo_private.notification_audience_count(
  text, uuid, uuid, text[], text[], text[], kardo_core.membership_role[]
) from public;
grant execute on function kardo_private.notification_audience_count(
  text, uuid, uuid, text[], text[], text[], kardo_core.membership_role[]
) to kardo_staff_api;

alter table kardo_core.notifications enable row level security;
alter table kardo_core.notification_reads enable row level security;
alter table kardo_core.notification_inbox enable row level security;

-- Cliente: solo lo que le corresponde; nunca quien del staff lo escribio.
grant select (
  id, category, title, body, action_label, action_url, audience, workspace_id, profile_id,
  plan_codes, billing_states, account_types, roles, pinned, publish_at, expires_at,
  edited_at, retired_at
) on kardo_core.notifications to kardo_customer_api;

drop policy if exists "customer api notifications read" on kardo_core.notifications;
create policy "customer api notifications read" on kardo_core.notifications
  for select to kardo_customer_api
  using (kardo_private.notification_visible(
    kardo_private.current_customer_subject(), audience, workspace_id, profile_id,
    plan_codes, billing_states, account_types, roles, pinned, publish_at, expires_at, retired_at
  ));

grant select, insert on kardo_core.notification_reads to kardo_customer_api;
drop policy if exists "customer api notification reads own" on kardo_core.notification_reads;
create policy "customer api notification reads own" on kardo_core.notification_reads
  for select to kardo_customer_api
  using (profile_id = kardo_private.current_customer_subject());
drop policy if exists "customer api notification reads insert" on kardo_core.notification_reads;
create policy "customer api notification reads insert" on kardo_core.notification_reads
  for insert to kardo_customer_api
  with check (
    profile_id = kardo_private.current_customer_subject()
    and exists (select 1 from kardo_core.notifications n where n.id = notification_id)
  );

grant select, insert, update (opened_at) on kardo_core.notification_inbox to kardo_customer_api;
drop policy if exists "customer api notification inbox own" on kardo_core.notification_inbox;
create policy "customer api notification inbox own" on kardo_core.notification_inbox
  for all to kardo_customer_api
  using (profile_id = kardo_private.current_customer_subject())
  with check (profile_id = kardo_private.current_customer_subject());

-- Staff: leer con notifications.read; crear, editar y retirar con send (una
-- organizacion o persona) o broadcast (todos o un segmento).
grant select on kardo_core.notifications to kardo_staff_api;
grant insert on kardo_core.notifications to kardo_staff_api;
grant update (
  category, title, body, action_label, action_url, pinned, publish_at, expires_at,
  updated_by, edited_at, retired_at, retired_by
) on kardo_core.notifications to kardo_staff_api;
grant select (notification_id, read_at) on kardo_core.notification_reads to kardo_staff_api;

drop policy if exists "staff api notifications read" on kardo_core.notifications;
create policy "staff api notifications read" on kardo_core.notifications
  for select to kardo_staff_api
  using (kardo_private.staff_has_permission('notifications.read'));

drop policy if exists "staff api notifications insert" on kardo_core.notifications;
create policy "staff api notifications insert" on kardo_core.notifications
  for insert to kardo_staff_api
  with check (
    created_by = kardo_private.current_staff_subject()
    and kardo_private.staff_has_permission(
      case when audience in ('all', 'segment') then 'notifications.broadcast' else 'notifications.send' end
    )
  );

drop policy if exists "staff api notifications update" on kardo_core.notifications;
create policy "staff api notifications update" on kardo_core.notifications
  for update to kardo_staff_api
  using (kardo_private.staff_has_permission(
    case when audience in ('all', 'segment') then 'notifications.broadcast' else 'notifications.send' end
  ))
  with check (
    updated_by = kardo_private.current_staff_subject()
    and kardo_private.staff_has_permission(
      case when audience in ('all', 'segment') then 'notifications.broadcast' else 'notifications.send' end
    )
  );

drop policy if exists "staff api notification reads count" on kardo_core.notification_reads;
create policy "staff api notification reads count" on kardo_core.notification_reads
  for select to kardo_staff_api
  using (kardo_private.staff_has_permission('notifications.read'));

-- ---------------------------------------------------------------------------
-- 2. Incidentes y mantenimientos
-- ---------------------------------------------------------------------------

create table if not exists kardo_core.status_incidents (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('incident', 'maintenance')),
  title text not null check (char_length(btrim(title)) between 1 and 120),
  impact text not null check (impact in ('degraded', 'partial_outage', 'major_outage', 'maintenance')),
  -- Areas que ve el cliente (ADR 022 §4).
  components text[] not null check (
    cardinality(components) between 1 and 6
    and components <@ array['pages', 'panel', 'publishing', 'files', 'analytics', 'ai']::text[]
  ),
  starts_at timestamptz not null default now(),
  -- Fin previsto de un mantenimiento.
  ends_at timestamptz,
  resolved_at timestamptz,
  created_by uuid references kardo_staff.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_by uuid references kardo_staff.staff_profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint status_incidents_window check (ends_at is null or ends_at > starts_at),
  constraint status_incidents_kind_impact check (
    (kind = 'maintenance' and impact = 'maintenance' and ends_at is not null)
    or (kind = 'incident' and impact <> 'maintenance')
  )
);
create index if not exists status_incidents_open_idx
  on kardo_core.status_incidents (starts_at desc) where resolved_at is null;
create index if not exists status_incidents_created_by_idx on kardo_core.status_incidents (created_by);
create index if not exists status_incidents_updated_by_idx on kardo_core.status_incidents (updated_by);

create table if not exists kardo_core.status_incident_updates (
  id uuid primary key default gen_random_uuid(),
  incident_id uuid not null references kardo_core.status_incidents(id) on delete cascade,
  status text not null check (status in (
    'investigating', 'identified', 'monitoring', 'resolved',
    'scheduled', 'in_progress', 'completed'
  )),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  created_by uuid references kardo_staff.staff_profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists status_incident_updates_incident_idx
  on kardo_core.status_incident_updates (incident_id, created_at desc);
create index if not exists status_incident_updates_created_by_idx
  on kardo_core.status_incident_updates (created_by);

-- Version de cada envio al Worker de estado: descarta envios viejos.
create sequence if not exists kardo_core.status_publication_seq;

alter table kardo_core.status_incidents enable row level security;
alter table kardo_core.status_incident_updates enable row level security;

grant select, insert on kardo_core.status_incidents to kardo_staff_api;
grant update (title, impact, components, starts_at, ends_at, resolved_at, updated_by, updated_at)
  on kardo_core.status_incidents to kardo_staff_api;
grant select, insert on kardo_core.status_incident_updates to kardo_staff_api;
grant usage on sequence kardo_core.status_publication_seq to kardo_staff_api;

drop policy if exists "staff api status incidents read" on kardo_core.status_incidents;
create policy "staff api status incidents read" on kardo_core.status_incidents
  for select to kardo_staff_api
  using (kardo_private.staff_has_permission('status.read'));
drop policy if exists "staff api status incidents insert" on kardo_core.status_incidents;
create policy "staff api status incidents insert" on kardo_core.status_incidents
  for insert to kardo_staff_api
  with check (
    created_by = kardo_private.current_staff_subject()
    and kardo_private.staff_has_permission('status.write')
  );
drop policy if exists "staff api status incidents update" on kardo_core.status_incidents;
create policy "staff api status incidents update" on kardo_core.status_incidents
  for update to kardo_staff_api
  using (kardo_private.staff_has_permission('status.write'))
  with check (
    updated_by = kardo_private.current_staff_subject()
    and kardo_private.staff_has_permission('status.write')
  );

drop policy if exists "staff api status updates read" on kardo_core.status_incident_updates;
create policy "staff api status updates read" on kardo_core.status_incident_updates
  for select to kardo_staff_api
  using (kardo_private.staff_has_permission('status.read'));
drop policy if exists "staff api status updates insert" on kardo_core.status_incident_updates;
create policy "staff api status updates insert" on kardo_core.status_incident_updates
  for insert to kardo_staff_api
  with check (
    created_by = kardo_private.current_staff_subject()
    and kardo_private.staff_has_permission('status.write')
  );

-- ---------------------------------------------------------------------------
-- 3. Prueba de la base para GET /health/ready (Worker de estado)
-- ---------------------------------------------------------------------------

-- Cuanto lleva esperando el trabajo de publicacion mas viejo. Sin datos de
-- clientes: solo una edad y una cuenta.
create or replace function kardo_private.status_probe()
returns table (oldest_pending_seconds integer, pending_jobs integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(extract(epoch from now() - min(job.created_at))::integer, 0),
    count(*)::integer
  from kardo_core.publication_jobs job
  where job.status in ('pending', 'running');
$$;
revoke all on function kardo_private.status_probe() from public;
grant execute on function kardo_private.status_probe() to kardo_customer_api;

-- ---------------------------------------------------------------------------
-- 4. Permisos de staff
-- ---------------------------------------------------------------------------

insert into kardo_staff.permissions (role_id, permission)
select role.id, catalog.permission
from kardo_staff.roles role
join (
  values
    ('platform-admin', 'notifications.read'),
    ('platform-admin', 'notifications.send'),
    ('platform-admin', 'notifications.broadcast'),
    ('platform-admin', 'status.read'),
    ('platform-admin', 'status.write'),
    ('operations', 'notifications.read'),
    ('operations', 'notifications.send'),
    ('operations', 'notifications.broadcast'),
    ('operations', 'status.read'),
    ('operations', 'status.write'),
    ('support', 'notifications.read'),
    ('support', 'notifications.send'),
    ('support', 'status.read'),
    ('commercial', 'notifications.read'),
    ('commercial', 'notifications.send'),
    ('commercial', 'notifications.broadcast'),
    ('commercial', 'status.read'),
    ('trust-safety', 'notifications.read'),
    ('trust-safety', 'status.read')
) as catalog(role_code, permission) on catalog.role_code = role.code
on conflict (role_id, permission) do nothing;
