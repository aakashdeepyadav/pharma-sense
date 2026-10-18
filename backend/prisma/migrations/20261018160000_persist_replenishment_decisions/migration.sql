BEGIN;

CREATE TABLE "ReplenishmentReview" (
  "medicineId" INTEGER NOT NULL,
  "reviewerId" INTEGER NOT NULL,
  "decision" TEXT NOT NULL,
  "notes" TEXT,
  "reviewedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ReplenishmentReview_pkey" PRIMARY KEY ("medicineId"),
  CONSTRAINT "ReplenishmentReview_decision_check"
    CHECK ("decision" IN ('APPROVED', 'DISMISSED')),
  CONSTRAINT "ReplenishmentReview_medicineId_fkey"
    FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id")
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReplenishmentReview_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ReplenishmentReview_reviewerId_idx"
  ON "ReplenishmentReview"("reviewerId");

COMMIT;
