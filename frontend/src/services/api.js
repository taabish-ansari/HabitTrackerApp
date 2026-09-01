import axios from 'axios';
import { supabase } from '../lib/supabase';

const api = axios.create({
  baseURL: `${(import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '')}/api`,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use(async config => {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export const habitsApi = {
  list: () => api.get('/habits'),
  create: payload => api.post('/habits', payload),
  update: (id, payload) => api.patch(`/habits/${id}`, payload),
  remove: id => api.delete(`/habits/${id}`),
  reorder: ids => api.put('/habits/reorder', { ids }),
};

export const logsApi = {
  list: (from, to) => api.get('/logs', { params: { from, to } }),
  toggle: payload => api.put('/logs', payload),
};

export const gameApi = {
  get: () => api.get('/gamification'),
};

export default api;
