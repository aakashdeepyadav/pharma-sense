# PharmaSense

Agent-Based Medicine Stock Management System.

## Prerequisites

- Node.js 22 and npm
- Docker (for database)

## Current MVP

- JWT login with server-side role checks for Admin, Pharmacist, Inventory Manager, and Staff.
- Medicine, category, supplier, and batch management through the live API and dashboard, including manufacturer, dosage/form, barcode, and active status fields.
- Server-side medicine search by name, manufacturer, barcode, and active status.
- Supplier search by name through the API and dashboard.
- Purchase drafts and atomic receiving into batches with stock-IN history.
- Fixed-precision purchase and selling prices with unique medicine batch numbers.
- Atomic stock receiving, issuing, and adjustments with transaction history.
- Expiry-aware batch ordering and protection against issuing expired stock.
- Low-stock, out-of-stock, expired, and expiring-soon alerts with acknowledgement.
- Operational reports, management-only audit logs, and transactional audit events for writes.
- Read-only replenishment recommendations based on recent OUT demand and reorder levels; recommendations never place purchases automatically.
- CI checks migrations, seeded backend HTTP/inventory smoke tests, research validation, frontend lint/build, leaked secrets, and dependency advisories; Dependabot proposes weekly dependency updates.

The forecasting pipeline currently uses synthetic research data only. It must not be mixed with operational inventory or treated as evidence of production model performance. See [research/data/DATA_CONTRACT.md](research/data/DATA_CONTRACT.md) before using any real or de-identified data.

## Quick Start

### 1. Database

```bash
cp .env.example .env
docker compose up -d
```

Set a unique local `POSTGRES_PASSWORD` in `.env`, then use the configured database username and password in `backend/.env`'s `DATABASE_URL`. The example values are placeholders only.

### 2. Backend

```bash
cd backend
npm ci
npx prisma migrate deploy
npm run seed
npm run dev
```

Before starting the backend, copy `backend/.env.example` to `backend/.env` and replace `JWT_SECRET` with a long random value. Copy `frontend/.env.example` to `frontend/.env` if the API is not running at the local default URL.

The development seed creates this local administrator account:

```text
Email: admin@pharmasense.local
Password: admin12345
```

Change these credentials before using any shared or deployed environment.

### 3. Frontend

```bash
cd frontend
npm ci
npm run dev
```

Open the frontend at the Vite URL and sign in with the seeded administrator account. Inventory routes require a valid JWT issued by the backend.

## Validation

Run these checks from the repository root:

```bash
cd backend
npx prisma migrate deploy
npm run seed
npm run build
npm test
npm run research:validate

cd ../frontend
npm run lint
npm run build
```

## Security Notes

- Passwords are stored as bcrypt hashes and login failures use a generic response.
- Protected API routes enforce JWT authentication and check the user's current database role on every request; frontend controls are presentation only.
- JWTs are restricted to HS256 with an issuer and audience, and the application refuses to start without a signing key of at least 32 bytes. Use a separately generated high-entropy value.
- Dashboard logout stores a SHA-256 token fingerprint in PostgreSQL; logout remains effective across API restarts and replicas. Existing tokens without the new issuer/audience must sign in again after this migration.
- Stock changes and inventory master-data writes create audit records tied to the authenticated user.
- Keep `JWT_SECRET`, database credentials, and shared-environment credentials outside source control.
- The seeded account is for local development only. Compose reads the database password from the ignored root `.env` and binds PostgreSQL to localhost; never reuse local values in shared environments.
- CORS allows the configured `FRONTEND_URL`; request bodies are limited to 100 KB, and the API sets content-type, frame, and referrer headers.
- Failed or malformed login attempts are limited to 10 per client address per 15 minutes per API process. Use a shared edge limiter before horizontal scaling; database-backed token revocation does not replace login throttling.
- CI runs Gitleaks and high-severity npm audits; pull requests receive dependency review. Configure GitHub branch protection to require these checks before merge.

## DevOps Handoff

- [Deployment and local rehearsal runbook](docs/DEPLOYMENT_RUNBOOK.md)
- [Security review checklist](docs/SECURITY_REVIEW.md)
- [Security and operational risk register](docs/SECURITY_RISK_REGISTER.md)
- [Release and rollback checklist](docs/RELEASE_CHECKLIST.md)
- [Smoke-test coverage and execution evidence](docs/DEVOPS_SMOKE_TEST_REPORT.md)

## Branch Workflow

- `master` is the release-ready branch.
- `develop` is the integration branch for the next release.
- `feature/*` branches contain one focused change and should merge into `develop` through a pull request.
- Use small commits with behavior-focused messages, and require CI to pass before merging.
