# PharmaSense Project Report

## 1. Executive Summary

PharmaSense is a medicine inventory and decision-support system designed for pharmacies and healthcare inventory teams. The project combines operational stock management, alerting, auditability, and a forecasting pipeline that can support replenishment planning without allowing model output to trigger purchases automatically.

The project has reached a solid MVP stage with validated inventory management workflows, an alerting layer, and a working ML forecasting baseline. The current implementation is strongest in product operations and data governance. The remaining work is the operational bridge from forecast output to business-approved actions, which should remain human-reviewed and auditable.

## 2. Project Objective

The main business objective is to reduce stockouts, expiry issues, and overstock risk while keeping inventory operations transparent and safe. The system supports:

- medicine master data management
- batch and supplier tracking
- stock receiving, issuing, and adjustments
- alert generation for low stock, expiry, and stockouts
- demand forecasting and replenishment guidance
- human approval before business actions are taken

## 3. Scope of the Current System

### Product foundation

The core operational system includes:

- JWT-based authentication and role-aware access control
- medicine, category, supplier, and batch management
- stock receiving and issuing workflows
- purchase receiving and ledger-based stock tracking
- expiry-aware inventory rules
- low-stock, out-of-stock, expired, and expiring-soon alerts
- audit logging for significant writes
- dashboard reporting and inventory status views

### Forecasting foundation

The project also includes a research and forecasting layer that is built to be production-aware:

- structured dataset validation
- time-based split logic
- feature engineering with lag and rolling-window demand variables
- LightGBM baseline training
- data readiness gate before using operational data for forecasting
- synthetic fallback mode when operational history is insufficient

### Governance and safety rules

The system intentionally keeps an operational boundary between:

- operational inventory data
- research/forecasting data
- production decisions vs. model suggestions

This is important because model output is treated as advisory evidence, not as an automatic purchase trigger.

## 4. Architecture

### Operational layer

- Backend: Node.js + TypeScript + Express
- Database: PostgreSQL + Prisma
- Auth: JWT with role checks
- Domain rules: stock validation, replenishment logic, forecasting evaluation

### Research and ML layer

- Python scripts
- pandas, scikit-learn, LightGBM
- dataset validation and feature building
- model training and metric export

### Frontend layer

- React + Vite + TypeScript
- inventory dashboard and management UI
- alert visibility and user interaction flows

## 5. Workflow Implemented

### 5.1 Product workflow

1. Staff or manager signs in with role-based access.
2. Medicines, batches, suppliers, and purchases are created or managed.
3. Stock is received or issued through validated API flows.
4. Alert generation checks stock and expiry conditions.
5. Audit logs capture inventory and user actions.
6. Report endpoints provide operational and replenishment context.

### 5.2 Forecasting workflow

1. Validate the demand dataset.
2. Check operational data sufficiency.
3. Use synthetic fallback only when operational data is too short.
4. Engineer lag and rolling-window demand features.
5. Split by time rather than random sampling.
6. Train the LightGBM model.
7. Evaluate MAE and RMSE.
8. Save prediction and metrics outputs.
9. Treat forecast output as read-only guidance.

### 5.3 Replenishment guidance workflow

1. Estimate average demand from historical OUT transactions.
2. Calculate reorder pressure using reorder level and current stock.
3. Recommend replenishment only as a draft decision.
4. Store the latest approval/dismissal decision per medicine so reviewers share the same status.
5. Record each decision with its authenticated reviewer in the audit trail; decisions never create purchases or change stock.

## 6. Current Implementation Status

### Completed and working

- inventory management operations
- auth and role checks
- stock transaction logic
- alerts for stock and expiry risk
- report APIs for forecast baseline and replenishment guidance
- shared replenishment review state with reviewer attribution and transactional audit records
- dashboard review status showing who made the latest decision
- fleet of background validation and readiness checks
- ML research pipeline and evaluation metrics

### In progress or not yet full production

- business approval of production data use and forecasting claims
- production hosting, backup ownership, and deployment/rollback rehearsal
- ongoing ownership for forecast quality review and model retraining

## 7. Verified Results

The following checks were run and passed during the current implementation:

### Backend validation

Command:

```bash
cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense\backend"
npm run build
npx prisma validate
npx tsx --test src/domain/stockRules.test.ts src/domain/reconciliation.test.ts src/domain/dataQuality.test.ts src/validation/schemas.test.ts src/domain/forecasting.test.ts src/domain/replenishment.test.ts
```

Result:

- TypeScript build passed and Prisma schema validation passed
- all 10 database-independent backend tests passed
- 0 failed

### Frontend validation

Command:

```bash
cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense\frontend"
npm run lint
npm run build
npm run test:e2e
```

Result:

- lint completed with one existing React state-in-effect warning in the forecast selector
- production build succeeded
- all 10 browser tests passed, including review-state persistence across reloads

The full backend `npm test` run and `npx prisma migrate deploy` could not be
completed because the configured PostgreSQL endpoint at `localhost:5433` was
unavailable; the Docker daemon was also unavailable. The API integration test
for database-backed decision persistence therefore has not run against a live
database. Live PostgreSQL browser tests, database quality/reconciliation, and
research/model retraining were not run as part of this implementation.

## 8. Result Interpretation

The project is in a strong engineering state for:

- product operations
- business inventory control
- forecasting research
- alert and replenishment support

The system is deliberately not an autonomous prediction system. Its operational
review loop is implemented, while production use still depends on:

- explicit business approval of the data and forecasting claims
- production hosting, backup, ownership, and rollback readiness
- continued human review of all replenishment recommendations

## 9. Critical Risks and Gaps

1. Forecast output is still advisory and cannot be treated as an automatic operational action.
2. Real operational data must be approved before production claims are made.
3. Forecast metrics require ongoing review against approved operational data.
4. Model drift, lead-time changes, and new medicine behavior need assigned operational owners.
5. Production rollout remains gated on the release checklist and business sign-off.

## 10. Recommended Next Phase

The next working phase is deployment and handoff:

1. run the migration and full release checks in a disposable environment
2. assign database, backup, secret, access-review, and rollback owners
3. obtain explicit business approval for data usage and pilot claims
4. keep forecast recommendations advisory and human-reviewed

## 11. Final Assessment

PharmaSense has a functioning inventory system, forecasting and replenishment guidance, and a shared, auditable human review workflow. The remaining release work is organizational and operational: production data approval, hosting and recovery ownership, and a rehearsed deployment with explicit sign-off.

This is the correct path for a responsible full system rollout: product first, forecasting second, governed action last.
