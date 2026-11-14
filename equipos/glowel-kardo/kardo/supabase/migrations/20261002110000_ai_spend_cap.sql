-- AI spend cap per organization and month, in US cents (owner decision,
-- 2026-10-01: table D of the pricing research, with Esencial at US$1).
-- Plans carry `ai.spend_cents_month`; the Customer API checks it before each
-- generation (custom-html limiter, next to `ai.generations_month`). The
-- month's spend is the cost the API audits with every generation
-- (`metadata.costMicroUsd` of experience.custom_html_generated and
-- experience.design_generated), rounded up to whole cents. A generation that
-- fails after spending is not audited, so it does not count here; the
-- global daily cap (kardo_core.custom_html_ai_spend) still covers it.
create or replace function kardo_billing.workspace_usage(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_usage jsonb;
begin
  if not (kardo_private.is_workspace_member(p_workspace_id) or kardo_private.is_active_staff()) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;

  select jsonb_build_object(
    'touchpoints.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = p_workspace_id and t.kind <> 'link'
        and t.status in ('assigned', 'active', 'paused')
    ),
    'links.max', (
      select count(*) from kardo_core.touchpoints t
      where t.workspace_id = p_workspace_id and t.kind = 'link'
        and t.status in ('assigned', 'active', 'paused')
    ),
    'members.max', (
      (select count(*) from kardo_core.workspace_memberships m where m.workspace_id = p_workspace_id)
      + (select count(*) from kardo_core.workspace_invitations i
         where i.workspace_id = p_workspace_id and i.status = 'pending' and i.expires_at > now())
    ),
    'qr_designs.max', (
      select count(*) from kardo_core.qr_design_templates q where q.workspace_id = p_workspace_id
    ),
    'assets.storage_mb', (
      select coalesce(ceil(sum(a.byte_size) / 1048576.0), 0)::bigint
      from kardo_core.assets a
      where a.workspace_id = p_workspace_id and a.deleted_at is null
        and a.status not in ('rejected', 'deleted')
    ),
    'ai.generations_month', (
      select coalesce(sum(u.generations), 0)
      from kardo_core.custom_html_ai_usage u
      where u.workspace_id = p_workspace_id
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
      where e.workspace_id = p_workspace_id
        and e.action in ('experience.custom_html_generated', 'experience.design_generated')
        and e.occurred_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc'
    )
  ) into v_usage;

  return v_usage;
end;
$$;
revoke all on function kardo_billing.workspace_usage(uuid) from public;
grant execute on function kardo_billing.workspace_usage(uuid) to kardo_customer_api, kardo_staff_api;
