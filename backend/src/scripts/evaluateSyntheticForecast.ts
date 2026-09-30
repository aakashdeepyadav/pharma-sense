import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateHoldout, naiveForecast } from '../domain/forecasting';

type DemandRow = {
  medicineId: number;
  medicineName: string;
  quantity: number;
};

function parseRows(csv: string) {
  const lines = csv.trim().split(/\r?\n/).slice(1);
  return lines.map((line): DemandRow => {
    const [date, medicineId, medicineName, quantity] = line.split(',');
    void date;
    return { medicineId: Number(medicineId), medicineName, quantity: Number(quantity) };
  });
}

function evaluateNaive(values: number[], trainRatio = 0.8) {
  const splitIndex = Math.max(1, Math.floor(values.length * trainRatio));
  const actuals = values.slice(splitIndex);
  const predictions = naiveForecast(values.slice(0, splitIndex), actuals.length);
  const absoluteError = predictions.reduce(
    (total, prediction, index) => total + Math.abs(actuals[index] - prediction),
    0,
  );
  return { trainSize: splitIndex, testSize: actuals.length, mae: absoluteError / actuals.length };
}

async function evaluate() {
  const datasetPath = resolve(process.cwd(), '..', 'research', 'data', 'synthetic_demand.csv');
  const outputPath = resolve(process.cwd(), '..', 'research', 'results', 'synthetic_baseline_evaluation.json');
  const rows = parseRows(await readFile(datasetPath, 'utf8'));
  const results = Array.from(new Map(rows.map((row) => [row.medicineId, row])).values()).map((medicine) => {
    const values = rows.filter((row) => row.medicineId === medicine.medicineId).map((row) => row.quantity);
    return {
      medicineId: medicine.medicineId,
      medicineName: medicine.medicineName,
      observations: values.length,
      naive: evaluateNaive(values),
      movingAverage: evaluateHoldout(values, 7),
    };
  });
  const report = {
    dataset: 'synthetic_demand.csv',
    synthetic: true,
    split: '80% chronological train, 20% chronological test',
    metrics: ['MAE', 'RMSE for moving average'],
    window: 7,
    results,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Wrote baseline evaluation to ${outputPath}`);
}

evaluate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});