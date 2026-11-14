-- ¿La persona que llama aún tiene su prueba de 15 días? (relevo 20, T3)
-- Una por persona (perfil o sha256 del correo, ADR 020 §3). El Customer API
-- no puede leer el hash del correo, así que lo pregunta por esta funcion. La
-- usa el panel para ofrecer "Crear mi negocio y empezar 15 dias gratis" solo
-- cuando es verdad.

create or replace function kardo_billing.customer_trial_available()
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_subject uuid := kardo_private.current_customer_subject();
  v_email text;
begin
  if v_subject is null then
    return false;
  end if;
  select lower(u.email) into v_email from auth.users u where u.id = v_subject;
  return not exists (
    select 1 from kardo_billing.trials t
    where t.profile_id = v_subject
      or (v_email is not null and t.email_sha256 = encode(extensions.digest(v_email, 'sha256'), 'hex'))
  );
end;
$$;
revoke all on function kardo_billing.customer_trial_available() from public;
grant execute on function kardo_billing.customer_trial_available() to kardo_customer_api;
