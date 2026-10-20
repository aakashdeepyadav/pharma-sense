from __future__ import annotations

import json
from datetime import datetime, timezone
from pathlib import Path

import numpy as np
import pandas as pd
from lightgbm import LGBMRegressor
from sklearn.metrics import mean_absolute_error, mean_squared_error

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
MODEL_ARTIFACT_PATH = ROOT / 'backend' / 'ml-artifacts' / 'lightgbm_model.json'
RESULTS_DIR.mkdir(parents=True, exist_ok=True)

MODEL_CANDIDATES = [
    {
        'name': 'lightgbm_conservative',
        'n_estimators': 150,
        'learning_rate': 0.03,
        'num_leaves': 7,
        'min_child_samples': 10,
        'subsample': 0.9,
        'colsample_bytree': 0.9,
    },
    {
        'name': 'lightgbm_baseline',
        'n_estimators': 250,
        'learning_rate': 0.05,
        'num_leaves': 15,
        'min_child_samples': 10,
        'subsample': 0.9,
        'colsample_bytree': 0.9,
    },
    {
        'name': 'lightgbm_regularized',
        'n_estimators': 200,
        'learning_rate': 0.04,
        'num_leaves': 15,
        'min_child_samples': 20,
        'subsample': 0.8,
        'colsample_bytree': 0.8,
        'reg_lambda': 1.0,
    },
]
FEATURE_NAMES = [
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


def choose_data_source() -> tuple[Path, str]:
    if OPERATIONAL_DATA_PATH.exists():
        try:
            operational_df = pd.read_csv(OPERATIONAL_DATA_PATH)
            if (
                {'date', 'medicine_id', 'quantity_issued'}.issubset(operational_df.columns)
                and operational_df['date'].nunique() >= 35
                and operational_df.groupby('medicine_id')['date'].count().min() >= 35
            ):
                return OPERATIONAL_DATA_PATH, 'operational'
        except Exception:
            pass
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


def analyze_dataset(df: pd.DataFrame) -> dict:
    coverage = (
        df.groupby('medicine_id')
        .agg(
            observations=('quantity_issued', 'size'),
            unique_days=('date', 'nunique'),
            mean_demand=('quantity_issued', 'mean'),
            zero_demand_rate=('quantity_issued', lambda values: float((values == 0).mean())),
        )
        .reset_index()
    )
    return {
        'rows': int(len(df)),
        'medicines': int(df['medicine_id'].nunique()),
        'unique_days': int(df['date'].nunique()),
        'date_from': df['date'].min().isoformat(),
        'date_to': df['date'].max().isoformat(),
        'mean_demand': float(df['quantity_issued'].mean()),
        'zero_demand_rate': float((df['quantity_issued'] == 0).mean()),
        'duplicate_medicine_dates': int(df.duplicated(subset=['date', 'medicine_id']).sum()),
        'medicine_coverage': [
            {
                key: (float(value) if isinstance(value, (np.floating, float)) else int(value) if isinstance(value, (np.integer, int)) else str(value))
                for key, value in row.items()
            }
            for row in coverage.to_dict(orient='records')
        ],
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


def train_model(
    train_df: pd.DataFrame,
    test_df: pd.DataFrame,
    model_params: dict,
) -> tuple[LGBMRegressor, pd.DataFrame, dict, list[str]]:
    feature_names = FEATURE_NAMES
    model = LGBMRegressor(
        objective='regression',
        random_state=42,
        verbose=-1,
        **{key: value for key, value in model_params.items() if key != 'name'},
    )

    X_train = train_df[feature_names]
    y_train = train_df['target']
    X_test = test_df[feature_names]
    y_test = test_df['target']

    model.fit(X_train, y_train)
    preds = model.predict(X_test)
    preds = np.clip(preds, 0, None)
    result_df = pd.DataFrame({
        'actual': y_test.reset_index(drop=True),
        'predicted': preds,
        'medicine_id': test_df['medicine_id'].reset_index(drop=True),
        'date': test_df['date'].reset_index(drop=True),
    })

    importances = model.feature_importances_
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
        'baseline_naive_mae': float(np.mean(np.abs(y_test.to_numpy() - test_df['lag_1'].to_numpy()))),
        'baseline_moving_average_7_mae': float(
            mean_absolute_error(y_test, test_df['rolling_mean_7'])
        ),
        'metrics_by_medicine': [
            {
                'medicine_id': str(medicine_id),
                'observations': int(len(group)),
                'mae': float(mean_absolute_error(group['actual'], group['predicted'])),
                'rmse': float(np.sqrt(mean_squared_error(group['actual'], group['predicted']))),
            }
            for medicine_id, group in result_df.groupby('medicine_id')
        ],
        'top_feature_importance': [
            {'feature': feature, 'importance': float(score)}
            for feature, score in ranked_features
        ],
    }

    return model, result_df, metrics, feature_names


def rolling_validation_splits(feature_df: pd.DataFrame, folds: int = 3) -> list[tuple[pd.DataFrame, pd.DataFrame]]:
    dates = sorted(feature_df['date'].drop_duplicates())
    if len(dates) < folds + 2:
        raise ValueError('Insufficient dates for rolling time-series validation.')
    validation_size = max(7, len(dates) // (folds + 2))
    splits = []
    for fold in range(folds):
        validation_end = len(dates) - (folds - fold - 1) * validation_size
        validation_start = validation_end - validation_size
        train_dates = dates[:validation_start]
        validation_dates = dates[validation_start:validation_end]
        train = feature_df[feature_df['date'].isin(train_dates)].copy()
        validation = feature_df[feature_df['date'].isin(validation_dates)].copy()
        if len(train) >= 30 and not validation.empty:
            splits.append((train, validation))
    if len(splits) < 2:
        raise ValueError('Insufficient rows for rolling time-series validation.')
    return list(reversed(splits))


def select_model(feature_df: pd.DataFrame, feature_names: list[str]) -> tuple[dict, list[dict]]:
    scores = []
    for candidate in MODEL_CANDIDATES:
        fold_scores = []
        for train_df, validation_df in rolling_validation_splits(feature_df):
            model = LGBMRegressor(
                objective='regression',
                random_state=42,
                verbose=-1,
                **{key: value for key, value in candidate.items() if key != 'name'},
            )
            model.fit(train_df[feature_names], train_df['target'])
            predictions = np.clip(model.predict(validation_df[feature_names]), 0, None)
            fold_scores.append({
                'mae': float(mean_absolute_error(validation_df['target'], predictions)),
                'rmse': float(np.sqrt(mean_squared_error(validation_df['target'], predictions))),
            })
        scores.append({
            'model': candidate['name'],
            'mean_mae': float(np.mean([score['mae'] for score in fold_scores])),
            'mean_rmse': float(np.mean([score['rmse'] for score in fold_scores])),
            'folds': fold_scores,
            'parameters': candidate,
        })
    scores.sort(key=lambda score: (score['mean_mae'], score['mean_rmse']))
    return next(candidate for candidate in MODEL_CANDIDATES if candidate['name'] == scores[0]['model']), scores


def evaluate_baselines(feature_df: pd.DataFrame) -> list[dict]:
    fold_scores = {'naive_last_value': [], 'moving_average_7': []}
    for _, validation_df in rolling_validation_splits(feature_df):
        fold_scores['naive_last_value'].append(
            float(mean_absolute_error(validation_df['target'], validation_df['lag_1']))
        )
        fold_scores['moving_average_7'].append(
            float(mean_absolute_error(validation_df['target'], validation_df['rolling_mean_7']))
        )
    return [
        {
            'model': model_name,
            'mean_mae': float(np.mean(scores)),
            'folds': scores,
        }
        for model_name, scores in fold_scores.items()
    ]


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
    data_profile = analyze_dataset(df)
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

    selected_params, cross_validation = select_model(feature_df, FEATURE_NAMES)
    model, result_df, metrics, feature_names = train_model(train_df, test_df, selected_params)
    final_model = LGBMRegressor(
        objective='regression',
        random_state=42,
        verbose=-1,
        **{key: value for key, value in selected_params.items() if key != 'name'},
    )
    final_model.fit(feature_df[FEATURE_NAMES], feature_df['target'])

    summary = {
        'model': selected_params['name'],
        'dataset': str(data_path.relative_to(ROOT)),
        'data_source': data_source,
        'production_ready': False,
        'production_readiness_reason': 'A research baseline requires approved data, representative evaluation, and human sign-off before production use.',
        'production_ready_structure': {
            'time_based_split': True,
            'feature_validation': True,
            'explainability': True,
            'business_decision_layer': True,
        },
        'validation': validation,
        'forecast_horizon_days': 1,
        'metrics': metrics,
        'model_selection': {
            'selection_metric': 'mean_mae',
            'selected_model': selected_params['name'],
            'candidates': cross_validation,
            'baselines': evaluate_baselines(feature_df),
        },
        'data_profile': data_profile,
        'feature_names': feature_names,
        'notes': [
            'Operational data is preferred for production evaluation; a synthetic fallback is used only when operational history is insufficient.',
            'This is a baseline pipeline and not evidence of production forecasting performance unless the dataset is approved and operational.',
            'Operational production deployment requires an approved real or de-identified dataset and human sign-off.',
        ],
    }

    export_model_artifact = data_source == 'synthetic'
    if export_model_artifact:
        MODEL_ARTIFACT_PATH.parent.mkdir(parents=True, exist_ok=True)
        artifact = {
            'format': 'lightgbm-booster-json-v1',
            'model': 'LightGBM baseline',
            'training_data_source': data_source,
            'trained_at': datetime.now(timezone.utc).isoformat(),
            'feature_names': feature_names,
            'booster': final_model.booster_.dump_model(),
        }
        MODEL_ARTIFACT_PATH.write_text(json.dumps(artifact, separators=(',', ':')), encoding='utf-8')
        print(f'Portable inference artifact written to {MODEL_ARTIFACT_PATH.relative_to(ROOT)}')
    else:
        print('Operational model artifact was not exported. A governed, private model-release process is required for operational data.')

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
    if export_model_artifact:
        MODEL_ARTIFACT_PATH.parent.joinpath('lightgbm_forecast_metrics.json').write_text(
            json.dumps(summary, indent=2), encoding='utf-8',
        )
        MODEL_ARTIFACT_PATH.parent.joinpath('lightgbm_replenishment_example.json').write_text(
            json.dumps(recommend_replenishment(pd.Series(example)), indent=2), encoding='utf-8',
        )

    print(json.dumps(summary, indent=2))


if __name__ == '__main__':
    main()
