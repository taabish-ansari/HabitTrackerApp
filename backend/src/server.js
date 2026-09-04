import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const app = express();
const origins = (process.env.FRONTEND_URL ?? 'http://localhost:5173').split(',').map(s => s.trim()).filter(Boolean);
app.use(helmet());
app.use(cors({ origin: origins.length ? origins : false }));
app.use(express.json({ limit: '1mb' }));

const supabaseUrl = process.env.SUPABASE_URL;
const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!supabaseUrl || !publishableKey) throw new Error('SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are required');

function userClient(token) {
  return createClient(supabaseUrl, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

function xpRequiredForLevel(level) {
  const safeLevel = Math.max(1, Math.floor(Number(level) || 1));
  const completedLevels = safeLevel - 1;
  return 100 * completedLevels + (50 * completedLevels * (completedLevels + 1)) / 2;
}

function getLevelProgress(totalXp) {
  const xp = Math.max(0, Math.floor(Number(totalXp) || 0));
  let level = 1;
  while (xp >= xpRequiredForLevel(level + 1)) level += 1;

  const currentLevelXp = xpRequiredForLevel(level);
  const nextLevelXp = xpRequiredForLevel(level + 1);
  const progressXp = xp - currentLevelXp;
  const requiredXp = nextLevelXp - currentLevelXp;
  const progressPercent = Math.min(100, Math.floor((progressXp / requiredXp) * 100));

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    progressXp,
    requiredXp,
    progressPercent,
    xpToNextLevel: Math.max(0, nextLevelXp - xp),
  };
}

const habitInput = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(40),
  difficulty: z.coerce.number().int().min(1).max(3).default(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10b981'),
});
const logInput = z.object({
  habitId: z.coerce.number().int().positive(),
  date: z.string().date(),
  completed: z.coerce.boolean(),
});
const dateRangeInput = z.object({
  from: z.string().date().optional(),
  to: z.string().date().optional(),
});

async function requireUser(req, res, next) {
  const auth = req.get('authorization');
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  const token = auth.slice(7);
  const supabase = userClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return res.status(401).json({ error: 'Invalid session' });
  req.user = data.user;
  req.supabase = supabase;
  next();
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'habittracker-api' }));

app.get('/api/habits', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await req.supabase
      .from('habits')
      .select('id,name,category,difficulty,color,position,created_at,schedule_type,schedule_days,streaks(current_streak,longest_streak,last_completed_date)')
      .eq('user_id', req.user.id)
      .order('position', { ascending: true })
      .order('created_at', { ascending: true });
    if (error) throw error;
    res.json(data ?? []);
  } catch (error) { next(error); }
});

app.post('/api/habits', requireUser, async (req, res, next) => {
  try {
    const input = habitInput.parse(req.body);
    const { data: last } = await req.supabase.from('habits').select('position').eq('user_id', req.user.id).order('position', { ascending: false }).limit(1).maybeSingle();
    const position = (last?.position ?? -1) + 1;
    const { data, error } = await req.supabase
      .from('habits')
      .insert({ user_id: req.user.id, ...input, position })
      .select('id,name,category,difficulty,color,position,schedule_type,schedule_days')
      .single();
    if (error) throw error;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.patch('/api/habits/:id', requireUser, async (req, res, next) => {
  try {
    const input = habitInput.partial().parse(req.body);
    const { data, error } = await req.supabase
      .from('habits')
      .update({ ...input, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .eq('user_id', req.user.id)
      .select('id,name,category,difficulty,color,position,schedule_type,schedule_days')
      .maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Habit not found' });
    res.json(data);
  } catch (error) { next(error); }
});

app.delete('/api/habits/:id', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await req.supabase.from('habits').delete().eq('id', req.params.id).eq('user_id', req.user.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Habit not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.put('/api/habits/reorder', requireUser, async (req, res, next) => {
  try {
    const ids = z.array(z.coerce.number().int().positive()).min(1).parse(req.body.ids);
    if (new Set(ids).size !== ids.length) return res.status(400).json({ error: 'Duplicate habit IDs are not allowed' });
    const { data: habits, error } = await req.supabase.from('habits').select('id').eq('user_id', req.user.id);
    if (error) throw error;
    const allowed = new Set((habits ?? []).map(h => h.id));
    if (ids.length !== allowed.size || ids.some(id => !allowed.has(id))) return res.status(400).json({ error: 'Habit order must include every habit exactly once' });
    for (const [position, id] of ids.entries()) {
      const { error: updateError } = await req.supabase.from('habits').update({ position }).eq('id', id).eq('user_id', req.user.id);
      if (updateError) throw updateError;
    }
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.get('/api/logs', requireUser, async (req, res, next) => {
  try {
    const range = dateRangeInput.parse({ from: req.query.from, to: req.query.to });
    if (range.from && range.to && range.from > range.to) return res.status(400).json({ error: 'Invalid date range' });
    let query = req.supabase.from('habit_logs').select('id,habit_id,date,completed').eq('user_id', req.user.id).order('date', { ascending: true });
    if (range.from) query = query.gte('date', range.from);
    if (range.to) query = query.lte('date', range.to);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data ?? []);
  } catch (error) { next(error); }
});

app.put('/api/logs', requireUser, async (req, res, next) => {
  try {
    const input = logInput.parse(req.body);
    const { data: habit, error: habitError } = await req.supabase
      .from('habits')
      .select('id,difficulty')
      .eq('id', input.habitId)
      .eq('user_id', req.user.id)
      .single();
    if (habitError || !habit) return res.status(404).json({ error: 'Habit not found' });

    const { data, error } = await req.supabase.rpc('set_habit_completion', {
      p_user_id: req.user.id,
      p_habit_id: input.habitId,
      p_date: input.date,
      p_completed: input.completed,
      p_xp: habit.difficulty * 10,
    });
    if (error) throw error;
    res.json(data?.log ?? { habit_id: input.habitId, date: input.date, completed: input.completed });
  } catch (error) { next(error); }
});

app.get('/api/gamification', requireUser, async (req, res, next) => {
  try {
    const [{ data: stats, error: statsError }, { data: badges, error: badgesError }] = await Promise.all([
      req.supabase.from('user_stats').select('total_xp,total_completed').eq('user_id', req.user.id).single(),
      req.supabase.from('badges').select('code,name,description,earned_at').eq('user_id', req.user.id).order('earned_at', { ascending: false }),
    ]);
    if (statsError) throw statsError;
    if (badgesError) throw badgesError;
    const levelProgress = getLevelProgress(stats?.total_xp ?? 0);
    res.json({ stats, ...levelProgress, badges: badges ?? [] });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) {
    return res.status(400).json({
      error: error.issues?.[0]?.message || 'Invalid request',
      details: error.issues,
    });
  }
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 5000);
if (!process.env.VERCEL) app.listen(port, () => console.log(`HabitTracker API listening on ${port}`));

export default app;
