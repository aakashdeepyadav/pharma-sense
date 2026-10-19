import assert from 'node:assert/strict';
import {
  calculateStockDelta,
  availableStock,
  canApplyStockDelta,
  isBatchExpired,
  minimumQuantityForDelta,
} from './stockRules';

assert.equal(calculateStockDelta('OUT', 4), -4);
assert.equal(calculateStockDelta('ADJ', -3), -3);
assert.equal(minimumQuantityForDelta(-4), 4);
assert.equal(minimumQuantityForDelta(6), 0);
assert.equal(canApplyStockDelta(10, -10), true);
assert.equal(canApplyStockDelta(10, -11), false);
assert.equal(canApplyStockDelta(10, 5), true);
assert.equal(isBatchExpired(new Date('2026-09-29T00:00:00Z'), new Date('2026-09-30T00:00:00Z')), true);
assert.equal(isBatchExpired(new Date('2026-09-30T00:00:00Z'), new Date('2026-09-30T23:59:59Z')), false);
assert.equal(isBatchExpired(new Date('2026-10-01T00:00:00Z'), new Date('2026-09-30T00:00:00Z')), false);
assert.equal(availableStock([
  { quantity: 4, expiryDate: new Date('2026-09-29T00:00:00Z') },
  { quantity: 3, expiryDate: new Date('2026-09-30T00:00:00Z') },
], new Date('2026-09-30T23:59:59Z')), 3);

console.log('Stock rule tests passed');
