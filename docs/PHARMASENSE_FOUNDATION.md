# PharmaSense Master Project Foundation

**Formal title:** Agent-Based Medicine Stock Management System
**Project type:** AI-powered pharmaceutical inventory management and decision-support system
**Document status:** Baseline architecture and implementation status
**Version:** 0.2
**Date:** 2026-09-30

## How to use this document

This document is the working contract for the six-member team. It defines what the first release is, what is deliberately postponed, who owns each workstream, and how the current repository will be advanced.

The repository began as an early prototype. The current implementation has moved beyond that baseline:

- PostgreSQL is available through `docker-compose.yml`.
- Prisma already models users, roles, categories, medicines, suppliers, batches, and stock transactions.
- The backend now uses protected, validated routes for inventory, purchases, alerts, reports, and audit logs.
- The frontend dashboard reads live API data and supports medicine, category, supplier, batch, purchase, and stock workflows.
- Authentication, validation, authorization, purchase receiving, alerts, audit logging, migrations, CI, baseline tests, a read-only replenishment recommendation, and paginated list API hardening are implemented; production deployment and advanced AI features remain open.

The core MVP is released as `v0.1.0`. The current implementation extends it with read-only replenishment recommendations, paginated list responses, structured validation errors, persisted token revocation, route-scoped request throttling, and optional-barcode normalization. Local validation includes backend build/tests, frontend lint/build, research validation, five mocked Playwright login/role tests, and a live browser workflow against an isolated PostgreSQL database covering login through stock issue, audit verification, insufficient-stock rejection, and expired-batch rejection. The research validator reports warnings because the dataset is synthetic and does not model stockout censoring or organization groups.

Production readiness is not complete. Browser coverage for purchase receiving, alert acknowledgement, and the remaining responsive/accessibility review, user/role administration, shared token-revocation and rate-limit state, approved operational demand data, human-approved replenishment, and a deployment/backup-restore rehearsal remain open. Camera/mobile scanning, advanced forecasting, and AI agents remain later phases.

## A. Executive Summary

PharmaSense is a web-based inventory management and decision-support platform for pharmacies, hospital pharmacies, clinics, medical stores, and pharmacy chains. It manages medicine master data, batches, suppliers, purchases, stock movements, expiry, and operational alerts.

The system must remain useful without ML or an LLM. Rule-based inventory functions are the product foundation. Later services may analyze reliable historical transactions to forecast demand, estimate stockout risk, and recommend replenishment. Recommendations require review and approval by an authorized human; agents must not place purchases autonomously.

The first delivery target is a secure, testable MVP with a React web client, an Express REST API, PostgreSQL, Prisma migrations, JWT authentication, role-based authorization, and auditable stock operations.

## B. Problem Statement

Inventory operators often rely on spreadsheets or manual processes that make it difficult to know the quantity and expiry status of each batch. This creates avoidable stockouts, overstock, expiry waste, weak purchase visibility, and slow decision-making.

PharmaSense centralizes operational data and presents timely, explainable information. It supports inventory decisions; it does not prescribe medicines, diagnose patients, or replace a pharmacist's professional judgment.

## C. Target Users

| User              | Primary needs                                       |
| ----------------- | --------------------------------------------------- |
| Administrator     | Users, roles, configuration, audit visibility       |
| Pharmacist        | Medicine, batch, expiry, and stock operations       |
| Inventory Manager | Stock health, purchases, alerts, reports, approvals |
| Staff             | Authorized receiving, issuing, and lookup workflows |
| Management        | Read-only summaries and approved recommendations    |

The tenant boundary for the MVP is one organization per deployment. Multi-tenant SaaS isolation is postponed until the single-organization workflow is reliable.

## D. Objectives

