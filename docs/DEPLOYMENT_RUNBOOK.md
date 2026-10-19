# Deployment and Rehearsal Runbook

This runbook covers the local rehearsal and the Render deployment configuration in [`render.yaml`](../render.yaml). The Render Blueprint creates a managed PostgreSQL database, API service, and static frontend. It uses paid service/database plans; review Render's current pricing and your workspace region before creating resources.

## Deploy to Render

1. Push this repository to a Git provider connected to your Render account. In Render, create a Blueprint from the repository and select the intended release branch. Review the resources and paid plans in `render.yaml` before approving creation.
2. Keep the API and database in Singapore, as configured, or change both to the same region before first creation. Render private database URLs only work for services in the same region.
3. During the initial Blueprint creation flow, set `BOOTSTRAP_ADMIN_NAME`, `BOOTSTRAP_ADMIN_EMAIL`, and a unique `BOOTSTRAP_ADMIN_PASSWORD` (at least 16 characters). Render prompts for the `sync: false` values at initial Blueprint creation. The one-time initial deploy hook uses them to create only the first admin and application roles; it does not seed demo inventory.
4. Let Render create the services, run migrations with the pre-deploy command, and execute the initial administrator bootstrap. Confirm the API `/health` check is healthy and open the static site URL.
5. Sign in with the bootstrap account, change its password, create named accounts with least privilege, and then remove the three `BOOTSTRAP_ADMIN_*` environment variables from the API service. Keep the generated `JWT_SECRET` private; replacing it revokes every current session.
6. In the Render database settings, verify inbound IP rules remain private. Configure and test database backup retention and restore according to the workspace plan. Record an actual restore rehearsal before storing operational data.
7. Before using operational inventory, complete the remaining gates in [SECURITY_REVIEW.md](SECURITY_REVIEW.md) and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md), especially privileged MFA. For a custom frontend domain, update `FRONTEND_URLS` and the frontend CSP `connect-src` in `render.yaml`, then sync and redeploy.

The Blueprint's service slugs are `pharmasense-api` and `pharmasense-web`; if those names are unavailable in the Render workspace, change the names and the API URL in the frontend CSP together. Do not scale the API above one instance while the in-memory login and request limiters are in use. Do not run the development seed in Render.

This configuration is deployable as a controlled pilot. It does not by itself close the privileged MFA, backup-restore rehearsal, dependency review/hosted CI, or production forecasting gates. Do not treat a successful deploy as production approval.

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

The Render Blueprint configures managed PostgreSQL, secret injection, HTTPS, a private database allow list, and one trusted proxy hop. Token revocations are stored in PostgreSQL and protected requests fail closed when that database is unavailable. Login and general request limiters remain process-local, so keep one API instance until a shared limiter is implemented. Existing tokens lacking the configured issuer/audience will be rejected after this release, requiring users to sign in again. A successful deploy does not close the MFA, monitoring, restore, or release-signoff gates.

## Release and Recovery

Use [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before a release. Capture a database backup or provider recovery point before applying migrations. Migrations are forward-only in this repository; on a failed release, stop writes if data integrity is uncertain, restore the recovery point when schema/data compatibility requires it, and redeploy the last known-good application only after compatibility is confirmed. Do not manually edit Prisma migration history as a rollback shortcut. Record the recovery point, commands, and outcome in the release handoff.
