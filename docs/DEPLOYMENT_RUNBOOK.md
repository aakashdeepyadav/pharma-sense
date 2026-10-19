# Deployment and Rehearsal Runbook

This runbook covers local rehearsal and the recommended résumé-demo deployment: Vercel for the static Vite frontend, plus a Render API and managed PostgreSQL database in the same Singapore region. The Render Blueprint in [`render.yaml`](../render.yaml) creates only the API and database; `frontend/vercel.json` sets frontend security headers and long-lived caching for Vite's content-hashed assets. Review provider pricing before creating paid resources.

## Recommended deployment: Vercel frontend + paid Render API/database

1. Push this repository to a Git provider connected to Render and Vercel. Create a Render Blueprint from `render.yaml` on the intended branch and review the paid API/database plans before approving resource creation. Keep the API and database in Singapore so the API can use the database's private connection.
2. During initial Blueprint creation, set `FRONTEND_URLS` to the production frontend origin(s) (for example, `https://example.com,https://www.example.com`) and set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and a unique `BOOTSTRAP_ADMIN_PASSWORD` of at least 16 characters. The one-time deploy hook creates the first administrator and application roles; it does not seed demo inventory.
3. Wait for Render to run migrations and bootstrap the admin. Confirm `https://pharmasense-api.onrender.com/health` returns healthy. Keep `JWT_SECRET` and `MFA_ENCRYPTION_KEY` stable; replacing them invalidates sessions or makes stored MFA secrets unreadable.
4. In Vercel, import this repository as a project and set **Root Directory** to `frontend`. Vercel detects Vite; use `npm run build` and `dist` if it asks for build settings. Set `VITE_API_URL=https://pharmasense-api.onrender.com` for Production. `frontend/vercel.json` applies the matching API origin in its CSP and caches hashed assets for one year. Redeploy after setting environment variables.
5. Add the domain and `www` alias under the Vercel project's **Settings → Domains**. Apply the DNS records Vercel displays at your registrar. If using a different frontend domain, change Render's `FRONTEND_URLS`; if using a custom API hostname, also update `VITE_API_URL` and `connect-src` in `frontend/vercel.json`, then redeploy both services.
6. Sign in with the bootstrap account. Enroll MFA, save the one-time recovery codes, verify a fresh login, change the bootstrap password, create named least-privilege accounts, and remove the three `BOOTSTRAP_ADMIN_*` variables from Render.
7. In Render, verify the database remains private and configure backup retention. Perform a restore rehearsal before storing any data that must be retained. Complete the remaining gates in [SECURITY_REVIEW.md](SECURITY_REVIEW.md) and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

The Blueprint's API slug is `pharmasense-api`; if it is unavailable, update the API URL in `frontend/vercel.json` and `VITE_API_URL` together. Do not scale the API above one instance while the in-memory login and request limiters are in use. Do not run the development seed in Render.

## Free résumé preview

The frontend can use Vercel Hobby for a personal, non-commercial résumé demo. A Render Free API will sleep after 15 minutes without inbound traffic, so its first request after idle can take about a minute. Its health check does not keep it awake. Do not use Render's Free Postgres for persistent data: it expires after 30 days and has no backups. If choosing a free API, use an external PostgreSQL provider such as Neon and expect its free quotas and possible database wake-up latency. Use a paid always-on API and a backed-up database when cold starts or data loss are unacceptable.

This configuration is deployable as a controlled pilot. It does not by itself close backup-restore rehearsal, live monitoring, hosted CI review, or production forecasting gates. Do not treat a successful deploy as production approval.

## Prerequisites

- Node.js 22 and npm
- Docker with the Compose plugin
- A disposable local database; never use shared or production data for the smoke workflow

## Clean Local Setup

From the repository root, start PostgreSQL and prepare environment files:

```powershell
Copy-Item .env.example .env
docker compose up -d
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

Replace the placeholder `POSTGRES_PASSWORD` in the root `.env` and use the configured database username/password in `backend/.env`'s `DATABASE_URL`. Replace both `JWT_SECRET` and `SEED_ADMIN_PASSWORD` with unique local values; the seed requires at least 16 characters for its password and refuses to run in production. Compose binds PostgreSQL to localhost; these values and the seeded account are for local development only. Existing database volumes retain the password set when initialized; changing `.env` alone does not rotate an existing volume's database role password.

In terminal 1:

```powershell
Set-Location backend
npm ci
npx prisma migrate deploy
npm run seed
npm run build
npm start
```

In terminal 2:

```powershell
Set-Location frontend
npm ci
npm run build
npm run dev
```

Check API health at `http://localhost:5000/health`; it should return `{"status":"ok","database":"ok"}`. An unauthenticated request to `http://localhost:5000/api/v1/medicines` should return `401`. Open the Vite URL printed in terminal 2 and use only the local seed credentials documented in the root README.

## Validation

With the backend database running and seeded:

```powershell
Set-Location backend
npm test
npm run db:quality
npm run db:reconcile
npm run research:validate
npm run build

Set-Location ../frontend
npm run lint
npm run build
```

For the real browser workflow, use a disposable database and set `E2E_DATABASE_URL` and `E2E_ADMIN_PASSWORD` before running `npm run test:e2e:live` from `frontend`.

`npm test` includes HTTP checks for health, login, anonymous access denial, role enforcement, and an authenticated receive-and-issue inventory workflow. The CI backend job runs migrations and seed before these checks against a fresh PostgreSQL service.

## Production-Like Rehearsal Boundaries

For a rehearsal, use a separate disposable database and environment values, build the backend and frontend, then run the backend with `npm start` and the frontend with `npm run preview`. Keep both bound to localhost unless the rehearsal network is explicitly isolated. Do not use `npm run seed` with operational data or share the sample credentials.

The Render Blueprint configures managed PostgreSQL, secret injection, HTTPS, a private database allow list, one trusted proxy hop, and mandatory MFA for every role. Token revocations are stored in PostgreSQL and protected requests fail closed when that database is unavailable. Login and general request limiters remain process-local, so keep one API instance until a shared limiter is implemented. Existing tokens lacking the configured issuer/audience will be rejected after this release, requiring users to sign in again. A successful deploy does not close the monitoring, restore, or release-signoff gates.

## Release and Recovery

Use [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before a release. Capture a database backup or provider recovery point before applying migrations. Migrations are forward-only in this repository; on a failed release, stop writes if data integrity is uncertain, restore the recovery point when schema/data compatibility requires it, and redeploy the last known-good application only after compatibility is confirmed. Do not manually edit Prisma migration history as a rollback shortcut. Record the recovery point, commands, and outcome in the release handoff.
