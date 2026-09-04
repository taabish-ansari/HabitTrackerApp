-- Fix date handling for users ahead of the database's UTC date.
-- The app stores habit dates as calendar dates in the user's local timezone.
-- This migration uses India Standard Time for the current deployment.

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
  local_today date := (now() at time zone 'Asia/Kolkata')::date;
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
    today_is_scheduled := extract(isodow from local_today) between 1 and 5;
  elsif habit_schedule_type = 'custom' then
    today_is_scheduled := extract(dow from local_today)::smallint = any(habit_schedule_days);
  else
    today_is_scheduled := true;
  end if;

  anchor_date := local_today;
  if today_is_scheduled then
    if not exists (
      select 1 from public.habit_logs hl
      where hl.user_id = p_user_id and hl.habit_id = p_habit_id
        and hl.date = local_today and hl.completed = true
    ) then
      anchor_date := local_today - 1;
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

create or replace function public.set_habit_completion(p_user_id uuid, p_habit_id bigint, p_date date, p_completed boolean, p_xp integer)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  existing_completed boolean := false;
  habit_exists boolean := false;
  awarded_xp integer := 0;
  streak_data jsonb;
  log_row jsonb;
  removed_xp integer;
  local_today date := (now() at time zone 'Asia/Kolkata')::date;
begin
  if p_user_id is null or p_user_id <> (select auth.uid()) then
    raise exception 'Not authorized';
  end if;

  if p_xp <= 0 then
    raise exception 'Invalid XP';
  end if;

  -- Future dates remain inert, but 'today' is evaluated in the app's local timezone.
  if p_date > local_today then
    return jsonb_build_object(
      'log', jsonb_build_object('habit_id', p_habit_id, 'date', p_date, 'completed', false),
      'awardedXp', 0,
      'streak', jsonb_build_object('currentStreak', 0, 'longestStreak', 0),
      'skipped', true,
      'reason', 'future_date'
    );
  end if;

  select exists(
    select 1 from public.habits h
    where h.id = p_habit_id and h.user_id = p_user_id
  ) into habit_exists;

  if not habit_exists then
    raise exception 'Habit not found';
  end if;

  select hl.completed into existing_completed
  from public.habit_logs hl
  where hl.user_id = p_user_id and hl.habit_id = p_habit_id and hl.date = p_date;

  insert into public.habit_logs(user_id, habit_id, date, completed, updated_at)
  values(p_user_id, p_habit_id, p_date, p_completed, now())
  on conflict(user_id, habit_id, date) do update
    set completed = excluded.completed, updated_at = now();

  if p_completed and not coalesce(existing_completed, false) then
    insert into public.xp_logs(user_id, habit_id, date, xp)
    values(p_user_id, p_habit_id, p_date, p_xp)
    on conflict(user_id, habit_id, date) do nothing;

    if found then
      awarded_xp := p_xp;
      update public.user_stats
      set total_xp = total_xp + p_xp,
          total_completed = total_completed + 1,
          updated_at = now()
      where user_id = p_user_id;
    end if;
  elsif not p_completed and coalesce(existing_completed, false) then
    removed_xp := null;
    delete from public.xp_logs
    where user_id = p_user_id and habit_id = p_habit_id and date = p_date
    returning xp into removed_xp;

    if removed_xp is not null then
      awarded_xp := -removed_xp;
      update public.user_stats
      set total_xp = greatest(0, total_xp - removed_xp),
          total_completed = greatest(0, total_completed - 1),
          updated_at = now()
      where user_id = p_user_id;
    end if;
  end if;

  streak_data := public.recompute_habit_streak(p_user_id, p_habit_id);

  select to_jsonb(hl) into log_row
  from public.habit_logs hl
  where hl.user_id = p_user_id and hl.habit_id = p_habit_id and hl.date = p_date;

  return jsonb_build_object('log', log_row, 'awardedXp', awarded_xp, 'streak', streak_data);
end;
$$;
