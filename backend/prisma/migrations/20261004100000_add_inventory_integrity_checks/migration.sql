BEGIN;

ALTER TABLE "Batch"
  ADD CONSTRAINT "Batch_quantity_nonnegative_check"
    CHECK ("quantity" >= 0),
  ADD CONSTRAINT "Batch_purchasePrice_nonnegative_check"
    CHECK ("purchasePrice" >= 0),
  ADD CONSTRAINT "Batch_sellingPrice_nonnegative_check"
    CHECK ("sellingPrice" >= 0),
  ADD CONSTRAINT "Batch_date_order_check"
    CHECK ("expiryDate" > "mfgDate");

ALTER TABLE "PurchaseItem"
  ADD CONSTRAINT "PurchaseItem_quantity_positive_check"
    CHECK ("quantity" > 0),
  ADD CONSTRAINT "PurchaseItem_purchasePrice_nonnegative_check"
    CHECK ("purchasePrice" >= 0),
  ADD CONSTRAINT "PurchaseItem_sellingPrice_nonnegative_check"
    CHECK ("sellingPrice" >= 0),
  ADD CONSTRAINT "PurchaseItem_date_order_check"
    CHECK ("expiryDate" > "mfgDate");

ALTER TABLE "StockTransaction"
  ADD CONSTRAINT "StockTransaction_type_quantity_check"
    CHECK (
      ("type" = 'IN' AND "quantity" >= 0)
      OR ("type" = 'OUT' AND "quantity" > 0)
      OR ("type" = 'ADJ' AND "quantity" <> 0)
    );

COMMIT;