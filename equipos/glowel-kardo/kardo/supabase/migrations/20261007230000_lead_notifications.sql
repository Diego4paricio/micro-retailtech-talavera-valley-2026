-- Aviso en la campana por cada solicitud nueva (relevo 37, C3c).
--
-- En la ronda 2 de usuarios simulados, Paola y Karla esperaban que Kardo les
-- avisara de una solicitud nueva («casi me la pierdo»). Un trigger en
-- kardo_core.leads escribe la notificacion en la misma transaccion en que
-- llega la solicitud, asi funciona sin desplegar el analytics-worker.
--
-- - Audiencia: la organizacion, solo owner y admin (los roles con leads.read;
--   packages/domain). Un editor o un viewer no ven solicitudes.
-- - Privacidad: la notificacion lleva el nombre y el mensaje de la persona,
--   asi que va atada a la solicitud (lead_id, on delete cascade). Cuando la
--   solicitud se borra (a mano, por la retencion o al borrar la cuenta), su
--   aviso se borra con ella. El staff no ve estos avisos.
-- - Categoria 'lead': solo la escribe este trigger, nunca Operations.

alter table kardo_core.notifications
  add column if not exists lead_id uuid references kardo_core.leads(id) on delete cascade;

create index if not exists notifications_lead_idx
  on kardo_core.notifications (lead_id) where lead_id is not null;

alter table kardo_core.notifications
  drop constraint if exists notifications_category_check;
alter table kardo_core.notifications
  add constraint notifications_category_check
  check (category in ('news', 'maintenance', 'account', 'tip', 'lead'));

-- Una categoria 'lead' siempre es de una solicitud y de su organizacion.
alter table kardo_core.notifications
  drop constraint if exists notifications_lead_shape;
alter table kardo_core.notifications
  add constraint notifications_lead_shape
  check ((category = 'lead') = (lead_id is not null)
    and (lead_id is null or audience = 'workspace'));

create or replace function kardo_private.notify_new_lead()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_place text;
  v_who text;
  v_message text;
  v_body text;
begin
  select nullif(btrim(touchpoint.operational_name), '')
    into v_place
    from kardo_core.touchpoints touchpoint
   where touchpoint.id = new.touchpoint_id;

  v_who := coalesce(nullif(btrim(new.name), ''), 'Alguien');
  v_message := nullif(regexp_replace(btrim(coalesce(new.message, '')), '\s+', ' ', 'g'), '');
  if v_message is not null and char_length(v_message) > 160 then
    v_message := left(v_message, 159) || '…';
  end if;

  v_body := case
    when v_message is not null then v_who
      || case when v_place is not null then ', desde «' || v_place || '»' else '' end
      || ': «' || v_message || '»'
    else v_who || ' te dejó sus datos'
      || case when v_place is not null then ' desde «' || v_place || '»' else '' end
      || '.'
  end;

  -- A failing notice never loses the request itself.
  begin
    insert into kardo_core.notifications (
      category, title, body, action_label, action_url, audience, workspace_id, roles, lead_id
    ) values (
      'lead',
      'Solicitud nueva',
      left(v_body, 4000),
      'Ver solicitud',
      '/leads?lead=' || new.id::text,
      'workspace',
      new.workspace_id,
      array['owner', 'admin']::kardo_core.membership_role[],
      new.id
    );
  exception when others then
    raise warning 'notify_new_lead: %', sqlerrm;
  end;
  return new;
end;
$$;

revoke all on function kardo_private.notify_new_lead() from public;

drop trigger if exists leads_notify_new on kardo_core.leads;
create trigger leads_notify_new
  after insert on kardo_core.leads
  for each row execute function kardo_private.notify_new_lead();

-- El staff no lee ni edita los avisos de solicitudes: traen datos personales
-- de los clientes de la organizacion.
drop policy if exists "staff api notifications read" on kardo_core.notifications;
create policy "staff api notifications read" on kardo_core.notifications
  for select to kardo_staff_api
  using (lead_id is null and kardo_private.staff_has_permission('notifications.read'));

drop policy if exists "staff api notifications update" on kardo_core.notifications;
create policy "staff api notifications update" on kardo_core.notifications
  for update to kardo_staff_api
  using (lead_id is null and kardo_private.staff_has_permission(
    case when audience in ('all', 'segment') then 'notifications.broadcast' else 'notifications.send' end
  ))
  with check (
    lead_id is null
    and updated_by = kardo_private.current_staff_subject()
    and kardo_private.staff_has_permission(
      case when audience in ('all', 'segment') then 'notifications.broadcast' else 'notifications.send' end
    )
  );

drop policy if exists "staff api notifications insert" on kardo_core.notifications;
create policy "staff api notifications insert" on kardo_core.notifications
  for insert to kardo_staff_api
  with check (
    lead_id is null
    and created_by = kardo_private.current_staff_subject()
    and kardo_private.staff_has_permission(
      case when audience in ('all', 'segment') then 'notifications.broadcast' else 'notifications.send' end
    )
  );
