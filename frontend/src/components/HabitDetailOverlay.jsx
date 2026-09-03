import { useEffect, useMemo, useState } from 'react';
import { habitsApi, logsApi } from '../services/api';

function HabitDetailOverlay() {
  const [selected, setSelected] = useState(null);
  const [monthLogs, setMonthLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleCardClick = async (event) => {
      const card = event.target.closest('.habit-card');
      if (!card || !document.body.contains(card)) return;
      if (event.target.closest('button, input, .drag-handle, .reorder-controls')) return;
      const habitId = card.dataset.habitId;
      if (!habitId) return;

      setLoading(true);
      setError('');
      try {
        const habitResult = await habitsApi.list();
        const habit = (habitResult.data ?? []).find(item => String(item.id) === String(habitId));
        if (!habit) throw new Error('Habit not found.');

        const now = new Date();
        const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()).padStart(2, '0')}`;
        const logsResult = await logsApi.list(from, to);
        const logs = (logsResult.data ?? []).filter(log => String(log.habit_id) === String(habitId));
        setMonthLogs(logs);
        setSelected(habit);
      } catch (e) {
        setError(e.response?.data?.error || e.message || 'Could not load habit details.');
      } finally {
        setLoading(false);
      }
    };

    document.addEventListener('click', handleCardClick);
    return () => document.removeEventListener('click', handleCardClick);
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setSelected(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selected]);

  const stats = useMemo(() => {
    const completed = monthLogs.filter(log => log.completed).length;
    const total = new Date().getDate();
    const rate = total ? Math.round((completed / total) * 100) : 0;
    return { completed, total, rate };
  }, [monthLogs]);

  if (!selected && !loading && !error) return null;

  return (
    <div className="habit-detail-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) setSelected(null);
    }}>
      <section className="habit-detail-panel" role="dialog" aria-modal="true" aria-labelledby="habit-detail-title">
        <button className="habit-detail-close" type="button" onClick={() => setSelected(null)} aria-label="Close habit details">×</button>

        {loading && <div className="habit-detail-loading"><div className="spinner" />Loading habit…</div>}
        {!loading && error && <div className="error">{error}</div>}

        {!loading && selected && (
          <>
            <div className="habit-detail-accent" style={{ background: selected.color || '#10b981' }} />
            <div className="habit-detail-header">
              <div>
                <p className="eyebrow">Habit details</p>
                <h2 id="habit-detail-title">{selected.name}</h2>
                <div className="habit-detail-meta">
                  <span><i style={{ background: selected.color || '#10b981' }} />{selected.category}</span>
                  <span>•</span>
                  <span>{selected.difficulty === 1 ? 'Easy' : selected.difficulty === 2 ? 'Medium' : 'Hard'}</span>
                </div>
              </div>
            </div>

            <div className="habit-detail-stats">
              <div><span>Current streak</span><strong>🔥 {selected.streaks?.[0]?.current_streak || 0}</strong><small>days</small></div>
              <div><span>This month</span><strong>{stats.completed}</strong><small>check-ins</small></div>
              <div><span>Completion rate</span><strong>{stats.rate}%</strong><small>of days</small></div>
            </div>

            <div className="habit-detail-section">
              <div className="habit-detail-section-head"><strong>Recent activity</strong><span>Last 7 days</span></div>
              <div className="habit-detail-week">
                {Array.from({ length: 7 }, (_, index) => {
                  const date = new Date();
                  date.setDate(date.getDate() - (6 - index));
                  const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
                  const done = monthLogs.some(log => log.date === key && log.completed);
                  return <div key={key} className={`habit-day ${done ? 'done' : ''}`} style={{ '--detail-color': selected.color || '#10b981' }}><span>{date.toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2)}</span><i>{done ? '✓' : ''}</i></div>;
                })}
              </div>
            </div>

            <div className="habit-detail-tip">
              <span>✦</span>
              <p>Small, repeatable wins are what turn this habit into a routine.</p>
            </div>
          </>
        )}
      </section>
    </div>
  );
}

export default HabitDetailOverlay;
