# Deployment and Handoff Summary

## Status

The replenishment review workflow now persists the latest decision per
medicine, shows the reviewer in the dashboard, and writes each decision with
its audit event atomically. The release is **not ready for production
handoff**: local database-backed checks and the live browser workflow pass,
and a Render Blueprint is prepared, but no Render resources have been created.
Target migration, deployed MFA recovery, backup/restore, monitoring, and rollback
rehearsal remain open.

## Verified evidence

### Previously recorded backend release rehearsal

The following results are historical project evidence and were not rerun for
the current change.

Commands run:

```powershell
cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense\backend"
npx prisma migrate deploy
npm run seed
npm run build
npm test
npm run db:quality
npm run db:reconcile
npm run research:validate
npm run research:readiness
npm run research:ml:operational
```

Result:

- 46 tests passed
- 0 failed
- database quality check passed with warnings only
- stock reconciliation reported zero discrepancies
- research validation passed for the demand dataset
- operational readiness passed for the expanded demand dataset
- operational model training and artifact export passed

### Forecasting readiness

The current operational release uses `npm run research:ml:operational`.
The expanded dataset contains 20,080 rows across 20 medicines and 1,004
complete daily dates from 2024-01-01 through 2026-09-30.

Result:

- data source: operational
- model: LightGBM baseline
- rolling-validation MAE: 0.750
- final holdout MAE: 0.748
- final holdout RMSE: 1.344
- seven-day moving-average baseline MAE: 1.834
- naive baseline MAE: 2.001
- stockout-censored rows: 0

### Frontend build

Command run:

```powershell
cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense\frontend"
npm run lint
npm run build
```

Result:

- build succeeded
- no lint warnings remained
- production bundle was generated successfully

### Historical local validation (superseded)

Commands run:

```powershell
cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense\backend"
npm run build
npx prisma validate
npx tsx --test src/domain/stockRules.test.ts src/domain/reconciliation.test.ts src/domain/dataQuality.test.ts src/validation/schemas.test.ts src/domain/forecasting.test.ts src/domain/replenishment.test.ts

cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense\frontend"
npm run lint
npm run build
npm run test:e2e
```

Results:

- backend TypeScript build and Prisma schema validation passed
- all 17 database-independent backend tests passed
- frontend build passed and all 15 browser tests passed
- lint completed with one existing forecast-selector React warning

These results predate the verification below. The old PostgreSQL connection
failure is no longer the current database status.

### Current project verification (2026-10-21)

- Backend build and schema validation passed; all 46 backend tests passed.
- Frontend lint and production build passed; all 15 mocked Playwright tests
  passed.
- The live browser workflow passed with 1 workflow against a separately named
  disposable PostgreSQL database; the temporary database was removed after the
  run.
- Backend and frontend production dependency audits reported 0 vulnerabilities.
- Database quality passed with 0 errors and 0 warnings after the demo seed
  expiry was corrected; stock reconciliation
  reported 0 discrepancies and 0 unsupported movements. Both checks were
  read-only (`modifiedData: false`).
- A read-only browser smoke test against the running local app passed
  administrator sign-in and dashboard loading, with no API failures or console
  warnings; all 290 stock transaction rows were unique across paginated pages.

## Operational interpretation

This project remains in an advisory, human-reviewed operating model:

- forecasting is evidence for planning and monitoring
- replenishment decisions are shared, persistent, reviewable, and auditable
- no recommendation directly creates orders or stock movements without approval
- the new persistence migration must be applied and verified before release

## Release checklist status

The following release gates remain open for this change:

- [x] pass the full backend integration test suite against the configured local database
- [x] pass database quality and stock reconciliation checks
- [x] apply migrations and run the live browser workflow against a disposable PostgreSQL database
- [ ] complete final release rehearsal and rollback review

Frontend build and browser tests, Prisma schema validation, and backend
integration tests passed locally. See [project completion estimate](PROJECT_COMPLETION_PLAN.md)
for weighted completion and remaining work.

## Remaining operational owner actions

The Render Blueprint now configures a private managed PostgreSQL database,
HTTPS static hosting, security headers, pre-deploy migrations, generated JWT
secret, and one-time administrator bootstrap. Before using operational data:

- create the Blueprint resources and verify the live API and frontend origins
- remove bootstrap secrets after the first administrator login
- verify MFA enrollment, recovery codes, and administrator recovery for every operational account
- configure monitoring and verify a database restore from backup
- team access review and role approval
- release sign-off and rollback/recovery rehearsal

## Recommended next release action

Use the Render steps in [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) to create a controlled pilot deployment. Do not enter operational inventory until the remaining security and recovery gates above are verified and signed off.
