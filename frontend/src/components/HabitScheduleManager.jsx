import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const WEEK = [
  ['Sun', 0], ['Mon', 1], ['Tue', 2], ['Wed', 3], ['Thu', 4], ['Fri', 5], ['Sat', 6],
];

const labels = {
  daily: 'Every day',
  weekdays: 'Weekdays',
  custom: 'Custom days',
};

function normalize(habit) {
  return {
    ...habit,
    schedule_type: habit.schedule_type || 'daily',
    schedule_days: Array.isArray(habit.schedule_days) ? habit.schedule_days : [],
  };
}

export default function HabitScheduleManager() {
  const [open, setOpen] = useState(false);
  const [habits, setHabits] = useState([]);
  const [drafts, setDrafts] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('habits')
        .select('id,name,color,position,schedule_type,schedule_days')
        .order('position', { ascending: true });
      if (queryError) throw queryError;
      const nextHabits = (data ?? []).map(normalize);
      setHabits(nextHabits);
      setDrafts(Object.fromEntries(nextHabits.map(habit => [habit.id, { schedule_type: habit.schedule_type, schedule_days: [...habit.schedule_days] }])));
    } catch (e) {
      setError(e.message || 'Could not load schedules.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const customCount = useMemo(() => habits.filter(h => drafts[h.id]?.schedule_type === 'custom').length, [habits, drafts]);

  const setType = (id, schedule_type) => {
    setSaved(false);
    setDrafts(current => ({
      ...current,
      [id]: {
        ...(current[id] || { schedule_days: [] }),
        schedule_type,
        schedule_days: schedule_type === 'custom' ? (current[id]?.schedule_days?.length ? current[id].schedule_days : [1, 2, 3, 4, 5]) : [],
      },
    }));
  };

  const toggleDay = (id, day) => {
    setSaved(false);
    setDrafts(current => {
      const draft = current[id] || { schedule_type: 'custom', schedule_days: [] };
      const days = new Set(draft.schedule_days);
      if (days.has(day)) days.delete(day); else days.add(day);
      return { ...current, [id]: { ...draft, schedule_type: 'custom', schedule_days: [...days].sort((a, b) => a - b) } };
    });
  };

  const save = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      for (const habit of habits) {
        const draft = drafts[habit.id] || { schedule_type: 'daily', schedule_days: [] };
        if (draft.schedule_type === 'custom' && draft.schedule_days.length === 0) {
          throw new Error(`Choose at least one day for “${habit.name}”.`);
        }
        const { error: updateError } = await supabase
          .from('habits')
          .update({ schedule_type: draft.schedule_type, schedule_days: draft.schedule_type === 'custom' ? draft.schedule_days : [] })
          .eq('id', habit.id);
        if (updateError) throw updateError;
      }
      await load();
      setSaved(true);
      window.dispatchEvent(new Event('habit-schedule-updated'));
    } catch (e) {
      setError(e.message || 'Could not save schedules.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <button className="habit-schedule-launcher" type="button" onClick={() => setOpen(true)} aria-label="Open habit schedules">
        <span aria-hidden="true">◷</span><b>Schedules</b>
      </button>

      {open && (
        <div className="habit-schedule-backdrop" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setOpen(false); }}>
          <section className="habit-schedule-panel" role="dialog" aria-modal="true" aria-labelledby="schedule-title">
            <div className="habit-schedule-topline"><div><p className="eyebrow">Routine planning</p><h2 id="schedule-title">When should you do it?</h2><p className="muted">Choose which days each habit belongs to. Unsheduled days stay intentionally quiet.</p></div><button className="habit-schedule-close" type="button" onClick={() => setOpen(false)} aria-label="Close schedules">×</button></div>

            {loading ? <div className="habit-schedule-loading"><span className="spinner" />Loading schedules…</div> : habits.length === 0 ? <div className="habit-schedule-empty">Create a habit first, then give it a rhythm.</div> : <div className="habit-schedule-list">
              {habits.map(habit => {
                const draft = drafts[habit.id] || { schedule_type: 'daily', schedule_days: [] };
                return (
                  <article className="habit-schedule-card" key={habit.id} style={{ '--schedule-color': habit.color || '#10b981' }}>
                    <div className="habit-schedule-heading"><span className="habit-schedule-dot" /><div><strong>{habit.name}</strong><span>{labels[draft.schedule_type] || 'Every day'}</span></div></div>
                    <div className="habit-schedule-types" role="group" aria-label={`${habit.name} schedule`}>
                      {Object.entries(labels).map(([type, label]) => <button key={type} type="button" className={draft.schedule_type === type ? 'active' : ''} onClick={() => setType(habit.id, type)}>{label}</button>)}
                    </div>
                    {draft.schedule_type === 'custom' && <div className="habit-schedule-days">{WEEK.map(([label, day]) => <button key={day} type="button" className={draft.schedule_days.includes(day) ? 'selected' : ''} onClick={() => toggleDay(habit.id, day)}>{label}</button>)}</div>}
                  </article>
                );
              })}
            </div>}

            {error && <div className="error habit-schedule-error">{error}</div>}
            <div className="habit-schedule-footer"><span>{customCount ? `${customCount} custom schedule${customCount === 1 ? '' : 's'}` : 'Daily routines are the default'}</span><div><button className="ghost" type="button" onClick={() => setOpen(false)}>Cancel</button><button className="primary" type="button" disabled={saving || loading} onClick={save}>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save schedules'}</button></div></div>
          </section>
        </div>
      )}
    </>
  );
}
