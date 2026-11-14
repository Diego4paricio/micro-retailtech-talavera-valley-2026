-- Verificación en dos pasos de los clientes (relevo 28, ADR 023).
--
-- Hasta hoy un cliente podía activar TOTP, pero ni el inicio de sesión ni el
-- Customer API pedían el segundo factor: un token aal1 abría todo. Desde
-- ahora el Customer API rechaza (401 MFA_REQUIRED) un token que no sea aal2
-- cuando la cuenta tiene al menos un factor verificado.
--
-- El rol del API no lee el esquema auth. Esta función le responde solo un
-- sí o un no para una cuenta, sin exponer el factor ni su secreto.

create or replace function kardo_private.customer_requires_second_factor(p_subject uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.mfa_factors factor
    where factor.user_id = p_subject
      and factor.status = 'verified'
  );
$$;

revoke all on function kardo_private.customer_requires_second_factor(uuid) from public;
grant execute on function kardo_private.customer_requires_second_factor(uuid) to kardo_customer_api;
