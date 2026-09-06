create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 2 and 40),
  email text not null unique,
  age smallint check (age is null or age between 13 and 120),
  avatar_url text,
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

create trigger on_auth_user_created
after insert on auth.users
for each row execute procedure public.handle_new_user();
