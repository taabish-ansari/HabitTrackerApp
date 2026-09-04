function isScheduledOnDate(habit, date) {
  const scheduleType = habit?.schedule_type || 'daily';
  const day = date.getDay();
  if (scheduleType === 'weekdays') return day >= 1 && day <= 5;
  if (scheduleType === 'custom') {
    const days = Array.isArray(habit?.schedule_days) ? habit.schedule_days : [];
    return days.includes(day);
  }
  return true;
}

function getDateKey(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function getHabitMonthPerformance(habit, logs, days, year, month, todayKey) {
  let due = 0;
  let completed = 0;

  for (const day of days) {
    const dateKey = getDateKey(year, month, day);
    if (dateKey > todayKey) continue;

    const date = new Date(year, month, day);
    if (!isScheduledOnDate(habit, date)) continue;

    due += 1;
    if (logs?.[`${habit.id}-${dateKey}`]?.completed) completed += 1;
  }

  return {
    due,
    completed,
    rate: due ? Math.round((completed / due) * 100) : null,
  };
}

export function getPersonalizedRecommendations(habits, logs, days, year, month, todayKey, dailyScore) {
  if (!habits?.length) {
    return [{
      type: 'start',
      title: 'Start with one repeatable habit',
      body: 'Add a small habit you can realistically complete most days. Consistency matters more than volume.',
      label: 'Build momentum',
    }];
  }

  const performance = habits
    .map((habit) => ({ habit, ...getHabitMonthPerformance(habit, logs, days, year, month, todayKey) }))
    .filter((item) => item.due > 0);

  const recommendations = [];
  const weakest = [...performance]
    .filter((item) => item.due >= 2 && item.rate < 60)
    .sort((a, b) => a.rate - b.rate)[0];

  if (weakest) {
    recommendations.push({
      type: 'focus',
      title: `Give ${weakest.habit.name} a smaller win`,
      body: `You are at ${weakest.rate}% this month (${weakest.completed}/${weakest.due} scheduled). Lower the friction today and protect the next completion.`,
      label: 'Focus habit',
      color: weakest.habit.color,
    });
  }

  const strongest = [...performance]
    .filter((item) => item.due >= 2 && item.rate >= 80)
    .sort((a, b) => b.rate - a.rate)[0];

  if (strongest) {
    recommendations.push({
      type: 'protect',
      title: `Protect ${strongest.habit.name}`,
      body: `It is your strongest habit at ${strongest.rate}% this month. Keep the same routine instead of adding more complexity.`,
      label: 'Keep steady',
      color: strongest.habit.color,
    });
  }

  if (dailyScore?.dueCount > 0 && dailyScore.remainingCount > 0) {
    recommendations.push({
      type: 'today',
      title: `Finish ${dailyScore.remainingCount} scheduled habit${dailyScore.remainingCount === 1 ? '' : 's'}`,
      body: `Your daily score is ${dailyScore.score}/100. One more check-in moves today closer to a complete win.`,
      label: 'Win today',
    });
  } else if (dailyScore?.dueCount > 0 && dailyScore.score === 100) {
    recommendations.push({
      type: 'complete',
      title: 'Today is fully cleared',
      body: 'You completed every scheduled habit today. Keep tomorrow’s plan simple and repeat what worked.',
      label: 'Great work',
    });
  }

  if (recommendations.length === 0) {
    recommendations.push({
      type: 'maintain',
      title: 'Stay with what is working',
      body: 'Your current pattern is balanced. Keep your routine steady before introducing more habits.',
      label: 'Maintain',
    });
  }

  return recommendations.slice(0, 3);
}
