# Demand research data

`synthetic_demand.csv` is generated research data. It is not production inventory, not patient data, and must not be used to claim real-world model performance.

Generate it from the backend directory:

```bash
npm run research:demand
```

The generator is deterministic and produces 180 daily observations for three synthetic medicines. It includes weekday effects, mild seasonality, and bounded noise. Experiments must document that the data is synthetic and should later be repeated with an approved real dataset or a clearly documented de-identified source.

Expected columns:

- `date`
- `medicine_id`
- `medicine_name`
- `quantity_issued`
- `is_synthetic`

## Baseline evaluation

Run the chronological 80/20 comparison from the backend directory:

```bash
npm run research:evaluate
```

The result is written to `research/results/synthetic_baseline_evaluation.json`. The current experiment compares a naive last-value baseline with a seven-day moving average using MAE; the moving average also reports RMSE. The current synthetic run is an engineering baseline only and is not evidence of production forecasting performance.

## LightGBM forecasting baseline

Run the research-grade LightGBM demand model from the backend directory:

```bash
npm run research:ml
```

This script trains a LightGBM regressor on the synthetic demand dataset using lag and rolling-window features for medicine demand. It writes metrics to `research/results/lightgbm_forecast_metrics.json` and prediction output to `research/results/lightgbm_predictions.csv`.

This is still a synthetic-only benchmarking pipeline. It must not be treated as proof of production performance for a real pharmacy deployment.
