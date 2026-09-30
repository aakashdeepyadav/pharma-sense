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