1. Maintain accurate medicine, batch, supplier, and stock records.
2. Make every stock change traceable to a user, time, reason, and source operation.
3. Detect low stock, out of stock, expired, and expiring-soon conditions using deterministic rules.
4. Provide a consistent REST API and usable operator dashboard.
5. Protect credentials and restrict actions by role.
6. Produce a clean transaction history suitable for later analytics.
7. Add forecasting and agentic recommendations only after data quality and baseline metrics are established.
8. Support reproducible development, review, testing, and deployment for a six-member team.

## E. Functional Requirements

### MVP functional requirements

- Authenticate users with login and logout behavior; issue short-lived JWT access tokens and support revocation/session invalidation.
- Authorize actions for Admin, Pharmacist, Inventory Manager, and Staff roles.
- Create, read, update, search, and filter medicines.
- Store generic name, brand name, category, manufacturer, dosage/form, unit, reorder level, barcode, and active status.
- Create, read, update, and search categories and suppliers.
- Maintain separate medicine and batch entities.
- Store batch number, medicine, supplier, manufacturing date, expiry date, quantity, purchase price, and selling price.
- Record stock IN, stock OUT, and approved adjustments as immutable transaction records.
- Derive or safely update current batch quantity within a database transaction.
- Create purchases and purchase items; receiving a purchase creates or updates batches and records stock IN.
- Show current stock by medicine and batch, with FEFO-friendly expiry ordering.
- Generate rule-based low-stock, out-of-stock, expired, and expiring-soon alerts.
- Allow authorized users to acknowledge or resolve alerts without deleting their history.
- Provide inventory, supplier, purchase, transaction, and alert history.
- Expose health checks and consistent API error responses.

### Explicitly out of MVP

- Automatic purchasing.
- Medical advice or patient records.
- LLM chat as a primary workflow.
- Complex forecasting models.
- Mobile application and camera scanning.
- Multi-organization tenancy.
- Payment, insurance, or external pharmacy-system integration.

## F. Non-Functional Requirements

- **Correctness:** stock changes use atomic database transactions and reject negative quantities.
- **Security:** hashed passwords, validated input, least privilege, secure secrets, audit records, request throttling, and protected production transport.
- **Availability:** core inventory remains operational if ML or agent services are down.
- **Performance:** normal list and transaction operations should return within 500 ms in the local MVP dataset; measure rather than promise a production SLA.
- **Maintainability:** modular routes/services, Prisma migrations, typed request/response contracts, and documented decisions.
- **Usability:** common stock operations require few steps and show clear success/error states.
- **Observability:** structured server logs, request correlation where practical, health endpoint, and error monitoring before production.
- **Testability:** unit tests for business rules, API integration tests for critical workflows, and a repeatable local environment.
- **Data integrity:** foreign keys, unique constraints, date checks, decimal money types, and controlled status/type values.
- **Accessibility:** keyboard-operable forms, labels, readable contrast, and meaningful error messages.

## G. System Architecture

```text
React + Vite + TypeScript
          |
          | HTTPS / JSON REST API
          v
Express + TypeScript API
  auth | medicines | suppliers | purchases
  inventory | alerts | reports | audit
          |
          v
PostgreSQL via Prisma
          |
          +--> Optional Python ML service (later)
          |
          +--> Optional agent service (later)
```

The API is the authority for inventory state. The frontend never directly writes to PostgreSQL, and its forms are now aligned with the API's structured validation envelope and paginated list responses. ML and agent services consume approved API/data contracts and return predictions or recommendations; they do not mutate stock directly.

Recommended backend layers:

1. Routes: HTTP concerns, authentication middleware, status codes.
2. Validation: Zod schemas for request and query data.
3. Services: stock, purchases, alerts, authentication, and recommendation rules.
4. Persistence: Prisma access and transactions.
5. Shared contracts: documented JSON shapes and error codes.

Do not split into microservices until deployment, ownership, and operational value justify it. The initial API should be a modular monolith.

## H. Detailed Data Flow

### Receiving stock

