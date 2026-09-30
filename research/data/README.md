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