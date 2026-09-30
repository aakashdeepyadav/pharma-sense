import assert from 'node:assert/strict';
import {
  calculateStockDelta,
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
assert.equal(isBatchExpired(new Date('2026-10-01T00:00:00Z'), new Date('2026-09-30T00:00:00Z')), false);

console.log('Stock rule tests passed');