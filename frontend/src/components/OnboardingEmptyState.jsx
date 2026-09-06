import { useEffect, useState } from 'react';

function storageKey(userId) {
  return `habittracker-onboarding-dismissed-${userId}`;
}

export default function OnboardingEmptyState({ userId, onAddHabit }) {
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!userId) return;
    setDismissed(localStorage.getItem(storageKey(userId)) === '1');
  }, [userId]);

  if (dismissed) return null;

  const dismiss = () => {
    if (userId) localStorage.setItem(storageKey(userId), '1');
    setDismissed(true);
  };

  return (
    <section className="onboarding-empty" aria-labelledby="onboarding-empty-title">
      <div className="onboarding-empty-copy">
        <p className="eyebrow">A calm start</p>
        <h2 id="onboarding-empty-title">Build your first routine.</h2>
        <p>Start with one habit you genuinely want to repeat. You can add more later without rebuilding your system.</p>
        <button className="primary onboarding-empty-cta" type="button" onClick={onAddHabit}>＋ Add your first habit</button>
        <button className="link-button onboarding-empty-dismiss" type="button" onClick={dismiss}>I’ll do this later</button>
      </div>
      <div className="onboarding-empty-steps" aria-label="Getting started">
        <article><span>01</span><div><strong>Choose one</strong><p>Pick something small and realistic.</p></div></article>
        <article><span>02</span><div><strong>Set your rhythm</strong><p>Daily, weekdays, or the days that fit you.</p></div></article>
        <article><span>03</span><div><strong>Check in</strong><p>Return each day and mark what you completed.</p></div></article>
      </div>
    </section>
  );
}
