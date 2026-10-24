-- Trainer app — Supabase schema (v1)
-- Eén rij per gebruiker met de volledige app-state als JSON (zelfde vorm als localStorage "trainer.v1").
-- Eenvoudig, offline-first en makkelijk te synchroniseren. Row Level Security zorgt dat
-- iedere gebruiker alleen zijn eigen data kan lezen/schrijven.

create table if not exists public.app_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb       not null,
  version    int         not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.app_state enable row level security;

create policy "own state: select" on public.app_state
  for select using (auth.uid() = user_id);

create policy "own state: insert" on public.app_state
  for insert with check (auth.uid() = user_id);

create policy "own state: update" on public.app_state
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own state: delete" on public.app_state
  for delete using (auth.uid() = user_id);

-- Historie van back-ups (laatste N snapshots), handig als er ooit iets misgaat bij sync.
create table if not exists public.app_state_backups (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users (id) on delete cascade,
  data       jsonb       not null,
  created_at timestamptz not null default now()
);

alter table public.app_state_backups enable row level security;

create policy "own backups: select" on public.app_state_backups
  for select using (auth.uid() = user_id);

create policy "own backups: insert" on public.app_state_backups
  for insert with check (auth.uid() = user_id);
