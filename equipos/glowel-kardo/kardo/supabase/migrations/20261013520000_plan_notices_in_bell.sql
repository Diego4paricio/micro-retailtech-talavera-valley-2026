-- Domain audit 2026-10-13, A2-70 (decision taken as recommended): the end of
-- a trial, a pause, a deletion ahead and a smaller plan used to arrive only
-- by email and as a banner; the bell («Tu cuenta», a category nobody used)
-- now says it too. A trigger on kardo_billing.notices writes the bell notice
-- in the same transaction that queues the email, so nothing is redeployed and
-- the email stays the formal notice (LFPC). Addressed to the organization's
-- Owner and Admins; one per notice, like the email (dedupe_key).

create or replace function kardo_private.bell_for_billing_notice()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := coalesce(nullif(btrim(new.payload ->> 'workspaceName'), ''), 'tu organización');
  v_days int := case
    when (new.payload ->> 'daysLeft') ~ '^[0-9]{1,3}$' then (new.payload ->> 'daysLeft')::int
    else null
  end;
  v_title text;
  v_body text;
begin
  case new.kind
    when 'trial_reminder' then
      v_title := 'Tu prueba termina pronto';
      v_body := 'A la prueba de «' || v_name || '» le '
        || case when v_days = 1 then 'queda 1 día' when v_days is not null then 'quedan ' || v_days || ' días' else 'quedan pocos días' end
        || '. Elige un plan para que tus páginas sigan funcionando.';
    when 'trial_ending' then
      v_title := 'Tu prueba termina pronto';
      v_body := 'La prueba de «' || v_name || '» está por terminar. Revisa tu plan antes del primer cobro.';
    when 'trial_ended' then
      v_title := 'Terminó tu prueba';
      v_body := 'Terminó la prueba de «' || v_name || '». Elige un plan: tus páginas siguen funcionando unos días más.';
    when 'plan_ended' then
      v_title := 'Terminó tu plan';
      v_body := 'El plan de «' || v_name || '» terminó. Elige uno para seguir editando; tus páginas siguen funcionando unos días más.';
    when 'pause_upcoming' then
      v_title := 'Tus páginas se van a pausar';
      v_body := 'Si no eliges un plan, las páginas de «' || v_name || '» dejarán de verse pronto.';
    when 'pages_paused' then
      v_title := 'Tus páginas están en pausa';
      v_body := 'Las páginas de «' || v_name || '» ya no se ven. Elige un plan para volver a mostrarlas.';
    when 'deletion_upcoming' then
      v_title := 'Vamos a borrar una organización';
      v_body := '«' || v_name || '» se borrará pronto porque no tiene plan. Elige uno, o descarga sus datos en Configuración → General antes.';
    when 'plan_overage_opened' then
      v_title := 'Tu plan cambió: elige qué sigue';
      v_body := '«' || v_name || '» tiene más de lo que incluye tu plan nuevo. Elige qué sigue en Plan y facturación.';
    when 'plan_overage_reminder' then
      v_title := 'Falta elegir qué sigue';
      v_body := 'Elige qué sigue en «' || v_name || '» antes de que se aplique tu plan nuevo.';
    when 'plan_overage_applied' then
      v_title := 'Se aplicó tu plan nuevo';
      v_body := 'Lo que no cabía en tu plan quedó en pausa en «' || v_name || '». Puedes cambiarlo en Plan y facturación.';
    else
      return new;
  end case;

  -- A failing bell notice never blocks the email or the billing change.
  begin
    insert into kardo_core.notifications (
      category, title, body, action_label, action_url, audience, workspace_id, roles
    ) values (
      'account',
      v_title,
      left(v_body, 4000),
      'Ver mi plan',
      '/settings/plan',
      'workspace',
      new.workspace_id,
      array['owner', 'admin']::kardo_core.membership_role[]
    );
  exception when others then
    raise warning 'bell_for_billing_notice: %', sqlerrm;
  end;
  return new;
end;
$$;
revoke all on function kardo_private.bell_for_billing_notice() from public;

drop trigger if exists billing_notices_bell on kardo_billing.notices;
create trigger billing_notices_bell
  after insert on kardo_billing.notices
  for each row execute function kardo_private.bell_for_billing_notice();
