import { useMemo, useState } from 'react';
import { habitsApi } from './services/api';
import { useHabits, useHabitLogs } from './hooks/useHabits';
import { useSession, signIn, signUp } from './hooks/useSession';
import { supabase } from './lib/supabase';

const categories = ['Health','Study','Fitness','Work','Finance','Personal','Other'];
const colors = ['#10b981','#3b82f6','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#ec4899'];

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [username,setUsername]=useState(''); const [error,setError]=useState(''); const [busy,setBusy]=useState(false);
  const submit = async e => { e.preventDefault(); setBusy(true); setError(''); const result = mode === 'login' ? await signIn(email,password) : await signUp(email,password,username); setBusy(false); if (result.error) setError(result.error.message); else if (mode==='signup') setError('Check your email to confirm your account.'); };
  return <main className="auth-shell"><section className="auth-card"><div className="brand-mark">HT</div><h1>HabitTracker</h1><p className="muted">Build consistency, one day at a time.</p><form onSubmit={submit}>{mode==='signup' && <label>Username<input value={username} onChange={e=>setUsername(e.target.value)} required minLength={2}/></label>}<label>Email<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={6}/></label>{error && <div className="error">{error}</div>}<button className="primary" disabled={busy}>{busy ? 'Working…' : mode==='login' ? 'Log in' : 'Create account'}</button></form><button className="link-button" onClick={()=>{setMode(mode==='login'?'signup':'login');setError('')}}>{mode==='login'?'Need an account? Sign up':'Already have an account? Log in'}</button></section></main>;
}

function App() {
  const { session, loading: authLoading } = useSession();
  if (authLoading) return <div className="center">Loading…</div>;
  if (!session) return <AuthScreen />;
  return <Dashboard user={session.user} />;
}

function Dashboard({ user }) {
  const today = new Date();
  const [year,setYear]=useState(today.getFullYear()); const [month,setMonth]=useState(today.getMonth());
  const [newHabitOpen,setNewHabitOpen]=useState(false); const [form,setForm]=useState({name:'',category:'Study',difficulty:1,color:colors[0]});
  const { habits,loading,error,refresh } = useHabits();
  const { logs,toggle,error:logError } = useHabitLogs(year,month);
  const days = useMemo(()=>Array.from({length:new Date(year,month+1,0).getDate()},(_,i)=>i+1),[year,month]);
  const monthName = new Date(year,month).toLocaleString(undefined,{month:'long',year:'numeric'});
  const completed = habits.reduce((sum,h)=>sum + days.filter(d=>logs[`${h.id}-${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`]?.completed).length,0);
  const total = habits.length * days.length; const progress = total ? Math.round(completed/total*100) : 0;

  const addHabit = async e => { e.preventDefault(); try { await habitsApi.create(form); setForm({name:'',category:'Study',difficulty:1,color:colors[0]}); setNewHabitOpen(false); refresh(); } catch (e) { alert(e.response?.data?.error || e.message); } };
  const removeHabit = async id => { if(confirm('Delete this habit and its history?')) { try { await habitsApi.remove(id); refresh(); } catch (e) { alert(e.response?.data?.error || e.message); } } };
  const getDay = d => `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  const prev = ()=> month===0 ? (setMonth(11),setYear(year-1)) : setMonth(month-1);
  const next = ()=> month===11 ? (setMonth(0),setYear(year+1)) : setMonth(month+1);

  return <div className="app-shell"><header className="topbar"><div><div className="eyebrow">Personal dashboard</div><h1>HabitTracker</h1></div><div className="top-actions"><span className="user-chip">{user.email}</span><button className="ghost" onClick={()=>supabase.auth.signOut()}>Log out</button></div></header>
    <main className="content">
      <section className="hero"><div><div className="eyebrow">Consistency over perfection</div><h2>Track habits. See patterns. Keep going.</h2><p className="muted">A clean rebuild focused on reliable data, useful feedback, and zero duplicate rewards.</p></div><div className="hero-stat"><span>{progress}%</span><small>month progress</small></div></section>
      {(error||logError)&&<div className="error-banner">{error||logError}</div>}
      <section className="toolbar"><div className="month-nav"><button onClick={prev}>←</button><strong>{monthName}</strong><button onClick={next}>→</button></div><button className="primary small" onClick={()=>setNewHabitOpen(v=>!v)}>＋ Add habit</button></section>
      {newHabitOpen && <form className="habit-form" onSubmit={addHabit}><input placeholder="Habit name" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} required/><select value={form.category} onChange={e=>setForm({...form,category:e.target.value})}>{categories.map(c=><option key={c}>{c}</option>)}</select><select value={form.difficulty} onChange={e=>setForm({...form,difficulty:Number(e.target.value)})}><option value={1}>Easy · 10 XP</option><option value={2}>Medium · 20 XP</option><option value={3}>Hard · 30 XP</option></select><div className="color-row">{colors.map(c=><button type="button" key={c} className={form.color===c?'selected':''} style={{background:c}} onClick={()=>setForm({...form,color:c})}/>)}</div><button className="primary" type="submit">Save habit</button></form>}
      <section className="stats-row"><div><span>Habits</span><strong>{habits.length}</strong></div><div><span>Completed</span><strong>{completed}</strong></div><div><span>Progress</span><strong>{progress}%</strong></div></section>
      <section className="table-card"><div className="table-scroll"><table><thead><tr><th className="habit-col">Habit</th>{days.map(d=><th key={d}>{d}</th>)}</tr></thead><tbody>{loading ? <tr><td colSpan={days.length+1} className="empty">Loading habits…</td></tr> : habits.length===0 ? <tr><td colSpan={days.length+1} className="empty">Add your first habit to start tracking.</td></tr> : habits.map(h=><tr key={h.id}><td className="habit-col"><div className="habit-name"><i style={{background:h.color}}/>{h.name}</div><div className="habit-meta">{h.category} · {h.difficulty}×</div><button className="delete-link" onClick={()=>removeHabit(h.id)}>delete</button></td>{days.map(d=>{const key=`${h.id}-${getDay(d)}`; const checked=!!logs[key]?.completed; return <td key={key} className={checked?'done':''}><input type="checkbox" checked={checked} onChange={()=>toggle(h.id,getDay(d))}/></td>})}</tr>)}</tbody></table></div></section>
    </main></div>;
}

export default App;
