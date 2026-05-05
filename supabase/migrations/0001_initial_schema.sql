-- Throughline · 0001_initial_schema.sql
-- Bootstraps the full v1 data model: 6 tables, RLS, indexes, storage policies.
-- Auth: Clerk JWT integration. The Clerk user id (sub claim) is used directly
-- as the join key — no internal UUID indirection. RLS reads `auth.jwt()->>'sub'`.
--
-- Apply via: supabase db push  (or supabase migration up)

------------------------------------------------------------
-- Extensions
------------------------------------------------------------
create extension if not exists "uuid-ossp";
create extension if not exists "pg_trgm";

------------------------------------------------------------
-- Helper: pull Clerk user id from the verified JWT.
-- Throws if the JWT is missing or has no sub — RLS will deny by default.
------------------------------------------------------------
create or replace function public.clerk_user_id()
returns text
language sql
stable
as $$
  select nullif(auth.jwt()->>'sub', '')
$$;

------------------------------------------------------------
-- 1. users — Clerk mirror + Stripe customer + plan
------------------------------------------------------------
create table public.users (
  id              text primary key,                       -- Clerk user id (sub)
  email           text not null,
  stripe_customer_id text unique,
  plan            text not null default 'trial'
    check (plan in ('trial', 'solo', 'pro', 'past_due', 'canceled')),
  trial_ends_at   timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table public.users enable row level security;

drop policy if exists "users_select_own" on public.users;
create policy "users_select_own" on public.users
  for select using (id = public.clerk_user_id());

drop policy if exists "users_update_own" on public.users;
create policy "users_update_own" on public.users
  for update using (id = public.clerk_user_id())
  with check (id = public.clerk_user_id());

-- Inserts happen server-side via service role on Clerk webhook. No client policy.

------------------------------------------------------------
-- 2. studies — research projects
------------------------------------------------------------
create table public.studies (
  id                uuid primary key default uuid_generate_v4(),
  user_id           text not null references public.users(id) on delete cascade,
  name              text not null,
  research_question text,
  status            text not null default 'active'
    check (status in ('active', 'archived')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index idx_studies_user on public.studies(user_id, created_at desc);

alter table public.studies enable row level security;

drop policy if exists "studies_owner_all" on public.studies;
create policy "studies_owner_all" on public.studies
  for all using (user_id = public.clerk_user_id())
  with check (user_id = public.clerk_user_id());

------------------------------------------------------------
-- 3. interviews — raw transcript + processing state
------------------------------------------------------------
create table public.interviews (
  id                 uuid primary key default uuid_generate_v4(),
  study_id           uuid not null references public.studies(id) on delete cascade,
  user_id            text not null references public.users(id) on delete cascade,
  filename           text not null,
  storage_path       text not null,                       -- {user_id}/{study_id}/{interview_id}.{ext}
  participant_label  text,
  word_count         int,
  transcript_text    text,                                 -- parsed plain text
  status             text not null default 'queued'
    check (status in ('queued', 'processing', 'analyzed', 'failed')),
  failure_reason     text,
  uploaded_at        timestamptz not null default now(),
  analyzed_at        timestamptz
);

create index idx_interviews_study      on public.interviews(study_id, uploaded_at desc);
create index idx_interviews_pending    on public.interviews(status)
  where status in ('queued', 'processing');
create index idx_interviews_text_search on public.interviews
  using gin (to_tsvector('english', coalesce(transcript_text, '')));

alter table public.interviews enable row level security;

drop policy if exists "interviews_owner_all" on public.interviews;
create policy "interviews_owner_all" on public.interviews
  for all using (user_id = public.clerk_user_id())
  with check (user_id = public.clerk_user_id());

------------------------------------------------------------
-- 4. interview_analyses — per-interview AI output
------------------------------------------------------------
create table public.interview_analyses (
  id              uuid primary key default uuid_generate_v4(),
  interview_id    uuid not null unique references public.interviews(id) on delete cascade,
  user_id         text not null references public.users(id) on delete cascade,
  summary         text not null,
  sentiment       text not null check (sentiment in ('positive', 'mixed', 'negative', 'neutral')),
  themes_json     jsonb not null,                         -- [{ name, description }]
  quotes_json     jsonb not null,                         -- [{ text, theme, char_start, char_end }]
  input_tokens    int,
  output_tokens   int,
  model           text not null default 'claude-sonnet-4-6',
  created_at      timestamptz not null default now()
);

create index idx_analyses_interview on public.interview_analyses(interview_id);

alter table public.interview_analyses enable row level security;

drop policy if exists "analyses_owner_all" on public.interview_analyses;
create policy "analyses_owner_all" on public.interview_analyses
  for all using (user_id = public.clerk_user_id())
  with check (user_id = public.clerk_user_id());

------------------------------------------------------------
-- 5. study_themes — aggregate synthesis output
------------------------------------------------------------
create table public.study_themes (
  id                 uuid primary key default uuid_generate_v4(),
  study_id           uuid not null references public.studies(id) on delete cascade,
  user_id            text not null references public.users(id) on delete cascade,
  name               text not null,
  description        text,
  frequency          int not null default 0,
  source_quote_refs  jsonb not null default '[]'::jsonb,  -- [{ interview_id, quote_index }]
  user_edited        boolean not null default false,
  archived           boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index idx_study_themes_freq on public.study_themes(study_id, frequency desc)
  where archived = false;

alter table public.study_themes enable row level security;

drop policy if exists "themes_owner_all" on public.study_themes;
create policy "themes_owner_all" on public.study_themes
  for all using (user_id = public.clerk_user_id())
  with check (user_id = public.clerk_user_id());

------------------------------------------------------------
-- 6. usage_counters — monthly plan enforcement
------------------------------------------------------------
create table public.usage_counters (
  user_id              text not null references public.users(id) on delete cascade,
  period_month         date not null,                     -- first-of-month
  interviews_uploaded  int not null default 0,
  studies_created      int not null default 0,
  primary key (user_id, period_month)
);

alter table public.usage_counters enable row level security;

drop policy if exists "usage_select_own" on public.usage_counters;
create policy "usage_select_own" on public.usage_counters
  for select using (user_id = public.clerk_user_id());

-- Mutations happen server-side via service role only.

------------------------------------------------------------
-- updated_at triggers
------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_users_updated      before update on public.users
  for each row execute function public.set_updated_at();
create trigger trg_studies_updated    before update on public.studies
  for each row execute function public.set_updated_at();
create trigger trg_themes_updated     before update on public.study_themes
  for each row execute function public.set_updated_at();

------------------------------------------------------------
-- Storage bucket: transcripts
-- Path convention: {user_id}/{study_id}/{interview_id}.{ext}
-- Run via dashboard OR include in seed; bucket creation is idempotent here.
------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'transcripts',
  'transcripts',
  false,
  10485760,  -- 10 MB
  array[
    'text/plain',
    'text/vtt',
    'application/x-subrip',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
  set file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "transcripts_owner_select" on storage.objects;
create policy "transcripts_owner_select" on storage.objects
  for select using (
    bucket_id = 'transcripts'
    and (storage.foldername(name))[1] = public.clerk_user_id()
  );

drop policy if exists "transcripts_owner_insert" on storage.objects;
create policy "transcripts_owner_insert" on storage.objects
  for insert with check (
    bucket_id = 'transcripts'
    and (storage.foldername(name))[1] = public.clerk_user_id()
  );

drop policy if exists "transcripts_owner_delete" on storage.objects;
create policy "transcripts_owner_delete" on storage.objects
  for delete using (
    bucket_id = 'transcripts'
    and (storage.foldername(name))[1] = public.clerk_user_id()
  );
