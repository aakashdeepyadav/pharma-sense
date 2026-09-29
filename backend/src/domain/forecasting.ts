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