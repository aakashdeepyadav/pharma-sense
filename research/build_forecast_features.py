from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
OPERATIONAL_DATA_PATH = ROOT / 'research' / 'data' / 'operational_demand.csv'
SYNTHETIC_DATA_PATH = ROOT / 'research' / 'data' / 'synthetic_demand.csv'
RESULTS_DIR = ROOT / 'research' / 'results'
RESULTS_DIR.mkdir(parents=True, exist_ok=True)


def choose_data_source() -> tuple[Path, str]:
    if OPERATIONAL_DATA_PATH.exists():
        operational_df = pd.read_csv(OPERATIONAL_DATA_PATH)
        if {'date'}.issubset(operational_df.columns) and len(operational_df['date'].dropna()) >= 30:
            return OPERATIONAL_DATA_PATH, 'operational'
    return SYNTHETIC_DATA_PATH, 'synthetic'


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out['date'] = pd.to_datetime(out['date'], utc=True)
    out['medicine_id'] = out['medicine_id'].astype(str)
    out['day_of_week'] = out['date'].dt.dayofweek
    out['month'] = out['date'].dt.month
    out['week_of_year'] = out['date'].dt.isocalendar().week.astype(int)
    out['is_weekend'] = out['day_of_week'].isin([5, 6]).astype(int)

    out = out.sort_values(['medicine_id', 'date']).reset_index(drop=True)

    for lag in [1, 7, 14, 30]:
        out[f'lag_{lag}'] = out.groupby('medicine_id')['quantity_issued'].transform(lambda s: s.shift(lag))

    for window in [7, 14, 30]:
        out[f'rolling_mean_{window}'] = (
            out.groupby('medicine_id')['quantity_issued']
            .transform(lambda s: s.shift(1).rolling(window, min_periods=1).mean())
        )

    out['target_next_day'] = out.groupby('medicine_id')['quantity_issued'].shift(-1)
    feature_columns = ['lag_1', 'lag_7', 'lag_14', 'lag_30', 'rolling_mean_7', 'rolling_mean_14', 'rolling_mean_30', 'target_next_day']
    out = out.dropna(subset=feature_columns).reset_index(drop=True)
    return out


def main() -> None:
    data_path, source = choose_data_source()
    df = pd.read_csv(data_path)
    feature_df = build_features(df)
    output_path = RESULTS_DIR / 'forecast_feature_table.csv'
    feature_df.to_csv(output_path, index=False)

    summary = {
        'data_source': source,
        'dataset': str(data_path.relative_to(ROOT)),
        'rows': int(len(feature_df)),
        'medicines': int(feature_df['medicine_id'].nunique()),
        'date_from': feature_df['date'].min().isoformat(),
        'date_to': feature_df['date'].max().isoformat(),
        'output_path': str(output_path),
        'columns': list(feature_df.columns),
    }

    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
