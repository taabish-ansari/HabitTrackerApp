-- Re-evaluate existing users once so achievements already earned by current stats are persisted.
select public.award_achievements(id) from auth.users;

-- The evaluator is trigger-driven after this migration and remains internal to the database.
revoke all on function public.award_achievements(uuid) from public;