import assert from 'node:assert/strict';
import { movingAverageForecast, movingAverageMae } from './forecasting';

assert.deepEqual(movingAverageForecast([2, 4, 6], 2, 3), [5, 5, 5]);
assert.deepEqual(movingAverageForecast([], 7, 2), [0, 0]);
assert.equal(movingAverageMae([2, 4, 6], 2), 3);
assert.equal(movingAverageMae([2], 2), null);

console.log('Forecasting baseline tests passed');