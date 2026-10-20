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

## Tuned LightGBM forecasting model

Run the research-grade LightGBM demand model from the backend directory:

```bash
npm run research:ml
```

For an approved operational dataset, use the explicit release command:

```bash
npm run research:ml:operational
```

This command exports the operationally trained artifact used by the live API.
It is intentionally separate from `research:ml` so a synthetic fallback cannot
silently replace an operational release. Confirm the readiness, governance,
privacy, and model-review gates before running it for a deployed environment.

This script trains and selects a LightGBM regressor using calendar, lag, and
rolling-window features. It compares three regularized parameter sets with
three rolling time-series validation folds, then evaluates the selected model
on a final chronological holdout. It also reports naive and seven-day
moving-average baselines, per-medicine metrics, feature importance, and a
dataset coverage profile.

The current synthetic run selected `lightgbm_regularized`:

- rolling-validation MAE: `1.295`
- final holdout MAE: `1.317`
- final holdout RMSE: `1.661`
- final holdout seven-day moving-average MAE: `1.711`
- final holdout naive MAE: `2.844`

These results show improvement on the synthetic benchmark only. The
operational dataset is evaluated separately and is preferred automatically
when it meets the readiness gate.

The current operational run selected `lightgbm_baseline`:

- 20,080 rows across 20 medicines
- 1,004 complete daily dates from 2024-01-01 through 2026-09-30
- no duplicate medicine/date rows and no missing values
- rolling-validation MAE: `0.750`
- final holdout MAE: `0.748`
- final holdout RMSE: `1.344`
- final holdout seven-day moving-average MAE: `1.834`
- final holdout naive MAE: `2.001`

The operational data contains no stockout-censored rows. That is a limitation
for production demand interpretation: observed issues may not represent
unmet demand during stockouts. The model artifact is therefore operationally
trained but remains advisory until censoring coverage, privacy review, and
business model sign-off are complete.

When the synthetic dataset is selected, the script writes evaluation metrics
and prediction output under `research/results/` and exports a portable tree
model plus dashboard metric artifacts under `backend/ml-artifacts/`. The
exported artifact is retrained on all available synthetic feature rows after
selection so the demonstration inference model uses the full development
history. The API evaluates those exported trees directly in TypeScript; a
separate Python inference server is not required.

The live endpoint `GET /api/v1/reports/forecast-ml/predictions?medicineId={id}` applies the packaged model to 30 full UTC days of that medicine's stock OUT transactions. The current packaged model was trained on synthetic data and is only a working demonstration; its prediction is not production-calibrated. If operational data is selected, the script intentionally does not export a deployable model. Operational model release requires approved data, representative evaluation, and private governance.
