-- The Publisher marks a Touchpoint `active` once its first publication is
-- live (assigned → active only; it never resumes a paused Touchpoint). That
-- code shipped without a grant, so every successful projection failed while
-- recording its result (found by the end-to-end run against kardo-dev).
-- Column-limited grant plus a policy that only allows that exact transition.
grant update (status, updated_at) on kardo_core.touchpoints to kardo_publisher;

drop policy if exists "publisher touchpoints activate" on kardo_core.touchpoints;
create policy "publisher touchpoints activate" on kardo_core.touchpoints
  for update to kardo_publisher
  using (status = 'assigned')
  with check (status = 'active');
