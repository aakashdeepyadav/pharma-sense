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
4. Leave final purchase action to a human approver.

## 6. Current Implementation Status

### Completed and working

- inventory management operations
- auth and role checks
- stock transaction logic
- alerts for stock and expiry risk
- report APIs for forecast baseline and replenishment guidance
- fleet of background validation and readiness checks
- ML research pipeline and evaluation metrics
- generated training dataset for full model training

### In progress or not yet full production

- real operational demand dataset from live business data
- model-to-alert integration at the product level
- forecast-driven alert rules
- approval workflow for purchase actions
- monitoring, drift checks, retraining, and governance workflow

## 7. Verified Results

The following checks were run and passed in the current workspace:

### Backend validation

Command:

```bash
cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense\backend"
npm test
```

Result:

- 28 tests passed
- 0 failed

### Frontend build validation

Command:

```bash
cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense\frontend"
npm run build
```

Result:

- successful production build
- Vite compile completed successfully

### Forecast readiness validation

Command:

```bash
cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense\backend"
npm run research:readiness
```

Result:

- production_ready: true
- dataset passed minimum data-quality and coverage gates

### Forecast model validation

Command:

```bash
cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense\backend"
npm run research:ml
```

Result:

- MAE: 1.3775
- RMSE: 2.0038
- model trained successfully on the full generated demand dataset
- forecast output generated

## 8. Result Interpretation

The project is in a strong engineering state for:

- product operations
- business inventory control
- forecasting research
- alert and replenishment support

The project is not yet a fully autonomous, live, pharma-grade prediction system because the remaining gap is the operational decision loop:

- approved live data feed
- model-supported alerting
- approval workflow
- human-in-the-loop purchase decisions
- formal monitoring and governance

## 9. Critical Risks and Gaps

1. Forecast output is still advisory and cannot be treated as an automatic operational action.
2. Real operational data must be approved before production claims are made.
3. Forecast-based alerts need a governance layer before being used in critical decisions.
4. The model needs monitoring for drift, lead-time changes, and new medicine behavior.
5. Product-level workflow integration still needs to be completed for end-user forecasting dashboards.

## 10. Recommended Next Phase

The next working phase should focus on the operational decision loop:

1. connect forecast output to the operational API
2. create forecast risk alert types
3. add human-approved replenishment recommendations
4. expose them in the UI
5. add monitoring, versioning, and drift checks
6. validate with production-style review before purchase automation is considered

## 11. Final Assessment

PharmaSense is already a credible operational inventory platform with a strong early-stage forecasting and replenishment research layer. The project is no longer just a prototype; it is a functioning inventory system with a valid ML research pipeline. The remaining work is not about basic features anymore — it is about connecting the forecasting intelligence to a reviewable, safe, and production-ready operational workflow.

This is the correct path for a responsible full system rollout: product first, forecasting second, governed action last.
