import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { habitsApi, logsApi } from '../services/api';
import { getPersonalizedRoutine } from '../utils/personalizedRoutine';

function monthRange(date = new Date()) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const lastDay = new Date(year, month + 1, 0).getDate();
  return {
    from: `${year}-${String(month + 1).padStart(2, '0')}-01`,
    to: `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
  };
}

export default function PersonalizedRoutine() {
  const [active, setActive] = useState(false);
  const [mount, setMount] = useState(null);
  const [habits, setHabits] = useState([]);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const listSignatureRef = useRef('');

  useEffect(() => {
    const syncMount = () => {
      const todayButton = [...document.querySelectorAll('.side-nav button')]
        .find((button) => button.classList.contains('active') && button.textContent?.includes('Today'));
      const list = document.querySelector('.habit-list');
      const isToday = Boolean(todayButton && list);
      setActive(isToday);

      if (!isToday) {
        setMount(null);
        listSignatureRef.current = '';
        return;
      }

      const signature = list.textContent || '';
      if (signature !== listSignatureRef.current) {
        listSignatureRef.current = signature;
        window.dispatchEvent(new Event('habittracker:routine-refresh'));
      }

      let target = document.querySelector('.personalized-routine-mount');
      if (!target) {
        target = document.createElement('div');
        target.className = 'personalized-routine-mount';
        list.parentElement?.insertBefore(target, list);
      }
      setMount(target);
    };

    syncMount();
    const observer = new MutationObserver(syncMount);
    observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!active) return undefined;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const range = monthRange();
        const [{ data: habitData }, { data: logData }] = await Promise.all([
          habitsApi.list(),
          logsApi.list(range.from, range.to),
        ]);
        if (!cancelled) {
          setHabits(habitData ?? []);
          setLogs(logData ?? []);
        }
      } catch {
        if (!cancelled) {
          setHabits([]);
          setLogs([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    window.addEventListener('habittracker:completion', load);
    window.addEventListener('habit-schedule-updated', load);
    window.addEventListener('habittracker:routine-refresh', load);
    return () => {
      cancelled = true;
      window.removeEventListener('habittracker:completion', load);
      window.removeEventListener('habit-schedule-updated', load);
      window.removeEventListener('habittracker:routine-refresh', load);
    };
  }, [active]);

  if (!active || !mount || loading) return null;

  const routine = getPersonalizedRoutine(habits, logs, new Date());
  if (routine.restDay) return null;

  if (routine.complete) {
    return createPortal(
      <section className="personalized-routine-card personalized-routine-complete" aria-labelledby="personalized-routine-title">
        <div className="personalized-routine-head">
          <div>
            <p className="eyebrow">Personalized routine</p>
            <h2 id="personalized-routine-title">Today’s routine is clear.</h2>
            <p>You completed every habit scheduled for today. Keep tomorrow just as simple.</p>
          </div>
          <span>{routine.completedCount}/{routine.dueCount} done ✓</span>
        </div>
      </section>,
      mount,
    );
  }

  return createPortal(
    <section className="personalized-routine-card" aria-labelledby="personalized-routine-title">
      <div className="personalized-routine-head">
        <div>
          <p className="eyebrow">Personalized routine</p>
          <h2 id="personalized-routine-title">A simple flow for today.</h2>
          <p>Based on your scheduled habits and recent consistency.</p>
        </div>
        <span>{routine.completedCount}/{routine.dueCount} done</span>
      </div>

      <div className="personalized-routine-steps">
        {routine.steps.map((step, index) => (
          <article className="personalized-routine-step" key={`${step.type}-${step.habit.id}`}>
            <div className="personalized-routine-number">{index + 1}</div>
            <div className="personalized-routine-body">
              <span>{step.label}</span>
              <strong>{step.habit.name}</strong>
            </div>
            <div className="personalized-routine-status" style={{ '--routine-color': step.habit.color || '#10b981' }}>•</div>
          </article>
        ))}
      </div>
    </section>,
    mount,
  );
}
