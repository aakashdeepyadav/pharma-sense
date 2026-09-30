# PharmaSense

Agent-Based Medicine Stock Management System.

## Prerequisites

- Node.js (v18+)
- Docker (for database)

## Current MVP

- JWT login with server-side role checks for Admin, Pharmacist, Inventory Manager, and Staff.
- Admin-only user listing, creation, role updates, and account deactivation/reactivation with audit events; protected requests use the user's current database role and session state.
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
- Pagination metadata and a structured validation error envelope on list endpoints for safer production API contracts.
- Dashboard error handling aligned with the structured API envelope so login, submit, and inventory actions show actionable server messages.
- CI checks for migrations, backend tests, research validation, frontend lint/build, mocked browser smoke tests, and a live inventory workflow against an isolated PostgreSQL database.

## Completion Status

The core MVP was released as `v0.1.0` on `master`. Its inventory, purchase receiving, stock movement, alerts, reporting, and role-checked API workflows are implemented. Admins can list users, create accounts, and update name/email/role; password hashes are never returned, and role changes apply to already-issued tokens. Browser coverage includes login/role/keyboard/responsive checks plus a live PostgreSQL workflow for user management, purchasing, stock, alerts, and rejection paths. Local validation passes; dataset validation reports documented synthetic-data warnings.

## Next Work

The current development line adds read-only replenishment recommendations, paginated list responses, structured validation errors, persisted token revocation, and basic request throttling. Production readiness is still in progress; the current controls are local single-process implementations, not shared controls for horizontally scaled deployments.

- Expand browser coverage for purchase and alert edge cases; complete a broader responsive and screen-reader accessibility review.
- Complete broader account/accessibility hardening; self-service password change, Admin-managed reset, and safe deactivation/reactivation are implemented.
- Replace file-backed token revocation and process-local rate limiting with shared production storage, and configure trusted proxy handling before deployment.
- Obtain approved real or de-identified demand data before making model-performance claims; synthetic data remains research/test-only.
- Add human approval for replenishment, agent safety controls, and a deployment rehearsal including backup and restore.

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

The development seed creates these local role-test accounts:

```text
Admin: admin@pharmasense.local / admin12345
Pharmacist: pharmacist@pharmasense.local / pharmacist12345
Inventory Manager: manager@pharmasense.local / manager12345
Staff: staff@pharmasense.local / staff12345
```

These accounts are for local development only. The seed exits when `NODE_ENV=production`; never use these credentials in shared or deployed environments.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open the frontend at the Vite URL and sign in with the seeded administrator account. Inventory routes require a valid JWT issued by the backend.

To manage accounts, open **Management and history** and use **User access**. Admins can create users, update their name/email/role, deactivate/reactivate accounts, and optionally reset a managed user’s password. Signed-in users can use **Change password** in the header. The app prevents demoting or deactivating the signed-in last Admin.

## Validation

Run these checks from the repository root:

```bash
cd backend
npm run seed
npm run build
npm test
npm run research:validate

cd ../frontend
npx playwright install chromium
npm run lint
npm run build
npm run test:e2e
```

The live browser workflow uses a disposable PostgreSQL database and writes test records. For a local run, create a separate database such as `pharmasense_e2e`, apply migrations and seed it with `DATABASE_URL` pointing to that database, then set `E2E_DATABASE_URL` to the same connection string before running `npm run test:e2e:live` from `frontend/`. CI provisions an isolated database automatically.

## Security Notes

- Passwords are stored as bcrypt hashes and login failures use a generic response.
- Protected API routes enforce JWT authentication and role authorization on the server; frontend controls are presentation only.
- Dashboard logout revokes the current access token on the running API instance before clearing the local session, and the backend persists revoked JWT fingerprints to disk so server restarts do not silently re-enable old tokens.
- The API applies a lightweight request throttle to limit abusive bursts from a single client and returns a structured 429 response with a clear rate-limit code.
- Every API response includes a generated `X-Request-Id` for correlating support reports with server-side request traces.
- Forwarded client IPs are ignored unless `TRUST_PROXY=true` is explicitly configured behind a trusted reverse proxy; this prevents spoofed `X-Forwarded-For` headers from bypassing throttling.
- Configure one or more browser origins with `FRONTEND_URLS` as a comma-separated allow-list; unknown origins receive no CORS access.
- `RATE_LIMIT_WINDOW_MS` and `RATE_LIMIT_MAX_REQUESTS` configure the API burst limit; the local defaults are 60 seconds and 40 requests per client/route.
- `LOGIN_RATE_LIMIT_WINDOW_MS` and `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` configure failed-login throttling; the local defaults are 15 minutes and 10 attempts per client.
- Stock changes and inventory master-data writes create audit records tied to the authenticated user.
- Keep `JWT_SECRET`, database credentials, and shared-environment credentials outside source control.
- The seeded role accounts and Docker database password are for local development only; the seed script refuses to run with `NODE_ENV=production`.

## Branch Workflow

- `master` is the release-ready branch.
- `develop` is the integration branch for the next release.
- `feature/*` branches contain one focused change and should merge into `develop` through a pull request.
- Use small commits with behavior-focused messages, and require CI to pass before merging.
