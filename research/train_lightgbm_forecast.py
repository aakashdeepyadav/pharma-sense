from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.compose import ColumnTransformer
from sklearn.metrics import mean_absolute_error, mean_squared_error
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

REQUIRED_COLUMNS = {'date', 'medicine_id', 'quantity_issued'}
OPTIONAL_FEATURE_COLUMNS = {
    'medicine_name',
    'medicine_category',
    'organization_group',
    'is_stockout_censored',
    'available_units_at_start',
    'expiry_units_at_start',
    'supplier_lead_days',
}

ROOT = Path(__file__).resolve().parent.parent
FEATURE_TABLE_PATH = ROOT / 'research' / 'results' / 'forecast_feature_table.csv'
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


def validate_dataset(df: pd.DataFrame) -> dict:
    missing = sorted(REQUIRED_COLUMNS - set(df.columns))
    if missing:
        raise ValueError(f'Missing required columns: {missing}')

    if df.empty:
        raise ValueError('Dataset is empty.')

    df['date'] = pd.to_datetime(df['date'], utc=True)
    if df['date'].isna().any():
        raise ValueError('Date column contains invalid values.')

    if (df['date'] > pd.Timestamp.now(tz='UTC')).any():
        raise ValueError('Dataset contains future dates and cannot be used for forecasting.')

    if (df['quantity_issued'] < 0).any():
        raise ValueError('quantity_issued contains negative values.')

    if df.duplicated(subset=['date', 'medicine_id']).any():
        raise ValueError('Duplicate medicine/date rows were found.')

    return {
        'rows': int(len(df)),
        'medicines': int(df['medicine_id'].nunique()),
        'date_from': df['date'].min().isoformat(),
        'date_to': df['date'].max().isoformat(),
    }


def load_data() -> pd.DataFrame:
    df = pd.read_csv(DATA_PATH)
    validation = validate_dataset(df)
    df['date'] = pd.to_datetime(df['date'], utc=True)
    df = df.sort_values(['medicine_id', 'date']).reset_index(drop=True)
    return df, validation


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    out = df.copy()
    out['medicine_id'] = out['medicine_id'].astype(str)
    out['day_of_week'] = out['date'].dt.dayofweek
    out['month'] = out['date'].dt.month
    out['week_of_year'] = out['date'].dt.isocalendar().week.astype(int)
    out['is_weekend'] = out['day_of_week'].isin([5, 6]).astype(int)

    if 'is_stockout_censored' in out.columns:
        out['is_stockout_censored'] = out['is_stockout_censored'].astype(str).str.lower().eq('true').astype(int)
    if 'available_units_at_start' in out.columns:
        out['available_units_at_start'] = pd.to_numeric(out['available_units_at_start'], errors='coerce').fillna(0)
    if 'expiry_units_at_start' in out.columns:
        out['expiry_units_at_start'] = pd.to_numeric(out['expiry_units_at_start'], errors='coerce').fillna(0)
    if 'supplier_lead_days' in out.columns:
        out['supplier_lead_days'] = pd.to_numeric(out['supplier_lead_days'], errors='coerce').fillna(0)

    for lag in [1, 7, 14, 30]:
        out[f'lag_{lag}'] = out.groupby('medicine_id')['quantity_issued'].transform(lambda s: s.shift(lag))

    for window in [7, 14, 30]:
        out[f'rolling_mean_{window}'] = (
            out.groupby('medicine_id')['quantity_issued']
            .transform(lambda s: s.shift(1).rolling(window, min_periods=1).mean())
        )

    out['target'] = out.groupby('medicine_id')['quantity_issued'].shift(-1)
    feature_columns = ['lag_1', 'lag_7', 'lag_14', 'lag_30', 'rolling_mean_7', 'rolling_mean_14', 'rolling_mean_30', 'target']
    out = out.dropna(subset=feature_columns).reset_index(drop=True)
    return out


def train_model(train_df: pd.DataFrame, test_df: pd.DataFrame) -> tuple[Pipeline, pd.DataFrame, dict, list[str]]:
    categorical = ['medicine_id']
    if 'medicine_category' in train_df.columns:
        categorical.append('medicine_category')
    if 'organization_group' in train_df.columns:
        categorical.append('organization_group')
    if 'medicine_name' in train_df.columns:
        categorical.append('medicine_name')

    numeric = [
        'day_of_week',
        'month',
        'week_of_year',
        'is_weekend',
        'lag_1',
        'lag_7',
        'lag_14',
        'lag_30',
        'rolling_mean_7',
        'rolling_mean_14',
        'rolling_mean_30',
    ]
    for column in ['is_stockout_censored', 'available_units_at_start', 'expiry_units_at_start', 'supplier_lead_days']:
        if column in train_df.columns:
            numeric.append(column)

    preprocessor = ColumnTransformer(
        transformers=[
            ('cat', OneHotEncoder(handle_unknown='ignore'), categorical),
            ('num', 'passthrough', numeric),
        ]
    )

    model = Pipeline(
        steps=[
            ('preprocessor', preprocessor),
            ('model', LGBMRegressor(
                objective='regression',
                n_estimators=500,
                learning_rate=0.05,
                num_leaves=31,
                subsample=0.9,
                colsample_bytree=0.9,
                random_state=42,
                verbose=-1,
            )),
        ]
    )

    X_train = train_df[categorical + numeric]
    y_train = train_df['target']
    X_test = test_df[categorical + numeric]
    y_test = test_df['target']

    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    preds = np.clip(preds, 0, None)

    feature_names = list(model.named_steps['preprocessor'].get_feature_names_out())
    importances = model.named_steps['model'].feature_importances_
    ranked_features = sorted(
        zip(feature_names, importances.tolist()),
        key=lambda item: item[1],
        reverse=True,
    )[:10]

    metrics = {
        'mae': float(mean_absolute_error(y_test, preds)),
        'rmse': float(np.sqrt(mean_squared_error(y_test, preds))),
        'train_rows': int(len(train_df)),
        'test_rows': int(len(test_df)),
        'baseline_naive_mae': float(np.mean(np.abs(y_test - y_test.shift(1).fillna(y_test.mean())))),
        'top_feature_importance': [
            {'feature': feature, 'importance': float(score)}
            for feature, score in ranked_features
        ],
    }

    result_df = pd.DataFrame({
        'actual': y_test.reset_index(drop=True),
        'predicted': preds,
        'medicine_id': X_test['medicine_id'].reset_index(drop=True),
        'date': test_df['date'].reset_index(drop=True),
    })

    return model, result_df, metrics, feature_names


