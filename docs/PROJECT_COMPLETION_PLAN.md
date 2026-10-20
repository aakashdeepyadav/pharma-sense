# Project Completion Estimate

## Status as of 2026-10-21

**Estimated completion: 84% for the full production-ready project.** The
inventory application and its local verification are complete for the tested
scope. The remaining work is mainly production operations and evidence-based
forecasting; neither can be closed by local code changes alone.

This is a weighted planning estimate, not a claim that every possible feature
has shipped. The weights make the scope explicit:

| Workstream | Weight | Completion | Weighted points | Evidence / open work |
|---|---:|---:|---:|---|
| Core inventory application | 50% | 100% | 50 | Authentication and roles, inventory, receiving/issuing, purchase history, alerts, reporting, and replenishment review are implemented. |
| Local verification | 25% | 100% | 25 | Backend build, Prisma validation and 41 tests, frontend lint/build and 15 mocked browser tests, plus a separate live inventory workflow on disposable PostgreSQL passed. Earlier database quality/reconciliation, local dashboard smoke, and production dependency audits also passed. |
| Production operations | 15% | 60% | 9 | Render config now requires MFA for all roles; the app supports encrypted TOTP enrollment, replay protection, one-time recovery codes, and audited admin reset. Actual Render deploy, hosted MFA recovery rehearsal, backup/restore, monitoring, and rollback remain open. |
| Production forecasting | 10% | 0% | 0 | Current forecasting remains advisory/research. The roadmap requires representative operational history (at least 12 months of daily demand) before model validation and a governed pilot. |

Calculation: `50 + 25 + (15 * 0.60) + (10 * 0) = 84%`.
The local inventory application alone is effectively complete; the 16
percentage points left in the full-project estimate are not all coding tasks.

## What remains

### Production launch

The Render target is configured in `render.yaml`, but no Render account,
repository connection, or deployed environment is available in this workspace.
Complete these gates in the Render account:

1. Connect the repository to Render and create the Blueprint resources. Review
   the paid plans and keep the API and database in the same region.
2. Provide the one-time administrator setup values, confirm migrations and
   health checks, then remove the bootstrap variables after the first login.
3. Verify authenticator enrollment, recovery codes, and administrator recovery
   for every operational account; keep the API at one instance while request/login limiting is process-local.
4. Configure monitoring and log review; verify a backup by rehearsing restore
   and documenting the recovery point and operator.
5. Review migration compatibility, rehearse rollback/recovery, assign owners,
   then complete [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) and production
   sign-off.

Hosted CI status, actual deployment, backup restoration, and production
sign-off remain unverified; local passing checks do not close those gates.

### Production forecasting

The repository roadmap calls for at least 12 months of representative daily
operational demand across multiple medicines and organization groups, with
stockout censoring and availability context. If that history already exists,
the next work is data validation, benchmark/model comparison, monitoring design,
and a human-reviewed pilot. If it does not, collect it before claiming
production forecast readiness. See
[PRODUCTION_FORECASTING_ROADMAP.md](PRODUCTION_FORECASTING_ROADMAP.md).

## Verification record

### Current repository verification (2026-10-21)

- Backend TypeScript build passed.
- Database-independent backend tests passed: 17 tests, 0 failures.
- Prisma schema validation passed.
- Synthetic demand dataset validation passed with the documented research
  warnings and no validation errors.
- Backend production dependency audit passed with 0 vulnerabilities.
- Frontend lint passed with no warnings after the forecast response guard was
  added.
- Frontend production build passed.
- All 15 mocked Playwright browser tests passed.
- The frontend now treats a successful but incomplete LightGBM response as an
  unavailable prediction instead of allowing an undefined `forecasts` array to
  crash the dashboard.

The full backend integration suite was attempted, but its database-backed
tests could not run because Docker Desktop was unavailable and the configured
PostgreSQL service could not be reached. This is an environment blocker, not
a passing integration result.

### Previously recorded verification

- Backend TypeScript build and Prisma schema validation: passed; all 41 backend tests passed.
- The MFA migration, enrollment, replay rejection, and single-use recovery flow passed against a temporary PostgreSQL schema; that schema was dropped afterward.
- Frontend lint, production build, and all 15 mocked Playwright tests passed.
- Live browser workflow: 1 passed against a disposable isolated PostgreSQL
  database in 2.4 minutes; the temporary database was removed.
- Database quality: 0 errors and 0 warnings; reconciliation: 0 discrepancies
  and 0 unsupported movements; both checks were read-only.
- Local administrator browser smoke: passed with all API calls successful, no
  browser console warnings, and 290 unique stock transaction rows across pages.
- Backend and frontend production dependency audits: 0 vulnerabilities.
- Render Blueprint YAML syntax parses successfully; the Render CLI schema
  validator and an actual account deployment have not been run.

These are local results recorded on 2026-10-20. They do not establish hosted CI
success or production deployment readiness.
