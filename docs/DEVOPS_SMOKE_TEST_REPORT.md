# DevOps Smoke-Test Report

## Coverage

The backend HTTP test suite covers:

| Check | Expected result |
| --- | --- |
| `GET /health` with migrated database | `200` with database status `ok` |
| Seeded administrator login | `200` and an access token |
| Anonymous `GET /api/v1/medicines` | `401` |
| Staff attempt at a prohibited write | `403` |
| Staff account with an Admin role claim | `403` based on the current database role |
| Logout | Revocation fingerprint is stored in PostgreSQL and the token is rejected afterward |
| Weak or shipped-placeholder JWT secret | Token creation is rejected |
| Authenticated inventory workflow | Create category/supplier/medicine, receive a batch, issue five units, and verify remaining quantity is seven |

The workflow uses unique records and removes them after the test. Run it with `cd backend; npm test` after applying migrations and running the development seed. CI performs those setup steps against its isolated PostgreSQL service.

## Execution Evidence

- CI definition: `.github/workflows/ci.yml` (`backend` job: migration, seed, then `npm test`).
- Environment: Node.js `v24.19.0`; dependencies installed from both committed lockfiles with `npm ci`.
- Passed: Prisma schema validation, backend TypeScript build, three database-independent backend test files, research dataset validation (`PASS_WITH_WARNINGS`), frontend lint, and frontend production build.
- Database migration and seed were not run: Docker is unavailable and no PostgreSQL service is listening on `127.0.0.1:5433`.
- Full `npm test` was attempted with a temporary JWT key. The three database-independent domain suites and three server checks passed; database-dependent API checks failed because PostgreSQL was unreachable. The result is not a passing smoke report.
- Security audit: frontend reports no vulnerabilities. Backend `npm audit --audit-level=high` fails on three high-severity Prisma CLI/config-chain advisories (`prisma`, `@prisma/config`, and `deepmerge-ts`); npm's suggested automatic fix is a breaking Prisma downgrade, so it was not applied without compatibility testing. The current CI security job will fail until these findings are resolved or formally handled.
- Required completion evidence: run migration, seed, and full backend `npm test` in CI or against a disposable PostgreSQL environment, then resolve the backend audit findings before treating this handoff as complete.