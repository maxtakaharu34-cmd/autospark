-- Tenant foundation: link auth users to clients, invite gate, approval columns,
-- and customer-facing SELECT-only RLS. References the enum values added in 0002.

-- 1. clients: auth linkage + invite flag
alter table clients
  add column auth_user_id uuid unique references auth.users(id) on delete set null,
  add column invited_at timestamptz;

-- Normalize existing emails to lowercase so identity-linking can use exact `.eq`
-- (no LIKE/ILIKE wildcards on the security-critical email->client lookup).
update clients set email = lower(email) where email is not null and email <> lower(email);
-- email must resolve to a single client
create unique index clients_email_unique on clients (email) where email is not null;

-- 2. scheduled_posts: approval metadata
alter table scheduled_posts
  add column approval_note text,        -- customer comment (incl. rejection reason)
  add column approved_at timestamptz,
  add column approved_by uuid;          -- auth.users(id) of the approving customer

-- 3. helper: client ids owned by the current authenticated user.
--    security definer with a fixed search_path (privilege-escalation hardening).
create or replace function current_client_ids()
returns setof uuid
language sql stable security definer
set search_path = ''
as $$
  select id from public.clients where auth_user_id = (select auth.uid());
$$;
revoke all on function current_client_ids() from public;
grant execute on function current_client_ids() to authenticated;

-- 4. customer SELECT-only policies (anon stays fully denied; no write policies).
create policy client_select_self on clients
  for select to authenticated
  using (id in (select current_client_ids()));

create policy client_select_post_history on post_history
  for select to authenticated
  using (client_id in (select current_client_ids()));

create policy client_select_scheduled on scheduled_posts
  for select to authenticated
  using (client_id in (select current_client_ids()));

-- NOTE: x_accounts, instagram_accounts, error_logs, api_quota_usage intentionally
-- get NO customer policies — they remain operator-only (service-role) and invisible
-- to the customer anon client.
