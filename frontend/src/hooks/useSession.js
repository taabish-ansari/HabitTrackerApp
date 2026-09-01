import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export function useSession() {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setLoading(false); } });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => { active = false; listener.subscription.unsubscribe(); };
  }, []);
  return { session, loading };
}

export async function signIn(email, password) { return supabase.auth.signInWithPassword({ email, password }); }
export async function signUp(email, password, username) { return supabase.auth.signUp({ email, password, options: { data: { username } } }); }
