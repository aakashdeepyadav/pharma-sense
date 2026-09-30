-- AlterTable
ALTER TABLE "Medicine"
ADD COLUMN "manufacturer" TEXT,
ADD COLUMN "dosageForm" TEXT,
ADD COLUMN "barcode" TEXT,
ADD COLUMN "active" BOOLEAN NOT NULL DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_barcode_key" ON "Medicine"("barcode");