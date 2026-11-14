-- The Publisher resolves every asset a publication references (avatar,
-- menu and catalog photos, theme and design images, the PDF and its viewer
-- pages) with `select id, sha256, media_type, original_filename from
-- kardo_core.assets where id = any(...) and workspace_id = ... and status =
-- 'validated'` (services/publisher/src/index.ts, claimNext). Its runtime
-- role never had that read, so any publication with an image failed inside
-- the claim transaction ("permission denied for table assets"): the job
-- rolled back to pending with no error and stayed "Publicando" forever.
--
-- Read only, only the columns the Publisher uses, same RLS pattern as
-- "publisher experience assets read" (20260915070000): the query itself
-- scopes rows to the job's workspace.
grant select (id, workspace_id, sha256, media_type, original_filename, status)
  on kardo_core.assets to kardo_publisher;

drop policy if exists "publisher assets read" on kardo_core.assets;
create policy "publisher assets read" on kardo_core.assets
  for select to kardo_publisher using (true);
