import assert from 'node:assert/strict';
import { assessForecastReadiness, movingAverageForecast, movingAverageMae } from './forecasting';

assert.deepEqual(movingAverageForecast([2, 4, 6], 2, 3), [5, 5, 5]);
assert.deepEqual(movingAverageForecast([], 7, 2), [0, 0]);
assert.equal(movingAverageMae([2, 4, 6], 2), 3);
assert.equal(movingAverageMae([2], 2), null);
assert.deepEqual(assessForecastReadiness([0, 2, 0, 4], 2), {
	totalDays: 4,
	daysWithDemand: 2,
	zeroDemandDays: 2,
	observationRate: 0.5,
	status: 'INSUFFICIENT_HISTORY',
});

console.log('Forecasting baseline tests passed');