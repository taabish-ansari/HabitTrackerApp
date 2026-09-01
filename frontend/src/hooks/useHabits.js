import { useEffect, useMemo, useState, useCallback } from 'react';
import { habitsApi, logsApi } from '../services/api';

const normalizeHabit = habit => ({
  ...habit,
  streaks: Array.isArray(habit.streaks) ? habit.streaks : [],
});

export function useHabits() {
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await habitsApi.list();
      setHabits((data ?? []).map(normalizeHabit));
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Unable to load habits.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);
  return { habits, setHabits, loading, error, refresh };
}

export function useHabitLogs(year, month) {
  const [logs, setLogs] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = useMemo(() => {
    const from = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
    return { from, to };
  }, [year, month]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await logsApi.list(range.from, range.to);
      setLogs(Object.fromEntries((data ?? []).map(log => [`${log.habit_id}-${log.date}`, log])));
      setError('');
    } catch (e) {
      setError(e.response?.data?.error || e.message || 'Unable to load activity.');
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const toggle = async (habitId, date) => {
    const key = `${habitId}-${date}`;
    const completed = !logs[key]?.completed;
    const previous = logs[key];
    setLogs(current => ({ ...current, [key]: { ...(previous || {}), habit_id: habitId, date, completed } }));
    try {
      const { data } = await logsApi.toggle({ habitId, date, completed });
      setLogs(current => ({ ...current, [key]: data }));
      setError('');
    } catch (e) {
      setLogs(current => {
        const copy = { ...current };
        if (previous) copy[key] = previous; else delete copy[key];
        return copy;
      });
      setError(e.response?.data?.error || e.message || 'Could not save that check-in.');
    }
  };

  return { logs, toggle, loading, error, refresh: fetchLogs };
}
