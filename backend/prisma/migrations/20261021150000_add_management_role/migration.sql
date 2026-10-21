BEGIN;

INSERT INTO "Role" ("name", "permissions")
VALUES ('Management', 'reports:read,replenishment:read')
ON CONFLICT ("name") DO UPDATE
SET "permissions" = EXCLUDED."permissions";

COMMIT;
