import assert from 'node:assert/strict';
import {
  calculateStockDelta,
  canApplyStockDelta,
  minimumQuantityForDelta,
} from './stockRules';

assert.equal(calculateStockDelta('OUT', 4), -4);
assert.equal(calculateStockDelta('ADJ', -3), -3);
assert.equal(minimumQuantityForDelta(-4), 4);
assert.equal(minimumQuantityForDelta(6), 0);
assert.equal(canApplyStockDelta(10, -10), true);
assert.equal(canApplyStockDelta(10, -11), false);
assert.equal(canApplyStockDelta(10, 5), true);

console.log('Stock rule tests passed');