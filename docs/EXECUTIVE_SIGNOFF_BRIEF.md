# PharmaSense Executive Sign-off Brief

## Project purpose

PharmaSense is a medicine inventory and replenishment platform designed for operational visibility, controlled stock movement, and human-reviewed decision support. The system is intended to improve medicine availability and operational discipline without allowing forecasting to trigger autonomous purchasing decisions.

## What the product does

- tracks inventory and batch-level stock movements
- supports medicine, supplier, category, and purchase workflows
- enforces role-based access and auditability
- provides low-stock and expiry alerts
- exposes forecast risk and replenishment recommendations
- stores every review decision with the acting user and decision context

## Model and forecasting approach

The selected forecasting baseline is LightGBM, chosen for its strong performance on tabular demand patterns with time-based features such as:

- rolling demand averages
- lagged demand values
- day-of-week and month effects
- medicine-level demand history

The model output is advisory. It is not used as an autonomous stock-order trigger. In practice, the workflow is:

1. generate demand evidence
2. assess forecast risk and coverage
3. show recommendations to an authorized operator
4. require explicit review approval or dismissal
5. record the final decision with audit evidence

## Governance model

The system is designed around controlled usage and clear accountability:

- forecasts are read-only unless a human approves a replenishment action
- every replenishment decision is persisted with user attribution
- audit logs are restricted to management roles
- model quality is monitored with thresholds and human review gates
- synthetic data is explicitly separated from production evidence

## Verified evidence

Local verification recorded on 2026-10-20 passed:

- backend build, Prisma schema validation, and all 41 backend tests
- frontend lint, production build, and all 15 mocked browser tests
- MFA enrollment, TOTP replay protection, one-time recovery, and migration integration against a disposable PostgreSQL schema
- one live browser workflow against an isolated disposable PostgreSQL database
- database quality with 0 errors or warnings and stock reconciliation with 0 discrepancies
- local browser dashboard smoke and zero high-severity production dependency audit findings
- Render Blueprint YAML syntax parsing

The Render CLI schema validator and an actual Render account deployment have
not been run. Forecasting remains research/advisory; synthetic-data metrics are
not evidence of production forecasting performance.

## Operational risk position

The current implementation is prepared for a controlled Render pilot. Before
operational inventory use, the following gates remain:

- deploy the Blueprint and verify service health and database privacy
- verify MFA enrollment and recovery for every operational account on the deployed target
- configure monitoring and rehearse backup restoration
- assign role approval and release ownership
- complete release and rollback rehearsal

This remains an advisory platform, not an autonomous replenishment engine.

## Executive recommendation

Proceed with a controlled pilot deployment, subject to the open production
gates, with the following design policy:

- keep forecasting advisory and auditable
- require human sign-off before any replenishment action is executed
- continue monitoring model performance on real operational demand
- maintain a documented rollback and release process

## Decision statement

The codebase and Render deployment configuration are ready for a controlled
pilot. Production operational use is not approved until deployed MFA recovery, backup/restore,
monitoring, and release sign-off are verified. Forecasting remains advisory;
the system does not automate procurement.
