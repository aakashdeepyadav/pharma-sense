-- AlterTable
ALTER TABLE "Batch"
ALTER COLUMN "purchasePrice" TYPE DECIMAL(12,2)
USING ROUND("purchasePrice"::numeric, 2);

ALTER TABLE "PurchaseItem"
ALTER COLUMN "purchasePrice" TYPE DECIMAL(12,2)
USING ROUND("purchasePrice"::numeric, 2);