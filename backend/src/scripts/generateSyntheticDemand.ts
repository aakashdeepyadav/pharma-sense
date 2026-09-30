import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const medicines = [
  { id: 1, name: 'Synthetic Paracetamol', baseline: 24 },
  { id: 2, name: 'Synthetic Amoxicillin', baseline: 15 },
  { id: 3, name: 'Synthetic Cetirizine', baseline: 9 },
];
const startDate = new Date('2026-01-01T00:00:00.000Z');
const numberOfDays = 180;
let seed = 20260930;

function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}

function formatDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

async function generate() {
  const rows = ['date,medicine_id,medicine_name,quantity_issued,is_synthetic'];
  for (let day = 0; day < numberOfDays; day += 1) {
    const date = new Date(startDate);
    date.setUTCDate(date.getUTCDate() + day);
    const weekdayFactor = date.getUTCDay() === 0 || date.getUTCDay() === 6 ? 0.8 : 1;
    for (const medicine of medicines) {
      const seasonalFactor = 1 + Math.sin(day / 21) * 0.12;
      const noise = 0.85 + random() * 0.3;
      const quantity = Math.max(0, Math.round(medicine.baseline * weekdayFactor * seasonalFactor * noise));
      rows.push(`${formatDate(date)},${medicine.id},${medicine.name},${quantity},true`);
    }
  }

  const outputDirectory = resolve(process.cwd(), '..', 'research', 'data');
  await mkdir(outputDirectory, { recursive: true });
  const outputPath = resolve(outputDirectory, 'synthetic_demand.csv');
  await writeFile(outputPath, `${rows.join('\n')}\n`, 'utf8');
  console.log(`Generated ${rows.length - 1} synthetic demand rows at ${outputPath}`);
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});