export function movingAverageForecast(values: number[], window: number, horizon: number) {
  if (horizon < 1 || window < 1) return [];
  const recentValues = values.slice(-window);
  const average = recentValues.length === 0
    ? 0
    : recentValues.reduce((total, value) => total + value, 0) / recentValues.length;
  return Array.from({ length: horizon }, () => average);
}

export function movingAverageMae(values: number[], window: number) {
  if (window < 1 || values.length <= window) return null;
  let absoluteError = 0;
  let evaluatedPoints = 0;
  for (let index = window; index < values.length; index += 1) {
    const history = values.slice(index - window, index);
    const prediction = history.reduce((total, value) => total + value, 0) / window;
    absoluteError += Math.abs(values[index] - prediction);
    evaluatedPoints += 1;
  }
  return absoluteError / evaluatedPoints;
}

export function assessForecastReadiness(values: number[], window: number) {
  const daysWithDemand = values.filter((value) => value > 0).length;
  const minimumDays = Math.max(window + 1, 14);
  return {
    totalDays: values.length,
    daysWithDemand,
    zeroDemandDays: values.length - daysWithDemand,
    observationRate: values.length === 0 ? 0 : daysWithDemand / values.length,
    status: values.length >= minimumDays && daysWithDemand > 0 ? 'READY_FOR_BASELINE' : 'INSUFFICIENT_HISTORY',
  } as const;
}

export function naiveForecast(values: number[], horizon: number) {
  const lastValue = values.length === 0 ? 0 : values[values.length - 1];
  return Array.from({ length: horizon }, () => lastValue);
}

export function assessDemandRisk(values: number[], currentStock: number, reorderLevel: number, window = 7) {
  const recentValues = values.slice(-window);
  const predictedDailyDemand = recentValues.length === 0
    ? 0
    : recentValues.reduce((total, value) => total + value, 0) / recentValues.length;
  const coverDays = predictedDailyDemand > 0 ? currentStock / predictedDailyDemand : Number.POSITIVE_INFINITY;
  const projectedStockAfter7Days = Math.max(currentStock - predictedDailyDemand * 7, 0);

  if (values.length < Math.max(window, 14)) {
    return {
      riskLevel: 'INSUFFICIENT_DATA',
      predictedDailyDemand,
      coverDays: Number.isFinite(coverDays) ? coverDays : null,
      projectedStockAfter7Days,
      message: 'Not enough historical demand to assess the risk with confidence.',
    } as const;
  }

  if (currentStock <= reorderLevel || projectedStockAfter7Days <= 0 || coverDays <= 2) {
    return {
      riskLevel: 'HIGH',
      predictedDailyDemand,
      coverDays: Number.isFinite(coverDays) ? coverDays : null,
      projectedStockAfter7Days,
      message: 'Projected demand exceeds the current stock buffer and should be reviewed urgently.',
    } as const;
  }

  if (currentStock <= reorderLevel * 1.5 || coverDays <= 7) {
    return {
      riskLevel: 'MEDIUM',
      predictedDailyDemand,
      coverDays: Number.isFinite(coverDays) ? coverDays : null,
      projectedStockAfter7Days,
      message: 'Demand is elevated and stock cover is tightening.',
    } as const;
  }

  return {
    riskLevel: 'LOW',
    predictedDailyDemand,
    coverDays: Number.isFinite(coverDays) ? coverDays : null,
    projectedStockAfter7Days,
    message: 'Demand risk is within a normal operating band.',
  } as const;
}

export function evaluateHoldout(values: number[], window: number, trainRatio = 0.8) {
  if (values.length < 2 || window < 1 || trainRatio <= 0 || trainRatio >= 1) return null;
  const splitIndex = Math.max(1, Math.floor(values.length * trainRatio));
  const history = values.slice(0, splitIndex);
  const actuals = values.slice(splitIndex);
  const predictions: number[] = [];

  for (const actual of actuals) {
    predictions.push(movingAverageForecast(history, window, 1)[0] ?? 0);
    history.push(actual);
  }

  const squaredError = predictions.reduce((total, prediction, index) => {
    const difference = actuals[index] - prediction;
    return total + difference * difference;
  }, 0);
  const absoluteError = predictions.reduce(
    (total, prediction, index) => total + Math.abs(actuals[index] - prediction),
    0,
  );
  return {
    trainSize: splitIndex,
    testSize: actuals.length,
    mae: absoluteError / actuals.length,
    rmse: Math.sqrt(squaredError / actuals.length),
  };
}