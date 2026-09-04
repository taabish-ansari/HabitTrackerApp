import { useEffect, useRef, useState } from 'react';
import { gameApi } from '../services/api';

const EMPTY_GAME = { level: 1, stats: { total_xp: 0, total_completed: 0 }, badges: [] };

export default function RewardCelebration() {
  const [notice, setNotice] = useState(null);
  const [levelUp, setLevelUp] = useState(null);
  const timeoutRef = useRef(null);
  const baselineRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const loadBaseline = async () => {
      try {
        const { data } = await gameApi.get();
        if (!cancelled) baselineRef.current = data || EMPTY_GAME;
      } catch {
        if (!cancelled) baselineRef.current = EMPTY_GAME;
      }
    };
    loadBaseline();

    const handleCompletion = (event) => {
      const { completed, gamification } = event.detail || {};
      if (!gamification) return;
      const previous = baselineRef.current || EMPTY_GAME;
      const nextBadges = gamification.badges || [];
      const oldBadges = new Set((previous.badges || []).map((badge) => badge.code));
      const newlyEarned = completed ? nextBadges.filter((badge) => !oldBadges.has(badge.code)) : [];

      baselineRef.current = gamification;
      if (!completed) return;

      const awardedXp = Math.max(0, Number(gamification.stats?.total_xp || 0) - Number(previous.stats?.total_xp || 0));
      const previousLevel = Number(previous.level || 1);
      const nextLevel = Number(gamification.level || 1);

      if (nextLevel > previousLevel) {
        setLevelUp({ level: nextLevel, xp: awardedXp, badges: newlyEarned });
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => setLevelUp(null), 4200);
      } else if (newlyEarned.length) {
        setNotice({ kind: 'badge', badges: newlyEarned, xp: awardedXp });
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => setNotice(null), 3600);
      } else if (awardedXp > 0) {
        setNotice({ kind: 'xp', xp: awardedXp });
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = window.setTimeout(() => setNotice(null), 1700);
      }
    };

    window.addEventListener('habittracker:completion', handleCompletion);
    return () => {
      cancelled = true;
      window.removeEventListener('habittracker:completion', handleCompletion);
      window.clearTimeout(timeoutRef.current);
    };
  }, []);

  if (levelUp) return (
    <div className="reward-celebration-backdrop" role="status" aria-live="polite">
      <div className="reward-celebration-card level-up-card">
        <div className="celebration-sparkles" aria-hidden="true"><span>✦</span><span>✧</span><span>✦</span><span>·</span></div>
        <div className="celebration-level-orb"><span>LEVEL</span><strong>{levelUp.level}</strong></div>
        <p className="eyebrow">Level up</p>
        <h2>New level unlocked.</h2>
        <p>You just crossed another milestone. Keep the momentum going.</p>
        {levelUp.xp > 0 && <div className="celebration-xp">+{levelUp.xp} XP</div>}
        {levelUp.badges?.length > 0 && <div className="celebration-badges">{levelUp.badges.map((badge) => <span key={badge.code}>★ {badge.name}</span>)}</div>}
      </div>
    </div>
  );

  if (!notice) return null;

  if (notice.kind === 'badge') return (
    <div className="reward-toast badge-toast" role="status" aria-live="polite">
      <div className="reward-toast-icon">★</div>
      <div><span>Achievement unlocked</span><strong>{notice.badges[0]?.name}</strong></div>
      {notice.xp > 0 && <b>+{notice.xp} XP</b>}
    </div>
  );

  return (
    <div className="reward-toast xp-toast" role="status" aria-live="polite">
      <div className="reward-toast-icon">+</div>
      <div><span>Progress saved</span><strong>Nice work</strong></div>
      <b>+{notice.xp} XP</b>
    </div>
  );
}
