# Database Quality and Reconciliation

## Schema Review

- Required Prisma relations provide foreign keys. `PurchaseItem.purchase` cascades on purchase deletion; other relations use PostgreSQL's restrictive default so referenced inventory history is not silently removed.
- Batch identity is unique by `(medicineId, batchNumber)`. Medicine barcodes, role names, category names, and alert fingerprints are unique. Audit logs are indexed by entity and creation time; revoked-token expiry is indexed.
- Batch and purchase-item prices use `Decimal(12,2)`. API validation limits money to nonnegative values with at most two fractional digits and the representable precision. Migration checks protect nonnegative prices and inventory quantities in PostgreSQL too.
- Batch and purchase-item expiry must be later than manufacture. Stock ledger entries use positive `IN`/`OUT` quantities, signed nonzero `ADJ` quantities, and the batch balance cannot be negative. Expired batches are retained as history; active expired stock is reported as a warning rather than deleted.
- The database-specific `CHECK` constraints live in migration SQL because they are not represented in the current Prisma schema language. Keep equivalent validation in Zod and retain the SQL constraints when generating future migrations.

## Read-Only Reports

Run from `backend` with `DATABASE_URL` set to the database being inspected:

```powershell
npm run db:quality
npm run db:reconcile
```

`db:quality` checks missing or invalid dates, date order, duplicate medicine/batch keys, batch and purchase quantities, transaction type/sign rules, invalid prices, and expired batches with remaining stock. It prints issue codes and record IDs only. Integrity errors return exit code 1; expired stock is a warning.

`db:reconcile` compares each `Batch.quantity` with the ledger sum (`IN` plus signed `ADJ` minus `OUT`). It reports batch quantity, ledger quantity, and difference, and flags unknown movement types. Any discrepancy returns exit code 1. Both commands are read-only and print `modifiedData: false`; neither proposes nor applies repairs. Review and approve any correction separately, with a backup and an audit trail.

Run quality validation before applying the integrity migration to an existing database. PostgreSQL rejects the migration if existing rows violate a new constraint; investigate the report rather than editing production-like data automatically.

## Disposable Migration Validation

Use only a local database created for testing. Never point migration experiments at a shared or production database. The following PowerShell commands create a separate database inside the local Compose PostgreSQL service; substitute the local Compose username and URL-encoded password if they differ from the defaults:

```powershell
docker compose up -d
docker compose exec -T postgres sh -c 'createdb -U "$POSTGRES_USER" pharmasense_migration_test'
Set-Location backend
$env:DATABASE_URL = 'postgresql://postgres:<local-password>@localhost:5433/pharmasense_migration_test?schema=public'
npx prisma migrate deploy
npx prisma migrate status
npx prisma validate
npm run seed
npm run db:quality
npm run db:reconcile
```

The seed is development-only and refuses `NODE_ENV=production`. It creates synthetic demo medicines, a supplier, a received purchase, matching batches and `IN` movements, and alert rows. It does not contain patient or confidential data. Re-running it does not reset seeded batch quantities or duplicate existing stock movements.

After testing, remove only the named disposable database once you have confirmed its name:

```powershell
docker compose exec -T postgres sh -c 'dropdb -U "$POSTGRES_USER" pharmasense_migration_test'
```

If `POSTGRES_USER` is not set in the host shell, substitute its configured value explicitly. Do not remove the Compose volume to clean up a test database; that volume may contain other local work.

## Backup, Restore, and Retention

- Before migrations against any shared environment, take a provider recovery point or a protected `pg_dump -Fc` backup and record where it is stored. Keep dumps outside the repository; they may contain sensitive operational data.
- Restore a dump only into an isolated database first, then verify migrations, quality results, reconciliation, and application health. A restore with `pg_restore --clean` deletes objects in the target database; confirm the target is disposable before using it.
- Local development databases should contain synthetic or explicitly approved de-identified data only. Remove disposable databases after the task. Never copy production exports into a developer checkout.
- Shared and production retention periods must be set by the data owner to meet applicable policy and law; this repository does not prescribe a retention duration. Restrict backup access, encrypt backups in transit and at rest, and periodically test restores.
- Never commit `.env` files, database dumps, credentials, patient data, or confidential exports. Reconciliation output should be reviewed as operational data and stored only in an approved location.