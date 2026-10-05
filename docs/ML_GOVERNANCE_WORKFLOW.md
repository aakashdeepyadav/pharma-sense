# ML Governance Workflow for PharmaSense

## Objective

This workflow defines how demand forecasting is used in PharmaSense without turning model output into an autonomous operational decision. Forecasting is an advisory layer that supports review, planning, and auditability.

## Decision principle

- Forecast output is evidence, not action.
- The model never places an order or changes stock by itself.
- Human staff must review recommended replenishment decisions.
- Every decision is recorded in audit logs.

## Lifecycle

### 1. Data collection

- Pull operational demand history from stock transactions.
- Validate that each record includes a valid date, medicine ID, and quantity.
- Remove invalid, future-dated, or negative entries.
- Keep the data in a daily medicine-level format.

### 2. Data readiness gate

Before use in a production decision workflow, the project should confirm:

- enough daily observations exist
- there are no future-only or invalid dates
- demand is not zero across the full window
- the dataset has a usable time structure
- the data passes business quality and reconciliation checks

If readiness fails, the system should remain in a human-review baseline only and not claim production forecasting quality.

### 3. Feature engineering

The forecasting baseline uses:

- lag features such as 1, 7, 14, and 30 day demand
- rolling mean features for 7, 14, and 30 day windows
- weekday, month, and seasonality signals
- medicine-specific grouping and temporal structure

### 4. Model training and validation

Training should use a time-based split instead of random sampling. The expected flow is:

1. Sort by medicine and date.
2. Use an 80/20 time split.
3. Fit the LightGBM model on historical demand.
4. Score on the later horizon.
5. Compare with naive and moving-average baselines.

Evaluation should review:

- MAE
- RMSE
- forecast stability by medicine
- sensitivity to short-history medicines

### 5. Decision support output

The model should produce:

- predicted daily demand
- forecast risk level
- stock cover estimate
- projected stock after 7 days
- replenishment recommendation status

These outputs should be visible to managers and pharmacists, but not applied automatically.

### 6. Human review workflow

When a medicine is flagged as medium or high risk:

1. Review the forecast evidence and stock cover.
2. Check the current batch quantity and reorder level.
3. Confirm whether the medicine should be replenished.
4. Approve, dismiss, or defer the recommendation.
5. Record the decision in the audit log with user and timestamp.

### 7. Audit and governance

Every approval or dismissal should log:

- user identity
- medicine ID and name
- risk level
- recommendation state
- decision outcome
- timestamp
- notes

This ensures accountability and allows review of model-support decisions over time.

## Practical commands

From the repo root:

```powershell
cd "c:\Users\aakas\Documents\PlayGround 2.0\PharmaSense"
(Set-ExecutionPolicy -Scope Process -ExecutionPolicy RemoteSigned) ; (& ".\.venv\Scripts\Activate.ps1")
cd backend
npm run research:ml
npm test
```

## Weekly operational checklist

- confirm data quality checks still pass
- verify forecast metrics remain stable
- review rising risk medicines
- examine any replenishment decisions that were approved or dismissed
- confirm audit logs are complete
- check whether the operational dataset remains valid for forecasting

## Production caution

The project should not claim a fully autonomous production forecasting system until:

- a real approved operational dataset is in place
- forecast changes are reviewed by responsible staff
- monitoring and drift checks are configured
- retraining governance is defined
- business ownership has signed off on the model use

This workflow preserves the current safe operating model: evidence-driven forecasting with human oversight.
