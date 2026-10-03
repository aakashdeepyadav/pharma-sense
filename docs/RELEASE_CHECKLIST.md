# Release Checklist

## Before Release

- [ ] Confirm the release commit is reviewed and merged through the intended pull-request target.
- [ ] Confirm CI passed migrations, seed, backend build/tests, research validation, frontend lint/build, secret scanning, dependency audit, and dependency review where applicable.
- [ ] Review pull-request security impact, migration impact, environment changes, and known limitations.
- [ ] Review [SECURITY_REVIEW.md](SECURITY_REVIEW.md) and assign owners/dates to unresolved risks.
- [ ] Confirm `.env` files, credentials, database dumps, confidential exports, and sensitive test artifacts are not committed or attached.
- [ ] Confirm the target environment injects unique secrets, restricts database/network access, and terminates HTTPS correctly.
- [ ] Capture and verify the target database backup/recovery point; confirm restore procedure and responsible operator.
- [ ] Review migrations for backward compatibility and deployment order. Migrations have no automatic down path here.
- [ ] Run the deployment rehearsal and smoke checks in [DEPLOYMENT_RUNBOOK.md](DEPLOYMENT_RUNBOOK.md) using a disposable environment.
- [ ] Record release version, commit, migration identifiers, backup/recovery point, operator, and smoke-test results.

## After Deployment

- [ ] Verify `/health` reports database availability.
- [ ] Verify valid login, invalid login handling, anonymous protected-route denial, and an authorized inventory read/write workflow.
- [ ] Check application logs and infrastructure health for errors, unexpected 429s, and failed migrations.
- [ ] Confirm no secrets or sensitive request bodies appear in logs or artifacts.
- [ ] Record the outcome, incidents, and any accepted risks in the handoff.

## Rollback / Recovery

- [ ] Stop or restrict writes if the release could corrupt data or if migration state is uncertain.
- [ ] Decide whether the previous application is schema-compatible before redeploying it.
- [ ] For incompatible schema/data changes, restore the verified recovery point or use the provider's reviewed recovery procedure; do not improvise a destructive migration reversal.
- [ ] Confirm database health, auth, and inventory workflow after recovery.
- [ ] Preserve logs and migration output, document impact and recovery point, and open follow-up work before resuming normal traffic.