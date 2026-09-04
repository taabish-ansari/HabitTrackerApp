create or replace function public.award_achievements(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare total_xp integer := 0; total_completed integer := 0; habit_count integer := 0; best_longest_streak integer := 0; awarded integer := 0;
begin
  if p_user_id is null then raise exception 'User is required'; end if;
  select coalesce(us.total_xp,0), coalesce(us.total_completed,0) into total_xp,total_completed from public.user_stats us where us.user_id=p_user_id;
  select count(*)::integer into habit_count from public.habits h where h.user_id=p_user_id;
  select coalesce(max(s.longest_streak),0)::integer into best_longest_streak from public.streaks s join public.habits h on h.id=s.habit_id where h.user_id=p_user_id;
  if total_completed >= 1 then insert into public.badges(user_id,code,name,description) values(p_user_id,'first-step','First Step','Completed your first habit check-in') on conflict(user_id,code) do nothing; if found then awarded:=awarded+1; end if; end if;
  if total_completed >= 10 then insert into public.badges(user_id,code,name,description) values(p_user_id,'check-ins-10','Getting Consistent','Completed 10 habit check-ins') on conflict(user_id,code) do nothing; if found then awarded:=awarded+1; end if; end if;
  if total_completed >= 50 then insert into public.badges(user_id,code,name,description) values(p_user_id,'check-ins-50','On a Roll','Completed 50 habit check-ins') on conflict(user_id,code) do nothing; if found then awarded:=awarded+1; end if; end if;
  if total_completed >= 100 then insert into public.badges(user_id,code,name,description) values(p_user_id,'check-ins-100','Century of Wins','Completed 100 habit check-ins') on conflict(user_id,code) do nothing; if found then awarded:=awarded+1; end if; end if;
  if total_xp >= 500 then insert into public.badges(user_id,code,name,description) values(p_user_id,'xp-500','500 XP','Earned 500 total XP') on conflict(user_id,code) do nothing; if found then awarded:=awarded+1; end if; end if;
  if total_xp >= 1000 then insert into public.badges(user_id,code,name,description) values(p_user_id,'xp-1000','1,000 XP','Earned 1,000 total XP') on conflict(user_id,code) do nothing; if found then awarded:=awarded+1; end if; end if;
  if best_longest_streak >= 7 then insert into public.badges(user_id,code,name,description) values(p_user_id,'streak-7','7-Day Streak','Completed all required days for a 7-day streak') on conflict(user_id,code) do nothing; if found then awarded:=awarded+1; end if; end if;
  if best_longest_streak >= 30 then insert into public.badges(user_id,code,name,description) values(p_user_id,'streak-30','30-Day Streak','Completed all required days for a 30-day streak') on conflict(user_id,code) do nothing; if found then awarded:=awarded+1; end if; end if;
  if best_longest_streak >= 100 then insert into public.badges(user_id,code,name,description) values(p_user_id,'streak-100','Century Streak','Completed all required days for a 100-day streak') on conflict(user_id,code) do nothing; if found then awarded:=awarded+1; end if; end if;
  if habit_count >= 3 then insert into public.badges(user_id,code,name,description) values(p_user_id,'habits-3','Habit Builder','Created 3 active habits') on conflict(user_id,code) do nothing; if found then awarded:=awarded+1; end if; end if;
  return jsonb_build_object('awarded',awarded);
end;
$$;

create or replace function public.award_achievements_from_user_stats() returns trigger language plpgsql security definer set search_path='' as $$ begin perform public.award_achievements(new.user_id); return new; end; $$;
create or replace function public.award_achievements_from_streak() returns trigger language plpgsql security definer set search_path='' as $$ declare owner_id uuid; begin select h.user_id into owner_id from public.habits h where h.id=new.habit_id; if owner_id is not null then perform public.award_achievements(owner_id); end if; return new; end; $$;
create or replace function public.award_achievements_from_habit() returns trigger language plpgsql security definer set search_path='' as $$ begin perform public.award_achievements(new.user_id); return new; end; $$;

drop trigger if exists award_achievements_on_user_stats on public.user_stats;
create trigger award_achievements_on_user_stats after insert or update of total_xp,total_completed on public.user_stats for each row execute function public.award_achievements_from_user_stats();
drop trigger if exists award_achievements_on_streaks on public.streaks;
create trigger award_achievements_on_streaks after insert or update of current_streak,longest_streak on public.streaks for each row execute function public.award_achievements_from_streak();
drop trigger if exists award_achievements_on_habits on public.habits;
create trigger award_achievements_on_habits after insert on public.habits for each row execute function public.award_achievements_from_habit();