import assert from 'node:assert/strict';
import test from 'node:test';
import { inspectInventoryQuality } from './dataQuality.js';

test('accepts valid batch, purchase item, and stock ledger records', () => {
  const report = inspectInventoryQuality(
    [{
      id: 1,
      medicineId: 10,
      batchNumber: 'LOT-1',
      mfgDate: new Date('2026-01-01T00:00:00.000Z'),
      expiryDate: new Date('2027-01-01T00:00:00.000Z'),
      quantity: 4,
      purchasePrice: 1.25,
      sellingPrice: 2.5,
    }],
    [{
      id: 1,
      mfgDate: new Date('2026-01-01T00:00:00.000Z'),
      expiryDate: new Date('2027-01-01T00:00:00.000Z'),
      quantity: 4,
      purchasePrice: 1.25,
      sellingPrice: 2.5,
    }],
    [{ id: 1, timestamp: new Date('2026-05-01T00:00:00.000Z'), type: 'OUT', quantity: 2 }],
    new Date('2026-06-01T00:00:00.000Z'),
  );

  assert.deepEqual(report, { errors: [], warnings: [] });
});

test('detects duplicates, invalid dates, quantities, prices, movements, and expired stock', () => {
  const report = inspectInventoryQuality(
    [
      {
        id: 1,
        medicineId: 10,
        batchNumber: 'LOT-1',
        mfgDate: new Date('2026-01-01T00:00:00.000Z'),
        expiryDate: new Date('2026-02-01T00:00:00.000Z'),
        quantity: -1,
        purchasePrice: -1,
        sellingPrice: 2,
      },
      {
        id: 2,
        medicineId: 10,
        batchNumber: 'LOT-1',
        mfgDate: null,
        expiryDate: new Date('2026-01-01T00:00:00.000Z'),
        quantity: 3,
        purchasePrice: 1.001,
        sellingPrice: 2,
      },
    ],
    [{
      id: 1,
      mfgDate: new Date('2026-04-01T00:00:00.000Z'),
      expiryDate: new Date('2026-03-01T00:00:00.000Z'),
      quantity: 0,
      purchasePrice: 1,
      sellingPrice: 1,
    }],
    [
      { id: 1, timestamp: null, type: 'OUT', quantity: -1 },
      { id: 2, timestamp: new Date('2026-01-01T00:00:00.000Z'), type: 'UNKNOWN', quantity: 2 },
    ],
    new Date('2026-06-01T00:00:00.000Z'),
  );

  assert.deepEqual(report.errors.map(({ code }) => code), [
    'BATCH_INVALID_QUANTITY',
    'BATCH_INVALID_PRICE',
    'DUPLICATE_BATCH',
    'BATCH_MISSING_OR_INVALID_DATE',
    'BATCH_INVALID_PRICE',
    'PURCHASE_ITEM_INVALID_DATE_ORDER',
    'PURCHASE_ITEM_INVALID_QUANTITY',
    'TRANSACTION_MISSING_OR_INVALID_DATE',
    'TRANSACTION_INVALID_TYPE_OR_QUANTITY',
    'TRANSACTION_INVALID_TYPE_OR_QUANTITY',
  ]);
  assert.deepEqual(report.warnings, [{ code: 'EXPIRED_BATCH_HAS_STOCK', entityId: 2 }]);
});