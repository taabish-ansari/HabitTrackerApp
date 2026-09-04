create or replace function public.recompute_habit_streak(p_user_id uuid, p_habit_id bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_streak integer := 0;
  longest_streak integer := 0;
  running integer := 0;
  cursor_date date;
  previous_date date := null;
  row_date date;
  latest_date date;
  anchor_date date;
  candidate_date date;
  habit_schedule_type text;
  habit_schedule_days smallint[];
  guard integer := 0;
  today_is_scheduled boolean := false;
begin
  if p_user_id is null or p_user_id <> (select auth.uid()) then
    raise exception 'Not authorized';
  end if;

  select h.schedule_type, h.schedule_days
    into habit_schedule_type, habit_schedule_days
  from public.habits h
  where h.id = p_habit_id and h.user_id = p_user_id;

  if not found then
    raise exception 'Habit not found';
  end if;

  select max(hl.date)
    into latest_date
  from public.habit_logs hl
  where hl.user_id = p_user_id
    and hl.habit_id = p_habit_id
    and hl.completed = true
    and public.is_habit_scheduled(p_habit_id, hl.date);

  if habit_schedule_type = 'weekdays' then
    today_is_scheduled := extract(isodow from current_date) between 1 and 5;
  elsif habit_schedule_type = 'custom' then
    today_is_scheduled := extract(dow from current_date)::smallint = any(habit_schedule_days);
  else
    today_is_scheduled := true;
  end if;

  anchor_date := current_date;
  if today_is_scheduled then
    if not exists (
      select 1 from public.habit_logs hl
      where hl.user_id = p_user_id and hl.habit_id = p_habit_id
        and hl.date = current_date and hl.completed = true
    ) then
      anchor_date := current_date - 1;
    end if;
  end if;

  if habit_schedule_type = 'weekdays' then
    while extract(isodow from anchor_date) not between 1 and 5 loop
      anchor_date := anchor_date - 1;
      guard := guard + 1;
      exit when guard > 370;
    end loop;
  elsif habit_schedule_type = 'custom' then
    while not (extract(dow from anchor_date)::smallint = any(habit_schedule_days)) loop
      anchor_date := anchor_date - 1;
      guard := guard + 1;
      exit when guard > 370;
    end loop;
  end if;

  if latest_date is not null and latest_date = anchor_date then
    cursor_date := anchor_date;
    guard := 0;
    loop
      exit when not exists (
        select 1 from public.habit_logs hl
        where hl.user_id = p_user_id and hl.habit_id = p_habit_id
          and hl.date = cursor_date and hl.completed = true
          and public.is_habit_scheduled(p_habit_id, hl.date)
      );
      current_streak := current_streak + 1;

      candidate_date := cursor_date - 1;
      if habit_schedule_type = 'weekdays' then
        while extract(isodow from candidate_date) not between 1 and 5 loop
          candidate_date := candidate_date - 1;
          guard := guard + 1;
          exit when guard > 370;
        end loop;
      elsif habit_schedule_type = 'custom' then
        while not (extract(dow from candidate_date)::smallint = any(habit_schedule_days)) loop
          candidate_date := candidate_date - 1;
          guard := guard + 1;
          exit when guard > 370;
        end loop;
      end if;

      cursor_date := candidate_date;
      guard := guard + 1;
      exit when guard > 370;
    end loop;
  end if;

  running := 0;
  previous_date := null;
  guard := 0;
  for row_date in
    select hl.date
    from public.habit_logs hl
    where hl.user_id = p_user_id
      and hl.habit_id = p_habit_id
      and hl.completed = true
      and public.is_habit_scheduled(p_habit_id, hl.date)
    order by hl.date
  loop
    if previous_date is null then
      running := 1;
    else
      candidate_date := previous_date + 1;
      if habit_schedule_type = 'weekdays' then
        while extract(isodow from candidate_date) not between 1 and 5 loop
          candidate_date := candidate_date + 1;
          guard := guard + 1;
          exit when guard > 370;
        end loop;
      elsif habit_schedule_type = 'custom' then
        while not (extract(dow from candidate_date)::smallint = any(habit_schedule_days)) loop
          candidate_date := candidate_date + 1;
          guard := guard + 1;
          exit when guard > 370;
        end loop;
      end if;

      if row_date = candidate_date then
        running := running + 1;
      else
        running := 1;
      end if;
    end if;
    longest_streak := greatest(longest_streak, running);
    previous_date := row_date;
    guard := guard + 1;
    exit when guard > 10000;
  end loop;

  insert into public.streaks(habit_id, current_streak, longest_streak, last_completed_date)
  values(p_habit_id, current_streak, longest_streak, latest_date)
  on conflict(habit_id) do update set
    current_streak = excluded.current_streak,
    longest_streak = excluded.longest_streak,
    last_completed_date = excluded.last_completed_date,
    updated_at = now();

  return jsonb_build_object(
    'currentStreak', current_streak,
    'longestStreak', longest_streak,
    'lastCompletedDate', latest_date
  );
end;
$$;

do $$
declare
  r record;
begin
  for r in select h.user_id, h.id from public.habits h loop
    perform public.recompute_habit_streak(r.user_id, r.id);
  end loop;
end;
$$;
