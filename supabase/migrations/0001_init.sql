-- AutoSpark SaaS initial schema.
-- All tables are accessed exclusively via the service-role key from
-- `app/api/**`. RLS is enabled with no permissive policies so that even a
-- leaked anon key cannot read or modify operator data.

create extension if not exists "pgcrypto";

create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create type plan_tier as enum ('starter', 'growth', 'enterprise', 'trial', 'suspended');
create type platform_kind as enum ('x', 'instagram');
create type scheduled_status as enum ('pending', 'running', 'succeeded', 'failed', 'cancelled');
create type log_severity as enum ('info', 'warning', 'critical');

-- ---------------------------------------------------------------------------
-- clients

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  plan plan_tier not null default 'trial',
  stripe_customer_id text unique,
  stripe_subscription_id text unique,
  suspend_at timestamptz,
  persona jsonb not null default jsonb_build_object(
    'voice', 'friendly',
    'character', '',
    'forbidden_words', '[]'::jsonb,
    'preferred_post_hours', '[9,12,19]'::jsonb,
    'notes', ''
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clients_updated_at before update on clients
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- x_accounts

create table x_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  handle text not null,
  user_id text not null,
  access_token_enc text not null,
  access_secret_enc text not null,
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, user_id)
);
create trigger x_accounts_updated_at before update on x_accounts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- instagram_accounts

create table instagram_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  ig_user_id text not null,
  username text not null,
  access_token_enc text not null,
  token_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, ig_user_id)
);
create trigger instagram_accounts_updated_at before update on instagram_accounts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- scheduled_posts

create table scheduled_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform platform_kind not null,
  payload jsonb not null,
  scheduled_at timestamptz not null,
  status scheduled_status not null default 'pending',
  attempts int not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index scheduled_posts_due_idx on scheduled_posts (status, scheduled_at);
create trigger scheduled_posts_updated_at before update on scheduled_posts
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- post_history

create table post_history (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform platform_kind not null,
  external_id text,
  action text not null,
  text text,
  impressions int not null default 0,
  likes int not null default 0,
  retweets int not null default 0,
  replies int not null default 0,
  measured_at timestamptz,
  posted_at timestamptz not null default now()
);
create index post_history_client_posted_idx on post_history (client_id, posted_at desc);

-- ---------------------------------------------------------------------------
-- error_logs

create table error_logs (
  id uuid primary key default gen_random_uuid(),
  client_id uuid references clients(id) on delete set null,
  severity log_severity not null,
  kind text not null,
  message text not null,
  meta jsonb,
  resolved boolean not null default false,
  created_at timestamptz not null default now()
);
create index error_logs_recent_idx on error_logs (created_at desc);
create index error_logs_unresolved_idx on error_logs (resolved, severity, created_at desc);

-- ---------------------------------------------------------------------------
-- api_quota_usage

create table api_quota_usage (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients(id) on delete cascade,
  platform platform_kind not null,
  period_start timestamptz not null,
  call_count int not null default 0,
  monthly_limit int not null default 1500,
  updated_at timestamptz not null default now(),
  unique (client_id, platform, period_start)
);
create trigger api_quota_usage_updated_at before update on api_quota_usage
  for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS: deny by default; service-role key is used by the application.

alter table clients enable row level security;
alter table x_accounts enable row level security;
alter table instagram_accounts enable row level security;
alter table scheduled_posts enable row level security;
alter table post_history enable row level security;
alter table error_logs enable row level security;
alter table api_quota_usage enable row level security;
