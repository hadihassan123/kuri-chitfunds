# Kuri Chit Funds — Phase 0 Security & Production Baseline

**Audit date:** 2026-09-06  
**Repository:** `hadihassan123/kuri-chitfunds`  
**Branch audited:** `main`  
**Audited HEAD:** `0143f98b392106f897af24e09afa96f09e93a58e` (`Update Twitter image meta tag versioning`)

## Scope

This baseline was produced from the current `main` branch before security-hardening changes. No application/security code was modified as part of the audit.

## Architecture

- **Frontend:** React 18 + TypeScript + Vite, deployed as a Render static site.
- **Backend:** FastAPI + SQLAlchemy + PostgreSQL, deployed as a Render web service.
- **Authentication:** Supabase Auth in the frontend; the frontend obtains the Supabase session/access token and sends it to FastAPI as a Bearer token.
- **Database:** The README describes Supabase PostgreSQL as the single source of truth, and the frontend directly uses Supabase JS as a fallback. However, the current `render.yaml` provisions a separate Render PostgreSQL database and injects that database's connection string into the backend as `DATABASE_URL`. Therefore the repository currently describes and configures two potentially independent databases. This must be resolved before production.
- **Frontend fallback:** `src/lib/api.ts` currently implements FastAPI → direct Supabase → localStorage fallback. The direct Supabase path performs database operations from the browser, so RLS is security-critical.
- **Deployment:** Render Blueprint defines the frontend and backend and also a Render PostgreSQL database.

## Repository Structure Findings

Present and inspected:

- `frontend` source under `src/`
- `backend/`
- `render.yaml`
- `package.json`
- `package-lock.json`
- `backend/requirements.txt`
- `backend/config.py`
- `backend/database.py`
- `backend/models.py`
- `backend/schemas.py`
- `backend/main.py`
- `backend/Dockerfile`
- `backend/alembic.ini`
- `backend/runtime.txt`
- root and backend README documentation
- `.github/workflows/keep-alive.yml`
- `.gitignore`

Not present in the current repository:

- `backend/alembic/` migration environment
- `backend/tests/`
- `supabase/` migration/test directory
- a dedicated GitHub Actions CI workflow (only `keep-alive.yml` exists)

The repository therefore has an `alembic.ini` reference but no committed Alembic environment/migrations.

## Authentication Baseline

**CRITICAL:** FastAPI authentication currently decodes the JWT payload with base64 and trusts `sub`. It does not verify the JWT signature, algorithm, issuer, audience, or expiration. A forged JWT-shaped token can therefore be accepted as an arbitrary user identity by protected routes.

The frontend does use the Supabase session and sends `Authorization: Bearer <access_token>` to FastAPI, which is the correct transport pattern. The backend verification step is the broken trust boundary.

## Authorization Baseline

Authorization is inconsistent across routes.

Current high-risk examples:

- `GET /api/chits/{chit_id}` does not require authentication or membership/ownership.
- `POST /api/chits/{chit_id}/members` does not enforce organizer ownership.
- `DELETE /api/chits/{chit_id}/members/{member_id}` has no authentication/ownership check.
- `GET /api/chits/{chit_id}/eligible` has no authorization check.
- `POST /api/chits/{chit_id}/draw` has no authorization check.
- `GET /api/chits/{chit_id}/payments` has no authorization check.
- Payment mutation authorization is partially implemented but relies on the same unverified JWT identity.

These are IDOR/business-authorization risks and must be fixed independently of JWT verification.

## Database / Integrity Baseline

- SQLAlchemy models define foreign keys but do not currently define the requested uniqueness constraints for monthly draws/payments.
- `Base.metadata.create_all(bind=engine)` executes during application import/startup. This is not a reproducible production migration strategy.
- `create_chit` performs multiple writes in one SQLAlchemy session and commits at the end, but there is no explicit transaction strategy documented for deployment/migration safety.
- Member-capacity checks are application-level and are vulnerable to concurrent-request races.
- Draw processing is multi-step and currently lacks a database-level uniqueness/locking strategy against concurrent duplicate draws.

## Supabase / RLS Baseline

No `supabase/` directory or committed SQL migration/test suite was found in the current repository. Therefore repository-side RLS policies cannot be treated as verified from source control.

The frontend uses the Supabase anon key through `VITE_SUPABASE_ANON_KEY`, which is normal for a browser client, but the security of direct Supabase fallback depends on live RLS policies. Live Supabase policy verification is a required later phase.

## CORS / Security Headers Baseline

- Current backend `CORS_ORIGINS` defaults to localhost, but the Render Blueprint explicitly sets `CORS_ORIGINS: "*"` with `allow_credentials=True`. This is unsafe for production and must be restricted to the actual frontend origin.
- The current FastAPI CORS middleware allows all methods and headers.
- The current frontend `index.html` contains standard metadata but no CSP/security-header configuration. Render/static response-header configuration has not yet been established in source.

## CI / Validation Baseline

- `package.json` currently has `lint` and `build`, but no `typecheck` or meaningful test script.
- No pytest suite is present.
- No RLS SQL test suite is present.
- No CI workflow validates frontend/backend/security requirements.
- `keep-alive.yml` is operational infrastructure only; it is not a validation pipeline.

## Runtime / Deployment Baseline

- `backend/runtime.txt` pins Python 3.11.0.
- `backend/Dockerfile` currently uses Python 3.10, creating a runtime inconsistency if the Dockerfile is used.
- `render.yaml` uses `pip install -r backend/requirements.txt` and `npm install && npm run build`; the frontend should move to `npm ci` once the lockfile is the intended source of dependency reproducibility.
- The Blueprint provisions `kuri-db` as a Render PostgreSQL database even though the application README says Supabase PostgreSQL is the authoritative database.

## Secret Exposure Baseline

No service-role key, database password, JWT secret, or other obvious private credential was found in the inspected source/config files. `.env`, `.env.local`, and related local environment files are ignored by Git.

The browser-visible Supabase URL and anon key are expected public client configuration. They still require correct RLS; they are not substitutes for authorization.

## Phase 0 Risk Classification

### Critical

1. FastAPI JWT payload is trusted without cryptographic verification.
2. Multiple FastAPI resource/state-changing endpoints lack authorization checks, creating IDOR/business-action exposure.
3. Render Blueprint currently provisions a separate database while application architecture claims Supabase is authoritative; this can cause split-brain data/storage behavior.

### High

1. Direct browser-to-Supabase fallback requires verified RLS, but no repository RLS migration/test suite is present.
2. Concurrent draw/member operations are not protected by database invariants or locking.
3. Production migration strategy is incomplete (`alembic.ini` exists without migration environment; startup uses `create_all()`).
4. Production CORS is wildcard with credentials enabled.

### Medium

1. No backend pytest suite.
2. No frontend typecheck/test pipeline.
3. No security-header/CSP configuration in source.
4. Python runtime configuration differs between `runtime.txt` (3.11) and Dockerfile (3.10).
5. Blueprint uses `npm install` instead of lockfile-enforced `npm ci`.

### Low / Operational

1. Existing keep-alive workflow is not CI and does not validate application security.
2. Documentation contains architecture descriptions that do not fully match the current Render Blueprint.

## Phase 0 Conclusion

**Classification: NOT READY**

The repository has a workable application architecture and correct frontend Supabase-session usage, but the current backend authentication trust boundary and route authorization are unsafe. The database/deployment architecture also needs to be made unambiguous before production.

No Phase 1+ implementation was performed in this baseline commit.