1. Staff or pharmacist submits a purchase and its items.
2. API authenticates the user and checks the receiving permission.
3. Validation checks identifiers, dates, prices, quantities, and duplicate batch rules.
4. A database transaction creates the purchase, purchase items, batch records, and stock IN transactions.
5. The API commits or rolls back the complete operation.
6. Alert rules are recalculated for affected medicines.
7. The frontend refreshes inventory and purchase history.

### Issuing stock

1. Authorized user selects a medicine and batch, preferably using FEFO ordering.
2. API validates available quantity and rejects expired or insufficient stock according to policy.
3. A transaction creates a stock OUT record and decrements the batch quantity.
4. The operation is recorded in the audit log.
5. Low-stock and out-of-stock rules are evaluated.

### Recommendation flow later

```text
Transactions -> cleaned dataset -> baseline forecast -> stockout risk
             -> replenishment recommendation -> human review -> approved action
```

No recommendation changes inventory or creates a purchase without explicit authorization.

## I. Database / ER Design

### MVP entities

- `User` belongs to one `Role`.
- `Role` has users and permission definitions.
- `Category` has many `Medicine` records.
- `Medicine` has many `Batch` records and many purchase items through purchases.
- `Supplier` has many purchases and batches.
- `Purchase` belongs to a supplier and creator; it has many `PurchaseItem` records.
- `PurchaseItem` references a medicine and the received batch details.
- `Batch` belongs to one medicine and supplier; it has stock transactions.
- `StockTransaction` references a batch and user and records IN, OUT, or ADJUSTMENT.
- `Alert` references a medicine and optionally a batch; it has status and timestamps.
- `AuditLog` records sensitive changes and approval events.

### Required schema corrections before MVP

- `sellingPrice` is implemented on `Batch` and purchase receiving items.
- Manufacturer, dosage/form, barcode, and active status are implemented for `Medicine`.
- `Purchase`, `PurchaseItem`, `Alert`, and `AuditLog` models are implemented.
- Prefer enums for role, transaction type, purchase status, alert type, and alert status.
- Use `Decimal` for money instead of floating point. Purchase and selling prices now use `Decimal(12,2)`.
- The `(medicineId, batchNumber)` batch uniqueness constraint is implemented; supplier contact uniqueness remains a future data-policy decision.
- Add checks for positive quantities, non-negative prices, expiry after manufacturing date, and valid dates.
- Add indexes for medicine search fields, batch expiry, batch medicine, transaction timestamp, and alert status/type.
- Decide whether quantity is a maintained projection or calculated from transactions. For the MVP, maintain `Batch.quantity` inside the same transaction as every stock transaction and periodically reconcile it from the ledger.
- Replace `Role.permissions String` with a controlled permission model or a typed permission representation; do not parse arbitrary free text for authorization.

### Migration policy

Use committed Prisma migrations rather than relying on `db push` after the initial prototype. Development data must be disposable and seeded only through a documented development seed script. Production migrations must be reviewed and backed up.

## J. API Architecture

Base path: `/api/v1`.

### Core endpoints

| Area       | Endpoints                                                                       |
| ---------- | ------------------------------------------------------------------------------- |
| Auth       | `POST /auth/login`, `POST /auth/logout`, `GET /auth/me`                         |
| Medicines  | `GET/POST /medicines`, `GET/PATCH /medicines/:id`, search/barcode filters       |
| Categories | `GET/POST /categories`, `PATCH /categories/:id`                                 |
| Suppliers  | `GET/POST /suppliers`, `GET/PATCH /suppliers/:id`                               |
| Batches    | `GET/POST /batches`, `GET/PATCH /batches/:id`                                   |
| Purchases  | `GET/POST /purchases`, `GET /purchases/:id`, `POST /purchases/:id/receive`      |
| Inventory  | `GET /inventory`, `POST /inventory/transactions`, `GET /inventory/transactions` |
| Alerts     | `GET /alerts`, `POST /alerts/:id/acknowledge`                                   |
| Audit      | `GET /audit-logs` for authorized administrators                                 |
| System     | `GET /health`                                                                   |

