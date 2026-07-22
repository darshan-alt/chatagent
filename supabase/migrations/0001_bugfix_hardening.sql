-- Schema changes supporting the bug fixes in this branch.
-- Run this against your Supabase project (SQL editor or `supabase db push`).

-- 1. Webhook idempotency.
-- The Stripe webhook records each processed event id here and skips replays,
-- preventing duplicate credit grants when Stripe retries a delivery.
create table if not exists public.stripe_events (
  id text primary key,
  processed_at timestamptz not null default now()
);

-- The webhook writes with the service-role key, so RLS can stay locked down.
alter table public.stripe_events enable row level security;

-- 2. Promo redemption integrity.
-- Enforce one redemption per user per code at the database level so the
-- "already redeemed" check cannot be raced.
create unique index if not exists redemptions_user_code_unique
  on public.redemptions (user_id, lower(coupon_code));

-- 3. Optional but recommended: enforce the per-code usage cap atomically in the
-- database instead of relying on application-level count-then-insert. Wrap
-- redemption in a SECURITY DEFINER function that locks the code's rows:
--
-- create or replace function public.redeem_coupon(p_code text, p_credits int, p_max int)
-- returns int language plpgsql security definer as $$
-- declare used int;
-- begin
--   perform pg_advisory_xact_lock(hashtext(lower(p_code)));
--   select count(*) into used from public.redemptions where lower(coupon_code) = lower(p_code);
--   if used >= p_max then raise exception 'promo code exhausted'; end if;
--   insert into public.redemptions (user_id, coupon_code) values (auth.uid(), p_code);
--   update public.profiles set credits = credits + p_credits where id = auth.uid();
--   return used + 1;
-- end $$;
