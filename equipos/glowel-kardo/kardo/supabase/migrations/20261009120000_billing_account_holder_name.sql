-- Cobro por persona (ADR 024): el nombre de quien tiene el plan, sin el
-- «· Personal» que el alta pone hasta que la persona elige su nombre.

create or replace function kardo_billing.workspace_account(p_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account uuid;
  v_profile uuid;
  v_holder text;
begin
  if not (kardo_private.is_workspace_member(p_workspace_id) or kardo_private.is_active_staff()) then
    raise exception using errcode = 'P0001', message = 'FORBIDDEN';
  end if;
  v_account := kardo_billing.account_of(p_workspace_id);
  if v_account is null then
    return null;
  end if;
  select a.profile_id into v_profile from kardo_billing.accounts a where a.id = v_account;
  -- The name the person chose; the sign-up's default is «Name · Personal».
  select coalesce(
      nullif(btrim(p.preferred_name), ''),
      nullif(btrim(regexp_replace(p.display_name, ' · Personal$', '')), ''),
      p.email
    )
    into v_holder
  from kardo_core.profiles p where p.id = v_profile;
  return jsonb_build_object(
    'accountId', v_account,
    'holderName', v_holder,
    'isHolder', v_profile is not null and v_profile = kardo_private.current_customer_subject(),
    'internal', kardo_billing.is_internal_workspace(p_workspace_id),
    'excludedAt', (select w.plan_excluded_at from kardo_core.workspaces w where w.id = p_workspace_id),
    'organizationsUsed', kardo_billing.account_organization_count(v_account),
    'organizationsLimit', kardo_billing.account_organization_limit(v_account),
    'extras', kardo_billing.account_extras(v_account),
    'organizations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', w.id,
        'name', w.name,
        'excluded', w.plan_excluded_at is not null,
        'internal', exists (select 1 from kardo_billing.internal_workspaces i where i.workspace_id = w.id)
      ) order by w.created_at)
      from kardo_core.workspaces w
      where w.billing_account_id = v_account and w.kind = 'organization' and w.deleted_at is null
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function kardo_billing.workspace_account(uuid) from public;
grant execute on function kardo_billing.workspace_account(uuid) to kardo_customer_api, kardo_staff_api;
