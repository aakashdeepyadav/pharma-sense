# DevOps Smoke-Test Report

## Coverage

The backend HTTP test suite covers:

| Check                                  | Expected result                                                                                              |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `GET /health` with migrated database   | `200` with database status `ok`                                                                              |
| Seeded administrator login             | `200` and an access token                                                                                    |
| Anonymous `GET /api/v1/medicines`      | `401`                                                                                                        |
| Staff attempt at a prohibited write    | `403`                                                                                                        |
| Staff account with an Admin role claim | `403` based on the current database role                                                                     |
| Logout                                 | Revocation fingerprint is stored in PostgreSQL and the token is rejected afterward                           |
| Weak or shipped-placeholder JWT secret | Token creation is rejected                                                                                   |
| Authenticated inventory workflow       | Create category/supplier/medicine, receive a batch, issue five units, and verify remaining quantity is seven |

The workflow uses unique records and removes them after the test. Run it with `cd backend; npm test` after applying migrations and running the development seed. CI performs those setup steps against its isolated PostgreSQL service.

## Execution Evidence

- CI definition: `.github/workflows/ci.yml` (`backend` job: migration, seed, database quality, reconciliation, build, tests, and research validation).
- Local validation environment: PostgreSQL through Docker Compose, Node.js 22-compatible toolchain, and dependencies installed with `npm ci`.
- Passed: the merged migration, secure development seed, backend build, all 23 backend tests, `db:quality` with `status: PASS`, `db:reconcile` with zero discrepancies, frontend lint/build, and 9 mocked Playwright browser tests.
- Passed: the live inventory workflow against local PostgreSQL with one Playwright test in 20 seconds, including real authentication, receiving, issuing, alerts, user management, and role restrictions.
- Security audit: backend and frontend `npm audit --omit=dev --audit-level=high` report zero vulnerabilities. Prisma remains on 6.19.3 and the patched `deepmerge-ts` 8.0.2 override is locked and tested.
- Remaining evidence gap: production-like deployment and backup/restore rehearsal must still run in an isolated environment before production release; CI remains the authoritative clean-environment live test.
