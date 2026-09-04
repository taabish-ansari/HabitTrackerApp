import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLevelProgress } from '../utils/progression';

export default function ProfileOverlay() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const handleClick = (event) => {
      if (event.target.closest('.mini-profile')) setOpen(true);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKey);
    };
  }, []);

  useEffect(() => {
    document.body.classList.toggle('profile-open', open);
    return () => document.body.classList.remove('profile-open');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadProfile = async () => {
      setLoading(true);
      setError('');
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Your session has expired. Please log in again.');
        setLoading(false);
        return;
      }
      const [{ data: profileData, error: profileError }, { data: statsData, error: statsError }] = await Promise.all([
        supabase.from('profiles').select('username,email,created_at').eq('id', user.id).single(),
        supabase.from('user_stats').select('total_xp,total_completed').eq('user_id', user.id).single(),
      ]);
      if (cancelled) return;
      if (profileError || statsError) setError(profileError?.message || statsError?.message || 'Could not load your profile.');
      setProfile(profileData || { username: user.user_metadata?.username || user.email?.split('@')[0], email: user.email, created_at: user.created_at });
      setStats(statsData || { total_xp: 0, total_completed: 0 });
      setLoading(false);
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [open]);

  if (!open) return null;
  const username = profile?.username || 'User';
  const initials = username.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const xp = stats?.total_xp || 0;
  const levelProgress = getLevelProgress(xp);
  const joined = profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—';

  return <div className="profile-overlay" role="dialog" aria-modal="true" aria-label="Your profile" onMouseDown={(event) => { if (event.target === event.currentTarget) setOpen(false); }}>
    <div className="profile-panel">
      <button className="profile-close" onClick={() => setOpen(false)} aria-label="Close profile">×</button>
      <div className="profile-cover"><div className="profile-orb profile-orb-one"/><div className="profile-orb profile-orb-two"/></div>
      <div className="profile-body">
        <div className="profile-avatar-large">{initials}</div>
        <div className="profile-intro"><p className="eyebrow">Your profile</p><h1>{username}</h1><p>{profile?.email || '—'}</p></div>
        {loading ? <div className="profile-loading"><span className="spinner"/>Loading your details…</div> : <>
          {error && <div className="error-banner">{error}</div>}
          <section className="profile-grid">
            <div className="profile-card profile-card-wide"><span>Username</span><strong>{username}</strong><small>Your identity in HabitTracker</small></div>
            <div className="profile-card profile-card-wide"><span>Email</span><strong className="profile-email">{profile?.email || '—'}</strong><small>Your account email</small></div>
            <div className="profile-card"><span>Total XP</span><strong>{xp}</strong><small>Level {levelProgress.level}</small></div>
            <div className="profile-card"><span>Completed</span><strong>{stats?.total_completed || 0}</strong><small>Habit check-ins</small></div>
            <div className="profile-card"><span>Member since</span><strong>{joined}</strong><small>Keep building consistency</small></div>
          </section>
          <section className="profile-progress-card"><div><p className="eyebrow">Current momentum</p><h2>Level {levelProgress.level}</h2><p>{levelProgress.progressXp} / {levelProgress.requiredXp} XP toward your next level</p><small>{levelProgress.xpToNextLevel} XP to Level {levelProgress.level + 1}</small></div><div className="profile-progress-ring" style={{ '--profile-progress': `${levelProgress.progressPercent * 3.6}deg` }}><div><strong>{levelProgress.progressPercent}%</strong></div></div></section>
        </>}
      </div>
    </div>
  </div>;
}
