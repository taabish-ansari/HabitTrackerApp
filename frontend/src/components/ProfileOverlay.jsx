import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import { getLevelProgress } from '../utils/progression';
import { getUsageStreak } from '../hooks/useUsageStreak';

const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

export default function ProfileOverlay() {
  const [open, setOpen] = useState(false);
  const [profile, setProfile] = useState(null);
  const [stats, setStats] = useState(null);
  const [usageStreak, setUsageStreak] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [draft, setDraft] = useState({ username: '', age: '' });

  useEffect(() => {
    const handleClick = (event) => {
      if (event.target.closest('.profile-overlay')) return;
      if (event.target.closest('.mini-profile')) setOpen(true);
    };
    const handleKey = (event) => {
      if (event.key === 'Escape') setOpen(false);
      const active = document.activeElement;
      if (active?.matches('.mini-profile') && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        setOpen(true);
      }
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
    if (!open) {
      setEditing(false);
      setSaved(false);
      setError('');
    }
    return () => document.body.classList.remove('profile-open');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const loadProfile = async () => {
      setLoading(true);
      setError('');
      setSaved(false);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setError('Your session has expired. Please log in again.');
        setLoading(false);
        return;
      }
      const [{ data: profileData, error: profileError }, { data: statsData, error: statsError }, { data: activityData, error: activityError }] = await Promise.all([
        supabase.from('profiles').select('username,email,age,avatar_url,created_at').eq('id', user.id).single(),
        supabase.from('user_stats').select('total_xp,total_completed').eq('user_id', user.id).single(),
        supabase.from('user_activity').select('active_date').eq('user_id', user.id).order('active_date', { ascending: false }),
      ]);
      if (cancelled) return;
      if (profileError || statsError || activityError) setError(profileError?.message || statsError?.message || activityError?.message || 'Could not load your profile.');
      const nextProfile = profileData || {
        username: user.user_metadata?.username || user.email?.split('@')[0],
        email: user.email,
        age: null,
        avatar_url: user.user_metadata?.avatar_url || null,
        created_at: user.created_at,
      };
      setProfile(nextProfile);
      setDraft({ username: nextProfile.username || '', age: nextProfile.age ?? '' });
      setStats(statsData || { total_xp: 0, total_completed: 0 });
      setUsageStreak(getUsageStreak((activityData ?? []).map((item) => item.active_date)));
      setLoading(false);
    };
    loadProfile();
    return () => { cancelled = true; };
  }, [open]);

  const uploadAvatar = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!AVATAR_TYPES.includes(file.type)) {
      setError('Please choose a JPG, PNG, WebP, or GIF image.');
      return;
    }
    if (file.size > MAX_AVATAR_SIZE) {
      setError('Profile pictures must be 5 MB or smaller.');
      return;
    }

    setUploading(true);
    setError('');
    setSaved(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Your session has expired. Please log in again.');
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
      const filePath = `${user.id}/${crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, file, {
        cacheControl: '3600',
        contentType: file.type,
        upsert: false,
      });
      if (uploadError) throw uploadError;

      const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filePath);
      const avatarUrl = publicData.publicUrl;
      const { data, error: profileError } = await supabase
        .from('profiles')
        .update({ avatar_url: avatarUrl })
        .eq('id', user.id)
        .select('username,email,age,avatar_url,created_at')
        .single();
      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({ data: { avatar_url: avatarUrl } });
      if (authError) throw authError;

      setProfile(data);
      setSaved(true);
      window.dispatchEvent(new Event('profile-updated'));
    } catch (e) {
      setError(e.message || 'Could not upload your profile picture.');
    } finally {
      setUploading(false);
    }
  };

  const saveProfile = async (event) => {
    event.preventDefault();
    const username = draft.username.trim();
    const ageText = String(draft.age).trim();
    const age = ageText === '' ? null : Number(ageText);

    if (username.length < 2 || username.length > 40) {
      setError('Username must be between 2 and 40 characters.');
      return;
    }
    if (age !== null && (!Number.isInteger(age) || age < 13 || age > 120)) {
      setError('Age must be a whole number between 13 and 120.');
      return;
    }

    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Your session has expired. Please log in again.');

      const { data, error: profileError } = await supabase
        .from('profiles')
        .update({ username, age })
        .eq('id', user.id)
        .select('username,email,age,avatar_url,created_at')
        .single();
      if (profileError) throw profileError;

      const { error: authError } = await supabase.auth.updateUser({ data: { username } });
      if (authError) throw authError;

      setProfile(data);
      setDraft({ username: data.username || '', age: data.age ?? '' });
      setEditing(false);
      setSaved(true);
      window.dispatchEvent(new Event('profile-updated'));
    } catch (e) {
      setError(e.message || 'Could not save your profile.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;
  const username = profile?.username || 'User';
  const initials = username.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase();
  const xp = stats?.total_xp || 0;
  const levelProgress = getLevelProgress(xp);
  const joined = profile?.created_at ? new Date(profile.created_at).toLocaleDateString(undefined, { month: 'long', year: 'numeric' }) : '—';
  const closeProfile = () => setOpen(false);

  return <div className="profile-overlay" role="dialog" aria-modal="true" aria-labelledby="profile-title" onClick={(event) => { if (event.target === event.currentTarget) closeProfile(); }}>
    <div className="profile-panel">
      <button className="profile-close" type="button" onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); closeProfile(); }} onClick={(event) => { event.preventDefault(); event.stopPropagation(); closeProfile(); }} aria-label="Close profile">×</button>
      <div className="profile-cover" aria-hidden="true"><div className="profile-orb profile-orb-one"/><div className="profile-orb profile-orb-two"/></div>
      <div className="profile-body">
        <div className="profile-avatar-wrap">
          <div className="profile-avatar-large" aria-label={`${username} profile picture`}>
            {profile?.avatar_url ? <img className="profile-avatar-image" src={profile.avatar_url} alt={`${username} profile`} /> : initials}
          </div>
          <label className={`profile-avatar-upload${uploading ? ' is-uploading' : ''}`} htmlFor="profile-avatar-input">
            {uploading ? 'Uploading…' : profile?.avatar_url ? 'Change photo' : 'Add photo'}
          </label>
          <input id="profile-avatar-input" className="profile-avatar-input" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={uploadAvatar} disabled={uploading} />
        </div>
        <div className="profile-intro"><p className="eyebrow">Your profile</p><h1 id="profile-title">{username}</h1><p>{profile?.email || '—'}</p></div>
        {loading ? <div className="profile-loading" role="status" aria-live="polite"><span className="spinner"/>Loading your details…</div> : <>
          {error && <div className="error-banner" role="alert">{error}</div>}
          {saved && <div className="profile-saved" role="status" aria-live="polite">Profile updated successfully.</div>}

          {!editing ? <>
            <section className="profile-grid" aria-label="Profile details">
              <div className="profile-card"><span>Username</span><strong>{username}</strong><small>Your identity in HabitTracker</small></div>
              <div className="profile-card"><span>Age</span><strong>{profile?.age ?? 'Not set'}</strong><small>{profile?.age ? 'Your profile age' : 'Add your age whenever you are ready'}</small></div>
              <div className="profile-card"><span>App streak</span><strong>{usageStreak} day{usageStreak === 1 ? '' : 's'}</strong><small>Days you used HabitTracker</small></div>
              <div className="profile-card"><span>Total XP</span><strong>{xp}</strong><small>Level {levelProgress.level}</small></div>
              <div className="profile-card"><span>Completed</span><strong>{stats?.total_completed || 0}</strong><small>Habit check-ins</small></div>
              <div className="profile-card"><span>Member since</span><strong>{joined}</strong><small>Keep building consistency</small></div>
              <div className="profile-card"><span>Email</span><strong className="profile-email">{profile?.email || '—'}</strong><small>Your account email</small></div>
            </section>
            <button className="profile-edit-button" type="button" onClick={() => { setSaved(false); setError(''); setDraft({ username, age: profile?.age ?? '' }); setEditing(true); }}>Edit profile</button>
          </> : <form className="profile-edit-form" onSubmit={saveProfile} aria-labelledby="profile-edit-title">
            <div className="profile-edit-head"><div><p className="eyebrow">Personal details</p><h2 id="profile-edit-title">Edit your profile</h2><p>Update these details whenever you like.</p></div><button className="profile-edit-cancel" type="button" onClick={() => { setEditing(false); setError(''); setSaved(false); setDraft({ username, age: profile?.age ?? '' }); }}>Cancel</button></div>
            <div className="profile-edit-fields">
              <label><span>Username</span><input value={draft.username} onChange={(event) => setDraft(current => ({ ...current, username: event.target.value }))} minLength={2} maxLength={40} required autoComplete="name" /></label>
              <label><span>Age</span><input type="number" min="13" max="120" step="1" value={draft.age} onChange={(event) => setDraft(current => ({ ...current, age: event.target.value }))} placeholder="Optional" inputMode="numeric" /></label>
            </div>
            <button className="profile-save-button" type="submit" disabled={saving} aria-busy={saving}>{saving ? 'Saving…' : 'Save changes'}</button>
          </form>}

          <section className="profile-progress-card" aria-label="Current level progress"><div><p className="eyebrow">Current momentum</p><h2>Level {levelProgress.level}</h2><p>{levelProgress.progressXp} / {levelProgress.requiredXp} XP toward your next level</p><small>{levelProgress.xpToNextLevel} XP to Level {levelProgress.level + 1}</small></div><div className="profile-progress-ring" style={{ '--profile-progress': `${levelProgress.progressPercent * 3.6}deg` }} aria-label={`${levelProgress.progressPercent}% level progress`} role="img"><div><strong>{levelProgress.progressPercent}%</strong></div></div></section>
        </>}
      </div>
    </div>
  </div>;
}
