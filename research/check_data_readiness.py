from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OPERATIONAL_PATH = ROOT / 'research' / 'data' / 'operational_demand.csv'
SYNTHETIC_PATH = ROOT / 'research' / 'data' / 'synthetic_demand.csv'

REQUIRED_COLUMNS = {'date', 'medicine_id', 'quantity_issued'}


def load_dataset(path: Path) -> pd.DataFrame:
    df = pd.read_csv(path)
    missing = sorted(REQUIRED_COLUMNS - set(df.columns))
    if missing:
        raise ValueError(f'{path.name} is missing required columns: {missing}')
    df['date'] = pd.to_datetime(df['date'], utc=True)
    return df.dropna(subset=['date', 'medicine_id', 'quantity_issued']).reset_index(drop=True)


def evaluate_operational_readiness() -> dict:
    report = {
        'dataset': 'operational_demand.csv',
        'operational_file_exists': OPERATIONAL_PATH.exists(),
        'production_ready': False,
        'fallback_dataset': SYNTHETIC_PATH.name,
        'reasons': [],
        'metrics': {},
    }

    if not OPERATIONAL_PATH.exists():
        report['reasons'].append('Operational demand file is not present yet.')
        report['metrics'] = {'rows': 0, 'medicines': 0, 'unique_days': 0, 'date_from': None, 'date_to': None}
        return report

    try:
        df = load_dataset(OPERATIONAL_PATH)
    except Exception as exc:  # pragma: no cover - reporting path
        report['reasons'].append(f'Operational dataset failed validation: {exc}')
        report['metrics'] = {'rows': 0, 'medicines': 0, 'unique_days': 0, 'date_from': None, 'date_to': None}
        return report

    unique_days = int(df['date'].nunique())
    medicine_count = int(df['medicine_id'].nunique())
    rows = int(len(df))

    report['metrics'] = {
        'rows': rows,
        'medicines': medicine_count,
        'unique_days': unique_days,
        'date_from': df['date'].min().isoformat() if not df.empty else None,
        'date_to': df['date'].max().isoformat() if not df.empty else None,
    }

    if rows == 0:
        report['reasons'].append('Operational dataset is empty.')
    if unique_days < 30:
        report['reasons'].append('Operational history is shorter than 30 days. This is insufficient for a time-based model check.')
    if medicine_count < 2:
        report['reasons'].append('Operational data contains fewer than 2 medicines; model validation is weak.')
    if (df['quantity_issued'] < 0).any():
        report['reasons'].append('Negative demand values are present in operational data.')

    if not report['reasons']:
        report['production_ready'] = True
        report['reasons'].append('Operational dataset meets the minimum readiness gate for a forecasting training check.')

    return report


def main() -> None:
    report = evaluate_operational_readiness()
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
