# PharmaSense

Agent-Based Medicine Stock Management System.

## Prerequisites

- Node.js (v18+)
- Docker (for database)

## Current MVP

- JWT login with server-side role checks for Admin, Pharmacist, Inventory Manager, and Staff.
- Medicine, category, supplier, and batch management through the live API and dashboard.
- Purchase drafts and atomic receiving into batches with stock-IN history.
- Atomic stock receiving, issuing, and adjustments with transaction history.
- Expiry-aware batch ordering and protection against issuing expired stock.
- Low-stock, out-of-stock, expired, and expiring-soon alerts with acknowledgement.
- Operational reports, management-only audit logs, and transactional audit events for writes.

The forecasting pipeline currently uses synthetic research data only. It must not be mixed with operational inventory or treated as evidence of production model performance. See [research/data/DATA_CONTRACT.md](research/data/DATA_CONTRACT.md) before using any real or de-identified data.

## Quick Start

### 1. Database

```bash
docker-compose up -d
```

### 2. Backend

```bash
cd backend
npm install
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
npm install
npm run dev
```

Open the frontend at the Vite URL and sign in with the seeded administrator account. Inventory routes require a valid JWT issued by the backend.

## Validation

Run these checks from the repository root:

```bash
cd backend
npm run build
npm test
npm run research:validate

cd ../frontend
npm run lint
npm run build
```

## Security Notes

- Passwords are stored as bcrypt hashes and login failures use a generic response.
- Protected API routes enforce JWT authentication and role authorization on the server; frontend controls are presentation only.
- Stock changes and inventory master-data writes create audit records tied to the authenticated user.
- Keep `JWT_SECRET`, database credentials, and shared-environment credentials outside source control.
- The seeded account and Docker database password are for local development only.

## Branch Workflow

- `master` is the release-ready branch.
- `develop` is the integration branch for the next release.
- `feature/*` branches contain one focused change and should merge into `develop` through a pull request.
- Use small commits with behavior-focused messages, and require CI to pass before merging.
