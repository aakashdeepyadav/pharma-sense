# Demand data contract

This contract defines the minimum acceptable dataset for demand forecasting experiments. It is separate from the operational database and must be approved before any real or de-identified data is used.

## Scope

The target is organizational medicine demand, represented by completed stock-out transactions. The data must not contain patient records, prescriptions, diagnoses, names, phone numbers, addresses, or free-text notes.

The current synthetic dataset remains useful for pipeline development only. It must not be mixed with real data or used as evidence of production model performance.

## Required row grain

One row represents the quantity issued for one medicine on one UTC calendar day within one organization or an explicitly documented aggregation group.

Required columns:

| Column                 | Type                 | Rule                                                                                       |
| ---------------------- | -------------------- | ------------------------------------------------------------------------------------------ |
| `date`                 | ISO date             | UTC calendar day; no future dates                                                          |
| `medicine_id`          | pseudonymous string  | Stable within the dataset; must not encode a product name or identifier                    |
| `medicine_name`        | string               | Human-readable medicine label for operational reporting                                    |
| `medicine_category`    | string               | Standardized category label such as Antibiotic or Analgesic                                |
| `quantity_issued`      | non-negative integer | Completed stock OUT quantity after returns policy is applied                               |
| `is_stockout_censored` | boolean              | True when observed demand may be lower than requested demand because stock was unavailable |
| `organization_group`   | pseudonymous string  | Optional for pooled research; never a real organization name                               |

Enhanced optional columns:

- `available_units_at_start`, non-negative integer
- `expiry_units_at_start`, non-negative integer
- `supplier_lead_days`, non-negative integer
- `is_synthetic`, boolean

Optional explanatory columns:

- `category_id`, pseudonymous and documented
- `supplier_lead_days`, non-negative number
- `available_units_at_start`, non-negative integer
- `expiry_units_at_start`, non-negative integer
- `is_synthetic`, boolean

## Operational mapping

| Operational source                         | Research field             | Treatment                                         |
| ------------------------------------------ | -------------------------- | ------------------------------------------------- |
| `StockTransaction.timestamp`               | `date`                     | Convert to UTC date                               |
| `StockTransaction.type = OUT`              | `quantity_issued`          | Aggregate by medicine and date                    |
| `Batch.medicineId`                         | `medicine_id`              | Replace with a research pseudonym                 |
| Stock availability and failed issue events | `is_stockout_censored`     | Mark periods where requested demand may be hidden |
| Batch quantity before the day              | `available_units_at_start` | Optional feature, never a target label            |

Adjustments, receipts, and purchases are not demand. Returns must be explicitly removed or represented with a documented negative-demand policy before aggregation.

## Data quality checks

A dataset is rejected until these checks pass or exceptions are documented:

- Dates parse as ISO dates and are ordered within the declared study period.
- No future observations exist relative to the extraction date.
- Quantities are integers and never negative.
- Medicine identifiers are stable, non-identifying, and have no unexpected collisions.
- Duplicate medicine/date rows are aggregated or rejected.
- Missing dates are distinguished from true zero demand.
- Stockout-censored periods are identified where possible.
- Timezone conversion is recorded and consistent.
- The proportion of zero-demand days and missingness is reported per medicine.
- The dataset has enough observations for a chronological train/test split.
- The extraction query, code version, source period, and transformation version are recorded.

## Privacy and governance

1. Obtain written approval from the data owner and the project supervisor before extraction.
2. Use the minimum fields required for the research question.
3. Remove direct identifiers before the team receives the dataset.
4. Keep the re-identification key outside the repository and outside the research workspace.
5. Do not commit confidential source data, credentials, exports, or raw database dumps.
6. Restrict access to named team members and record who can access the dataset.
7. Define retention and deletion dates before collection.
8. Report dataset limitations and possible organizational or seasonal bias.

## Forecast evaluation protocol

- Use chronological splits; never randomly shuffle time-series rows.
- Keep a final untouched test period where possible.
- Compare against naive and moving-average baselines before advanced models.
- Report MAE, RMSE, bias, zero-demand performance, and coverage by medicine.
- Report results separately for uncensored and stockout-censored periods when labels permit.
- Do not claim generalization beyond the organization, period, and medicines represented by the data.

## Acceptance gate

The ML workstream may use a real or de-identified dataset only when the project lead, ML engineer, and supervisor have signed off the source, privacy review, data dictionary, quality report, extraction version, and evaluation split. Until then, use the synthetic dataset only for pipeline and test development.
