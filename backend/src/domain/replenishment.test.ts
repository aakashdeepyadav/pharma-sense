import assert from 'node:assert/strict';
import { calculateReplenishment } from './replenishment';

const recommendation = calculateReplenishment(12, 10, 2.5, 7);
assert.equal(recommendation.targetStock, 28);
assert.equal(recommendation.recommendedUnits, 16);
assert.equal(recommendation.status, 'REPLENISH');

const noAction = calculateReplenishment(50, 10, 0, 14);
assert.equal(noAction.recommendedUnits, 0);
assert.equal(noAction.status, 'NO_ACTION');

console.log('Replenishment rule tests passed');
