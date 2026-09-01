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
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

const habitInput = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().min(1).max(40),
  difficulty: z.coerce.number().int().min(1).max(3).default(1),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/).default('#10b981'),
});
const logInput = z.object({
  habitId: z.coerce.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  completed: z.boolean(),
});

async function requireUser(req, res, next) {
  const auth = req.get('authorization');
  if (!auth?.startsWith('Bearer ')) return res.status(401).json({ error: 'Authentication required' });
  const { data, error } = await supabase.auth.getUser(auth.slice(7));
  if (error || !data.user) return res.status(401).json({ error: 'Invalid session' });
  req.user = data.user;
  next();
}

app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'habittracker-api' }));

app.get('/api/habits', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('habits')
      .select('id,name,category,difficulty,color,position,created_at,streaks(current_streak,longest_streak,last_completed_date)')
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
    const { data: last } = await supabase.from('habits').select('position').eq('user_id', req.user.id).order('position', { ascending: false }).limit(1).maybeSingle();
    const position = (last?.position ?? -1) + 1;
    const { data, error } = await supabase.from('habits').insert({ user_id: req.user.id, ...input, position }).select('id,name,category,difficulty,color,position').single();
    if (error) throw error;
    const { error: streakError } = await supabase.from('streaks').insert({ habit_id: data.id });
    if (streakError) throw streakError;
    res.status(201).json(data);
  } catch (error) { next(error); }
});

app.patch('/api/habits/:id', requireUser, async (req, res, next) => {
  try {
    const input = habitInput.partial().parse(req.body);
    const { data, error } = await supabase.from('habits').update({ ...input, updated_at: new Date().toISOString() }).eq('id', req.params.id).eq('user_id', req.user.id).select('id,name,category,difficulty,color,position').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Habit not found' });
    res.json(data);
  } catch (error) { next(error); }
});

app.delete('/api/habits/:id', requireUser, async (req, res, next) => {
  try {
    const { data, error } = await supabase.from('habits').delete().eq('id', req.params.id).eq('user_id', req.user.id).select('id').maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Habit not found' });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.put('/api/habits/reorder', requireUser, async (req, res, next) => {
  try {
    const ids = z.array(z.coerce.number().int().positive()).min(1).parse(req.body.ids);
    const { data: habits, error } = await supabase.from('habits').select('id').eq('user_id', req.user.id);
    if (error) throw error;
    const allowed = new Set((habits ?? []).map(h => h.id));
    if (ids.some(id => !allowed.has(id))) return res.status(400).json({ error: 'Invalid habit order' });
    for (const [position, id] of ids.entries()) {
      const { error: updateError } = await supabase.from('habits').update({ position }).eq('id', id).eq('user_id', req.user.id);
      if (updateError) throw updateError;
    }
    res.json({ success: true });
  } catch (error) { next(error); }
});

app.get('/api/logs', requireUser, async (req, res, next) => {
  try {
    let query = supabase.from('habit_logs').select('id,habit_id,date,completed').eq('user_id', req.user.id).order('date', { ascending: true });
    if (req.query.from) query = query.gte('date', req.query.from);
    if (req.query.to) query = query.lte('date', req.query.to);
    const { data, error } = await query;
    if (error) throw error;
    res.json(data ?? []);
  } catch (error) { next(error); }
});

app.put('/api/logs', requireUser, async (req, res, next) => {
  try {
    const input = logInput.parse(req.body);
    const { data: habit, error: habitError } = await supabase.from('habits').select('id,difficulty').eq('id', input.habitId).eq('user_id', req.user.id).single();
    if (habitError || !habit) return res.status(404).json({ error: 'Habit not found' });

    const { data: existing, error: existingError } = await supabase.from('habit_logs').select('id,completed').eq('habit_id', input.habitId).eq('user_id', req.user.id).eq('date', input.date).maybeSingle();
    if (existingError) throw existingError;

    const write = existing
      ? await supabase.from('habit_logs').update({ completed: input.completed, updated_at: new Date().toISOString() }).eq('id', existing.id).select('id,habit_id,date,completed').single()
      : await supabase.from('habit_logs').insert({ user_id: req.user.id, habit_id: input.habitId, date: input.date, completed: input.completed }).select('id,habit_id,date,completed').single();
    if (write.error) throw write.error;

    // The RPC is only called for a false -> true transition, so repeat clicks cannot award XP twice.
    if (!existing?.completed && input.completed) {
      const { error: rpcError } = await supabase.rpc('apply_habit_completion', { p_user_id: req.user.id, p_habit_id: input.habitId, p_date: input.date, p_xp: habit.difficulty * 10 });
      if (rpcError) throw rpcError;
    }

    if (existing?.completed && !input.completed) {
      const { error: streakError } = await supabase.rpc('recompute_habit_streak', { p_user_id: req.user.id, p_habit_id: input.habitId });
      if (streakError) throw streakError;
    }
    res.json(write.data);
  } catch (error) { next(error); }
});

app.get('/api/gamification', requireUser, async (req, res, next) => {
  try {
    const [{ data: stats, error: statsError }, { data: badges, error: badgesError }] = await Promise.all([
      supabase.from('user_stats').select('total_xp,total_completed').eq('user_id', req.user.id).single(),
      supabase.from('badges').select('code,name,description,earned_at').eq('user_id', req.user.id).order('earned_at', { ascending: false }),
    ]);
    if (statsError) throw statsError;
    if (badgesError) throw badgesError;
    res.json({ stats, level: Math.floor((stats?.total_xp ?? 0) / 100) + 1, badges: badges ?? [] });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  if (error instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: error.issues });
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
});

const port = Number(process.env.PORT ?? 5000);
app.listen(port, () => console.log(`HabitTracker API listening on ${port}`));
