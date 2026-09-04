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

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function buildLogLookup(logs) {
  const values = Array.isArray(logs) ? logs : Object.values(logs || {});
  return new Map(values.map((log) => [`${log.habit_id}-${log.date}`, log]));
}

function getMonthPerformance(habit, lookup, today) {
  let due = 0;
  let completed = 0;
  const cursor = new Date(today.getFullYear(), today.getMonth(), 1);

  while (cursor <= today) {
    if (isScheduledOnDate(habit, cursor)) {
      due += 1;
      if (lookup.get(`${habit.id}-${dateKey(cursor)}`)?.completed) completed += 1;
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return { due, completed, rate: due ? completed / due : 0 };
}

export function getPersonalizedRoutine(habits, logs, today = new Date()) {
  const todayHabits = (habits || []).filter((habit) => isScheduledOnDate(habit, today));
  if (!todayHabits.length) return { steps: [], restDay: true, complete: false };

  const lookup = buildLogLookup(logs);
  const performance = todayHabits.map((habit, index) => ({
    habit,
    index,
    completedToday: !!lookup.get(`${habit.id}-${dateKey(today)}`)?.completed,
    ...getMonthPerformance(habit, lookup, today),
  }));

  const incomplete = performance.filter((item) => !item.completedToday);
  const completedCount = performance.length - incomplete.length;
  if (!incomplete.length) {
    return { steps: [], restDay: false, complete: true, dueCount: performance.length, completedCount };
  }

  const steps = [];
  const used = new Set();

  const quickWin = [...incomplete]
    .filter((item) => item.rate >= 0.75 || item.due < 4)
    .sort((a, b) => b.rate - a.rate || a.index - b.index)[0];

  if (quickWin) {
    steps.push({ type: 'start', label: 'Start with a quick win', habit: quickWin.habit });
    used.add(quickWin.habit.id);
  }

  const priority = [...incomplete]
    .filter((item) => !used.has(item.habit.id))
    .sort((a, b) => a.rate - b.rate || b.difficulty - a.difficulty || a.index - b.index)[0];

  if (priority) {
    steps.push({
      type: 'focus',
      label: priority.rate < 0.7 ? 'Then protect your weak spot' : 'Then keep your momentum',
      habit: priority.habit,
    });
    used.add(priority.habit.id);
  }

  [...incomplete]
    .filter((item) => !used.has(item.habit.id))
    .sort((a, b) => a.index - b.index)
    .forEach((item) => {
      if (steps.length < 3) steps.push({ type: 'finish', label: 'Finish with this', habit: item.habit });
    });

  return {
    steps,
    restDay: false,
    complete: false,
    dueCount: performance.length,
    completedCount,
  };
}
