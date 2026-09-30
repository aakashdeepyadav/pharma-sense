# PharmaSense Team Handover Plan

## Purpose

PharmaSense is a six-member capstone project. The project leader owns architecture, integration, release decisions, and the final demo. The other five members each own a meaningful workstream with a clear deliverable, review responsibility, and acceptance criteria.

The team should work through `feature/*` branches, merge completed work into `develop` through pull requests, and keep `master` release-ready. Every contribution must include validation evidence and documentation where relevant.

## Team Structure

### Project Leader and Integration Owner

**Primary responsibility:** architecture, backlog, integration, security decisions, code review, release coordination, and final delivery.

The leader owns:

- Final API and data contracts.
- Cross-module integration and conflict resolution.
- Review and merge decisions.
- Release notes, milestone status, and final presentation.
- High-risk authentication, authorization, and transaction decisions.

The leader should not implement every task alone. Each member must own and demonstrate their assigned workstream.

## How Every Member Should Work

1. Pull the latest `develop` branch and confirm the application starts before editing.
2. Create the assigned branch from `develop`, for example `git switch -c feature/frontend-ux`.
3. Read the relevant existing route, component, test, and documentation before changing code.
4. Make one focused change at a time. Do not mix unrelated formatting or refactoring into the feature.
5. Run the smallest relevant check after the first edit, then run the full checks before opening a pull request.
6. Commit with a clear human message such as `add purchase smoke tests`.
7. Push the branch and open a pull request into `develop`.
8. In the pull request, explain what changed, how it was tested, migration impact, security impact, and known limitations.
9. Demonstrate the workflow to the leader or reviewer using a short script, screenshots, test output, or a result file.

### Standard setup

```bash
docker compose up -d
cd backend
npm install
npx prisma migrate deploy
npm run seed
npm run dev
```

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

### Standard validation

```bash
cd backend
npm run build
npm test
npm run research:validate

cd ../frontend
npm run lint
npm run build
```

Do not commit `backend/.env`, frontend environment files containing secrets, database dumps, or generated confidential data.

## Member 1: Frontend and User Experience

**Branch:** `feature/frontend-ux`

**Mission:** make the operator dashboard complete, accessible, and easy to use.

**How to do it:** start in `frontend/src/App.tsx`, `frontend/src/api.ts`, and the existing Vite configuration. Test the real API with the seeded admin account and at least one restricted role. Use browser developer tools to check network failures, keyboard focus, narrow widths, and console errors.

**Tasks:**

- Finish responsive layouts for desktop and tablet screens.
- Add clear loading, empty, success, and API-error states to every dashboard workflow.
- Improve keyboard navigation, labels, focus states, contrast, and screen-reader text.
- Complete frontend support for medicine details, categories, suppliers, purchases, alerts, audit logs, and reports.
- Add frontend tests or browser checks for login, create medicine, receive purchase, issue stock, and acknowledge alert.
- Confirm the dashboard uses `VITE_API_URL` and does not contain environment-specific URLs.

**Deliverables:**

- Updated React components and styles.
- A short accessibility and responsive testing record.
- Browser or component test evidence.
- Screenshots or a short demo script for the final presentation.

**Acceptance criteria:**

- A user can complete the main inventory workflow without console errors.
- Forms work with keyboard-only navigation.
- Mobile or narrow-width layouts do not overlap or hide controls.
- API failures show useful recovery messages.

## Member 2: Backend API and Inventory Operations

**Branch:** `feature/backend-operations`

**Mission:** strengthen API completeness, validation, and inventory workflows.

**How to do it:** start in `backend/src/routes`, `backend/src/validation/schemas.ts`, and `backend/src/server.test.ts`. For every endpoint, write down the allowed roles, input schema, success response, error responses, transaction boundary, and audit event before editing. Use non-destructive tests when possible and clean up any data created by a test.

**Tasks:**

- Complete supplier search and filtering.
- Review all medicine, supplier, category, batch, purchase, alert, and report endpoints for consistent status codes.
- Improve structured error responses while preserving existing client behavior.
- Add logout/session invalidation design or document the JWT limitation and approved mitigation.
- Add API integration tests for purchase receiving, duplicate batches, insufficient stock, expired stock, and role restrictions.
- Review transaction boundaries and audit coverage for every operational write.

**Deliverables:**

- Backend route/service changes.
- Zod validation updates.
- Integration tests with clear setup and cleanup behavior.
- API endpoint notes or contract examples.

**Acceptance criteria:**

- Invalid input returns a clear 400 response.
- Unauthorized and forbidden requests are distinguished correctly.
- Duplicate and insufficient-stock operations never partially update inventory.
- Every sensitive write is traceable to a user and timestamp.

## Member 3: Database, Data Quality, and Reconciliation

**Branch:** `feature/database-quality`

**Mission:** protect data integrity and make operational data reliable for reporting and forecasting.