All endpoints should use a consistent envelope, for example `{ data, meta }` on success and `{ error: { code, message, details } }` on failure. The medicine and supplier list endpoints now include validated pagination metadata and structured validation error responses, and the remaining routes can follow the same contract as the dataset grows.

Every write endpoint must define its permission, validation schema, transaction boundary, and audit behavior. Avoid exposing raw Prisma errors to clients.

## K. AI/ML Architecture

ML is a later service, written in Python/FastAPI only after transaction data is sufficient.

1. Establish data definitions: demand means completed stock OUT quantity, with returns and adjustments handled explicitly.
2. Build a reproducible extraction and cleaning job.
3. Start with naive and moving-average forecasts.
4. Compare models using time-based backtesting, not random train/test splitting.
5. Evaluate MAE, RMSE, weighted error, service-level impact, and forecast bias.
6. Add stockout risk features such as current stock, usage rate, lead time, supplier reliability, and expiry constraints.
7. Version datasets, features, models, and evaluation results.
8. Expose read-only prediction endpoints first.

The system must display forecast horizon, confidence/uncertainty, data coverage, and model version. A forecast is not a fact and must not silently drive a purchase.

## L. Agent Architecture

Start with deterministic services and scheduled jobs. Introduce an LLM only where explanation or summarization adds value.

| Agent                | Inputs                         | Output                            | Initial control |
| -------------------- | ------------------------------ | --------------------------------- | --------------- |
| Inventory monitoring | Stock and reorder rules        | Conditions and alerts             | Read-only       |
| Expiry monitoring    | Batch dates and quantity       | Prioritized expiry alerts         | Read-only       |
| Demand forecasting   | Historical stock OUT data      | Forecast request/result           | Read-only       |
| Stockout risk        | Stock, forecast, lead time     | Risk score and reasons            | Read-only       |
| Replenishment        | Risk, forecast, reorder policy | Draft recommendation              | Human approval  |
| Reporting            | Approved operational data      | Summary with citations to records | Read-only       |

Agent tools must have explicit schemas, permission boundaries, timeouts, rate limits, and logs. Store prompt/model/version, inputs or references, output, user, timestamp, and approval status. Agents must not receive secrets, modify stock directly, or issue purchases.

## M. Barcode Architecture

Barcode is a post-MVP adapter, not a dependency of inventory correctness.

1. Add a unique optional barcode field to `Medicine`.
2. Support USB scanners as keyboard input first.
3. On scan, call `GET /medicines?barcode=...`.
4. Show the medicine and eligible batches.
5. Require the normal authorized stock operation confirmation.
6. Add camera scanning only after the desktop workflow is stable.

Unknown, duplicate, expired, and ambiguous barcodes must produce recoverable errors and never silently choose a batch.

## N. Security Architecture

- Hash passwords with a current adaptive password hash; never store plaintext passwords.
- Use short-lived JWT access tokens, secure secret storage, and a documented logout/revocation strategy.
- Enforce authorization server-side on every protected route; the frontend role check is only presentation.
- Validate and normalize all request bodies, query parameters, and path IDs with Zod.
- Use parameterized ORM queries and avoid raw SQL unless reviewed.
- Configure CORS to known origins rather than unrestricted production CORS.
- Apply security headers, request size limits, rate limits on login, and generic login failure messages.
- Keep secrets out of source control; provide `.env.example` with non-secret placeholders.
- Use HTTPS in deployed environments and secure cookie/token handling appropriate to the chosen auth design.
- Log security events without passwords, tokens, or unnecessary personal data.
- Back up the database, restrict database network access, and test restoration.
- Audit stock adjustments, role changes, user changes, approvals, and sensitive configuration changes.
- Threat-model IDOR, privilege escalation, replayed tokens, SQL injection, XSS, CSRF where cookies are used, and accidental data exposure.

The committed Docker password is acceptable only for local development and must be replaced with environment variables before any shared or deployed environment.

