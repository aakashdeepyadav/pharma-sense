# Deployment and Rehearsal Runbook

This runbook provides a reproducible local rehearsal. It is not a production deployment recipe: the checked-in Compose service is a development database bound to localhost and requires a password from an ignored environment file.

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
npm run research:validate
npm run build

Set-Location ../frontend
npm run lint
npm run build
```

`npm test` includes HTTP checks for health, login, anonymous access denial, role enforcement, and an authenticated receive-and-issue inventory workflow. The CI backend job runs migrations and seed before these checks against a fresh PostgreSQL service.

## Production-Like Rehearsal Boundaries

For a rehearsal, use a separate disposable database and environment values, build the backend and frontend, then run the backend with `npm start` and the frontend with `npm run preview`. Keep both bound to localhost unless the rehearsal network is explicitly isolated. Do not use `npm run seed` with operational data or share the sample credentials.

Before any real deployment, an owner must provide managed PostgreSQL, secret injection, HTTPS termination, restricted networking, an explicit trusted-proxy design, a shared login rate limiter, monitoring, and tested backup/restore procedures. Token revocations are stored in PostgreSQL and protected requests fail closed when that database is unavailable. The login limiter is still process-local. Existing tokens lacking the configured issuer/audience will be rejected after this release, requiring users to sign in again. This runbook does not establish that production deployment is safe.

## Release and Recovery

Use [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) before a release. Capture a database backup or provider recovery point before applying migrations. Migrations are forward-only in this repository; on a failed release, stop writes if data integrity is uncertain, restore the recovery point when schema/data compatibility requires it, and redeploy the last known-good application only after compatibility is confirmed. Do not manually edit Prisma migration history as a rollback shortcut. Record the recovery point, commands, and outcome in the release handoff.