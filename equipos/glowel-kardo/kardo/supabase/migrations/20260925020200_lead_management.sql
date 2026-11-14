-- Gestion de leads: estado de seguimiento, borrado por Owner/Admin y
-- retencion por workspace con purga diaria (pg_cron). Por defecto 365 dias;
-- null conserva los leads indefinidamente (decision explicita del cliente).

alter table kardo_core.leads
  add column if not exists status text not null default 'new',
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table kardo_core.leads
    add constraint leads_status_allowed check (status in ('new', 'contacted', 'closed'));
exception when duplicate_object then null;
end $$;

create index if not exists leads_workspace_created_idx on kardo_core.leads (workspace_id, created_at desc);

alter table kardo_core.workspaces
  add column if not exists lead_retention_days integer default 365;

do $$ begin
  alter table kardo_core.workspaces
    add constraint workspaces_lead_retention_allowed
    check (lead_retention_days is null or lead_retention_days in (30, 90, 180, 365, 730));
exception when duplicate_object then null;
end $$;

-- Cliente: solo Owner/Admin cambian el estado o borran (datos personales).
grant update (status, updated_at) on kardo_core.leads to kardo_customer_api;
grant delete on kardo_core.leads to kardo_customer_api;

drop policy if exists "customer api leads update" on kardo_core.leads;
create policy "customer api leads update" on kardo_core.leads
  for update to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'))
  with check (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));

drop policy if exists "customer api leads delete" on kardo_core.leads;
create policy "customer api leads delete" on kardo_core.leads
  for delete to kardo_customer_api
  using (kardo_private.workspace_role(workspace_id) in ('owner', 'admin'));

-- Purga: borra los leads vencidos segun la retencion de cada workspace
-- (lead_deliveries cae en cascada) y deja un evento de auditoria por
-- workspace con el conteo, sin datos personales.
create or replace function kardo_private.purge_expired_leads()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  purged integer := 0;
begin
  with deleted as (
    delete from kardo_core.leads lead
    using kardo_core.workspaces workspace
    where lead.workspace_id = workspace.id
      and workspace.lead_retention_days is not null
      and lead.created_at < now() - make_interval(days => workspace.lead_retention_days)
    returning lead.workspace_id
  ),
  per_workspace as (
    select workspace_id, count(*)::integer as total from deleted group by workspace_id
  ),
  audited as (
    insert into kardo_audit.events (workspace_id, actor_type, action, target_type, target_id, result, metadata)
    select workspace_id, 'service', 'lead.retention_purged', 'workspace', workspace_id, 'succeeded',
           jsonb_build_object('count', total)
    from per_workspace
    returning (metadata ->> 'count')::integer as total
  )
  select coalesce(sum(total), 0)::integer into purged from audited;
  return purged;
end;
$$;

revoke all on function kardo_private.purge_expired_leads() from public;

create extension if not exists pg_cron;

select cron.schedule(
  'kardo-purge-expired-leads',
  '17 3 * * *',
  'select kardo_private.purge_expired_leads()'
);
