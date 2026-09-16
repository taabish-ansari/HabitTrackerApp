import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { habitsApi, logsApi } from '../services/api';

function monthRangeFromLabel(label) {
  const parsed = new Date(`${label} 1, 12:00:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  const year = parsed.getFullYear();
  const month = parsed.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    year,
    month,
    from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    to: `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

function dateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formatDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
  });
}

function weekdayStats(keys, habits, lookup) {
  const days = Array.from({ length: 7 }, (_, index) => ({
    index,
    label: new Date(2026, 0, 4 + index).toLocaleDateString(undefined, { weekday: 'short' }),
    completed: 0,
    possible: 0,
  }));

  keys.forEach((key) => {
    const date = new Date(`${key}T12:00:00`);
    const bucket = days[date.getDay() === 0 ? 6 : date.getDay() - 1];
    bucket.possible += habits.length;
    bucket.completed += habits.reduce(
      (sum, habit) => sum + (lookup.get(`${habit.id}-${key}`)?.completed ? 1 : 0),
      0,
    );
  });

  return days.map((day) => ({
    ...day,
    rate: day.possible ? Math.round((day.completed / day.possible) * 100) : 0,
  }));
}

export default function InsightsEnhancer() {
  const [active, setActive] = useState(false);
  const [contentRoot, setContentRoot] = useState(null);
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [range, setRange] = useState(null);
  const [loading, setLoading] = useState(false);
  const rangeKeyRef = useRef('');

  useEffect(() => {
    const sync = () => {
      const activeButton = [...document.querySelectorAll('.side-nav button')]
        .find((button) => button.classList.contains('active'));
      const isInsights = activeButton?.textContent?.includes('Insights');
      const root = document.querySelector('.content');
      setActive(Boolean(isInsights));
      setContentRoot(root || null);

      if (!isInsights) {
        rangeKeyRef.current = '';
        return;
      }

      const label = document.querySelector('.insights-grid .insight-card.large .eyebrow')?.textContent?.trim();
      const nextRange = monthRangeFromLabel(label || '');
      const nextKey = nextRange ? `${nextRange.from}|${nextRange.to}` : '';
      if (nextKey && nextKey !== rangeKeyRef.current) {
        rangeKeyRef.current = nextKey;
        setRange(nextRange);
      }
    };

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active || !range) return undefined;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [{ data: habitData }, { data: logData }] = await Promise.all([
          habitsApi.list(),
          logsApi.list(range.from, range.to),
        ]);
        if (!cancelled) {
          setHabits(habitData ?? []);
          setLogs(logData ?? []);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, [active, range?.from, range?.to]);

  const analysis = useMemo(() => {
    if (!range) return null;

    const now = new Date();
    const sameMonth = range.year === now.getFullYear() && range.month === now.getMonth();
    const elapsed = sameMonth
      ? now.getDate()
      : range.year < now.getFullYear() || (range.year === now.getFullYear() && range.month < now.getMonth())
        ? new Date(range.year, range.month + 1, 0).getDate()
        : 0;

    const keys = Array.from(
      { length: elapsed },
      (_, index) => `${range.year}-${String(range.month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
    );
    const lookup = new Map(logs.map((log) => [`${log.habit_id}-${log.date}`, log]));
    const totalPossible = habits.length * keys.length;
    const totalCompleted = habits.reduce(
      (sum, habit) => sum + keys.reduce(
        (count, key) => count + (lookup.get(`${habit.id}-${key}`)?.completed ? 1 : 0),
        0,
      ),
      0,
    );
    const score = totalPossible ? Math.round((totalCompleted / totalPossible) * 100) : 0;

    const habitStats = habits.map((habit) => {
      const completed = keys.reduce(
        (count, key) => count + (lookup.get(`${habit.id}-${key}`)?.completed ? 1 : 0),
        0,
      );
      return {
        habit,
        completed,
        rate: keys.length ? Math.round((completed / keys.length) * 100) : 0,
      };
    }).sort((a, b) => b.rate - a.rate || b.completed - a.completed);

    const daily = keys.map((date) => ({
      date,
      count: habits.reduce(
        (sum, habit) => sum + (lookup.get(`${habit.id}-${date}`)?.completed ? 1 : 0),
        0,
      ),
    }));

    const activeDays = daily.filter((day) => day.count > 0).length;
    const avgCompletedPerDay = elapsed ? (totalCompleted / elapsed).toFixed(1) : '0.0';
    const weekly = weekdayStats(keys, habits, lookup);
    const strongestDay = [...weekly].sort((a, b) => b.rate - a.rate || b.completed - a.completed)[0];
    const strongestHabit = habitStats[0] || null;
    const opportunity = habitStats.length > 1 ? habitStats[habitStats.length - 1] : strongestHabit;
    const onTrack = habitStats.filter((item) => item.rate >= 80).length;
    const bestStreak = Math.max(
      0,
      ...habits.flatMap((habit) => (habit.streaks || []).map((streak) => Number(streak.longest_streak) || 0)),
    );

    const todayKey = dateKey(now);
    const recentWeek = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (6 - index));
      const key = dateKey(date);
      const count = habits.reduce(
        (sum, habit) => sum + (lookup.get(`${habit.id}-${key}`)?.completed ? 1 : 0),
        0,
      );
      return {
        date: key,
        count,
        label: date.toLocaleDateString(undefined, { weekday: 'narrow' }),
        future: key > todayKey,
      };
    });

    return {
      score,
      totalCompleted,
      activeDays,
      avgCompletedPerDay,
      onTrack,
      bestStreak,
      strongestHabit,
      opportunity,
      strongestDay,
      weekly,
      recentWeek,
      elapsed,
    };
  }, [habits, logs, range]);

  if (!active || !contentRoot) return null;

  return createPortal(
    <section className="figma-insights">
      {loading || !analysis ? (
        <div className="figma-panel">Building your insights…</div>
      ) : (
        <>
          <header className="figma-insights-header">
            <div>
              <p className="eyebrow">Your patterns</p>
              <h1>Understand what is working.</h1>
              <p>A simple view of your consistency, strengths, and where you can improve.</p>
            </div>
            <div className="figma-insights-headstats">
              <div className="figma-insights-headstat">
                <strong>{analysis.score}%</strong>
                <span>Month consistency</span>
              </div>
              <div className="figma-insights-headstat">
                <span>Best streak</span>
                <strong>{analysis.bestStreak} days</strong>
              </div>
            </div>
          </header>

          <section>
            <p className="eyebrow figma-insights-section-label">At a glance</p>
            <h2 className="figma-insights-section-title">This month</h2>
            <div className="figma-kpi-grid">
              <article className="figma-kpi-card">
                <strong>{analysis.score}%</strong>
                <span>overall consistency</span>
              </article>
              <article className="figma-kpi-card">
                <strong>{analysis.avgCompletedPerDay}</strong>
                <span>avg. completed / day</span>
              </article>
              <article className="figma-kpi-card">
                <strong>{analysis.onTrack} / {habits.length}</strong>
                <span>habits on track</span>
              </article>
              <article className="figma-kpi-card accent">
                <strong>You’re strongest on weekdays.</strong>
                <span>{analysis.strongestDay?.label || 'Your strongest day will appear here.'}</span>
              </article>
            </div>
          </section>

          <section>
            <h2 className="figma-what-title">What your habits are telling you</h2>
            <div className="figma-what-grid">
              <article className="figma-insight-card">
                <span className="card-label">Strongest habit</span>
                <h3>{analysis.strongestHabit?.habit.name || 'No habits yet'}</h3>
                <div className="card-stat">{analysis.strongestHabit?.rate || 0}% consistency this month</div>
                <p>This is the habit you stick to most reliably.</p>
              </article>
              <article className="figma-insight-card">
                <span className="card-label">Biggest opportunity</span>
                <h3>{analysis.opportunity?.habit.name || 'No habits yet'}</h3>
                <div className="card-stat">{analysis.opportunity?.rate || 0}% consistency this month</div>
                <p>A little more consistency here would move your month forward.</p>
              </article>
            </div>
          </section>

          <div className="figma-insights-bottom">
            <section className="figma-panel">
              <p className="eyebrow">Weekly rhythm</p>
              <h3>Your consistency by day</h3>
              <div className="figma-week-bars">
                {analysis.weekly.map((day) => (
                  <div className="figma-week-day" key={day.index}>
                    <span>{day.label}</span>
                    <div className="figma-week-track">
                      <i className="figma-week-fill" style={{ height: `${Math.max(6, day.rate)}%` }} />
                    </div>
                    <small>{day.rate}%</small>
                  </div>
                ))}
              </div>
            </section>

            <section className="figma-panel figma-takeaway">
              <p className="eyebrow">One useful takeaway</p>
              <h3>Your strongest day</h3>
              <strong>{analysis.strongestDay?.label || '—'}</strong>
              <p>
                You tend to finish more habits later in the week. Keep that momentum going.
              </p>
            </section>
          </div>
        </>
      )}
    </section>,
    contentRoot,
  );
}