## O. Six-Member Responsibility Matrix

| Member                            | Primary ownership                                                  | Shared responsibility                    |
| --------------------------------- | ------------------------------------------------------------------ | ---------------------------------------- |
| 1. Project lead/integration       | Architecture, auth, API contracts, reviews, integration            | Definition of done and release decisions |
| 2. Frontend engineer              | React shell, forms, dashboard, inventory, alerts                   | Accessibility and API contract tests     |
| 3. AI/ML engineer                 | Data definitions, baselines, evaluation, ML API later              | Data quality and research records        |
| 4. Agentic AI engineer            | Agent interfaces, tool permissions, evaluation, explanations later | Safety review and auditability           |
| 5. Backend/database engineer      | Schema, migrations, services, inventory/purchase logic             | Integrity and integration tests          |
| 6. Mobile/barcode/DevOps engineer | Docker, CI, environments, health checks, barcode later             | Observability and release automation     |

Ownership is not a silo: every feature requires one owner, one reviewer, an API/data contract, and an integration check.

## P. 12-16 Week Development Roadmap

| Weeks | Milestone                                       | Exit criteria                                            |
| ----- | ----------------------------------------------- | -------------------------------------------------------- |
| 1     | Scope, architecture, workflow, repository rules | Approved foundation, issue backlog, local setup          |
| 2-3   | Schema and API foundation                       | Migrations, validation, error format, health check       |
| 4     | Authentication and RBAC                         | Login, protected routes, role tests, audit basics        |
| 5-6   | Medicine, category, supplier management         | CRUD/search flows backed by real API                     |
| 7     | Batch and inventory transactions                | Atomic IN/OUT/adjustment operations and history          |
| 8     | Purchasing                                      | Purchase creation/receiving updates batches correctly    |
| 9     | Alerts and dashboard                            | Rule alerts, acknowledgement, frontend live data         |
| 10    | MVP hardening                                   | Integration tests, security review, seeded demo dataset  |
| 11    | Analytics baseline                              | Usage summaries, fast/slow movement, expiry views        |
| 12    | Forecasting baseline                            | Naive/moving-average backtest and documented limitations |
| 13    | Stockout and replenishment prototype            | Explainable read-only recommendation output              |
| 14    | Agent safety prototype                          | Logged, read-only agents with human approval workflow    |
| 15    | Barcode and deployment rehearsal                | USB scan path, CI, Docker production-like run            |
| 16    | Final integration and research package          | Demo, report, metrics, risk register, release candidate  |

For a 12-week semester, combine weeks 2-3, 5-6, 11-12, and 15-16, and remove camera scanning and LLM work from the graded MVP.

## Q. GitHub Development Workflow

- `main` is release-ready; `develop` is integration; use `feature/*` and `fix/*` branches.
- No direct pushes to `main` or `develop`.
- Use issues with acceptance criteria and labels for area, priority, and milestone.
- Open pull requests early; require at least one reviewer and passing CI.
- Keep commits small and meaningful, such as `feat(inventory): record stock out transaction`.
- Require migrations, tests, docs, and API contract updates with relevant changes.
- Protect secrets with environment configuration and repository secret scanning.
- Use a pull request template containing behavior, tests, migration impact, and security impact.
- Tag milestone releases and keep a short changelog.

## R. MVP Definition

The MVP is complete when an authorized operator can log in, manage medicines/categories/suppliers, receive a purchase into distinct batches, issue stock, view accurate current quantities and transaction history, see deterministic alerts, and perform these workflows through the real frontend and API against PostgreSQL.

MVP is not complete if it depends on mock frontend data, unauthenticated writes, floating-point money, unreviewed direct quantity edits, or `db push` as the only schema process.

## S. V1 Features

After MVP hardening: richer reports, configurable alert thresholds, supplier purchase history, FEFO suggestions, export, dashboard trends, reconciliation tools, better audit search, and a read-only forecasting baseline.

