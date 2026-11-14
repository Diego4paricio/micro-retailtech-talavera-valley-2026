-- Cobro por persona (ADR 024): los miembros de la bolsa son personas
-- distintas. Quien está en varias organizaciones de la cuenta (la Owner, por
-- ejemplo) cuenta una sola vez; una invitación pendiente cuenta como una
-- persona más si su correo aún no está.

create or replace function kardo_billing.usage_of(p_workspace_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'organizations.max', (
      select count(*) from kardo_core.workspaces w
      where w.id = any(p_workspace_ids) and w.kind = 'organization'
    ),
    'touchpoints.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = any(p_workspace_ids) and t.kind <> 'link'
        and t.status in ('assigned', 'active', 'paused')
        and t.plan_excluded_at is null
    ),
    'links.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = any(p_workspace_ids) and t.kind = 'link'
        and t.status in ('assigned', 'active', 'paused')
        and t.plan_excluded_at is null
    ),
    -- Personas, no lugares: quien está en dos organizaciones cuenta una vez.
    'members.max', (
      select count(*) from (
        select coalesce(lower(pr.email), m.profile_id::text)
        from kardo_core.workspace_memberships m
        left join kardo_core.profiles pr on pr.id = m.profile_id
        where m.workspace_id = any(p_workspace_ids)
        union
        select lower(i.email) from kardo_core.workspace_invitations i
        where i.workspace_id = any(p_workspace_ids) and i.status = 'pending' and i.expires_at > now()
      ) people
    ),
    'qr_designs.max', (
      select count(*) from kardo_core.qr_design_templates q where q.workspace_id = any(p_workspace_ids)
    ),
    'assets.storage_mb', (
      select coalesce(ceil(sum(a.byte_size) / 1048576.0), 0)::bigint
      from kardo_core.assets a
      where a.workspace_id = any(p_workspace_ids) and a.deleted_at is null
        and a.status not in ('rejected', 'deleted')
    ),
    'ai.generations_month', (
      select coalesce(sum(u.generations), 0)
      from kardo_core.custom_html_ai_usage u
      where u.workspace_id = any(p_workspace_ids)
        and u.usage_day >= date_trunc('month', (now() at time zone 'utc'))::date
    ),
    'ai.spend_cents_month', (
      select coalesce(ceil(sum(
        case
          when e.metadata ->> 'costMicroUsd' ~ '^[0-9]{1,15}$'
            then (e.metadata ->> 'costMicroUsd')::bigint
          else 0
        end
      ) / 10000.0), 0)::bigint
      from kardo_audit.events e
      where e.workspace_id = any(p_workspace_ids)
        and e.action in ('experience.custom_html_generated', 'experience.design_generated')
        and e.occurred_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    )
  );
$$;
revoke all on function kardo_billing.usage_of(uuid[]) from public;
