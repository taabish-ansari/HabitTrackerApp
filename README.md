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
4. Copy the project URL and anon key into `frontend/.env`.
5. Copy the project URL and service role key into `backend/.env`.

The service role key is server-only and must never be exposed to the frontend.

## Local development

```bash
npm run install:all
npm run dev
```

The frontend runs on Vite's development server and the API defaults to port 5000.

## Deployment

Recommended production setup:

- Deploy `frontend/` as a Vercel project.
- Deploy `backend/` as a separate Vercel project using `backend/vercel.json`.
- Set `VITE_API_URL` in the frontend to the deployed API URL.
- Set `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` in the appropriate Vercel project settings.
- Set `FRONTEND_URL` on the API project to the deployed frontend origin.
