create table if not exists public.user_activity (
  user_id uuid not null references public.profiles(id) on delete cascade,
  active_date date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, active_date)
);

create index if not exists user_activity_user_date_idx
  on public.user_activity(user_id, active_date desc);

alter table public.user_activity enable row level security;

drop policy if exists "user activity own select" on public.user_activity;
drop policy if exists "user activity own insert" on public.user_activity;

create policy "user activity own select"
  on public.user_activity for select
  using (auth.uid() = user_id);

create policy "user activity own insert"
  on public.user_activity for insert
  with check (auth.uid() = user_id);
