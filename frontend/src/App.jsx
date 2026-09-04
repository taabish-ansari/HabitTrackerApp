import { useMemo, useState } from 'react';
import { habitsApi, gameApi } from './services/api';
import { useHabits, useHabitLogs } from './hooks/useHabits';
import { useSession, signIn, signUp } from './hooks/useSession';
import { supabase } from './lib/supabase';
import ProfileOverlay from './components/ProfileOverlay';
import RewardsView from './components/RewardsView';
import { getDailyScore } from './utils/dailyScore';
import { getPersonalizedRecommendations } from './utils/personalizedRecommendations';

const categories = ['Health', 'Study', 'Fitness', 'Work', 'Finance', 'Personal', 'Other'];
const colors = ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444', '#06b6d4', '#ec4899'];

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const result = mode === 'login' ? await signIn(email, password) : await signUp(email, password, username);
      if (result.error) setError(result.error.message);
      else if (mode === 'signup') setError('Account created. Check your email if confirmation is enabled.');
    } finally { setBusy(false); }
  };

  return <main className="auth-shell"><section className="auth-card">
    <div className="brand-row"><div className="brand-mark">HT</div><span className="brand-label">HabitTracker</span></div>
    <div className="auth-heading"><p className="eyebrow">Build consistency</p><h1>{mode === 'login' ? 'Welcome back.' : 'Start a better routine.'}</h1><p className="muted">Small wins, tracked clearly.</p></div>
    <form onSubmit={submit}>
      {mode === 'signup' && <label>Username<input value={username} onChange={(event) => setUsername(event.target.value)} required minLength={2} maxLength={40} placeholder="Your name" /></label>}
      <label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="you@example.com" /></label>
      <label>Password<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} placeholder="At least 6 characters" /></label>
      {error && <div className="error">{error}</div>}
      <button className="primary" disabled={busy}>{busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}</button>
    </form>
    <button className="link-button" onClick={() => { setMode(mode === 'login' ? 'signup' : 'login'); setError(''); }}>{mode === 'login' ? 'Need an account? Sign up' : 'Already have an account? Log in'}</button>
  </section></main>;
}

function App() {
  const { session, loading } = useSession();
  if (loading) return <div className="center"><div className="spinner" />Loading your workspace…</div>;
  return session ? <Dashboard user={session.user} /> : <AuthScreen />;
}

