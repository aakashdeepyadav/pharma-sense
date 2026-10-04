import assert from 'node:assert/strict';
import test from 'node:test';
import { reconcileBatchStock } from './reconciliation.js';

test('reconciles receipts, issues, and signed adjustments', () => {
  const discrepancies = reconcileBatchStock(
    [{ id: 1, quantity: 8 }, { id: 2, quantity: 3 }],
    [
      { batchId: 1, type: 'IN', quantity: 10 },
      { batchId: 1, type: 'OUT', quantity: 4 },
      { batchId: 1, type: 'ADJ', quantity: 2 },
      { batchId: 2, type: 'IN', quantity: 5 },
      { batchId: 2, type: 'ADJ', quantity: -2 },
    ],
  );

  assert.deepEqual(discrepancies, []);
});

test('returns quantity differences without changing input snapshots', () => {
  const batches = [{ id: 1, quantity: 7 }, { id: 2, quantity: 0 }];
  const transactions = [
    { batchId: 1, type: 'IN' as const, quantity: 5 },
    { batchId: 1, type: 'OUT' as const, quantity: 1 },
    { batchId: 2, type: 'IN' as const, quantity: 2 },
  ];

  assert.deepEqual(reconcileBatchStock(batches, transactions), [
    { batchId: 1, batchQuantity: 7, ledgerQuantity: 4, difference: 3 },
    { batchId: 2, batchQuantity: 0, ledgerQuantity: 2, difference: -2 },
  ]);
  assert.deepEqual(batches, [{ id: 1, quantity: 7 }, { id: 2, quantity: 0 }]);
  assert.equal(transactions.length, 3);
});

test('reports a positive batch with no ledger activity', () => {
  assert.deepEqual(reconcileBatchStock([{ id: 1, quantity: 4 }], []), [
    { batchId: 1, batchQuantity: 4, ledgerQuantity: 0, difference: 4 },
  ]);
});