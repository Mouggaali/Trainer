-- Hardening before sharing the app with other people. Run once in the Supabase SQL Editor (safe to run again).
-- Requires schema.sql and push.sql to have been run first.
--  1. Size limits so one account cannot fill the free plan (500 MB).
--  2. At most 30 backups and 5 push subscriptions per user (oldest are removed automatically).
--  3. RLS policies only for signed-in users, with (select auth.uid()) so Postgres evaluates it once per query.

-- ---------- 1. Size limits ----------
alter table public.app_state drop constraint if exists app_state_size;
alter table public.app_state add constraint app_state_size check (octet_length(data::text) < 5000000);

alter table public.app_state_backups drop constraint if exists app_state_backups_size;
alter table public.app_state_backups add constraint app_state_backups_size check (octet_length(data::text) < 5000000);

alter table public.push_subscriptions drop constraint if exists push_subscriptions_size;
alter table public.push_subscriptions add constraint push_subscriptions_size
  check (length(endpoint) < 1000 and length(p256dh) < 200 and length(auth) < 100);

alter table public.rest_timers drop constraint if exists rest_timers_size;
alter table public.rest_timers add constraint rest_timers_size check (length(title) <= 120 and length(body) <= 300);

-- ---------- 2. Keep the newest 30 backups / 5 push subscriptions per user ----------
-- Trigger functions live in a private (not exposed) schema; security definer because users have no delete
-- policy on their backups. They only ever touch rows of the user that inserted (new.user_id).
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create or replace function private.prune_backups()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.app_state_backups
  where user_id = new.user_id
    and id not in (
      select id from public.app_state_backups
      where user_id = new.user_id
      order by created_at desc, id desc
      limit 30
    );
  return null;
end;
$$;
revoke execute on function private.prune_backups() from public, anon, authenticated;

drop trigger if exists prune_backups on public.app_state_backups;
create trigger prune_backups after insert on public.app_state_backups
  for each row execute function private.prune_backups();

create or replace function private.prune_push_subscriptions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.push_subscriptions
  where user_id = new.user_id
    and id not in (
      select id from public.push_subscriptions
      where user_id = new.user_id
      order by created_at desc, id desc
      limit 5
    );
  return null;
end;
$$;
revoke execute on function private.prune_push_subscriptions() from public, anon, authenticated;

drop trigger if exists prune_push_subscriptions on public.push_subscriptions;
create trigger prune_push_subscriptions after insert on public.push_subscriptions
  for each row execute function private.prune_push_subscriptions();

create index if not exists app_state_backups_user_created on public.app_state_backups (user_id, created_at desc);
create index if not exists push_subscriptions_user on public.push_subscriptions (user_id);

-- ---------- 3. Policies: signed-in users only, auth.uid() evaluated once ----------
drop policy if exists "own state: select" on public.app_state;
drop policy if exists "own state: insert" on public.app_state;
drop policy if exists "own state: update" on public.app_state;
drop policy if exists "own state: delete" on public.app_state;
create policy "own state: select" on public.app_state for select to authenticated using ((select auth.uid()) = user_id);
create policy "own state: insert" on public.app_state for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own state: update" on public.app_state for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own state: delete" on public.app_state for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own backups: select" on public.app_state_backups;
drop policy if exists "own backups: insert" on public.app_state_backups;
create policy "own backups: select" on public.app_state_backups for select to authenticated using ((select auth.uid()) = user_id);
create policy "own backups: insert" on public.app_state_backups for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists "own subs: select" on public.push_subscriptions;
drop policy if exists "own subs: insert" on public.push_subscriptions;
drop policy if exists "own subs: update" on public.push_subscriptions;
drop policy if exists "own subs: delete" on public.push_subscriptions;
create policy "own subs: select" on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy "own subs: insert" on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own subs: update" on public.push_subscriptions for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own subs: delete" on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

drop policy if exists "own timer: select" on public.rest_timers;
drop policy if exists "own timer: insert" on public.rest_timers;
drop policy if exists "own timer: update" on public.rest_timers;
drop policy if exists "own timer: delete" on public.rest_timers;
create policy "own timer: select" on public.rest_timers for select to authenticated using ((select auth.uid()) = user_id);
create policy "own timer: insert" on public.rest_timers for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "own timer: update" on public.rest_timers for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "own timer: delete" on public.rest_timers for delete to authenticated using ((select auth.uid()) = user_id);

-- Check afterwards: Advisors → Security Advisor should show no errors for these tables.
