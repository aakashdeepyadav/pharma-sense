BEGIN;

ALTER TABLE "User"
  ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "mfaSecretEncrypted" TEXT,
  ADD COLUMN "mfaRecoveryCodes" TEXT,
  ADD COLUMN "mfaLastUsedStep" INTEGER;

-- Expire existing sessions for privileged users so password-only sessions do
-- not remain valid after MFA becomes mandatory in production.
UPDATE "User" AS users
SET "sessionVersion" = users."sessionVersion" + 1
FROM "Role" AS roles
WHERE users."roleId" = roles.id
  AND roles.name IN ('Admin', 'Inventory Manager', 'Pharmacist', 'Staff');

COMMIT;
