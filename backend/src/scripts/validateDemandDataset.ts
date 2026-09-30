import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const expectedColumns = ['date', 'medicine_id', 'medicine_name', 'quantity_issued', 'is_synthetic'];

function parseBoolean(value: string) {
  return value.toLowerCase() === 'true';
}

async function validate() {
  const datasetPath = resolve(process.cwd(), '..', 'research', 'data', 'synthetic_demand.csv');
  const outputPath = resolve(process.cwd(), '..', 'research', 'results', 'synthetic_data_quality.json');
  const lines = (await readFile(datasetPath, 'utf8')).trim().split(/\r?\n/);
  const columns = lines[0].split(',');
  const errors: string[] = [];
  const warnings: string[] = [];
  const medicineIds = new Set<string>();
  const keys = new Set<string>();
  const dates: string[] = [];
  let zeroDemandDays = 0;

  if (columns.join(',') !== expectedColumns.join(',')) {
    errors.push(`Expected columns ${expectedColumns.join(',')}, received ${columns.join(',')}`);
  }

  for (const [index, line] of lines.slice(1).entries()) {
    const rowNumber = index + 2;
    const [date, medicineId, medicineName, quantityText, syntheticText] = line.split(',');
    const parsedDate = new Date(`${date}T00:00:00.000Z`);
    const quantity = Number(quantityText);
    const key = `${medicineId}:${date}`;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsedDate.getTime())) errors.push(`Row ${rowNumber}: invalid ISO date`);
    if (parsedDate > new Date()) errors.push(`Row ${rowNumber}: future date`);
    if (!medicineId || !medicineName) errors.push(`Row ${rowNumber}: missing medicine identity`);
    if (!Number.isInteger(quantity) || quantity < 0) errors.push(`Row ${rowNumber}: quantity must be a non-negative integer`);
    if (!parseBoolean(syntheticText)) errors.push(`Row ${rowNumber}: synthetic dataset marker must be true`);
    if (keys.has(key)) errors.push(`Row ${rowNumber}: duplicate medicine/date row ${key}`);

    keys.add(key);
    medicineIds.add(medicineId);
    dates.push(date);
    if (quantity === 0) zeroDemandDays += 1;
  }

  warnings.push('This dataset is synthetic and cannot support production performance claims.');
  warnings.push('Stockout censoring and organization_group are not represented in the synthetic schema.');
  const report = {
    dataset: 'synthetic_demand.csv',
    status: errors.length === 0 ? 'PASS_WITH_WARNINGS' : 'FAIL',
    rows: lines.length - 1,
    medicines: medicineIds.size,
    dateRange: dates.length === 0 ? null : { from: dates[0], to: dates[dates.length - 1] },
    zeroDemandRows: zeroDemandDays,
    errors,
    warnings,
  };
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`Dataset validation ${report.status}: ${outputPath}`);
  if (errors.length > 0) process.exitCode = 1;
}

validate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});