**How to do it:** start in `backend/prisma/schema.prisma`, `backend/prisma/migrations`, `backend/src/scripts`, and `research/data`. Apply migrations to a disposable database, inspect the generated SQL, and compare database quantities with the transaction ledger before proposing repairs. Never silently modify production-like data from a reconciliation report.

**Tasks:**

- Review Prisma schema constraints, indexes, money types, date rules, and foreign keys.
- Build a stock reconciliation command that compares batch quantities with stock transactions.
- Add migration validation and disposable test-database instructions.
- Review seed data so the demo covers medicines, suppliers, batches, alerts, purchases, and stock movements without using confidential data.
- Add data-quality checks for missing dates, duplicate batches, negative quantities, invalid prices, and expired records.
- Document backup, restore, retention, and development-data rules.

**Deliverables:**

- Prisma migrations and schema review notes.
- Reconciliation script or report.
- Data-quality test results.
- Updated database and seed documentation.

**Acceptance criteria:**

- A migration can be applied from a clean database.
- Reconciliation identifies quantity mismatches without modifying data automatically.
- Money and quantity constraints are enforced by validation and persistence.
- No patient data, credentials, or raw confidential exports are committed.

## Member 4: ML, Forecasting, and Research Data

**Branch:** `feature/forecasting-research`

**Mission:** maintain a reproducible, evidence-based forecasting workstream that remains separate from operational inventory.

**How to do it:** start in `research/data/DATA_CONTRACT.md`, `backend/src/domain/forecasting.ts`, and `backend/src/scripts`. Run the deterministic generator and evaluator, preserve result artifacts, record the date range and split strategy, and label every result as synthetic until an approved real or de-identified dataset exists.

**Tasks:**

- Maintain the approved demand data contract.
- Keep synthetic data generation deterministic and clearly labelled.
- Improve baseline evaluation with naive and moving-average comparisons.
- Add documented metrics such as MAE, RMSE, bias, zero-demand behavior, and chronological train/test coverage.
- Produce a readiness report that states whether the dataset is sufficient for a forecast.
- Define the requirements for an approved real or de-identified dataset without collecting confidential data.
- Expose only read-only forecast results and clearly label synthetic or experimental output.

**Deliverables:**

- Research scripts and reproducible result files.
- Dataset quality report.
- Short limitations and bias report.
- Forecast API or contract proposal, if the data is ready.

**Acceptance criteria:**

- No synthetic data is mixed into operational inventory.
- Time-series evaluation never randomly shuffles observations.
- Results include dataset scope, model version, and limitations.
- No production claim is made from synthetic-only experiments.

## Member 5: DevOps, Security, and Quality Assurance

**Branch:** `feature/devops-security`

**Mission:** make the project reproducible, reviewable, and safer to demonstrate or deploy.

**How to do it:** start in `.github/workflows/ci.yml`, `docker-compose.yml`, `.env.example` files, and the security notes in `README.md`. Test the setup from a clean terminal or disposable database, verify that migrations and seed scripts work, and inspect CI output rather than relying only on local success.

**Tasks:**

- Maintain GitHub Actions CI for migrations, backend tests, research validation, frontend lint, and frontend build.
- Add a staging or local production-like runbook using Docker and environment templates.
- Review CORS, request limits, security headers, login throttling, secret handling, and dependency updates.
- Add smoke tests for health, authentication, protected routes, and the main inventory workflow.
- Create a release checklist and rollback checklist.
- Review the repository for accidentally committed credentials, generated artifacts, or confidential data.
- Record known risks and unresolved limitations in a risk register.

**Deliverables:**

- CI workflow updates.
- Deployment/rehearsal instructions.
- Security review checklist and risk register.
- Smoke-test report and release checklist.

**Acceptance criteria:**

- A new contributor can run the documented setup successfully.
- CI fails when builds, tests, migrations, or lint checks fail.
- Secrets are provided through environment configuration, never committed.
- The health endpoint and protected API smoke tests pass in a clean environment.

## Shared Working Rules

1. Create a focused branch from `develop` before starting work.
2. Use small commits with human-readable messages, for example `add purchase smoke tests`.
3. Open a pull request into `develop` when the workstream acceptance criteria are met.
4. Include validation commands, migration impact, security impact, and screenshots where relevant.
5. Do not change another member's workstream without coordination.
6. Rebase or merge from `develop` before final review when practical.
7. Never commit passwords, tokens, raw database dumps, patient data, or confidential exports.
8. The project leader reviews integration risk and merges only after CI passes.

## Weekly Handover Format

Each member reports:

- Completed work.
- Branch and pull request link.
- Tests or checks run.
- Screenshots, result files, or documentation produced.
- Known limitations.
- The next small task.

## Definition of Done for a Member Task

A task is complete only when the implementation, tests, documentation, and handoff evidence are present. A verbal claim or an unpushed local change is not considered a contribution.
