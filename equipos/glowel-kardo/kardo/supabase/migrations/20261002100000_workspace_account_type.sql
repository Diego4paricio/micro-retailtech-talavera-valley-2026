-- The sign up first asks whether the account is personal or a business
-- (owner decision, 2026-10-01). Either way the space is an organization, so
-- it can invite people who help; the answer is kept for the record and shown
-- in the panel and in Operations. Null for spaces from before this question
-- and for the unused personal space of someone who joined by invitation.
alter table kardo_core.workspaces
  add column account_type text
  constraint workspaces_account_type_check
    check (account_type in ('personal', 'business'));

comment on column kardo_core.workspaces.account_type is
  'Declared at sign up: personal or business. Protocol only: both are organizations and can invite.';
