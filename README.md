# 🚗 Remates Santiago — Tracker de Vehículos

Aplicación que scrapea las principales empresas de remate de vehículos en Santiago (Karcal, Reyco, Zárate, Macal), analiza precios históricos vs. mercado (Chileautos) y envía alertas por email cuando hay vehículos con margen > 20%.

## Stack

- **Frontend:** React + Vite + TypeScript + Tailwind CSS → Vercel
- **Base de datos:** Supabase (PostgreSQL + Auth + RLS)
- **Scrapers:** Node.js + Playwright + cheerio → GitHub Actions cron
- **Alertas:** Resend.com

## Setup rápido

### 1. Supabase — ejecutar SQL
Ir a Supabase Dashboard → SQL Editor → pegar y ejecutar `supabase/migrations/001_initial_schema.sql`

### 2. Crear usuario admin
Supabase Dashboard → Authentication → Users → Add user

### 3. Variables de entorno frontend
Copiar `frontend/.env.local.example` a `frontend/.env.local` y completar:
```
VITE_SUPABASE_URL=https://fifmbimepnqxwxswijba.supabase.co
VITE_SUPABASE_ANON_KEY=<anon key de Supabase>
```

### 4. GitHub Secrets
Ir a GitHub repo → Settings → Secrets → Actions:

| Secret | Valor |
|--------|-------|
| `SUPABASE_URL` | `https://fifmbimepnqxwxswijba.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Service Role Key (Supabase → Settings → API) |
| `RESEND_API_KEY` | API Key de resend.com |
| `RESEND_FROM_EMAIL` | `onboarding@resend.dev` (o tu dominio verificado) |
| `ALERT_EMAIL` | `nbpfaster97@gmail.com` |

### 5. Vercel
- Conectar repo GitHub → Root Directory: `frontend`
- Agregar env vars: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`

### 6. Probar scrapers manualmente
GitHub → Actions → "Scraper Remates Diario" → Run workflow

## Estructura
```
├── scrapers/          → Node.js scrapers (Karcal, Reyco, Zárate, Macal, Chileautos)
├── frontend/          → React SPA
├── supabase/          → SQL migrations
└── .github/workflows/ → Cron jobs
```
