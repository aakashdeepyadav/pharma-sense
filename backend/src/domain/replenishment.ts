export type ReplenishmentStatus = 'REPLENISH' | 'NO_ACTION';

export function calculateReplenishment(
  currentUnits: number,
  reorderLevel: number,
  averageDailyDemand: number,
  targetDays: number,
) {
  const targetStock = Math.ceil(averageDailyDemand * targetDays) + reorderLevel;
  const recommendedUnits = Math.max(0, targetStock - currentUnits);
  const status: ReplenishmentStatus = recommendedUnits > 0 ? 'REPLENISH' : 'NO_ACTION';

  return {
    currentUnits,
    reorderLevel,
    averageDailyDemand,
    targetDays,
    targetStock,
    recommendedUnits,
    status,
  };
}
