function isHabitScheduledToday(habit, date = new Date()) {
  const scheduleType = habit?.schedule_type || 'daily';
  if (scheduleType === 'weekdays') return date.getDay() >= 1 && date.getDay() <= 5;
  if (scheduleType === 'custom') {
    const days = Array.isArray(habit?.schedule_days) ? habit.schedule_days : [];
    return days.includes(date.getDay());
  }
  return true;
}

export function getDailyScore(habits, logs, dateKey, date = new Date()) {
  const dueHabits = (habits || []).filter(habit => isHabitScheduledToday(habit, date));
  const completedHabits = dueHabits.filter(habit => logs?.[`${habit.id}-${dateKey}`]?.completed);
  const dueCount = dueHabits.length;
  const completedCount = completedHabits.length;

  return {
    score: dueCount ? Math.round((completedCount / dueCount) * 100) : null,
    dueCount,
    completedCount,
    remainingCount: Math.max(0, dueCount - completedCount),
  };
}
