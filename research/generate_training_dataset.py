from __future__ import annotations

import math
from datetime import date, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT / 'research' / 'data' / 'operational_demand.csv'

MEDICINES = [
    {'id': 1, 'name': 'Paracetamol', 'baseline': 30},
    {'id': 2, 'name': 'Amoxicillin', 'baseline': 19},
    {'id': 3, 'name': 'Cetirizine', 'baseline': 12},
    {'id': 4, 'name': 'Ibuprofen', 'baseline': 16},
    {'id': 5, 'name': 'Omeprazole', 'baseline': 11},
    {'id': 6, 'name': 'Amlodipine', 'baseline': 10},
    {'id': 7, 'name': 'Metformin', 'baseline': 24},
    {'id': 8, 'name': 'Salbutamol', 'baseline': 8},
    {'id': 9, 'name': 'Azithromycin', 'baseline': 14},
    {'id': 10, 'name': 'Cefixime', 'baseline': 13},
]


def build_dataset() -> list[str]:
    rows = ['date,medicine_id,quantity_issued,is_synthetic']
    start_date = date(2025, 1, 1)
    for day in range(365):
        current_date = start_date + timedelta(days=day)
        date_value = current_date.isoformat()
        for medicine in MEDICINES:
            week_day = (day + 1) % 7
            weekend_factor = 0.8 if week_day in (5, 6) else 1.15
            seasonal_factor = 1 + math.sin(day / 18 + medicine['id'] * 0.8) * 0.16
            trend_factor = 1 + (day / 365) * 0.22
            noise = 0.9 + ((day * 13 + medicine['id'] * 17) % 17) / 100
            quantity = int(max(0, round(medicine['baseline'] * weekend_factor * seasonal_factor * trend_factor * noise)))
            if day % 17 == 0 and medicine['id'] % 2 == 0:
                quantity = max(0, quantity - 5)
            if day % 29 == 0 and medicine['id'] % 3 == 0:
                quantity = max(0, quantity + 4)
            rows.append(f'{date_value},{medicine["id"]},{quantity},true')
    return rows


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    rows = build_dataset()
    OUTPUT_PATH.write_text('\n'.join(rows) + '\n', encoding='utf-8')
    print(f'Generated {len(rows) - 1} training rows at {OUTPUT_PATH}')


if __name__ == '__main__':
    main()
