# PharmaSense

**PharmaSense** is a medicine inventory and decision-support application for tracking medicines, batches, suppliers, purchases, stock movement, expiry risk, and replenishment reviews. It combines a React dashboard, a role-protected TypeScript API, PostgreSQL persistence, and a separate Python forecasting research pipeline.

> **Project type:** résumé and portfolio project. The forecasting benchmark currently uses synthetic research data. It is not evidence of model performance in a real pharmacy, and this project is not a validated clinical or pharmacy operations system.

## Contents

- [What it does](#what-it-does)
- [Architecture](#architecture)
- [Technology](#technology)
- [Run locally](#run-locally)
- [Validation](#validation)
- [Forecasting and model status](#forecasting-and-model-status)
- [Deployment](#deployment)
- [Security and data boundaries](#security-and-data-boundaries)
- [Repository map](#repository-map)
- [Documentation](#documentation)

## What it does

### Inventory operations

- Manage medicines, categories, suppliers, batches, and purchase drafts.
- Receive purchases atomically into stock and record stock-in transactions.
- Issue and adjust stock with transaction history and audit records.
- Track batch expiry and prevent issuing expired stock.
- Search medicines by name, manufacturer, barcode, and active status; search suppliers by name or contact information.
- Browse large transaction, inventory, purchase, and audit lists with stable pagination.

### Alerts, reporting, and review

- Identify low-stock, out-of-stock, expired, and soon-to-expire items.
- View inventory, demand, transaction, and audit reports.
- Review read-only replenishment suggestions based on stock and recent demand.
- Share approval or dismissal decisions with reviewer attribution and audit history. A recommendation never creates a purchase or changes stock by itself.

### Accounts and access

- Authenticate with JWTs and enforce user roles on the API.
- Support Admin, Inventory Manager, Pharmacist, and Staff accounts.
- Manage accounts, roles, password resets, and account activation.
- Require authenticator MFA in production, with encrypted secrets, replay protection, single-use recovery codes, and audited administrator recovery.

## Architecture

```mermaid
flowchart LR
  Browser[React + Vite dashboard] -->|HTTPS / JSON| API[Express + TypeScript API]
  API -->|Prisma| DB[(PostgreSQL)]
  API --> Inventory[Stock, purchases, alerts, audit]
  API --> Forecast[Live baseline and risk calculations]
  Research[Python LightGBM research pipeline] -->|Evaluation artifacts| ResearchData[(Synthetic research data)]
```

The live dashboard calls the API for operational data. The API owns authorization and business rules; frontend role controls are only presentation. The Python training scripts are a research workflow and are not a separate live inference service.

## Technology

| Area | Tools |
| --- | --- |
| Frontend | React, TypeScript, Vite, Tailwind CSS |
| API | Node.js 22, Express 5, TypeScript, Zod |
| Data | PostgreSQL 15+, Prisma ORM and migrations |
| Authentication | JWT, bcrypt, TOTP MFA and recovery codes |
| Forecasting research | Python, pandas, scikit-learn, LightGBM |
| Quality checks | Node test runner, Playwright, Oxlint, GitHub Actions |

## Run locally

### Requirements

- Node.js 22 and npm
- Docker Desktop or Docker Engine with the Compose plugin
- Python and pip only if you want to run the forecasting research scripts

### 1. Configure environment files

From the repository root, copy the examples:

```bash
cp .env.example .env
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Set a unique `POSTGRES_PASSWORD` in the root `.env`. In `backend/.env`, set `DATABASE_URL` to use the same local database credentials, for example:

```dotenv
DATABASE_URL="postgresql://postgres:your-local-password@localhost:5433/pharmasense?schema=public"
```

Also replace `JWT_SECRET` with a unique random value and set `SEED_ADMIN_PASSWORD` to a unique password of at least 16 characters. These values are local development credentials; never reuse them in a deployed environment.

### 2. Start PostgreSQL and prepare the backend

```bash
docker compose up -d
cd backend
npm ci
npx prisma migrate deploy
npm run seed
npm run dev
```

The database is bound to `127.0.0.1:5433`. The seed is for local development only and refuses to run in production. It creates the local administrator `admin@pharmasense.local`; the password is the value in `SEED_ADMIN_PASSWORD`.

### 3. Start the frontend

In a second terminal, from the repository root:

```bash
cd frontend
npm ci
npm run dev
```

Open the Vite URL printed in the terminal. The default frontend API URL is `http://localhost:5000`; change `VITE_API_URL` in `frontend/.env` only if your API uses a different URL.

### 4. Confirm the local API

- `http://localhost:5000/health` should return an OK status and database status.
- Protected endpoints such as `http://localhost:5000/api/v1/medicines` should reject unauthenticated requests.
- Sign in using `admin@pharmasense.local` and your local `SEED_ADMIN_PASSWORD`.

## Validation

Run backend checks from `backend`:

```bash
npm run build
npm test
npm run db:quality
npm run db:reconcile
npm run research:validate
npm audit --omit=dev --audit-level=high
```

Run frontend checks from `frontend`:

```bash
npm run lint
npm run build
npm run test:e2e
npm audit --omit=dev --audit-level=high
```

The live PostgreSQL browser workflow uses a disposable database and separate `E2E_DATABASE_URL` and `E2E_ADMIN_PASSWORD` values:

```bash
npm run test:e2e:live
```

Do not point the live browser workflow or database quality tools at a database containing data you need to keep. See the [deployment runbook](docs/DEPLOYMENT_RUNBOOK.md) for the full rehearsal setup.

## Forecasting and model status

The project has three forecasting paths:

1. **Live advisory calculations:** the TypeScript API computes moving-average forecasts, demand risk, and replenishment suggestions from stock-out transactions and current inventory in PostgreSQL. These results are advisory and require human review.
2. **Live LightGBM inference:** the API loads the portable tree artifact at `backend/ml-artifacts/lightgbm_model.json` and runs the exported LightGBM trees in TypeScript. `GET /api/v1/reports/forecast-ml/predictions?medicineId={id}` predicts next-day demand from the medicine's last 30 full UTC days of stock OUT activity. It returns `INSUFFICIENT_HISTORY` when it cannot establish that history.
3. **LightGBM research benchmark:** Python scripts validate a dataset, profile its coverage, compare naive and moving-average baselines, select among regularized LightGBM candidates with rolling time-series validation, and write metrics and predictions under `research/results/`. The checked-in model was trained on synthetic demand. The live inference endpoint uses recent database transactions as inputs, but synthetic training means the result is a demonstration only and is not production-calibrated.

Run the research pipeline from the repository root:

```bash
python -m pip install -r research/requirements-ml.txt
cd backend
npm run research:demand
npm run research:validate
npm run research:evaluate
npm run research:ml
```

When the synthetic dataset is selected, training also refreshes the portable API artifact and its metric files under `backend/ml-artifacts/`. Redeploy the API after regenerating them. Operational model artifacts are deliberately not exported by the research script; releasing a model trained on operational data requires approval, representative evaluation, and a private governed release process. Model results must not be described as production accuracy without approved, representative operational history. Read the [data contract](research/data/DATA_CONTRACT.md), [forecasting roadmap](docs/PRODUCTION_FORECASTING_ROADMAP.md), and [ML governance workflow](docs/ML_GOVERNANCE_WORKFLOW.md) before using real or de-identified data.

## Deployment

### Recommended résumé-demo layout

- **Frontend:** Vercel, with the project root set to `frontend`.
- **API and database:** Render Blueprint from `render.yaml`, with the API and managed PostgreSQL in Singapore.
- **Domain:** add the frontend domain in Vercel and set the registrar DNS records Vercel provides.

The Render Blueprint provisions paid API and database plans so the API stays available and can use the database in the same region. `frontend/vercel.json` configures security headers, the API origin in the Content Security Policy, and one-year immutable caching for Vite's fingerprinted assets.

Set these deployment values:

| Provider | Setting | Value |
| --- | --- | --- |
| Vercel | Root directory | `frontend` |
| Vercel | Build command | `npm run build` |
| Vercel | Output directory | `dist` |
| Vercel | `VITE_API_URL` | `https://pharmasense-api.onrender.com` |
| Render | `FRONTEND_URLS` | Comma-separated production frontend origins, such as `https://example.com,https://www.example.com` |
| Render | Bootstrap admin values | Set once during initial setup; remove after the first admin is secured |

Render generates `JWT_SECRET` and `MFA_ENCRYPTION_KEY` from the Blueprint. Keep both stable and private. Do not scale the API above one instance while rate limiting is process-local. Follow the [deployment runbook](docs/DEPLOYMENT_RUNBOOK.md) for setup, first login, MFA enrollment, DNS, backups, and recovery.

### Free résumé preview

The frontend may use Vercel Hobby for a personal, non-commercial demo. A Render Free API sleeps after inactivity and takes longer to serve the first request after it wakes. Render Free PostgreSQL expires after 30 days, so use an external database such as Neon if you want a free database for a disposable demo. Monitor provider quotas and keep a separate export of any data you want to retain. Vercel Hobby terms may not fit commercial use.

## Security and data boundaries

- Keep all `.env` files, database URLs, signing keys, MFA encryption keys, and bootstrap credentials out of Git.
- Use unique high-entropy production secrets. A production `JWT_SECRET` must be at least 32 characters; keep the `MFA_ENCRYPTION_KEY` stable so enrolled authenticator secrets remain readable.
- Production requires MFA for all operational roles. Save recovery codes securely during enrollment.
- API authorization is authoritative; hiding a control in the frontend is not access control.
- Login and general request rate limits are process-local. Keep one API instance until a shared limiter is implemented.
- Never use real patient information in this portfolio project. Use synthetic or appropriately approved and de-identified data for research.
- Do not treat successful local builds or tests as proof of deployed uptime, backup recovery, security sign-off, or forecasting validity.

## Repository map

```text
backend/                 Express API, Prisma schema/migrations, tests and scripts
frontend/                React/Vite dashboard, browser tests and Vercel config
research/data/           Synthetic dataset and data contract
research/results/        Versioned evaluation metrics and benchmark outputs
docs/                    Deployment, security, release, forecasting and project docs
.github/workflows/       CI checks
docker-compose.yml        Local PostgreSQL service
render.yaml              Render API and database Blueprint
```

## Documentation

- [Project report](docs/PROJECT_REPORT.md)
- [Deployment runbook](docs/DEPLOYMENT_RUNBOOK.md)
- [Project completion plan and verification status](docs/PROJECT_COMPLETION_PLAN.md)
- [Backend API contracts](docs/BACKEND_API_CONTRACTS.md)
- [Database quality and reconciliation](docs/DATABASE_QUALITY.md)
- [Security review](docs/SECURITY_REVIEW.md) and [risk register](docs/SECURITY_RISK_REGISTER.md)
- [Release, recovery, and rollback checklist](docs/RELEASE_CHECKLIST.md)
- [Production sign-off](docs/PRODUCTION_SIGNOFF.md)
- [Forecasting plan](docs/ML_FORECASTING_PLAN.md), [data contract](research/data/DATA_CONTRACT.md), and [governance workflow](docs/ML_GOVERNANCE_WORKFLOW.md)
- [Frontend accessibility validation](docs/FRONTEND_UX_VALIDATION.md)

## Contribution workflow

The repository uses `develop` for integration and `master` for releases. Keep changes focused, run the relevant checks, and merge through pull requests with required CI checks and review.
