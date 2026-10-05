import assert from 'node:assert/strict';
import { assessForecastQuality, assessForecastReadiness, evaluateHoldout, movingAverageForecast, movingAverageMae, naiveForecast } from './forecasting';

assert.deepEqual(movingAverageForecast([2, 4, 6], 2, 3), [5, 5, 5]);
assert.deepEqual(movingAverageForecast([], 7, 2), [0, 0]);
assert.equal(movingAverageMae([2, 4, 6], 2), 3);
assert.equal(movingAverageMae([2], 2), null);
assert.deepEqual(naiveForecast([2, 4], 3), [4, 4, 4]);
assert.deepEqual(evaluateHoldout([2, 4, 6, 8, 10], 2), {
	trainSize: 4,
	testSize: 1,
	mae: 3,
	rmse: 3,
});
assert.deepEqual(assessForecastReadiness([0, 2, 0, 4], 2), {
	totalDays: 4,
	daysWithDemand: 2,
	zeroDemandDays: 2,
	observationRate: 0.5,
	status: 'INSUFFICIENT_HISTORY',
});
assert.deepEqual(assessForecastQuality([10, 12, 9, 11, 10, 13, 12, 11, 10, 12, 11, 13, 12, 11], [10, 12, 9, 12, 10, 12, 11, 12, 10, 12, 11, 12, 12, 11], { maxMae: 1.5, maxRmse: 1.8 }), {
	mae: 0.35714285714285715,
	rmse: 0.5976143046671968,
	observationRate: 1,
	status: 'OK',
});
assert.deepEqual(assessForecastQuality([10, 12, 9, 11, 10, 13, 12, 11, 10, 12, 11, 13, 12, 11], [10, 12, 9, 12, 10, 12, 11, 12, 10, 12, 11, 12, 12, 11], { maxMae: 0.2, maxRmse: 0.2 }), {
	mae: 0.35714285714285715,
	rmse: 0.5976143046671968,
	observationRate: 1,
	status: 'WATCH',
});

console.log('Forecasting baseline tests passed');