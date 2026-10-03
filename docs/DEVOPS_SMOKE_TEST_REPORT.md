# DevOps Smoke-Test Report

## Coverage

The backend HTTP test suite covers:

| Check | Expected result |
| --- | --- |
| `GET /health` with migrated database | `200` with database status `ok` |
| Seeded administrator login | `200` and an access token |
| Anonymous `GET /api/v1/medicines` | `401` |
| Staff attempt at a prohibited write | `403` |
| Authenticated inventory workflow | Create category/supplier/medicine, receive a batch, issue five units, and verify remaining quantity is seven |

The workflow uses unique records and removes them after the test. Run it with `cd backend; npm test` after applying migrations and running the development seed. CI performs those setup steps against its isolated PostgreSQL service.

## Execution Evidence

- CI definition: `.github/workflows/ci.yml` (`backend` job: migration, seed, then `npm test`).
- Local execution on this handoff machine: **not run**. Docker, Node.js, and npm are unavailable in the environment, so a database-backed result cannot be honestly reported here.
- Required completion evidence: attach the green CI run URL or the local command output after running the documented clean setup. A test definition is not a substitute for a passing execution result.