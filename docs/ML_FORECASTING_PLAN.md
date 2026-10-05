# PharmaSense ML Forecasting and Replenishment Plan

## 1. Objective

The ML system for PharmaSense should optimize medicine inventory decisions by forecasting demand and recommending safe replenishment actions while reducing stockouts, expiry risk, and overstock.

This is a business-operational forecasting problem, not a generic AI task. The solution must be explainable, auditable, and safe for pharmacy operations.

## 2. Recommended model

### Primary model

- LightGBM

### Benchmark model

- XGBoost

### Why LightGBM is the best fit

- Strong performance on tabular demand and inventory datasets
- Fast training and inference
- Better interpretability than deep learning approaches
- Works well with lag features, stock features, seasonality, and supplier data
- More operationally practical for pharma inventory workflows

### Why not a pure deep-learning approach

- High complexity and harder explainability
- More difficult to govern and audit in a healthcare/pharma environment
- More data required for reliable deployment
- Operationally less transparent for pharmacy teams

## 3. Architecture

The system should be structured as a two-layer decision pipeline:

1. Forecasting layer
   - predicts demand for each medicine over the next 7, 14, and 30 days
2. Replenishment layer
   - converts forecast and current stock into safe reorder advice
   - checks expiry risk, lead time, reorder threshold, and safety stock

This approach is better than relying on raw model output alone.

## 4. Data requirements

### 4.1 Core demand data

Track for each medicine and date:

- medicine_id
- date
- sold_qty
- issued_qty
- dispensed_qty
- transaction_count
- stockout_flag

### 4.2 Inventory state data

- opening_stock
- closing_stock
- received_qty
- adjusted_qty
- damaged_qty
- lost_qty
- reorder_level
- safety_stock

### 4.3 Product metadata

- medicine_name
- generic_name
- category
- manufacture_name
- dosage
- form
- active_status
- barcode
- batch_id
- expiry_date

### 4.4 Supplier and lead-time data

- supplier_id
- lead_time_days
- order_date
- delivery_date
- fill_rate
- delay_days

### 4.5 Risk and quality data

- expiry_risk
- near_expiry_flag
- expired_qty
- batch_age_days
- discard_qty

### 4.6 Time and seasonality features

- day_of_week
- month
- holiday_flag
- seasonality_index
- year-over-year trend marker

## 5. Synthetic vs real data

### Synthetic data

Use synthetic data for:

- prototyping
- early feature engineering
- pipeline validation
- model benchmarking
- research trials

### Real operational data

Use real operational data for:

- training the final model
- validating business value
- deployment decisions
- production monitoring and drift checks

Important rule:

- synthetic data must never be used as proof of production performance
- the project should keep research data separate from operational inventory data

## 6. Feature engineering

The model should use features such as:

- lagged demand: 7d, 14d, 30d
- rolling averages: 7d, 14d, 30d
- current stock on hand
- stock cover in days
- reorder point gap
- lead time in days
- previous stockout event
- seasonality indicators
- category-specific demand patterns
- expiry risk score

## 7. Target variable

The main target should be:

- next 7-day demand quantity
- optionally next 14-day and 30-day demand as secondary targets

For a retail-pharmacy use case, the most useful short-term horizon is often 7 days, with 30-day planning as a secondary output.

## 8. Training strategy

### Data split

- Use time-based splitting rather than random splitting
- Example: train on older periods, validate on recent periods

### Baselines

- Naive baseline: previous period demand
- Rolling average benchmark
- XGBoost benchmark
- LightGBM final model

### Final evaluation metrics

- MAE
- RMSE
- WAPE
- MAPE for non-zero demand periods
- stockout rate
- overstock rate
- expired stock risk
- service level

## 9. Replenishment decision logic

The recommendation engine should combine model forecast and operational rules:

- if forecasted demand > available stock + incoming stock => reorder needed
- if stock < reorder_level => urgent reorder
- if lead_time is long and demand is rising => increase order quantity
- if near-expiry risk is high => prioritize sale or reduce order quantity
- if stockout risk is severe => prioritize safety stock buffer

This ensures the business decision is governed by both numbers and operational risk.

## 10. Governance and pharma-readiness

The final system should include:

- model versioning
- training dataset versioning
- feature version tracking
- explanation outputs for each recommendation
- audit trail for reorder suggestions
- drift monitoring
- human approval workflow for critical inventory actions
- clear separation between research and operational data

This is necessary for enterprise and pharma handoff readiness.

## 11. Recommended rollout phases

### Phase 1: Research and prototyping

- build synthetic dataset
- engineer features
- test LightGBM baseline
- compare against XGBoost baseline
- validate forecast quality

### Phase 2: Operational integration

- connect to real inventory and transaction data
- build daily demand feature table
- integrate into replenishment workflow
- test with historical procurement decisions

### Phase 3: Pilot operations

- run in shadow mode
- compare model recommendations with human decisions
- track stockout reduction and expiry risk improvement

### Phase 4: Production handoff

- approve model governance and review process
- deploy recommendation engine behind human signoff
- monitor performance and retrain on a schedule

## 12. Final recommendation

For PharmaSense, the strongest model choice is:

- LightGBM for demand forecasting
- rule-based replenishment logic on top of forecast output
- real operational data for production validation
- synthetic data only for research and experimentation

This is the best combination of business value, explainability, deployment reliability, and enterprise readiness for a large pharma handoff.