function Dashboard({ user }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [view, setView] = useState('today');
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [query, setQuery] = useState('');
  const [draggedId, setDraggedId] = useState(null);
  const [dragOverId, setDragOverId] = useState(null);
  const [reorderError, setReorderError] = useState('');
  const [game, setGame] = useState(null);
  const [gameError, setGameError] = useState('');

  const { habits, setHabits, loading, error, refresh } = useHabits();
  const { logs, toggle, error: logError } = useHabitLogs(year, month);
  const days = useMemo(() => Array.from({ length: new Date(year, month + 1, 0).getDate() }, (_, index) => index + 1), [year, month]);
  const monthName = new Date(year, month).toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const getDate = (day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const filtered = habits.filter((habit) => `${habit.name} ${habit.category}`.toLowerCase().includes(query.toLowerCase()));

  const completed = habits.reduce((sum, habit) => sum + days.reduce((count, day) => count + (logs[`${habit.id}-${getDate(day)}`]?.completed ? 1 : 0), 0), 0);
  const possible = habits.length * days.length;
  const progress = possible ? Math.round((completed / possible) * 100) : 0;
  const todayCompleted = habits.filter((habit) => logs[`${habit.id}-${todayKey}`]?.completed).length;
  const currentStreak = Math.max(0, ...habits.map((habit) => habit.streaks?.[0]?.current_streak || 0));
  const dailyScore = getDailyScore(habits, logs, todayKey, today);

  const moveMonth = (delta) => { const next = new Date(year, month + delta, 1); setYear(next.getFullYear()); setMonth(next.getMonth()); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); };
  const loadGame = async () => { setGameError(''); try { const { data } = await gameApi.get(); setGame(data); } catch (e) { setGameError(e.response?.data?.error || e.message); } };
  const handleSave = async (payload) => { if (editing) await habitsApi.update(editing.id, payload); else await habitsApi.create(payload); setShowForm(false); setEditing(null); await refresh(); };
  const handleDelete = async (id) => { if (!window.confirm('Delete this habit and its history?')) return; try { await habitsApi.remove(id); await refresh(); } catch (e) { alert(e.response?.data?.error || e.message); } };
  const handleDragStart = (event, id) => { if (query.trim()) return; setDraggedId(id); setReorderError(''); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', String(id)); };
  const handleDragOver = (event, id) => { if (!draggedId || draggedId === id || query.trim()) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setDragOverId(id); };
  const handleDrop = async (event, targetId) => { event.preventDefault(); setDragOverId(null); if (!draggedId || draggedId === targetId || query.trim()) return; const from = habits.findIndex((habit) => habit.id === draggedId); const to = habits.findIndex((habit) => habit.id === targetId); if (from < 0 || to < 0) return; const next = [...habits]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); setHabits(next); setDraggedId(null); try { await habitsApi.reorder(next.map((habit) => habit.id)); } catch (e) { setReorderError(e.response?.data?.error || e.message || 'Could not save habit order.'); await refresh(); } };
  const handleDragEnd = () => { setDraggedId(null); setDragOverId(null); };

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand-row"><div className="brand-mark">HT</div><div><strong>HabitTracker</strong><span>Personal system</span></div></div>
      <nav className="side-nav">
        <button className={view === 'today' ? 'active' : ''} onClick={() => setView('today')}>◉ <span>Today</span></button>
        <button className={view === 'calendar' ? 'active' : ''} onClick={() => setView('calendar')}>▦ <span>Calendar</span></button>
        <button className={view === 'insights' ? 'active' : ''} onClick={() => setView('insights')}>◒ <span>Insights</span></button>
        <button className={view === 'rewards' ? 'active' : ''} onClick={() => { setView('rewards'); loadGame(); }}>★ <span>Rewards</span></button>
      </nav>
      <div className="sidebar-bottom"><div className="mini-profile" tabIndex={0} role="button"><div className="avatar">{(user.email?.[0] || 'U').toUpperCase()}</div><div><strong>{user.user_metadata?.username || user.email?.split('@')[0]}</strong><span>{currentStreak} day current streak</span></div></div><button className="ghost full" onClick={() => supabase.auth.signOut()}>Log out</button></div>
    </aside>
    <main className="content"><header className="mobile-header"><div className="brand-row"><div className="brand-mark">HT</div><strong>HabitTracker</strong></div><button className="ghost" onClick={() => supabase.auth.signOut()}>Log out</button></header>
      {(error || logError || gameError || reorderError) && <div className="error-banner">{error || logError || gameError || reorderError}</div>}
      {view !== 'rewards' && <section className="hero-card"><div><p className="eyebrow">{view === 'today' ? 'Daily focus' : view === 'calendar' ? 'Monthly planner' : 'Your patterns'}</p><h1>{view === 'today' ? 'Make today count.' : view === 'calendar' ? monthName : 'Consistency tells a story.'}</h1><p className="muted light">{view === 'today' ? `${todayCompleted} of ${habits.length} habits completed today.` : 'A calm, data-first view of your routine.'}</p></div><div className="hero-progress"><span>{progress}%</span><small>{monthName} progress</small><div className="progress-track"><i style={{ width: `${progress}%` }} /></div></div></section>}
      {view === 'today' && <><section className="toolbar"><div><p className="eyebrow">Focus</p><h2>Today</h2>{habits.length > 1 && <p className="reorder-hint">Drag habits to set your order.</p>}</div><div className="toolbar-actions"><input className="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search habits…" /><button className="primary small" onClick={() => { setEditing(null); setShowForm(true); }}>＋ Add habit</button></div></section>
        <section className="stats-row four"><div><span>Today</span><strong>{todayCompleted}<em>/{habits.length}</em></strong></div><div><span>Month progress</span><strong>{progress}%</strong></div><div><span>Active habits</span><strong>{habits.length}</strong></div><div><span>Best current streak</span><strong>{currentStreak}<em> days</em></strong></div></section>
        <DailyScoreCard score={dailyScore}/>
        <section className="habit-list">{loading ? <div className="empty">Loading habits…</div> : filtered.length === 0 ? <div className="empty"><strong>No habits found.</strong><span>Create a habit to start building your routine.</span></div> : filtered.map((habit) => { const checked = !!logs[`${habit.id}-${todayKey}`]?.completed; const streak = habit.streaks?.[0]?.current_streak || 0; const canDrag = !query.trim(); return <article className={`habit-card ${checked ? 'complete' : ''} ${draggedId === habit.id ? 'is-dragging' : ''} ${dragOverId === habit.id ? 'drag-over' : ''}`} style={{ '--habit-color': habit.color }} key={habit.id} draggable={canDrag} onDragStart={(event) => handleDragStart(event, habit.id)} onDragOver={(event) => handleDragOver(event, habit.id)} onDrop={(event) => handleDrop(event, habit.id)} onDragEnd={handleDragEnd}><div className="habit-main"><span className={`drag-handle ${canDrag ? '' : 'disabled'}`} title={canDrag ? 'Drag to reorder' : 'Clear search to reorder'} aria-hidden="true">⋮⋮</span><button aria-label={`Mark ${habit.name} ${checked ? 'incomplete' : 'complete'}`} className={`check ${checked ? 'checked' : ''}`} onClick={() => toggle(habit.id, todayKey)}>{checked ? '✓' : ''}</button><div><h3>{habit.name}</h3><div className="meta"><span className="dot" style={{ background: habit.color }} />{habit.category}<span>•</span>{habit.difficulty === 1 ? 'Easy' : habit.difficulty === 2 ? 'Medium' : 'Hard'}<span>•</span>{habit.difficulty * 10} XP</div></div></div><div className="habit-right">{streak > 0 && <span className="streak">🔥 {streak}</span>}<button className="icon-button" onClick={() => { setEditing(habit); setShowForm(true); }}>Edit</button><button className="icon-button danger" onClick={() => handleDelete(habit.id)}>Delete</button></div></article>; })}</section></>}
      {view === 'calendar' && <section className="calendar-section"><div className="calendar-toolbar"><div className="month-nav"><button onClick={() => moveMonth(-1)}>←</button><strong>{monthName}</strong><button onClick={() => moveMonth(1)}>→</button></div><button className="ghost" onClick={goToday}>Today</button></div><div className="table-card"><div className="table-scroll"><table><thead><tr><th className="sticky-col">Habit</th>{days.map((day) => <th key={day} className={`${getDate(day) === todayKey ? 'today-head' : ''} ${getDate(day) > todayKey ? 'future-head' : ''}`}>{day}</th>)}</tr></thead><tbody>{habits.length === 0 ? <tr><td colSpan={days.length + 1} className="empty">Add a habit to see your calendar.</td></tr> : habits.map((habit) => <tr key={habit.id}><td className="sticky-col"><div className="habit-name"><span className="dot" style={{ background: habit.color }} />{habit.name}</div></td>{days.map((day) => { const date = getDate(day); const checked = !!logs[`${habit.id}-${date}`]?.completed; const isFuture = date > todayKey; return <td key={date} className={`${checked ? 'done' : ''} ${date === todayKey ? 'today-cell' : ''} ${isFuture ? 'future-cell' : ''}`} style={{ '--habit-color': habit.color }}><input type="checkbox" checked={checked} disabled={isFuture} onChange={() => { if (!isFuture) toggle(habit.id, date); }} aria-label={`${habit.name} ${date}`} /></td>; })}</tr>)}</tbody></table></div></div></section>}
      {view === 'insights' && <Insights habits={habits} logs={logs} days={days} year={year} month={month} monthName={monthName} todayKey={todayKey} dailyScore={dailyScore} />}
      {view === 'rewards' && <RewardsView game={game} />}
    </main>
    {showForm && <HabitModal initial={editing} onClose={() => { setShowForm(false); setEditing(null); }} onSave={handleSave} />}<ProfileOverlay />
  </div>;
}

function DailyScoreCard({ score }) { const scoreLabel = score.score === null ? 'Rest day' : score.score >= 90 ? 'Excellent' : score.score >= 70 ? 'Strong' : score.score >= 40 ? 'Building' : 'Get started'; const scoreValue = score.score === null ? '—' : score.score; return <section className="daily-score-card"><div className="daily-score-copy"><p className="eyebrow">Daily score</p><h2>{scoreValue}{score.score !== null && <span>/100</span>}</h2><p className="muted">{score.score === null ? 'Nothing is scheduled for today. Enjoy the rest day.' : `${score.completedCount} of ${score.dueCount} scheduled habits completed.`}</p></div>... (truncated)