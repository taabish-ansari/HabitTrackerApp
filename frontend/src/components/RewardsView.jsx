import { getLevelProgress } from '../utils/progression';

const ACHIEVEMENTS = [
  { code: 'first-step', icon: '✦', name: 'First Step', description: 'Complete your first habit check-in', type: 'completed', target: 1 },
  { code: 'check-ins-10', icon: '↗', name: 'Getting Consistent', description: 'Complete 10 habit check-ins', type: 'completed', target: 10 },
  { code: 'check-ins-50', icon: '⚡', name: 'On a Roll', description: 'Complete 50 habit check-ins', type: 'completed', target: 50 },
  { code: 'check-ins-100', icon: '◈', name: 'Century of Wins', description: 'Complete 100 habit check-ins', type: 'completed', target: 100 },
  { code: 'xp-500', icon: '★', name: '500 XP', description: 'Earn 500 total XP', type: 'xp', target: 500 },
  { code: 'xp-1000', icon: '✹', name: '1,000 XP', description: 'Earn 1,000 total XP', type: 'xp', target: 1000 },
  { code: 'streak-7', icon: '🔥', name: '7-Day Streak', description: 'Reach a 7-day streak', type: 'streak', target: 7 },
  { code: 'streak-30', icon: '♛', name: '30-Day Streak', description: 'Reach a 30-day streak', type: 'streak', target: 30 },
  { code: 'streak-100', icon: '◆', name: 'Century Streak', description: 'Reach a 100-day streak', type: 'streak', target: 100 },
  { code: 'habits-3', icon: '▦', name: 'Habit Builder', description: 'Create 3 active habits', type: 'habits', target: 3 },
];

function getAchievementProgress(achievement, game) {
  const stats = game?.stats || {};
  if (achievement.type === 'completed') return Number(stats.total_completed) || 0;
  if (achievement.type === 'xp') return Number(stats.total_xp) || 0;
  if (achievement.type === 'streak') return Number(game?.bestLongestStreak) || 0;
  return Number(game?.habitCount) || 0;
}

export default function RewardsView({ game }) {
  const stats = game?.stats || {};
  const xp = Number(stats.total_xp) || 0;
  const completions = Number(stats.total_completed) || 0;
  const progress = game?.progressPercent != null ? game.progressPercent : getLevelProgress(xp).progressPercent;
  const level = game?.level || getLevelProgress(xp).level;
  const xpToNext = game?.xpToNextLevel ?? getLevelProgress(xp).xpToNextLevel;
  const currentLevelProgress = game?.progressXp ?? getLevelProgress(xp).progressXp;
  const requiredForLevel = game?.requiredXp ?? getLevelProgress(xp).requiredXp;
  const badges = game?.badges || [];
  const earnedCodes = new Set(badges.map((badge) => badge.code));
  const earnedCount = ACHIEVEMENTS.filter((achievement) => earnedCodes.has(achievement.code)).length;

  return (
    <section className="rewards-page">
      <header className="rewards-heading">
        <div>
          <p className="eyebrow">Your progression</p>
          <h1>Rewards</h1>
          <p className="muted">Every check-in builds momentum. Every milestone leaves a mark.</p>
        </div>
        <div className="rewards-count"><strong>{earnedCount}</strong><span>of {ACHIEVEMENTS.length} unlocked</span></div>
      </header>

      <section className="reward-hero reward-hero-upgraded">
        <div className="reward-hero-main">
          <div className="reward-level-orb"><span>LEVEL</span><strong>{level}</strong></div>
          <div>
            <p className="eyebrow">Current level</p>
            <h2>Keep the streak moving.</h2>
            <p className="muted light">{currentLevelProgress} / {requiredForLevel} XP in this level{xpToNext ? ` · ${xpToNext} XP to Level ${level + 1}` : ' · Next level ready'}</p>
          </div>
        </div>
        <div className="reward-progress-wrap">
          <div className="reward-progress-top"><span>Level progress</span><strong>{progress}%</strong></div>
          <div className="reward-progress-track"><i style={{ width: `${progress}%` }} /></div>
          <small>{xp.toLocaleString()} total XP</small>
        </div>
      </section>

      <section className="reward-stat-grid">
        <div className="reward-stat-card"><span>Total XP</span><strong>{xp.toLocaleString()}</strong><small>Lifetime progress</small></div>
        <div className="reward-stat-card"><span>Check-ins</span><strong>{completions.toLocaleString()}</strong><small>Habits completed</small></div>
        <div className="reward-stat-card"><span>Best streak</span><strong>{game?.bestLongestStreak || 0}</strong><small>Required days completed</small></div>
      </section>

      <section className="achievements-panel">
        <div className="achievements-panel-head">
          <div><p className="eyebrow">Milestones</p><h2>Achievement collection</h2></div>
          <span>{earnedCount} unlocked</span>
        </div>
        <div className="achievement-grid">
          {ACHIEVEMENTS.map((achievement) => {
            const earned = earnedCodes.has(achievement.code);
            const value = getAchievementProgress(achievement, game);
            const percentage = Math.min(100, Math.round((value / achievement.target) * 100));
            const badge = badges.find((item) => item.code === achievement.code);
            return (
              <article className={`achievement-card ${earned ? 'earned' : 'locked'}`} key={achievement.code}>
                <div className="achievement-icon">{earned ? '✓' : achievement.icon}</div>
                <div className="achievement-main">
                  <div className="achievement-title-row"><h3>{achievement.name}</h3><span>{earned ? 'Unlocked' : `${Math.min(value, achievement.target)}/${achievement.target}`}</span></div>
                  <p>{achievement.description}</p>
                  {!earned && <div className="achievement-mini-progress"><i style={{ width: `${percentage}%` }} /></div>}
                  {earned && <small>Unlocked {badge?.earned_at ? new Date(badge.earned_at).toLocaleDateString() : 'recently'}</small>}
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </section>
  );
}
