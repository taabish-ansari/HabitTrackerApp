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

function getDayLabel(date) {
  return date.toLocaleDateString(undefined, { weekday: 'long' });
}

export function getBehaviorInsights(habits, logs, year, month, todayKey) {
  const insights = [];
  const lookup = new Map(Object.values(logs || {}).map((log) => [`${log.habit_id}-${log.date}`, log]));
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const elapsedDays = Array.from({ length: daysInMonth }, (_, index) => index + 1)
    .filter((day) => getDateKey(year, month, day) <= todayKey);

  if (!habits?.length || elapsedDays.length < 4) return insights;

  const habitStats = habits.map((habit) => {
    let due = 0;
    let completed = 0;

    for (const day of elapsedDays) {
      const date = new Date(year, month, day);
      if (!isScheduledOnDate(habit, date)) continue;
      due += 1;
      if (lookup.get(`${habit.id}-${getDateKey(year, month, day)}`)?.completed) completed += 1;
    }

    return { habit, due, completed, rate: due ? completed / due : 0 };
  }).filter((item) => item.due >= 4);

  const strongestHabit = [...habitStats].sort((a, b) => b.rate - a.rate || b.completed - a.completed)[0];
  const secondStrongestHabit = [...habitStats].sort((a, b) => b.rate - a.rate || b.completed - a.completed)[1];

  if (strongestHabit && (!secondStrongestHabit || strongestHabit.rate - secondStrongestHabit.rate >= 0.12) && strongestHabit.rate >= 0.75) {
    insights.push({
      type: 'habit',
      title: `${strongestHabit.habit.name} is your most dependable habit`,
      body: `You complete it on ${Math.round(strongestHabit.rate * 100)}% of its scheduled days this month.`,
      color: strongestHabit.habit.color,
    });
  }

  const weekdayStats = { due: 0, completed: 0 };
  const weekendStats = { due: 0, completed: 0 };
  const dayStats = new Map();
  for (const day of elapsedDays) {
    const date = new Date(year, month, day);
    const dayOfWeek = date.getDay();
    const bucket = dayOfWeek === 0 || dayOfWeek === 6 ? weekendStats : weekdayStats;

    for (const habit of habits) {
      if (!isScheduledOnDate(habit, date)) continue;
      const completed = lookup.get(`${habit.id}-${getDateKey(year, month, day)}`)?.completed;
      bucket.due += 1;
      if (completed) bucket.completed += 1;

      const current = dayStats.get(dayOfWeek) || { due: 0, completed: 0, date };
      current.due += 1;
      if (completed) current.completed += 1;
      dayStats.set(dayOfWeek, current);
    }
  }

  const weekdayRate = weekdayStats.due >= 6 ? weekdayStats.completed / weekdayStats.due : null;
  const weekendRate = weekendStats.due >= 4 ? weekendStats.completed / weekendStats.due : null;

  if (weekdayRate !== null && weekendRate !== null && weekdayRate - weekendRate >= 0.15) {
    insights.push({
      type: 'pattern',
      title: 'You are strongest on weekdays',
      body: `Your weekday consistency is ${Math.round(weekdayRate * 100)}% versus ${Math.round(weekendRate * 100)}% on weekends.`,
    });
  } else if (weekdayRate !== null && weekendRate !== null && weekendRate - weekdayRate >= 0.15) {
    insights.push({
      type: 'pattern',
      title: 'You are strongest on weekends',
      body: `Your weekend consistency is ${Math.round(weekendRate * 100)}% versus ${Math.round(weekdayRate * 100)}% on weekdays.`,
    });
  }

  const strongestDay = [...dayStats.entries()]
    .filter(([, stat]) => stat.due >= 2)
    .map(([dayOfWeek, stat]) => ({ dayOfWeek, ...stat, rate: stat.completed / stat.due }))
    .sort((a, b) => b.rate - a.rate || b.completed - a.completed)[0];

  if (strongestDay && strongestDay.rate >= 0.75) {
    const label = getDayLabel(new Date(2024, 0, strongestDay.dayOfWeek === 0 ? 7 : strongestDay.dayOfWeek));
    insights.push({
      type: 'day',
      title: `${label}s are your strongest day`,
      body: `You complete ${Math.round(strongestDay.rate * 100)}% of the habits scheduled then.`,
    });
  }

  const midpoint = Math.floor(elapsedDays.length / 2);
  const firstHalf = elapsedDays.slice(0, midpoint);
  const secondHalf = elapsedDays.slice(midpoint);
  const getWindowRate = (windowDays) => {
    let due = 0;
    let completed = 0;

    for (const day of windowDays) {
      const date = new Date(year, month, day);
      for (const habit of habits) {
        if (!isScheduledOnDate(habit, date)) continue;
        due += 1;
        if (lookup.get(`${habit.id}-${getDateKey(year, month, day)}`)?.completed) completed += 1;
      }
    }

    return due >= 6 ? completed / due : null;
  };

  const firstRate = getWindowRate(firstHalf);
  const secondRate = getWindowRate(secondHalf);
  if (firstRate !== null && secondRate !== null && secondRate - firstRate >= 0.12) {
    insights.push({
      type: 'trend',
      title: 'Your consistency is improving',
      body: `You went from ${Math.round(firstRate * 100)}% in the first part of the month to ${Math.round(secondRate * 100)}% more recently.`,
    });
  } else if (firstRate !== null && secondRate !== null && firstRate - secondRate >= 0.12) {
    insights.push({
      type: 'trend',
      title: 'Your consistency has dipped recently',
      body: `You were at ${Math.round(firstRate * 100)}% earlier this month and ${Math.round(secondRate * 100)}% more recently.`,
    });
  }

  return insights.slice(0, 3);
}
