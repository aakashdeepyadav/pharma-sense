# PharmaSense Project Report

## 1. Executive Summary

PharmaSense is a medicine inventory and decision-support system designed for pharmacies and healthcare inventory teams. The project combines operational stock management, alerting, auditability, and a forecasting pipeline that can support replenishment planning without allowing model output to trigger purchases automatically.

The project has a complete, locally verified inventory workflow spanning authentication, role-based access, medicine and supplier management, receiving and issuing, purchases, alerts, reporting, audit history, and human-reviewed replenishment decisions. Authenticator MFA is implemented and required by the Render Blueprint. Production hosting, deployed MFA recovery rehearsal, backup/restore, and forecasting validation with representative operational data remain open.

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

### Remaining before production use

- business approval of production data use and forecasting claims
- production hosting, backup ownership, and deployment/rollback rehearsal
- ongoing ownership for forecast quality review and model retraining

## 7. Verified Results

The latest local verification was recorded on 2026-10-20:

- Backend TypeScript build, Prisma schema validation, and all 41 tests passed.
- Frontend lint and production build passed; all 15 mocked Playwright tests passed.
- MFA migration, enrollment, replay rejection, and single-use recovery passed on a temporary PostgreSQL schema, which was removed afterward.
- One live Playwright workflow passed against an isolated disposable PostgreSQL database; the temporary database was removed.
- Database quality reported 0 errors and warnings; stock reconciliation reported 0 discrepancies. Both checks were read-only.
- Backend and frontend production dependency audits reported 0 vulnerabilities.
- The Render Blueprint YAML syntax parses; Render CLI validation and hosted deployment remain unverified.

## 8. Result Interpretation

The local application and automated verification are complete for the tested scope. The project is prepared for a controlled Render pilot, while production use still depends on:

- product operations
- business inventory control
- forecasting research
- alert and replenishment support

The system is deliberately not an autonomous prediction system. Its operational
review loop is implemented, while production use still depends on:

- explicit business approval of the data and forecasting claims
- actual deployment, backup/restore, ownership, and rollback readiness
- deployed MFA enrollment/recovery verification before operational inventory use
- continued human review of all replenishment recommendations

## 9. Critical Risks and Gaps

1. Forecast output is still advisory and cannot be treated as an automatic operational action.
2. Real operational data must be approved before production claims are made.
3. Forecast metrics require ongoing review against approved operational data.
4. Model drift, lead-time changes, and new medicine behavior need assigned operational owners.
5. Production rollout remains gated on the release checklist and business sign-off.

## 10. Recommended Next Phase

The remaining release work is deployment and handoff:

1. run the migration and full release checks in a disposable environment
2. assign database, backup, secret, access-review, and rollback owners
3. obtain explicit business approval for data usage and pilot claims
4. keep forecast recommendations advisory and human-reviewed

## 11. Final Assessment

PharmaSense has a functioning inventory system, forecasting and replenishment guidance, and a shared, auditable human review workflow. The remaining release work is organizational and operational: production data approval, hosting and recovery ownership, and a rehearsed deployment with explicit sign-off.

This is the correct path for a responsible full system rollout: product first, forecasting second, governed action last.
