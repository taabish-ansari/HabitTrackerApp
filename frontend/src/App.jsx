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
      <div className="sidebar-bottom"><div className="mini-profile" tabIndex={0} role="button"><div className="avatar">{(user.email?.[0] || 'U').toUpperCase()}</div><div><strong>{user.email?.split('@')[0]}</strong><span>{currentStreak} day current streak</span></div></div><button className="ghost full" onClick={() => supabase.auth.signOut()}>Log out</button></div>
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

function DailyScoreCard({ score }) { const scoreLabel = score.score === null ? 'Rest day' : score.score >= 90 ? 'Excellent' : score.score >= 70 ? 'Strong' : score.score >= 40 ? 'Building' : 'Get started'; const scoreValue = score.score === null ? '—' : score.score; return <section className="daily-score-card"><div className="daily-score-copy"><p className="eyebrow">Daily score</p><h2>{scoreValue}{score.score !== null && <span>/100</span>}</h2><p className="muted">{score.score === null ? 'Nothing is scheduled for today. Enjoy the rest day.' : `${score.completedCount} of ${score.dueCount} scheduled habits completed.`}</p></div><div className="daily-score-orb" style={{ '--score': `${score.score ?? 0}%` }}><strong>{scoreLabel}</strong><span>{score.remainingCount ? `${score.remainingCount} left` : score.score === null ? 'No habits due' : 'All done'}</span></div></section>; }

function HabitModal({ initial, onClose, onSave }) { const [name, setName] = useState(initial?.name || ''); const [category, setCategory] = useState(initial?.category || 'Study'); const [difficulty, setDifficulty] = useState(initial?.difficulty || 1); const [color, setColor] = useState(initial?.color || colors[0]); const [busy, setBusy] = useState(false); const [error, setError] = useState(''); const submit = async (event) => { event.preventDefault(); setBusy(true); setError(''); try { await onSave({ name, category, difficulty: Number(difficulty), color }); } catch (e) { setError(e.response?.data?.error || e.message); setBusy(false); } }; return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><form className="modal" onSubmit={submit}><div className="modal-head"><div><p className="eyebrow">{initial ? 'Edit habit' : 'New habit'}</p><h2>{initial ? 'Tune this habit.' : 'Start something worth repeating.'}</h2></div><button type="button" className="close" onClick={onClose}>×</button></div><label>Habit name<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={100} placeholder="e.g. Read 20 pages" autoFocus /></label><div className="form-grid"><label>Category<select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label><label>Difficulty<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value={1}>Easy · 10 XP</option><option value={2}>Medium · 20 XP</option><option value={3}>Hard · 30 XP</option></select></label></div><label>Color<div className="color-row">{colors.map((item) => <button type="button" key={item} className={`color-swatch ${color === item ? 'selected' : ''}`} style={{ background: item }} onClick={() => setColor(item)} aria-label={`Choose ${item}`} />)}</div></label>{error && <div className="error">{error}</div>}<div className="modal-actions"><button type="button" className="ghost" onClick={onClose}>Cancel</button><button className="primary" disabled={busy}>{busy ? 'Saving…' : initial ? 'Save changes' : 'Create habit'}</button></div></form></div>; }

function Insights({ habits, logs, days, year, month, monthName, todayKey, dailyScore }) {
  const dateForDay = (day) => `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const stats = habits.map((habit) => ({ habit, actual: days.reduce((count, day) => count + (logs[`${habit.id}-${dateForDay(day)}`]?.completed ? 1 : 0), 0) }));
  const total = stats.reduce((sum, item) => sum + item.actual, 0);
  const top = [...stats].sort((a, b) => b.actual - a.actual)[0];
  const recommendations = getPersonalizedRecommendations(habits, logs, days, year, month, todayKey, dailyScore);

  return <section className="insights-grid">
    <div className="insight-card large"><p className="eyebrow">{monthName}</p><h2>Your month at a glance.</h2><div className="big-number">{total}<span>completions</span></div><p className="muted light">Track your strongest habits, then make the next month a little easier to win.</p></div>
    <div className="insight-card"><p className="eyebrow">Top habit</p><h3>{top?.habit.name || '—'}</h3><strong>{top?.actual || 0}</strong><span>completed days</span></div>
    <div className="insight-card wide"><p className="eyebrow">Habit breakdown</p>{stats.length === 0 ? <p className="muted">No habits yet.</p> : stats.map(({ habit, actual }) => <div className="bar-row" key={habit.id}><div><span>{habit.name}</span><strong>{actual}/{days.length}</strong></div><div className="bar"><i style={{ width: `${days.length ? Math.round((actual / days.length) * 100) : 0}%`, background: habit.color }} /></div></div>)}</div>
    <section className="recommendations-panel"><div className="recommendations-head"><div><p className="eyebrow">Personalized</p><h2>Recommendations for you</h2></div><span>Based on your recent pattern</span></div><div className="recommendations-grid">{recommendations.map((recommendation) => <article className="recommendation-card" key={`${recommendation.type}-${recommendation.title}`} style={{ '--recommendation-color': recommendation.color || '#94a3b8' }}><span className="recommendation-label">{recommendation.label}</span><h3>{recommendation.title}</h3><p>{recommendation.body}</p></article>)}</div></section>
  </section>;
}

export default App;
