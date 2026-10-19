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

This script trains a LightGBM regressor using calendar, lag, and rolling-window features. When the synthetic dataset is selected, it writes evaluation metrics and prediction output under `research/results/` and exports a portable tree model plus dashboard metric artifacts under `backend/ml-artifacts/`. The API evaluates those exported trees directly in TypeScript; a separate Python inference server is not required.

The live endpoint `GET /api/v1/reports/forecast-ml/predictions?medicineId={id}` applies the packaged model to 30 full UTC days of that medicine's stock OUT transactions. The current packaged model was trained on synthetic data and is only a working demonstration; its prediction is not production-calibrated. If operational data is selected, the script intentionally does not export a deployable model. Operational model release requires approved data, representative evaluation, and private governance.
