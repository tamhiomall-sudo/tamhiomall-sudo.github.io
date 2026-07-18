-- ============================================================
-- adriaanbosch.net private tools area — Supabase schema
-- APPLIED 2026-07-18 to project casmljyasiynhshtnplt.
--
-- Table name is `app_data` (the version Adriaan ran). One JSON blob
-- per user, per tool. Platform-ready: a second tool later is a new
-- `tool` value, not a schema change. The work tracker uses
-- tool = 'work-tracker'.
--
-- This script is idempotent: safe to run again, it will not error and
-- will not change data. It just guarantees the table, RLS, and policy
-- are all present and correct.
-- ============================================================

create table if not exists public.app_data (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null default auth.uid() references auth.users (id) on delete cascade,
  tool       text        not null,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  unique (user_id, tool)
);

-- Keep updated_at honest on every write.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists app_data_updated_at on public.app_data;
create trigger app_data_updated_at
  before update on public.app_data
  for each row execute function public.set_updated_at();

-- Row-level security is the real protection. The anon key in the front
-- end is public by design; this is what stops anyone but the logged-in
-- owner from reading or writing a row.
alter table public.app_data enable row level security;

drop policy if exists "Users can manage their own data" on public.app_data;
create policy "Users can manage their own data"
  on public.app_data
  for all
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ------------------------------------------------------------
-- Verified live 2026-07-18: table present, RLS on (anon writes
-- rejected with a row-level-security violation, as intended).
-- Remaining setup is in the dashboard, not SQL:
--   Authentication -> Users -> Add user -> tick "Auto Confirm User?"
-- (email confirmation is on and there is no SMTP, so without
--  auto-confirm the account cannot log in).
-- ============================================================
