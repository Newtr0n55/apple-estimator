-- Used Apple Estimator: storage for the anonymous records the app sends.
-- Paste this whole file into Supabase > SQL Editor > New query, then Run. Safe to run again.

create table if not exists public.records (
  id            bigint generated always as identity primary key,
  created_at    timestamptz not null default now(),
  client_time   timestamptz,
  install_id    uuid not null,
  kind          text not null check (kind in ('ask', 'bought', 'sold')),
  model         text not null check (char_length(model) between 1 and 20),
  storage       int  check (storage is null or storage between 8 and 4096),
  conn          text check (conn is null or conn in ('wifi', 'cell')),
  lock          text check (lock in ('official', 'esim', 'turbo', 'carrier', 'bypass', 'mdm', 'icloud')),
  battery       int  check (battery is null or battery between 40 and 100),
  bat_type      text check (char_length(bat_type) <= 20),
  bio           text check (char_length(bio) <= 20),
  screen_origin text check (char_length(screen_origin) <= 20),
  screen_cond   text check (char_length(screen_cond) <= 20),
  back          text check (char_length(back) <= 20),
  body          text check (char_length(body) <= 20),
  faults        text[] not null default '{}' check (cardinality(faults) <= 12),
  warranty      text check (char_length(warranty) <= 20),
  extras        text[] not null default '{}' check (cardinality(extras) <= 8),
  base_used     int  check (base_used between 0 and 100000),
  base_default  int  check (base_default between 0 and 100000),
  total         int  check (total between 0 and 200000),
  estimate      int  check (estimate between 0 and 200000),
  price         int  not null check (price between 50 and 100000),
  prices_version int,
  app_version   text check (char_length(app_version) <= 20),
  lang          text check (char_length(lang) <= 5)
);
create index if not exists records_created on public.records (created_at);
create index if not exists records_install on public.records (install_id, created_at);

-- The app's public key (role "anon") may insert and nothing else.
alter table public.records enable row level security;
drop policy if exists "app inserts" on public.records;
create policy "app inserts" on public.records for insert to anon with check (true);
revoke select, update, delete on public.records from anon, authenticated;
grant insert on public.records to anon;
grant usage on sequence public.records_id_seq to anon;

-- Server clock wins, and one install can send at most 60 records a day.
create or replace function public.records_limit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.records
      where install_id = new.install_id and created_at > now() - interval '1 day') >= 60 then
    raise exception 'daily limit reached' using errcode = 'P0001';
  end if;
  new.created_at := now();
  return new;
end $$;
drop trigger if exists records_limit on public.records;
create trigger records_limit before insert on public.records
  for each row execute function public.records_limit();

-- "Delete my data" in the app. Only someone holding the random install code can call it usefully.
create or replace function public.delete_install(p_install uuid) returns int
language sql security definer set search_path = public as $$
  with d as (delete from public.records where install_id = p_install returning 1)
  select count(*)::int from d;
$$;
revoke all on function public.delete_install(uuid) from public;
grant execute on function public.delete_install(uuid) to anon;

-- Handy view for you in the Table Editor: last 7 days per model.
create or replace view public.weekly_summary with (security_invoker = true) as
  select model, kind, count(*) as n, percentile_cont(0.5) within group (order by price) as median_price
  from public.records where created_at > now() - interval '7 days'
  group by model, kind order by model, kind;
revoke all on public.weekly_summary from anon, authenticated;
