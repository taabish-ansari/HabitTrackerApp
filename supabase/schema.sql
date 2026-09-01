create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 2 and 40),
  email text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists public.habits (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  category text not null check (char_length(category) between 1 and 40),
  difficulty smallint not null default 1 check (difficulty between 1 and 3),
  color text not null default '#10b981' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.habit_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  habit_id bigint not null references public.habits(id) on delete cascade,
  date date not null,
  completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, habit_id, date)
);

create table if not exists public.streaks (
  habit_id bigint primary key references public.habits(id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  longest_streak integer not null default 0 check (longest_streak >= 0),
  last_completed_date date,
  updated_at timestamptz not null default now()
);

create table if not exists public.xp_logs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  habit_id bigint references public.habits(id) on delete set null,
  date date not null,
  xp integer not null check (xp > 0),
  created_at timestamptz not null default now(),
  unique (user_id, habit_id, date)
);

create table if not exists public.user_stats (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  total_xp integer not null default 0 check (total_xp >= 0),
  total_completed integer not null default 0 check (total_completed >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.badges (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  name text not null,
  description text not null,
  earned_at timestamptz not null default now(),
  unique (user_id, code)
);

create index if not exists habits_user_position_idx on public.habits(user_id, position);
create index if not exists habit_logs_user_date_idx on public.habit_logs(user_id, date);
create index if not exists habit_logs_habit_date_idx on public.habit_logs(habit_id, date);
create index if not exists xp_logs_user_date_idx on public.xp_logs(user_id, date);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id, username, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), new.email)
  on conflict (id) do update set email = excluded.email;
  insert into public.user_stats(user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.recompute_habit_streak(p_user_id uuid, p_habit_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  current_streak integer := 0;
  longest_streak integer := 0;
  running integer := 0;
  cursor_date date := current_date;
  previous_date date := null;
  row_date date;
  latest_date date;
begin
  select max(date) into latest_date from public.habit_logs
  where user_id = p_user_id and habit_id = p_habit_id and completed = true;

  if latest_date is not null and latest_date >= current_date then
    cursor_date := current_date;
  elsif latest_date is not null then
    cursor_date := latest_date;
  end if;

  loop
    exit when not exists (
      select 1 from public.habit_logs
      where user_id = p_user_id and habit_id = p_habit_id and date = cursor_date and completed = true
    );
    current_streak := current_streak + 1;
    cursor_date := cursor_date - 1;
  end loop;

  for row_date in select date from public.habit_logs where user_id = p_user_id and habit_id = p_habit_id and completed = true order by date loop
    if previous_date is not null and row_date = previous_date + 1 then running := running + 1; else running := 1; end if;
    longest_streak := greatest(longest_streak, running);
    previous_date := row_date;
  end loop;

  insert into public.streaks(habit_id, current_streak, longest_streak, last_completed_date)
  values (p_habit_id, current_streak, longest_streak, latest_date)
  on conflict (habit_id) do update set current_streak = excluded.current_streak, longest_streak = excluded.longest_streak, last_completed_date = excluded.last_completed_date, updated_at = now();

  return jsonb_build_object('currentStreak', current_streak, 'longestStreak', longest_streak);
end;
$$;

create or replace function public.apply_habit_completion(p_user_id uuid, p_habit_id bigint, p_date date, p_xp integer)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  inserted_count integer;
  streak_data jsonb;
  current_streak integer;
begin
  insert into public.xp_logs(user_id, habit_id, date, xp)
  values (p_user_id, p_habit_id, p_date, p_xp)
  on conflict (user_id, habit_id, date) do nothing;
  get diagnostics inserted_count = row_count;

  update public.user_stats
  set total_xp = total_xp + case when inserted_count = 1 then p_xp else 0 end,
      total_completed = total_completed + case when inserted_count = 1 then 1 else 0 end,
      updated_at = now()
  where user_id = p_user_id;

  streak_data := public.recompute_habit_streak(p_user_id, p_habit_id);
  current_streak := (streak_data->>'currentStreak')::integer;

  if current_streak >= 7 then
    insert into public.badges(user_id, code, name, description) values (p_user_id, 'streak-7', '7 Day Streak', 'Completed a habit for 7 consecutive days') on conflict do nothing;
  end if;
  if current_streak >= 30 then
    insert into public.badges(user_id, code, name, description) values (p_user_id, 'streak-30', '30 Day Streak', 'Completed a habit for 30 consecutive days') on conflict do nothing;
  end if;
  if current_streak >= 100 then
    insert into public.badges(user_id, code, name, description) values (p_user_id, 'streak-100', 'Century', 'Completed a habit for 100 consecutive days') on conflict do nothing;
  end if;
  return streak_data;
end;
$$;

alter table public.profiles enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;
alter table public.streaks enable row level security;
alter table public.xp_logs enable row level security;
alter table public.user_stats enable row level security;
alter table public.badges enable row level security;

create policy "profiles own" on public.profiles for select using (auth.uid() = id);
create policy "habits own" on public.habits for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "habit logs own" on public.habit_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "streaks own" on public.streaks for select using (exists (select 1 from public.habits h where h.id = streaks.habit_id and h.user_id = auth.uid()));
create policy "xp own" on public.xp_logs for select using (auth.uid() = user_id);
create policy "stats own" on public.user_stats for select using (auth.uid() = user_id);
create policy "badges own" on public.badges for select using (auth.uid() = user_id);
