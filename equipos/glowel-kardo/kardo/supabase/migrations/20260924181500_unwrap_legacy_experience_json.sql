-- Some legacy versions were encoded twice. Experience content is always an
-- object, so unwrap only JSON string wrappers until the stored value is an
-- object. No user-authored scalar content belongs in these columns.
do $$
declare
  affected integer;
begin
  loop
    update kardo_core.experiences
    set draft_content = (draft_content #>> '{}')::jsonb
    where jsonb_typeof(draft_content) = 'string'
      and left(ltrim(draft_content #>> '{}'), 1) in ('{', chr(34));
    get diagnostics affected = row_count;
    exit when affected = 0;
  end loop;

  loop
    update kardo_core.experience_versions
    set content = (content #>> '{}')::jsonb
    where jsonb_typeof(content) = 'string'
      and left(ltrim(content #>> '{}'), 1) in ('{', chr(34));
    get diagnostics affected = row_count;
    exit when affected = 0;
  end loop;
end;
$$;
