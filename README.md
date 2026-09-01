# HabitTracker

A full-stack habit tracking app rebuilt from the original HabitTracker project with a cleaner architecture and production-minded data integrity.

## Stack

- React 18 + Vite
- Tailwind CSS
- Axios
- Node.js + Express 5
- Zod validation
- Helmet + CORS
- Supabase Auth
- Supabase PostgreSQL

## Features

- Email/password authentication through Supabase
- Create, edit, delete and search habits
- Easy/Medium/Hard difficulty with XP values
- Daily check-ins with optimistic UI updates
- Monthly calendar view
- Progress and habit insights
- XP, levels and streak badges
- Server-side idempotent XP rewards through PostgreSQL RPC
- Per-user data isolation through authenticated API requests and RLS
- Responsive desktop/mobile interface

## Project structure

```text
HabitTrackerApp/
├── backend/
│   ├── src/server.js
│   ├── .env.example
│   ├── package.json
│   └── vercel.json
├── frontend/
│   ├── src/App.jsx
│   ├── src/hooks/
│   ├── src/services/
│   ├── src/lib/
│   ├── src/styles.css
│   ├── .env.example
│   └── package.json
└── supabase/schema.sql
```

## Supabase setup

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the SQL editor.
3. Enable Email auth in Supabase Auth.
4. Use the modern **publishable key** in both frontend and backend environment variables.
5. The backend creates a request-scoped Supabase client using the signed-in user's access token, so RLS remains active end-to-end.

Do not commit any `.env` file. The new Supabase project used for this rebuild is separate from the previous HabitTracker project.

## Local development

```bash
npm run install:all
npm run dev
```

The frontend runs on Vite's development server and the API defaults to port 5000.

## Deployment

Recommended free-tier production setup:

- Deploy `frontend/` as a Vercel project.
- Deploy `backend/` as a separate Vercel project using `backend/vercel.json`.
- Set `VITE_API_URL` in the frontend to the deployed API URL.
- Set `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in the appropriate Vercel project settings.
- Set `FRONTEND_URL` on the API project to the deployed frontend origin.
