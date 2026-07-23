-- ChatAgent base schema. Run this FIRST in the Supabase SQL editor
-- (Dashboard -> SQL Editor -> New query -> paste -> Run), then run
-- 0001_bugfix_hardening.sql. Safe to re-run (idempotent).
--
-- The "Could not find the table 'public.profiles' in the schema cache" error
-- means these tables were never created.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per user; holds credit balance and paid status.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  credits integer not null default 0,
  has_paid boolean not null default false,
  created_at timestamptz not null default now()
);

-- Per-user LLM API credentials (server-only; never exposed to the client).
create table if not exists public.user_keys (
  user_id uuid primary key references auth.users (id) on delete cascade,
  base_url text,
  api_key text,
  updated_at timestamptz not null default now()
);

-- Chat threads.
create table if not exists public.chats (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text,
  created_at timestamptz not null default now()
);

-- Messages within a chat (user / assistant / tool).
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  chat_id uuid not null references public.chats (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id text,
  seq integer,
  role text,
  content text,
  tool_calls jsonb,
  tool_call_id text,
  created_at timestamptz not null default now()
);

-- Per-run token usage + cost for the stats page.
create table if not exists public.token_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  run_id text,
  model_id text,
  input_tokens integer default 0,
  output_tokens integer default 0,
  cache_tokens integer default 0,
  cost_usd numeric default 0,
  created_at timestamptz not null default now()
);

-- Promo codes.
create table if not exists public.coupons (
  code text primary key,
  credits_value integer not null default 0,
  created_at timestamptz not null default now()
);

-- Redemption ledger (one row per user per code).
create table if not exists public.redemptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  coupon_code text not null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Row-Level Security + policies
-- The app uses each user's session (anon key) for most reads/writes, so users
-- must be able to touch their OWN rows.
-- ---------------------------------------------------------------------------

alter table public.profiles     enable row level security;
alter table public.user_keys    enable row level security;
alter table public.chats        enable row level security;
alter table public.messages     enable row level security;
alter table public.token_usage  enable row level security;
alter table public.coupons      enable row level security;
alter table public.redemptions  enable row level security;

-- profiles: users manage their own row.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated using (auth.uid() = id);
drop policy if exists profiles_insert_own on public.profiles;
create policy profiles_insert_own on public.profiles
  for insert to authenticated with check (auth.uid() = id);
drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);

-- user_keys: users manage their own row.
drop policy if exists user_keys_all_own on public.user_keys;
create policy user_keys_all_own on public.user_keys
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- chats / messages / token_usage: users manage their own rows.
drop policy if exists chats_all_own on public.chats;
create policy chats_all_own on public.chats
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists messages_all_own on public.messages;
create policy messages_all_own on public.messages
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists token_usage_all_own on public.token_usage;
create policy token_usage_all_own on public.token_usage
  for all to authenticated using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- coupons: any signed-in user may look up a code (read-only).
drop policy if exists coupons_select on public.coupons;
create policy coupons_select on public.coupons
  for select to authenticated using (true);

-- redemptions: users see and create their own.
drop policy if exists redemptions_select_own on public.redemptions;
create policy redemptions_select_own on public.redemptions
  for select to authenticated using (auth.uid() = user_id);
drop policy if exists redemptions_insert_own on public.redemptions;
create policy redemptions_insert_own on public.redemptions
  for insert to authenticated with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Storage bucket for generated PDF reports (public read).
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('reports', 'reports', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Seed the built-in promo code (5 credits).
-- ---------------------------------------------------------------------------
insert into public.coupons (code, credits_value)
values ('SID_DRDROID', 5)
on conflict (code) do nothing;
