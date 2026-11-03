-- SocialFlow AI OAuth stage 1 schema (2026-11-03)
-- tokens are encrypted application-side (AES-256-GCM, SF_ENCRYPTION_KEY).
-- the database never sees plaintext tokens; *_enc columns hold v1:iv:ct:tag strings.
-- all user data tables have RLS with owner = auth.uid() so one user can never
-- read or write another user's accounts, posts or jobs.

create extension if not exists pgcrypto;

-- ---------- social accounts (connected platform accounts) ----------
create table if not exists public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in
    ('facebook','instagram','tiktok','linkedin','linkedin_page','x','youtube','pinterest')),
  platform_user_id text,
  account_name text,
  avatar_url text,
  scopes text[] not null default '{}',
  status text not null default 'connected' check (status in
    ('connected','reauth_required','expired','permission_denied','disconnected')),
  access_token_enc text not null,
  refresh_token_enc text,
  token_expires_at timestamptz,
  meta jsonb not null default '{}'::jsonb,
  last_publish_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner, platform, platform_user_id)
);

-- ---------- posts ----------
create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users(id) on delete cascade,
  body text not null,
  media_urls jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in
    ('draft','scheduled','publishing','published','partial','failed','canceled')),
  scheduled_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- per-account targets of a post ----------
create table if not exists public.post_targets (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  account_id uuid not null references public.social_accounts(id) on delete cascade,
  platform text not null,
  caption text,
  status text not null default 'pending' check (status in
    ('pending','publishing','published','failed','skipped_manual','needs_reauth')),
  remote_id text,
  remote_url text,
  error text,
  attempts int not null default 0,
  -- unique across all attempts of a logical publication: duplicate prevention
  idempotency_key text unique,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------- scheduler queue ----------
create table if not exists public.publish_jobs (
  id uuid primary key default gen_random_uuid(),
  target_id uuid not null references public.post_targets(id) on delete cascade,
  run_at timestamptz not null default now(),
  status text not null default 'queued' check (status in ('queued','claimed','done','failed')),
  attempts int not null default 0,
  next_retry_at timestamptz,
  claimed_at timestamptz,
  claimed_by text,
  last_error text,
  created_at timestamptz not null default now()
);
-- the cron claims due jobs with FOR UPDATE SKIP LOCKED; this index keeps that cheap
create index if not exists publish_jobs_due_idx
  on public.publish_jobs (run_at) where status = 'queued';

-- atomic claim for the cron runner: marks up to p_limit due jobs as claimed
-- and returns them. security definer so the service role can run it without
-- a direct table grant; rls does not apply to the service role anyway.
create or replace function public.claim_due_jobs(p_limit int)
returns setof public.publish_jobs
language sql
security definer
set search_path = public
as $$
  update public.publish_jobs
  set status = 'claimed',
      claimed_at = now(),
      claimed_by = 'cron'
  where id in (
    select id from public.publish_jobs
    where status = 'queued' and run_at <= now()
    order by run_at asc
    limit greatest(p_limit, 1)
    for update skip locked
  )
  returning *;
$$;

-- ---------- audit log ----------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  owner uuid references auth.users(id) on delete set null,
  action text not null,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ---------- oauth state (csrf + pkce, single-use, 10 min ttl) ----------
create table if not exists public.platform_app_state (
  state text primary key,
  verifier text,
  owner uuid not null references auth.users(id) on delete cascade,
  redirect_to text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '10 minutes'
);

-- ---------- updated_at touch triggers ----------
create or replace function public.touch_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end $$ language plpgsql;

drop trigger if exists social_accounts_touch on public.social_accounts;
create trigger social_accounts_touch before update on public.social_accounts
  for each row execute function public.touch_updated_at();

drop trigger if exists posts_touch on public.posts;
create trigger posts_touch before update on public.posts
  for each row execute function public.touch_updated_at();

drop trigger if exists post_targets_touch on public.post_targets;
create trigger post_targets_touch before update on public.post_targets
  for each row execute function public.touch_updated_at();

-- ---------- row level security ----------
alter table public.social_accounts enable row level security;
alter table public.posts enable row level security;
alter table public.post_targets enable row level security;
alter table public.publish_jobs enable row level security;
alter table public.audit_log enable row level security;
alter table public.platform_app_state enable row level security;

-- owner-scoped access for authenticated users; service_role bypasses rls and
-- is used only by the cron publisher via SUPABASE_SERVICE_ROLE_KEY.
do $$
declare
  t text;
begin
  -- tables that carry owner directly
  foreach t in array array['social_accounts','posts','audit_log','platform_app_state'] loop
    execute format('drop policy if exists owner_all on public.%I', t);
    execute format($f$create policy owner_all on public.%I
      for all to authenticated
      using (owner = auth.uid())
      with check (owner = auth.uid())$f$, t);
  end loop;
end $$;

-- post_targets: ownership flows through the parent post
drop policy if exists owner_all on public.post_targets;
create policy owner_all on public.post_targets
  for all to authenticated
  using (post_id in (select id from public.posts where owner = auth.uid()))
  with check (post_id in (select id from public.posts where owner = auth.uid()));

-- publish_jobs: ownership flows through target -> post
drop policy if exists owner_all on public.publish_jobs;
create policy owner_all on public.publish_jobs
  for all to authenticated
  using (target_id in (
    select pt.id from public.post_targets pt
    join public.posts p on p.id = pt.post_id
    where p.owner = auth.uid()))
  with check (target_id in (
    select pt.id from public.post_targets pt
    join public.posts p on p.id = pt.post_id
    where p.owner = auth.uid()));

-- audit_log rows created by the cron publisher (service role) may have null owner;
-- the service role bypasses rls so this is fine.
