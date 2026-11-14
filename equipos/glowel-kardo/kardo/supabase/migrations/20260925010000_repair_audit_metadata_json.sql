-- Application code passed pre-stringified JSON to jsonb parameters, so audit
-- metadata was stored as JSON *strings* (found by the end-to-end run against
-- kardo-dev). The writers are fixed and redeployed first; this unwraps the
-- existing rows and adds the invariant so it cannot recur silently.
-- The append-only trigger is disabled only for this repair, inside the
-- migration's transaction, and re-enabled immediately.
alter table kardo_audit.events disable trigger audit_events_append_only;

update kardo_audit.events
set metadata = (metadata #>> '{}')::jsonb
where jsonb_typeof(metadata) = 'string'
  and left(ltrim(metadata #>> '{}'), 1) = '{';

alter table kardo_audit.events enable trigger audit_events_append_only;

do $$ begin
  alter table kardo_audit.events
    add constraint events_metadata_is_object
    check (jsonb_typeof(metadata) = 'object') not valid;
exception when duplicate_object then null;
end $$;
alter table kardo_audit.events validate constraint events_metadata_is_object;