The first V1 slice is implemented: read-only replenishment recommendations use recent completed OUT demand and reorder levels and never create purchases automatically.

## T. Future Features

Stockout prediction, replenishment recommendations, agent summaries, human approval queues, barcode camera scanning, PWA/mobile workflows, multi-organization tenancy, external integrations, and advanced models. Each requires an evidence-based justification and a separate security/data review.

## U. Testing Strategy

- **Unit:** stock quantity rules, alert thresholds, FEFO ordering, permissions, validation, forecast metrics.
- **API integration:** login, role restrictions, medicine CRUD, purchase receiving, stock IN/OUT, rollback on failure, alerts.
- **Database:** migration application, constraints, transaction rollback, reconciliation query.
- **Frontend:** loading/error/empty states, protected navigation, forms, filtering, API failure behavior.
- **End-to-end:** login -> create medicine -> create supplier -> receive batch -> issue stock -> observe alert/history.
- **Security:** unauthorized route checks, IDOR attempts, malformed input, login rate limits, secret scan.
- **ML/agent:** time-based backtests, prompt/tool contract tests, refusal tests, audit-log completeness, human approval enforcement.

The minimum CI gate is typecheck/build, lint, unit tests, API integration tests, and migration validation.

## V. Deployment Strategy

### Local

Docker Compose runs PostgreSQL. Backend and frontend run with documented commands and environment templates. Use a non-production local password only.

### Review/staging

Build immutable backend/frontend artifacts, run migrations through a controlled step, use managed PostgreSQL or an isolated database, configure secrets through the platform, and enable logs and health checks.

### Production later

Use managed PostgreSQL with backups and restore tests, HTTPS, restricted networking, secret management, monitoring, migration approval, least-privilege database access, and a rollback plan. Deploy ML and agent services separately only when they have real operational boundaries.

## W. Research Roadmap

1. Conduct a literature review on pharmaceutical demand forecasting, intermittent demand, stockout prediction, and inventory decision support.
2. Define the research question without claiming novelty prematurely.
3. Document dataset origin, limitations, de-identification, missingness, and temporal coverage.
4. Establish naive and moving-average baselines.
5. Compare candidate models using time-based validation and operational metrics.
6. Study ablations for lead time, expiry, seasonality, and stockout-censored demand.
7. Evaluate recommendation usefulness and explanation quality with a defined protocol.
8. Report limitations, threats to validity, reproducibility steps, and ethical considerations.

Product milestones and research milestones are related but independently tracked.

## X. Major Technical Risks and Mitigations

| Risk                              | Impact                 | Mitigation                                                                             |
| --------------------------------- | ---------------------- | -------------------------------------------------------------------------------------- |
| Scope expansion                   | Missed MVP             | Freeze MVP; postpone mobile, LLM, and advanced ML                                      |
| Incorrect stock arithmetic        | Operational harm       | Ledger plus atomic transactions, constraints, reconciliation tests                     |
| Missing or biased demand data     | Invalid ML claims      | Start with baselines, document data limits, use synthetic/demo data only for demos     |
| Stockout-censored demand          | Biased forecasts       | Track stock availability and explicitly model censored periods                         |
| Weak auth/RBAC                    | Unauthorized changes   | Server-side permissions, security tests, audit logs                                    |
| Agent hallucination               | Unsafe recommendations | Deterministic tools, cited records, read-only scope, human approval                    |
| Integration bottleneck            | Team blockage          | Shared contracts, weekly integration, one owner/reviewer per feature                   |
| Database migration drift          | Broken environments    | Committed migrations and CI migration checks                                           |
| Frontend/backend divergence       | Fake demo behavior     | Replace mocks early; contract examples and integration tests                           |
| Expiry policy ambiguity           | Wrong stock decisions  | Agree on expiry window, timezone, and issuing policy in Week 1                         |
| Infrastructure credential leakage | Compromise             | Environment secrets, secret scanning, rotate the current local password before sharing |
| Small team capacity               | Incomplete features    | Vertical slices, fewer technologies, 12-week fallback scope                            |

