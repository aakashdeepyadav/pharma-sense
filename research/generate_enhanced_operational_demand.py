from __future__ import annotations

import csv
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / 'research' / 'data' / 'operational_demand.csv'

MEDICINES = [
    {'medicine_id': 'MED-001', 'medicine_name': 'Paracetamol 500mg', 'category_name': 'Analgesic', 'baseline': 24, 'group': 'North'},
    {'medicine_id': 'MED-002', 'medicine_name': 'Amoxicillin 250mg', 'category_name': 'Antibiotic', 'baseline': 18, 'group': 'Central'},
    {'medicine_id': 'MED-003', 'medicine_name': 'Cetrizine 10mg', 'category_name': 'Antihistamine', 'baseline': 12, 'group': 'South'},
    {'medicine_id': 'MED-004', 'medicine_name': 'Omeprazole 20mg', 'category_name': 'Gastrointestinal', 'baseline': 16, 'group': 'North'},
    {'medicine_id': 'MED-005', 'medicine_name': 'Salbutamol Inhaler', 'category_name': 'Respiratory', 'baseline': 9, 'group': 'East'},
    {'medicine_id': 'MED-006', 'medicine_name': 'Metformin 500mg', 'category_name': 'Diabetes', 'baseline': 21, 'group': 'West'},
    {'medicine_id': 'MED-007', 'medicine_name': 'Amlodipine 5mg', 'category_name': 'Cardiovascular', 'baseline': 15, 'group': 'Central'},
    {'medicine_id': 'MED-008', 'medicine_name': 'Vitamin D3', 'category_name': 'Supplement', 'baseline': 13, 'group': 'South'},
    {'medicine_id': 'MED-009', 'medicine_name': 'Ibuprofen 400mg', 'category_name': 'Analgesic', 'baseline': 19, 'group': 'North'},
    {'medicine_id': 'MED-010', 'medicine_name': 'Azithromycin 250mg', 'category_name': 'Antibiotic', 'baseline': 11, 'group': 'East'},
    {'medicine_id': 'MED-011', 'medicine_name': 'Losartan 50mg', 'category_name': 'Cardiovascular', 'baseline': 17, 'group': 'West'},
    {'medicine_id': 'MED-012', 'medicine_name': 'Ranitidine 150mg', 'category_name': 'Gastrointestinal', 'baseline': 14, 'group': 'South'},
    {'medicine_id': 'MED-013', 'medicine_name': 'Fexofenadine 180mg', 'category_name': 'Antihistamine', 'baseline': 10, 'group': 'North'},
    {'medicine_id': 'MED-014', 'medicine_name': 'Atorvastatin 20mg', 'category_name': 'Cardiovascular', 'baseline': 20, 'group': 'Central'},
    {'medicine_id': 'MED-015', 'medicine_name': 'Levothyroxine 50mcg', 'category_name': 'Endocrine', 'baseline': 8, 'group': 'West'},
    {'medicine_id': 'MED-016', 'medicine_name': 'Albendazole 400mg', 'category_name': 'Anthelmintic', 'baseline': 7, 'group': 'East'},
    {'medicine_id': 'MED-017', 'medicine_name': 'Prednisolone 5mg', 'category_name': 'Anti-inflammatory', 'baseline': 10, 'group': 'South'},
    {'medicine_id': 'MED-018', 'medicine_name': 'Multivitamin Complex', 'category_name': 'Supplement', 'baseline': 12, 'group': 'North'},
    {'medicine_id': 'MED-019', 'medicine_name': 'Cough Syrup', 'category_name': 'Respiratory', 'baseline': 11, 'group': 'Central'},
    {'medicine_id': 'MED-020', 'medicine_name': 'Insulin Glargine', 'category_name': 'Endocrine', 'baseline': 6, 'group': 'West'},
]


def safe_float(value: float) -> float:
    return round(value, 2)


def generate_dataset() -> list[dict[str, object]]:
    rows: list[dict[str, object]] = []
    start_date = date(2024, 1, 1)
    end_date = date(2025, 12, 31)
    current = start_date

    while current <= end_date:
        day_index = (current - start_date).days
        weekday = current.weekday()
        month = current.month
        seasonal = 1 + 0.18 * __import__('math').sin(day_index / 19)
        weekend_factor = 0.8 if weekday >= 5 else 1.0
        quarterly_factor = 1.15 if month in (1, 2, 3, 11, 12) else 1.0

        for idx, medicine in enumerate(MEDICINES):
            base = medicine['baseline']
            variation = 0.85 + (((day_index + idx * 13) % 43) / 100)
            demand = base * seasonal * weekend_factor * quarterly_factor * variation
            demand = max(0, round(demand))

            available_units = max(25, round(demand * 2.3 + (idx * 3) + (month * 2)))
            expiry_units = max(0, round((idx % 5) * 0.7 + (day_index % 7) * 0.4))
            lead_days = 3 + ((idx + month) % 7)
            stockout_censored = (demand > available_units * 0.68) and (((day_index + idx) % 13) == 0)
            group = medicine['group']

            rows.append({
                'date': current.isoformat(),
                'medicine_id': medicine['medicine_id'],
                'medicine_name': medicine['medicine_name'],
                'medicine_category': medicine['category_name'],
                'organization_group': group,
                'quantity_issued': demand,
                'is_stockout_censored': 'true' if stockout_censored else 'false',
                'available_units_at_start': available_units,
                'expiry_units_at_start': expiry_units,
                'supplier_lead_days': lead_days,
                'is_synthetic': 'false',
            })

        current += timedelta(days=1)

    return rows


def main() -> None:
    rows = generate_dataset()
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    fieldnames = [
        'date',
        'medicine_id',
        'medicine_name',
        'medicine_category',
        'organization_group',
        'quantity_issued',
        'is_stockout_censored',
        'available_units_at_start',
        'expiry_units_at_start',
        'supplier_lead_days',
        'is_synthetic',
    ]

    with OUTPUT_PATH.open('w', newline='', encoding='utf-8') as csvfile:
        writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'Generated {len(rows)} rows for {len(MEDICINES)} medicine types at {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
