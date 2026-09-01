import { useEffect, useMemo, useState } from 'react';
import { habitsApi, logsApi } from '../services/api';

export function useHabits() {
  const [habits, setHabits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refresh = async () => {
    setLoading(true);
    try { const { data } = await habitsApi.list(); setHabits(data); setError(''); }
    catch (e) { setError(e.response?.data?.error || e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { refresh(); }, []);
  return { habits, setHabits, loading, error, refresh };
}

export function useHabitLogs(year, month) {
  const [logs, setLogs] = useState({});
  const [error, setError] = useState('');
  const range = useMemo(() => {
    const from = `${year}-${String(month + 1).padStart(2,'0')}-01`;
    const to = `${year}-${String(month + 1).padStart(2,'0')}-${String(new Date(year, month + 1, 0).getDate()).padStart(2,'0')}`;
    return { from, to };
  }, [year, month]);

  useEffect(() => {
    logsApi.list(range.from, range.to)
      .then(({ data }) => setLogs(Object.fromEntries(data.map(log => [`${log.habit_id}-${log.date}`, log]))))
      .catch(e => setError(e.response?.data?.error || e.message));
  }, [range.from, range.to]);

  const toggle = async (habitId, date) => {
    const key = `${habitId}-${date}`;
    const completed = !logs[key]?.completed;
    const previous = logs[key];
    setLogs(current => ({ ...current, [key]: { ...previous, habit_id: habitId, date, completed } }));
    try {
      const { data } = await logsApi.toggle({ habitId, date, completed });
      setLogs(current => ({ ...current, [key]: data }));
    } catch (e) {
      setLogs(current => {
        const copy = { ...current };
        if (previous) copy[key] = previous; else delete copy[key];
        return copy;
      });
      setError(e.response?.data?.error || e.message);
    }
  };
  return { logs, toggle, error };
}