### Critical review decisions

- **Remove from initial scope:** autonomous purchasing, patient/medical features, advanced agent framework, camera scanning, microservices, and complex deep learning.
- **Postpone:** multi-tenancy, cloud production scale, LLM chat, and external integrations.
- **Keep but constrain:** agents are read-only decision support; recommendations need approval; ML starts with baselines.
- **Most urgent technical correction:** secure and validate the existing API before expanding the UI.
- **Most likely team blockage:** backend schema/API decisions delaying frontend and ML. Resolve this with versioned contracts and a small demo dataset by Week 3.

# First 7 Days Action Plan

## Day 1 - Requirements and scope

| Member | Task                                              |
| ------ | ------------------------------------------------- |
| 1      | Lead scope meeting, finalize MVP and decision log |
| 2      | Sketch operator workflows and dashboard screens   |
| 3      | Define demand, stock OUT, and dataset assumptions |
| 4      | Define agent boundaries and unsafe-action rules   |
| 5      | Review current Prisma schema against MVP entities |
| 6      | Verify local Docker, Node, and repository setup   |

**Dependencies:** team agrees on roles, MVP boundaries, expiry policy, and stock terminology.
**Deliverables:** approved MVP checklist, glossary, risk register, workflow sketches, local setup report.

## Day 2 - Architecture

| Member | Task                                                        |
| ------ | ----------------------------------------------------------- |
| 1      | Publish architecture decision record and service boundaries |
| 2      | Map screens to API capabilities                             |
| 3      | Define future ML data contract                              |
| 4      | Define agent tool and approval contract                     |
| 5      | Propose normalized schema changes                           |
| 6      | Draft local/staging environment design                      |

**Dependencies:** Day 1 scope and glossary.
**Deliverables:** architecture diagram, ADRs, initial API resource list, schema change proposal.

## Day 3 - Database and API design

| Member | Task                                                       |
| ------ | ---------------------------------------------------------- |
| 1      | Review endpoint permissions and response/error conventions |
| 2      | Create frontend API contract fixtures                      |
| 3      | Define transaction fields needed for later analytics       |
| 4      | Define audit events for agent and approval actions         |
| 5      | Implement/review Prisma migration design                   |
| 6      | Define health checks and CI database service plan          |

**Dependencies:** Day 2 architecture.
**Deliverables:** ER diagram, endpoint table, validation rules, migration checklist, contract examples.

## Day 4 - GitHub and development environment

| Member | Task                                                       |
| ------ | ---------------------------------------------------------- |
| 1      | Configure branch protection, PR template, and issue labels |
| 2      | Document frontend run/build commands                       |
| 3      | Add research/data documentation structure                  |
| 4      | Add agent safety checklist and review template             |
| 5      | Document migration and seed workflow                       |
| 6      | Add CI skeleton, environment templates, and Docker checks  |

**Dependencies:** agreed repository workflow.
**Deliverables:** protected branches, CI outline, `.env.example` files, contribution rules, issue backlog.

## Day 5 - Project skeleton

| Member | Task                                                           |
| ------ | -------------------------------------------------------------- |
| 1      | Add API error, config, and authentication module boundaries    |
| 2      | Add frontend routing/layout boundaries and API client boundary |
| 3      | Add data dictionary and experiment notebook template           |
| 4      | Add agent interfaces without LLM calls                         |
| 5      | Add Prisma migrations and service-layer boundaries             |
| 6      | Make Docker/local health checks reproducible                   |

**Dependencies:** Day 3 contracts and Day 4 environment.
**Deliverables:** compiling skeleton, migration applies locally, CI runs, no new application feature claims.

## Day 6 - Initial integration

