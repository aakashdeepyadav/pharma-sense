# Production Forecasting Roadmap

## Goal

Move from a working baseline to a production-ready, governed, and monitorable forecast system for medicine demand.

## Best-practice direction

The best path is not to chase the most advanced model in isolation. The best path is:

- richer real-world data
- stronger feature engineering
- governance-first rollout
- continuous monitoring
- human review before action

## Phase 1: Data depth and quality

### Objectives

- collect at least 12 months of daily medicine demand history
- include multiple medicines, categories, and organization groups
- ensure each row is complete and clean
- remove duplicates, negatives, and invalid dates

### Required fields

- `date`
- `medicine_id`
- `medicine_name`
- `medicine_category`
- `organization_group`
- `quantity_issued`
- `is_stockout_censored`
- `available_units_at_start`
- `expiry_units_at_start`
- `supplier_lead_days`

### Data quality rules

- no future dates
- no negative quantities
- no duplicate medicine-date rows
- each medicine has a stable identifier
- documented timezone handling
- consistent mapping from operational records

## Phase 2: Stronger feature engineering

### Add signals

- lagged demand values: 1, 7, 14, 30 days
- rolling means: 7, 14, 30 days
- seasonality features: month, week of year, day of week
- stock cover signals: available stock, reorder level, safety stock
- item risk signals: expiry pressure, stockout censoring
- discrete context: medicine category, organization group

### Why this matters

The model improves when it learns not only the raw demand trend, but also the operational context behind the demand.

## Phase 3: Model selection and benchmarking

### Recommended product path

Use LightGBM as the baseline production model because it is:

- robust on tabular demand data
- efficient to train and update
- easy to monitor
- practical for business use

### Benchmark against

- naive forecast
- moving average forecast
- simple seasonal baseline
- LightGBM with richer features

### Success metric

Target the model to outperform naive and moving-average baselines by a meaningful margin while staying explainable and safe.

## Phase 4: Risk and business logic

### Risk rules

Evaluate each medicine based on:

- current stock
- reorder threshold
- predicted demand
- stock cover days
- expiry exposure
- stockout risk

### Decision rule

- low risk: no action
- medium risk: watchlist
- high risk: escalate for review
- insufficient data: hold decision and request more history

The model must never trigger automatic purchase or stock movement.

## Phase 5: Monitoring and governance

### Must-have controls

- forecast quality monitoring by model and medicine
- drift checks over time
- retraining schedule
- alerting when prediction quality degrades
- audit trail for each recommendation and approved action
- human approval gate for all operational response

### Governance rule

Forecast output is evidence, not authority.

## Phase 6: Pilot rollout

### Pilot scope

- start with a limited set of medicines
- use one clinic, branch, or warehouse group
- review decisions weekly
- compare recommended actions with actual operations
- track false positives and missed stockout risk

### Exit criteria

- stable accuracy over time
- review process accepted by operations
- no unsafe autonomous action
- audit records complete
- model drift under control

## Phase 7: Production scale-up

After the pilot succeeds:

- extend to more medicines and branches
- automate scheduled retraining
- add dashboards and alerting
- expand governance and approval rules
- keep the human review loop active

## Final recommendation

The strongest production posture for this project is:

- LightGBM as the forecast engine
- richer real operational demand data
- richer inventory and risk features
- careful monitoring
- mandatory human review before action

This gives the best balance of accuracy, safety, accountability, and business usability.
