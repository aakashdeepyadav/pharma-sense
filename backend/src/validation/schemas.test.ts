import assert from 'node:assert/strict';
import test from 'node:test';
import { batchSchema, purchaseSchema, stockTransactionSchema } from './schemas.js';

const validBatch = {
  medicineId: 1,
  supplierId: 1,
  batchNumber: 'LOT-1',
  mfgDate: '2026-01-01',
  expiryDate: '2027-01-01',
  quantity: 1,
  purchasePrice: 1.25,
  sellingPrice: 2.5,
};

test('enforces Decimal(12,2) money and PostgreSQL integer quantity bounds', () => {
  assert.equal(batchSchema.safeParse(validBatch).success, true);
  assert.equal(batchSchema.safeParse({ ...validBatch, purchasePrice: 1.001 }).success, false);
  assert.equal(batchSchema.safeParse({ ...validBatch, sellingPrice: 10_000_000_000 }).success, false);
  assert.equal(batchSchema.safeParse({ ...validBatch, quantity: 2_147_483_648 }).success, false);
});

test('bounds purchase quantities and rejects out-of-range stock movements', () => {
  const purchase = purchaseSchema.safeParse({
    supplierId: 1,
    items: [{
      medicineId: 1,
      batchNumber: 'LOT-1',
      mfgDate: '2026-01-01',
      expiryDate: '2027-01-01',
      quantity: 2_147_483_648,
      purchasePrice: 1,
      sellingPrice: 2,
    }],
  });
  const transaction = stockTransactionSchema.safeParse({ batchId: 1, type: 'ADJ', quantity: -2_147_483_649 });

  assert.equal(purchase.success, false);
  assert.equal(transaction.success, false);
});