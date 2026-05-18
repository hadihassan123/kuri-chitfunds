# Kuri — Digital Chit Fund Manager

A full-stack web application for managing chit funds digitally. Create groups, add members, conduct monthly draws, and track winners — all in one place.

## 🌐 Live Demo
- **Frontend:** https://kuri-frontend.onrender.com
- **Backend API:** https://kuri-backend-0veb.onrender.com
- **API Docs:** https://kuri-backend-0veb.onrender.com/docs

> ⚠️ Backend runs on Render free tier — may take ~60 seconds to wake up on first request. Supabase JS fallback kicks in automatically during this time so no data is lost.

---

## Architecture — 2-Tier Fallback

```
User opens https://kuri-frontend.onrender.com
                        │
                        ▼
           React Frontend (Render Static)
               Always on, never sleeps ✅
                        │
                        │ user action
                        ▼
                  src/lib/api.ts
                        │
            ┌───────────▼────────────┐
            │   TIER 1 — FastAPI     │
            │  kuri-backend-0veb     │
            │    .onrender.com       │
            │   sleeps after 15min   │
            │   5 second timeout     │
            └───────────┬────────────┘
                        │ ✅ awake → handles request
                        │ ❌ sleeping → timeout → fallback
                        │
            ┌───────────▼────────────┐
            │  TIER 2 — Supabase JS  │
            │   direct client call   │
            │    always on ✅        │
            └───────────┬────────────┘
                        │
                        ▼
            ┌───────────────────────┐
            │   Supabase PostgreSQL  │
            │   (single source of   │
            │    truth — always on) │
            │                       │
            │  tables:              │
            │  • chit_funds         │
            │  • members            │
            │  • draw_results       │
            └───────────────────────┘
```

Both tiers write to the same Supabase database — data is always consistent regardless of which tier handled the request.

---

## Tech Stack

### Frontend
- **React 18** + **TypeScript**
- **Vite** — build tool
- **Tailwind CSS** + **shadcn/ui** — styling and components
- **TanStack Query** — data fetching
- **React Router** — navigation
- **Framer Motion** — animations
- **Supabase JS** — direct DB fallback client

### Backend
- **FastAPI** — REST API server
- **SQLAlchemy** — ORM
- **Pydantic** — data validation
- **Uvicorn** — ASGI server
- **psycopg2** — PostgreSQL driver

### Infrastructure
- **Supabase** — PostgreSQL cloud database (always on)
- **Render Web Service** — FastAPI backend (free tier)
- **Render Static Site** — React frontend (free, always on)

---

## Features

- ✅ Create and manage chit funds
- ✅ Add and remove members
- ✅ Automatic monthly draw with configurable rules
- ✅ Organizer wins first or last — your choice
- ✅ Auto-activates when all members join
- ✅ Full draw history per chit fund
- ✅ Multi-currency support
- ✅ Automatic fallback to Supabase when backend sleeps

---

## Project Structure

```
kuri-chitfunds/
├── backend/                  # FastAPI backend (deployed on Render)
│   ├── main.py               # All API routes
│   ├── models.py             # SQLAlchemy models
│   ├── schemas.py            # Pydantic request/response schemas
│   ├── database.py           # DB engine and session
│   ├── config.py             # Settings via pydantic-settings
│   ├── requirements.txt      # Python dependencies
│   ├── Dockerfile            # Container config
│   └── runtime.txt           # Python 3.11 pin for Render
├── src/                      # React frontend
│   ├── lib/
│   │   ├── api.ts            # 2-tier fallback API client
│   │   └── supabase.ts       # Supabase JS client setup
│   ├── components/           # Reusable UI components
│   ├── pages/                # App pages
│   └── types/
│       └── chit.ts           # TypeScript types
├── render.yaml               # Render deployment blueprint
├── index.html                # App entry point
└── package.json
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Health check |
| GET | `/api/chits` | Get all chit funds |
| POST | `/api/chits` | Create a new chit fund |
| GET | `/api/chits/{id}` | Get single chit fund |
| POST | `/api/chits/{id}/members` | Add a member |
| DELETE | `/api/chits/{id}/members/{member_id}` | Remove a member |
| GET | `/api/chits/{id}/eligible` | Get members eligible for draw |
| POST | `/api/chits/{id}/draw` | Conduct monthly draw |

Full interactive docs: https://kuri-backend-0veb.onrender.com/docs

---

## Local Development

### Prerequisites
- Node.js 18+
- Python 3.11+
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
DATABASE_URL=postgresql://postgres:YOUR-PASSWORD@db.YOUR-REF.supabase.co:5432/postgres
CORS_ORIGINS=http://localhost:5173,http://localhost:8080
```

Start backend:
```bash
uvicorn main:app --reload
```

### 3. Frontend setup
```bash
# In root folder
npm install --legacy-peer-deps
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
# Opens at http://localhost:8080
```

---

## Deployment

### Supabase Database
1. Create project at supabase.com
2. Run SQL schema in SQL Editor to create tables
3. Enable Row Level Security with public policies
4. Save: Project URL, anon key, Session Pooler connection string

### Render — Backend
1. New Web Service → connect GitHub repo
2. Root Directory: `backend`
3. Build Command: `pip install -r requirements.txt`
4. Start Command: `uvicorn main:app --host 0.0.0.0 --port 8000`
5. Add environment variables:

```
DATABASE_URL    → Supabase Session Pooler URI
CORS_ORIGINS    → https://kuri-frontend.onrender.com
PYTHON_VERSION  → 3.11.0
```

### Render — Frontend
1. New Static Site → connect GitHub repo
2. Build Command: `npm install --legacy-peer-deps && npm run build`
3. Publish Directory: `dist`
4. Add environment variables:

```
VITE_API_URL           → https://kuri-backend-0veb.onrender.com
VITE_SUPABASE_URL      → https://YOUR-REF.supabase.co
VITE_SUPABASE_ANON_KEY → your-anon-key
```

---

## Built By
Hadi (Abdulhadi Hassan) — Odoo Developer & AI Engineer based in Doha, Qatar.
- GitHub: [@hadihassan123](https://github.com/hadihassan123)
