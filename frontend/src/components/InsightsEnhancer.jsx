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
  return new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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
      const activeButton = [...document.querySelectorAll('.side-nav button')].find(button => button.classList.contains('active'));
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
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
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
    const elapsed = sameMonth ? now.getDate() : range.year < now.getFullYear() || (range.year === now.getFullYear() && range.month < now.getMonth()) ? new Date(range.year, range.month + 1, 0).getDate() : 0;
    const keys = Array.from({ length: elapsed }, (_, i) => `${range.year}-${String(range.month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
    const lookup = new Map(logs.map(log => [`${log.habit_id}-${log.date}`, log]));
    const totalPossible = habits.length * keys.length;
    const totalCompleted = habits.reduce((sum, habit) => sum + keys.reduce((count, key) => count + (lookup.get(`${habit.id}-${key}`)?.completed ? 1 : 0), 0), 0);
    const score = totalPossible ? Math.round((totalCompleted / totalPossible) * 100) : 0;
    const habitStats = habits.map(habit => {
      const completed = keys.reduce((count, key) => count + (lookup.get(`${habit.id}-${key}`)?.completed ? 1 : 0), 0);
      return { habit, completed, rate: keys.length ? Math.round((completed / keys.length) * 100) : 0 };
    }).sort((a, b) => b.rate - a.rate || b.completed - a.completed);
    const daily = keys.map(date => ({
      date,
      count: habits.reduce((sum, habit) => sum + (lookup.get(`${habit.id}-${date}`)?.completed ? 1 : 0), 0),
    }));
    const bestDay = [...daily].sort((a, b) => b.count - a.count)[0] || null;
    const activeDays = daily.filter(day => day.count > 0).length;
    const todayKey = dateKey(now);
    const week = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(now);
      date.setDate(now.getDate() - (6 - index));
      const key = dateKey(date);
      const count = habits.reduce((sum, habit) => sum + (lookup.get(`${habit.id}-${key}`)?.completed ? 1 : 0), 0);
      return { date: key, count, label: date.toLocaleDateString(undefined, { weekday: 'narrow' }), future: key > todayKey };
    });
    const weekPossible = habits.length * week.filter(item => !item.future).length;
    const weekCompleted = week.reduce((sum, item) => sum + item.count, 0);
    const weekScore = weekPossible ? Math.round((weekCompleted / weekPossible) * 100) : 0;
    return { totalPossible, totalCompleted, score, habitStats, daily, bestDay, activeDays, week, weekScore };
  }, [habits, logs, range]);

  if (!active || !contentRoot) return null;

  return createPortal(
    <section className="insights-enhancer-shell">
      {loading || !analysis ? <div className="insights-loading">Building your insights…</div> : (
        <>
          <div className="insights-enhancer-head">
            <div>
              <p className="eyebrow">Powerful insights</p>
              <h1>See what your consistency is telling you.</h1>
              <p>Clear patterns from your actual check-ins — future days never count against you.</p>
            </div>
            <div className="insights-score-ring" style={{ '--insight-score': `${analysis.score}%` }}><span>{analysis.score}%</span><small>consistency</small></div>
          </div>

          <div className="insights-enhancer-kpis">
            <div><span>Check-ins</span><strong>{analysis.totalCompleted}</strong><small>completed this month</small></div>
            <div><span>Active days</span><strong>{analysis.activeDays}</strong><small>days you showed up</small></div>
            <div><span>Best habit</span><strong>{analysis.habitStats[0]?.rate || 0}%</strong><small>{analysis.habitStats[0]?.habit.name || 'No habits yet'}</small></div>
            <div><span>Best day</span><strong>{analysis.bestDay?.count || 0}</strong><small>{analysis.bestDay ? formatDate(analysis.bestDay.date) : 'No data yet'}</small></div>
          </div>

          <div className="insights-enhancer-grid">
            <div className="insights-enhancer-panel wide">
              <p className="eyebrow">Recent momentum</p>
              <h2>Last 7 days</h2>
              <div className="insights-week-bars">
                {analysis.week.map(item => <div className={`insights-week-bar ${item.future ? 'future' : ''}`} key={item.date} title={`${formatDate(item.date)} · ${item.count}/${habits.length} completed`}><span>{item.label}</span><i style={{ height: `${Math.max(5, Math.round((item.count / Math.max(1, habits.length)) * 100))}%` }} /><small>{item.count}</small></div>)}
              </div>
              <div className="insights-panel-foot"><span>7-day consistency</span><strong>{analysis.weekScore}%</strong></div>
            </div>

            <div className="insights-enhancer-panel">
              <p className="eyebrow">Performance</p>
              <h2>Most reliable habits</h2>
              {analysis.habitStats.length === 0 ? <p className="insights-muted">Create a habit to start seeing patterns.</p> : <div className="insights-rank-list">{analysis.habitStats.slice(0, 6).map(({ habit, completed, rate }, index) => <div className="insights-rank" key={habit.id}><span className="rank-dot" style={{ background: habit.color }} /><div><strong>{index + 1}. {habit.name}</strong><small>{completed} completed · {rate}% consistency</small><div><i style={{ width: `${rate}%`, background: habit.color }} /></div></div></div>)}</div>}
            </div>

            <div className="insights-enhancer-panel wide">
              <p className="eyebrow">Daily rhythm</p>
              <h2>How your month unfolded.</h2>
              <div className="insights-calendar-strip">
                {analysis.daily.map(item => <div className={item.count ? 'active' : ''} key={item.date} title={`${formatDate(item.date)} · ${item.count}/${habits.length} completed`}><i style={{ opacity: Math.max(.12, item.count / Math.max(1, habits.length)) }} /></div>)}
              </div>
              <p className="insights-muted">Each square is a day. More filled days means stronger momentum.</p>
            </div>
          </div>
        </>
      )}
    </section>,
    contentRoot,
  );
}
