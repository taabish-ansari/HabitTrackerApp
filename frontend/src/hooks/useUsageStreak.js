import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function previousDate(key) {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return dateKey(date);
}

function calculateCurrentStreak(dates, today = new Date()) {
  const todayKey = dateKey(today);
  const activeDates = new Set(dates);
  if (!activeDates.has(todayKey)) return 0;

  let streak = 0;
  let cursor = todayKey;
  while (activeDates.has(cursor)) {
    streak += 1;
    cursor = previousDate(cursor);
  }
  return streak;
}

export function getUsageStreak(dates, today = new Date()) {
  return calculateCurrentStreak(dates, today);
}

export function useUsageStreak(userId) {
  const [currentStreak, setCurrentStreak] = useState(0);
  const lastRecordedDate = useRef('');

  const recordUsage = useCallback(async () => {
    if (!userId || document.visibilityState === 'hidden') return;

    const today = dateKey();
    if (lastRecordedDate.current === today) return;
    lastRecordedDate.current = today;

    const { error: insertError } = await supabase
      .from('user_activity')
      .upsert(
        { user_id: userId, active_date: today },
        { onConflict: 'user_id,active_date', ignoreDuplicates: true },
      );

    if (insertError) {
      lastRecordedDate.current = '';
      return;
    }

    const { data, error: readError } = await supabase
      .from('user_activity')
      .select('active_date')
      .eq('user_id', userId)
      .order('active_date', { ascending: false });

    if (readError) return;
    setCurrentStreak(calculateCurrentStreak((data ?? []).map((item) => item.active_date)));
  }, [userId]);

  useEffect(() => {
    lastRecordedDate.current = '';
    recordUsage();

    const handleActivity = () => recordUsage();
    document.addEventListener('visibilitychange', handleActivity);
    window.addEventListener('focus', handleActivity);

    return () => {
      document.removeEventListener('visibilitychange', handleActivity);
      window.removeEventListener('focus', handleActivity);
    };
  }, [recordUsage]);

  return { currentStreak, refresh: recordUsage };
}
