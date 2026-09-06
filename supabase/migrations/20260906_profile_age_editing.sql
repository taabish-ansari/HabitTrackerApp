alter table public.profiles
  add column if not exists age smallint;

alter table public.profiles
  drop constraint if exists profiles_age_check;

alter table public.profiles
  add constraint profiles_age_check check (age is null or age between 13 and 120);

create policy "profiles own update" on public.profiles
  for update
  using (auth.uid() = id)
  with check (auth.uid() = id);
