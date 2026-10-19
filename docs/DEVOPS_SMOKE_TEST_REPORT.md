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
| Privileged MFA enrollment and sign-in  | Enrollment challenge is limited; TOTP secrets are encrypted; replayed TOTP and recovery codes are rejected |
| Authenticated inventory workflow       | Create category/supplier/medicine, receive a batch, issue five units, and verify remaining quantity is seven |

The workflow uses unique records and removes them after the test. Run it with `cd backend; npm test` after applying migrations and running the development seed. CI performs those setup steps against its isolated PostgreSQL service.

## Execution Evidence

- CI definition: `.github/workflows/ci.yml` (`backend` job: migration, seed, database quality, reconciliation, build, tests, and research validation).
- Local verification recorded on 2026-10-20: backend build, schema validation, and all 41 tests passed; frontend lint/build and all 15 mocked browser tests passed. MFA integration used a disposable PostgreSQL schema that was removed afterward.
- Database quality reported 0 errors and warnings; reconciliation reported 0 discrepancies and unsupported movements. Both checks were read-only.
- One live inventory workflow passed against an isolated disposable PostgreSQL database; that temporary database was removed.
- Backend and frontend production dependency audits reported 0 vulnerabilities.
- Render deployment configuration is in `render.yaml`; only YAML syntax was parsed locally. Render CLI validation, hosted CI, deployment, and backup/restore rehearsal remain outstanding.
