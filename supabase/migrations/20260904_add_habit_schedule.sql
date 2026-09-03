alter table public.habits
  add column if not exists schedule_type text not null default 'daily' check (schedule_type in ('daily','weekdays','custom')),
  add column if not exists schedule_days smallint[] not null default '{}'::smallint[];

create index if not exists habits_schedule_idx on public.habits(user_id, schedule_type);

create or replace function public.is_habit_scheduled(p_habit_id bigint, p_date date)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select case
    when h.schedule_type = 'daily' then true
    when h.schedule_type = 'weekdays' then extract(isodow from p_date) between 1 and 5
    when h.schedule_type = 'custom' then extract(dow from p_date)::smallint = any(h.schedule_days)
    else true
  end
  from public.habits h
  where h.id = p_habit_id;
$$;

create or replace function public.enforce_habit_schedule()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.completed = true and not public.is_habit_scheduled(new.habit_id, new.date) then
    raise exception 'Habit is not scheduled for %', new.date using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists habit_logs_schedule_check on public.habit_logs;
create trigger habit_logs_schedule_check
before insert or update of habit_id, date, completed on public.habit_logs
for each row execute function public.enforce_habit_schedule();
