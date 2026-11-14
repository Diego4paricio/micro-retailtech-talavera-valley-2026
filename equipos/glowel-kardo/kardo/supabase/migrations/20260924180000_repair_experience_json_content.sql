-- Earlier application code passed JSON text to postgres as a parameter, which
-- stored it as a JSON string instead of a JSON object. Repair only values that
-- are demonstrably JSON objects; normal JSON content is left untouched.
update kardo_core.experiences
set draft_content = (draft_content #>> '{}')::jsonb
where jsonb_typeof(draft_content) = 'string'
  and left(ltrim(draft_content #>> '{}'), 1) = '{';

update kardo_core.experience_versions
set content = (content #>> '{}')::jsonb
where jsonb_typeof(content) = 'string'
  and left(ltrim(content #>> '{}'), 1) = '{';
