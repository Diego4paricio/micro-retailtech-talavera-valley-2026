-- Menor privilegio para kardo_customer_api (auditoria 2026-09-25).
--
-- El rol tenia INSERT/UPDATE/DELETE sobre tablas que la API nunca escribe:
-- planes y entitlements (con politica ALL using(true): cualquier sesion de
-- cliente podia alterar el catalogo o su propio plan si la API llegara a
-- ejecutar SQL arbitrario), versiones inmutables, publicaciones y jobs (solo
-- el Publisher los cambia), activaciones y perfiles/workspaces (los crean
-- funciones SECURITY DEFINER). Las Experiences se archivan, los Touchpoints se
-- retiran y los assets se marcan como eliminados: nunca se borran filas.

revoke insert, update, delete on kardo_core.plans, kardo_core.plan_entitlements, kardo_core.workspace_plans from kardo_customer_api;

drop policy if exists "customer api plans" on kardo_core.plans;
create policy "customer api plans read" on kardo_core.plans
  for select to kardo_customer_api using (true);

drop policy if exists "customer api entitlements" on kardo_core.plan_entitlements;
create policy "customer api entitlements read" on kardo_core.plan_entitlements
  for select to kardo_customer_api using (true);

drop policy if exists "customer api workspace plans" on kardo_core.workspace_plans;
create policy "customer api workspace plans read" on kardo_core.workspace_plans
  for select to kardo_customer_api
  using (kardo_private.is_workspace_member(workspace_id));

-- Versiones inmutables y cola de publicacion: la API solo inserta.
revoke update, delete on kardo_core.experience_versions from kardo_customer_api;
revoke update, delete on kardo_core.publications from kardo_customer_api;
revoke update, delete on kardo_core.publication_jobs from kardo_customer_api;

revoke insert, update, delete on kardo_core.touchpoint_activations from kardo_customer_api;
revoke insert, delete on kardo_core.profiles from kardo_customer_api;
revoke insert, delete on kardo_core.workspaces from kardo_customer_api;
revoke delete on kardo_core.experiences, kardo_core.touchpoints, kardo_core.assets from kardo_customer_api;

-- Touchpoints: solo las columnas que el cliente puede cambiar. La suspension
-- (staff) y retired_at quedan fuera de su alcance aun con SQL directo.
revoke update on kardo_core.touchpoints from kardo_customer_api;
grant update (operational_name, physical_type, group_id, status, updated_at)
  on kardo_core.touchpoints to kardo_customer_api;
