-- Backfill known app usage dates from completed habit check-ins.
-- A completed check-in is concrete evidence that the user opened/used HabitTracker
-- on that date. Future usage days continue to be recorded by useUsageStreak.js.
insert into public.user_activity (user_id, active_date)
select distinct hl.user_id, hl.date
from public.habit_logs hl
where hl.completed = true
on conflict (user_id, active_date) do nothing;