def recommend_replenishment(row: pd.Series) -> dict:
    current_stock = max(float(row.get('current_stock', 0.0)), 0.0)
    reorder_level = max(float(row.get('reorder_level', 0.0)), 0.0)
    lead_time_days = max(float(row.get('lead_time_days', 0.0)), 1.0)
    safety_stock = max(float(row.get('safety_stock', 0.0)), 0.0)
    forecast_demand = max(float(row.get('predicted_demand', 0.0)), 0.0)

    projected_need = forecast_demand * lead_time_days
    target_cover = reorder_level + safety_stock
    recommended_units = max(0.0, projected_need + target_cover - current_stock)
    status = 'REPLENISH' if recommended_units > 0 else 'NO_ACTION'

    return {
        'status': status,
        'recommended_units': round(float(recommended_units), 2),
        'projected_need': round(float(projected_need), 2),
        'target_cover': round(float(target_cover), 2),
        'current_stock': round(float(current_stock), 2),
    }


def main() -> None:
    data_path, data_source = choose_data_source()
    if data_source == 'synthetic':
        print('Using synthetic fallback dataset because operational history is insufficient for a real production check.')

    df = pd.read_csv(data_path)
    validation = validate_dataset(df)
    df['date'] = pd.to_datetime(df['date'], utc=True)
    df = df.sort_values(['medicine_id', 'date']).reset_index(drop=True)
    feature_df = build_features(df)
    validation = validate_dataset(feature_df)

    if 'target' not in feature_df.columns:
        feature_df = build_features(feature_df)
        validation = validate_dataset(feature_df)

    feature_df = feature_df.dropna(subset=['target', 'lag_1', 'lag_7', 'lag_14', 'lag_30', 'rolling_mean_7', 'rolling_mean_14', 'rolling_mean_30']).reset_index(drop=True)

    if data_source == 'operational' and feature_df['date'].nunique() < 30:
        raise ValueError(
            'Insufficient operational history for a real forecasting model. '
            'At least 30 daily records are required for a valid time-based model check.'
        )

    time_cutoff = feature_df['date'].quantile(0.8)
    train_df = feature_df[feature_df['date'] < time_cutoff].copy()
    test_df = feature_df[feature_df['date'] >= time_cutoff].copy()

    if train_df.empty or test_df.empty:
        raise ValueError('Insufficient data for a valid time-based train and test split.')

    model, result_df, metrics, feature_names = train_model(train_df, test_df)

    summary = {
        'model': 'LightGBM baseline',
        'dataset': str(data_path.relative_to(ROOT)),
        'data_source': data_source,
        'production_ready': data_source == 'operational',
        'production_ready_structure': {
            'time_based_split': True,
            'feature_validation': True,
            'explainability': True,
            'business_decision_layer': True,
        },
        'validation': validation,
        'forecast_horizon_days': 1,
        'metrics': metrics,
        'feature_names': feature_names,
        'notes': [
            'Operational data is preferred for production evaluation; a synthetic fallback is used only when operational history is insufficient.',
            'This is a baseline pipeline and not evidence of production forecasting performance unless the dataset is approved and operational.',
            'Operational production deployment requires an approved real or de-identified dataset and human sign-off.',
        ],
    }

    RESULTS_DIR.joinpath('lightgbm_forecast_metrics.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    RESULTS_DIR.joinpath('lightgbm_predictions.csv').write_text(
        result_df[['date', 'medicine_id', 'actual', 'predicted']].to_csv(index=False),
        encoding='utf-8',
    )

    example = {
        'medicine_id': '1',
        'current_stock': 25,
        'reorder_level': 20,
        'lead_time_days': 7,
        'safety_stock': 10,
        'predicted_demand': float(result_df[result_df['medicine_id'] == '1']['predicted'].mean()),
    }
    RESULTS_DIR.joinpath('lightgbm_replenishment_example.json').write_text(
        json.dumps(recommend_replenishment(pd.Series(example)), indent=2),
        encoding='utf-8',
    )

    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
