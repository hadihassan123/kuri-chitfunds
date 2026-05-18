# Kuri — Digital Chit Fund Manager

A full-stack web application for managing chit funds digitally. Create groups, add members, conduct monthly draws, and track winners — all in one place.

## Live Demo
> Coming soon after Render deployment

---

## Tech Stack

### Frontend
- **React 18** + **TypeScript**
- **Vite** — build tool
- **Tailwind CSS** + **shadcn/ui** — styling and components
- **TanStack Query** — data fetching
- **React Router** — navigation
- **Framer Motion** — animations

### Backend
- **FastAPI** — REST API server
- **SQLAlchemy** — ORM
- **PostgreSQL** (Supabase) — cloud database
- **Uvicorn** — ASGI server
- **Pydantic** — data validation

### Infrastructure
- **Supabase** — PostgreSQL cloud database
- **Render** — backend + frontend deployment
- **localStorage** — offline fallback

---

## Architecture — 3-Tier Fallback

```
User Action
    │
    ▼
Tier 1: FastAPI backend (Render)
    │ if sleeping or down
    ▼
Tier 2: Supabase JS direct
    │ if no internet
    ▼
Tier 3: localStorage (offline)
```

All three tiers point to the same Supabase PostgreSQL database — data is always consistent.

---

## Features

- ✅ Create and manage chit funds
- ✅ Add / remove members
- ✅ Automatic monthly draw with configurable rules
- ✅ Organizer wins first or last — your choice
- ✅ Auto-activates when all members join
- ✅ Full draw history
- ✅ Works offline (localStorage fallback)
- ✅ Multi-currency support

---

## Project Structure

```
kuri-chitfunds/
├── backend/                  # FastAPI backend
│   ├── main.py               # API routes
│   ├── models.py             # SQLAlchemy models
│   ├── schemas.py            # Pydantic schemas
│   ├── database.py           # DB connection
│   ├── config.py             # Settings
│   ├── requirements.txt
│   └── Dockerfile
├── src/                      # React frontend
│   ├── lib/
│   │   ├── api.ts            # 3-tier fallback API client
│   │   └── supabase.ts       # Supabase JS client
│   ├── components/           # UI components
│   ├── pages/                # App pages
│   └── types/                # TypeScript types
├── render.yaml               # Render deployment config
└── package.json
```

---

## Local Development

### Prerequisites
- Node.js 18+
- Python 3.10+
- Supabase account

### 1. Clone the repo
```bash
git clone https://github.com/hadihassan123/kuri-chitfunds.git
cd kuri-chitfunds
```

### 2. Backend setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

Create `backend/.env`:
```
DATABASE_URL=postgresql://postgres:PASSWORD@db.YOUR-REF.supabase.co:5432/postgres
CORS_ORIGINS=http://localhost:5173,http://localhost:8080
```

Start backend:
```bash
uvicorn main:app --reload
```

### 3. Frontend setup
```bash
# In root folder
npm install
```

Create `.env.local` in root:
```
VITE_API_URL=http://localhost:8000
VITE_SUPABASE_URL=https://YOUR-REF.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Start frontend:
```bash
npm run dev
```

### 4. Open app
```
http://localhost:8080
```

---

## Deployment

### Supabase
1. Create project at supabase.com
2. Run `supabase_schema.sql` in SQL Editor
3. Save Project URL, anon key, and DB connection string

### Render
1. Connect GitHub repo to Render
2. Render reads `render.yaml` automatically
3. Add environment variables in Render dashboard:

**kuri-backend:**
```
DATABASE_URL   → Supabase Session Pooler connection string
CORS_ORIGINS   → your Render frontend URL
```

**kuri-frontend:**
```
VITE_SUPABASE_URL      → Supabase project URL
VITE_SUPABASE_ANON_KEY → Supabase anon key
VITE_API_URL           → auto-filled from kuri-backend
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/chits` | Get all chit funds |
| POST | `/api/chits` | Create a chit fund |
| GET | `/api/chits/{id}` | Get single chit fund |
| POST | `/api/chits/{id}/members` | Add member |
| DELETE | `/api/chits/{id}/members/{member_id}` | Remove member |
| GET | `/api/chits/{id}/eligible` | Get eligible members for draw |
| POST | `/api/chits/{id}/draw` | Conduct monthly draw |

---

## Built By
Abdulhadi Hassan — Odoo Developer & AI Engineer based in Doha, Qatar.
