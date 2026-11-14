-- Borrar una organización con un grupo que usa un diseño de la biblioteca
-- (relevo 38, 2026-10-08). `erase_workspace_data` borraba los diseños antes
-- que los grupos, y la llave `touchpoint_groups_qr_template_same_workspace`
-- lo impedía: «Borrar mi cuenta» respondía 500 y el borrado a los 90 días
-- fallaba para esa organización. Lo encontró la E2E qr-studio-touchpoints.
-- Solo cambia el orden: primero los grupos, después los diseños.

create or replace function kardo_private.erase_workspace_data(
  p_workspace_id uuid,
  p_reason text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counts jsonb;
  v_cleanup integer;
begin
  if p_reason is null or char_length(btrim(p_reason)) not between 3 and 200 then
    raise exception using errcode = 'P0001', message = 'INVALID_REASON';
  end if;
  v_counts := kardo_private.workspace_deletion_counts(p_workspace_id);

  -- El registro va primero: autoriza la marca y quitar al ultimo Owner.
  insert into kardo_billing.workspace_deletions (workspace_id, reason, counts)
  values (p_workspace_id, btrim(p_reason), v_counts);

  -- Limpieza fuera de la base, despues del commit.
  insert into kardo_billing.deletion_cleanup (workspace_id, kind, target)
  select p_workspace_id, 'resolver', jsonb_build_object('publicId', t.public_id)
  from kardo_core.touchpoints t
  where t.workspace_id = p_workspace_id;
  insert into kardo_billing.deletion_cleanup (workspace_id, kind, target)
  select p_workspace_id, 'asset', jsonb_build_object(
    'assetId', a.id,
    'storageKey', a.storage_key,
    'sha256', case when a.derivative_key is not null then a.sha256 end,
    'deleteDerivative', a.derivative_key is not null and not exists (
      select 1 from kardo_core.assets other
      where other.sha256 = a.sha256
        and other.workspace_id <> p_workspace_id
        and other.status in ('validated', 'published')
    )
  )
  from kardo_core.assets a
  where a.workspace_id = p_workspace_id and a.status <> 'deleted';
  select count(*) into v_cleanup
  from kardo_billing.deletion_cleanup c where c.workspace_id = p_workspace_id;

  update kardo_core.touchpoints set
    status = 'retired',
    operational_name = null,
    qr_design = null,
    qr_design_updated_at = null,
    qr_template_id = null,
    qr_last_export_at = null,
    qr_last_export_fingerprint = null,
    qr_last_export_format = null,
    updated_at = now()
  where workspace_id = p_workspace_id;
  delete from kardo_core.touchpoint_activations
  where touchpoint_id in (
    select t.id from kardo_core.touchpoints t where t.workspace_id = p_workspace_id
  );

  delete from kardo_core.experience_targets where workspace_id = p_workspace_id;
  delete from kardo_core.publication_requests where workspace_id = p_workspace_id;
  delete from kardo_core.item_availability where workspace_id = p_workspace_id;
  delete from kardo_core.publications
  where touchpoint_id in (
    select t.id from kardo_core.touchpoints t where t.workspace_id = p_workspace_id
  );
  delete from kardo_core.experience_assets
  where experience_id in (
    select e.id from kardo_core.experiences e where e.workspace_id = p_workspace_id
  );
  delete from kardo_core.experience_versions
  where experience_id in (
    select e.id from kardo_core.experiences e where e.workspace_id = p_workspace_id
  );
  delete from kardo_core.experiences where workspace_id = p_workspace_id;
  delete from kardo_core.assets where workspace_id = p_workspace_id;

  delete from kardo_core.leads where workspace_id = p_workspace_id;
  delete from kardo_core.lead_deliveries where workspace_id = p_workspace_id;
  delete from kardo_core.lead_delivery_settings where workspace_id = p_workspace_id;
  delete from kardo_core.analytics_raw_events where workspace_id = p_workspace_id;
  delete from kardo_core.analytics_hourly where workspace_id = p_workspace_id;
  delete from kardo_core.analytics_daily where workspace_id = p_workspace_id;
  -- Groups first: a group may still point at a library design (its default
  -- for the QRs inside), and that link would stop the designs from going.
  delete from kardo_core.touchpoint_groups where workspace_id = p_workspace_id;
  delete from kardo_core.qr_design_templates where workspace_id = p_workspace_id;
  delete from kardo_core.dashboard_layouts where workspace_id = p_workspace_id;
  delete from kardo_core.custom_html_ai_usage where workspace_id = p_workspace_id;
  delete from kardo_core.workspace_invitations where workspace_id = p_workspace_id;
  delete from kardo_core.workspace_memberships where workspace_id = p_workspace_id;

  -- El perfil fiscal se conserva solo si sustenta un CFDI emitido.
  delete from kardo_billing.fiscal_profiles f
  where f.workspace_id = p_workspace_id
    and not exists (
      select 1 from kardo_billing.cfdi_requests c
      where c.workspace_id = p_workspace_id and c.status in ('issued', 'canceled')
    );
  update kardo_billing.notices
  set status = 'skipped', last_error = 'workspace deleted'
  where workspace_id = p_workspace_id and status in ('pending', 'failed');
  update kardo_billing.access_states
  set pages_paused_at = null, updated_at = now()
  where workspace_id = p_workspace_id;

  update kardo_core.workspaces set
    name = 'Organización eliminada',
    profile = '{}'::jsonb,
    lead_retention_days = null,
    deleted_at = now(),
    updated_at = now()
  where id = p_workspace_id;

  insert into kardo_audit.events (
    workspace_id, actor_subject, actor_type, action, target_type, target_id, result, reason, metadata
  ) values (
    p_workspace_id, null, 'service', 'workspace.deleted', 'workspace', p_workspace_id,
    'succeeded', btrim(p_reason), v_counts || jsonb_build_object('cleanupItems', v_cleanup)
  );

  return jsonb_build_object('status', 'deleted', 'counts', v_counts, 'cleanupItems', v_cleanup);
end;
$$;
revoke all on function kardo_private.erase_workspace_data(uuid, text) from public;
