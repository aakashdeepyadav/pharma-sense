# PharmaSense Next Work Plan

## Phase 1: Governance and review flow

Goal: make the forecast output fully operational from a governance perspective.

Tasks:

- confirm the dashboard exposes forecast risk and replenishment recommendations clearly
- ensure every review decision is attached to audit logs and staff identity
- make the approval/dismiss flow visible in the operational report views
- keep the model advisory-only with no automatic stock changes

Priority: High

Status: Active

## Phase 2: Monitoring and drift checks

Goal: avoid model decay and silent business risk.

Tasks:

- define forecast quality thresholds for MAE and RMSE
- add drift checks for medicine demand and seasonal shifts
- create a monitoring report for medicines with rising risk
- flag low-confidence forecasts for manual review

Priority: High

Status: Complete

## Phase 3: Real-data readiness and business sign-off

Goal: move from synthetic/engineering confidence to acceptable operational evidence.

Tasks:

- review real or de-identified demand data requirements
- validate data contract and quality rules against live operational data
- confirm approved data retention and governance practices
- obtain business sign-off before production claim language is used

Priority: High

## Phase 4: Deployment and handoff

Goal: prepare the project for production handoff and team usage.

Tasks:

- finalize deployment runbook and environment values
- validate health checks and rollback process
- confirm role-based access and security baselines
- prepare release checklist and operational ownership assignments

Priority: Medium

Status: Active

## Current immediate execution

Continue with Phase 4: deployment and handoff.

This will include:

- confirming the final release rehearsal evidence from the local environment
- recording operational ownership and live deployment boundaries
- checking environment secret handling and rollback plans
- finalising sign-off materials for team handoff and production release approval

## Delivery rhythm

- small working increments
- validate after each step
- keep the model advisory and auditable
- no automatic purchase action from forecast output

## Success conditions

The project is considered ready for the next level when:

- human review is enforced before action
- forecast output is visible and explainable
- audit records are complete and traceable
- monitoring thresholds are defined and reviewed
- the model is not used as an autonomous decision engine
