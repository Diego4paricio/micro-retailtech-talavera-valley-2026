-- Staff roles are a server-owned authorization catalog. This migration creates
-- no Auth user or staff assignment, particularly in production.
insert into kardo_staff.roles (code, name)
values
  ('platform-admin', 'Platform Admin'),
  ('operations', 'Operations'),
  ('support', 'Support'),
  ('commercial', 'Commercial'),
  ('trust-safety', 'Trust & Safety')
on conflict (code) do update set name = excluded.name;

insert into kardo_staff.permissions (role_id, permission)
select role.id, catalog.permission
from kardo_staff.roles role
join (
  values
    ('platform-admin', 'operations.diagnostics.read'),
    ('platform-admin', 'touchpoints.operations.read'),
    ('platform-admin', 'touchpoints.operations.write'),
    ('platform-admin', 'staff.roles.manage'),
    ('operations', 'operations.diagnostics.read'),
    ('operations', 'touchpoints.operations.read'),
    ('operations', 'touchpoints.operations.write'),
    ('support', 'operations.diagnostics.read'),
    ('commercial', 'commercial.catalog.read'),
    ('commercial', 'commercial.catalog.write'),
    ('trust-safety', 'trust-safety.cases.read'),
    ('trust-safety', 'touchpoints.suspend.write')
) as catalog(role_code, permission) on catalog.role_code = role.code
on conflict (role_id, permission) do nothing;

-- The Staff API uses these aggregate-only counters and writes an append-only
-- audit record for every successful diagnostic read. It still verifies staff
-- status and the explicit permission in application code on every request.
grant select on kardo_core.touchpoints, kardo_core.publications to kardo_staff_api;
grant insert on kardo_audit.events to kardo_staff_api;
