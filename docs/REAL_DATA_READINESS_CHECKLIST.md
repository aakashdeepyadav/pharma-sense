# Real Data Readiness and Business Sign-off Checklist

## Purpose

This checklist defines the conditions required before claiming that PharmaSense has a production-ready forecasting workflow using operational demand data.

The project must not treat synthetic data as proof of production performance.

## Minimum readiness gate

### Data quality

- [ ] The operational dataset is present and complete.
- [ ] Required columns exist: `date`, `medicine_id`, `quantity_issued`.
- [ ] No invalid date values are present.
- [ ] No future dates are included in the training dataset.
- [ ] No negative quantity values are present.
- [ ] Duplicate medicine/date rows are removed or handled intentionally.
- [ ] At least 30 days of valid daily demand history are available.
- [ ] At least two medicines are represented in the dataset.
- [ ] Stock and demand values have been reviewed for business realism.

### Model governance

- [ ] Forecasting is still advisory and not autonomous.
- [ ] A human review flow exists before any replenishment action is accepted.
- [ ] Forecast output is auditable and tied to the approving user.
- [ ] Demand metrics and model quality checks are stored and reviewable.
- [ ] Monitoring thresholds are defined for MAE, RMSE, and forecast drift.

### Business sign-off

- [ ] A pharmacy or operations owner has reviewed the data contract.
- [ ] The business owner approves the use of this dataset for forecasting.
- [ ] Data privacy and sensitivity review are complete.
- [ ] Standard operating procedures are documented for model review and overrides.
- [ ] Product owners agree on the risk of model advisory-only operation.

### Production claim rules

- [ ] Synthetic data is explicitly labelled as research-only.
- [ ] Real or de-identified operational data is used before any production claim is made.
- [ ] Model output is not described as fully autonomous or final without business sign-off.
- [ ] Forecasting quality is reviewed periodically, not treated as static.

## Sign-off statement

A production forecasting claim can only be made when all readiness checks are complete and all business stakeholders approve the use of the operational data and the governance controls.

Until that sign-off is complete, the product should remain in "advisory, human-reviewed" mode.