| Member | Task                                                       |
| ------ | ---------------------------------------------------------- |
| 1      | Integrate auth/API conventions and review PRs              |
| 2      | Connect one medicine list screen to the real API           |
| 3      | Add a small clearly labeled development dataset definition |
| 4      | Verify agent service is isolated and optional              |
| 5      | Implement one atomic stock transaction vertical slice      |
| 6      | Run full local stack and record setup failures             |

**Dependencies:** compiling skeleton and API contract.
**Deliverables:** login/API or protected-route spike, real medicine list, one tested stock operation, integration report.

## Day 7 - Team review and milestone

| Member | Task                                                           |
| ------ | -------------------------------------------------------------- |
| 1      | Run milestone review and update decisions/risks                |
| 2      | Demonstrate real-data frontend flow                            |
| 3      | Present data readiness and ML non-goals                        |
| 4      | Present agent safety boundary and deferred work                |
| 5      | Present schema integrity and transaction tests                 |
| 6      | Present CI/local reproducibility and next infrastructure steps |

**Dependencies:** all Day 6 deliverables.
**Deliverables:** signed-off Week 1 milestone, prioritized Week 2 backlog, demo recording/screenshots, updated risk register.

# Project Leader: Exact Day 1 Checklist

## Meeting

- [ ] Schedule a 90-minute kickoff with all six members.
- [ ] State that PharmaSense manages organizational inventory, not personal medicine cabinets or patient care.
- [ ] Walk through the current repository and label each part as prototype, MVP, later, or removed.
- [ ] Record decisions live in a decision log; unresolved items become named issues.

## Decisions required before the meeting ends

- [ ] Confirm the MVP workflow: login -> medicine/supplier -> purchase receiving -> batch -> stock IN/OUT -> alerts/history.
- [ ] Confirm the four roles and exact permissions for each.
- [ ] Confirm whether one deployment represents one organization for the MVP.
- [ ] Define `stock OUT`, `adjustment`, `expired`, `expiring soon`, and `low stock`.
- [ ] Choose the expiring-soon window and timezone.
- [ ] Decide whether issuing expired stock is always blocked or requires a controlled override.
- [ ] Decide the first money currency and decimal precision.
- [ ] Agree that forecasts and agents are read-only recommendations until approval.
- [ ] Agree that mobile, camera barcode, autonomous purchasing, patient data, and complex ML are out of MVP.

## Documents to create or update

- [ ] This foundation document.
- [ ] One-page product scope and glossary.
- [ ] Architecture diagram and decision log.
- [ ] MVP acceptance checklist.
- [ ] Initial ER/API contract document.
- [ ] Risk and assumption register.
- [ ] Six-member ownership matrix and Week 1 issue list.

## Questions to ask the team

- [ ] What is the smallest complete operator workflow we can demo in Week 4?
- [ ] Which data fields are mandatory at receiving and issuing time?
- [ ] How will we handle duplicate batch numbers, returns, damaged stock, and corrections?
- [ ] What evidence will be enough to claim an alert is correct?
- [ ] What real or synthetic data can the ML member legally and reproducibly use?
- [ ] Which actions require manager approval?
- [ ] Which API contract must be stable before frontend work proceeds?
- [ ] What will each member deliver by the end of Day 3 and Day 7?
- [ ] Who reviews each member's pull requests when the owner is unavailable?
- [ ] What is the fallback 12-week scope if time is lost?

## Assignments to send after the meeting

- [ ] Send each member their Day 1 task and named deliverable.
- [ ] Create one GitHub issue per decision, document, and technical task.
- [ ] Assign one owner and one reviewer to each issue.
- [ ] Add milestones for Week 1, MVP, V1, and research evaluation.
- [ ] Require all members to run the current local setup and report failures.

## Day 1 exit criteria

Day 1 is complete only when the team has an approved MVP boundary, role/permission draft, inventory terminology, expiry policy, architecture owner, data assumptions, risk register, GitHub task backlog, and a named deliverable for every member. No AI agent or advanced ML implementation should begin before these items are recorded.
