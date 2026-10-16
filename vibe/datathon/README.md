# Datathon data workflow

A reproducible local tabular workflow: data loading, EDA charts, dummy/linear baselines, classification/regression evaluation, and optional predictions. It needs no Docker, web server, AI credentials, or paid API after dependency setup.

Confirm the organizer's rules for prepared code and external tools. The actual brief determines the target, split, metric, and submission format. Synthetic demo scores are not competition results.

## Install and verify

Requirements: Python 3.12+, Node.js 22.12+, and Bun 1.4+. Run from `vibe/`:

```powershell
bun run datathon:setup
bun run datathon:test
bun run datathon:demo
```

Setup creates `datathon/.venv` and installs the complete pinned environment from `requirements.lock`. `requirements.in` records the approved pandas, scikit-learn, and matplotlib versions; NumPy/SciPy and other transitive dependencies are also pinned. Installation needs internet; the data workflow itself makes no network calls.

If Python is not on PATH, set its executable before setup:

```powershell
$env:DATATHON_PYTHON = 'C:\Path\To\Python\python.exe'
bun run datathon:setup
```

Demo generates deterministic synthetic classification and regression data with missing values. It creates a new ignored `.artifacts/datathon-demo-*` directory and prints its location. Open either task's `report.html`. It never downloads contest data.

Direct Python entrypoints from `datathon/` are `python -m datathon_cli --help` and `python -m unittest discover -s tests -v`. Use `.venv\Scripts\python.exe` on Windows or `.venv/bin/python` on Linux/macOS.

## Load and inspect the actual dataset

Keep approved competition files in ignored `datathon/data/`. Formats: UTF-8 CSV, TSV, JSON arrays of row objects, and JSONL/NDJSON. JSON values must be scalar. CSV headers must be unique/nonempty; every record must have the correct field count. Use `--delimiter ";"` for semicolon CSV. Export Excel or Parquet to a supported format first.

These examples assume a target named `label` and a unique identifier named `record_id`. Substitute the actual case columns:

```powershell
bun run datathon:eda --data datathon/data/train.csv --target label --output datathon/runs/eda-01
bun run datathon --data datathon/data/train.csv --target label --task classification --id-column record_id --metric f1_macro --output datathon/runs/baseline-01
```

Target is optional for EDA and required for modeling. EDA reports counts, column types, missingness, exact duplicates, numeric summaries, categorical top values, distributions, and correlations. Charts show up to four numeric distributions, twelve missing-value columns, and sixteen correlation columns. JSON retains every column's summary. EDA describes the supplied table, including its future validation rows, but does not fit model preprocessing.

Root commands resolve paths from the caller's current directory. Both `--data path` and `--data=path` work. Use `bun run datathon --help` for options.

## Choose the split before improving the model

Defaults: seed 42, validation fraction 0.2. Random classification splits are stratified. Change them with `--seed` and `--validation-size`.

- Repeated customers/users/devices: add `--group-column customer_id`. Entities never cross partitions. Use a separate unique row ID or omit `--id-column`; repeated entity IDs are not unique row IDs.
- Future prediction: add `--time-column timestamp`. Training times are strictly earlier; equal timestamps stay together at the boundary. This can change the requested fraction.
- Group and time strategies are mutually exclusive. If the case needs both constraints, implement an appropriate case-specific split.
- Repeat `--drop-column name` for identifiers, post-outcome fields, free text, or leaking features. Target and declared ID/group/time columns are always excluded from features.

At least ten labeled rows are required. Missing targets are removed and counted. Regression targets must be finite numeric values. Both partitions need at least two rows. Classification requires every class in both partitions; an invalid group/time split fails instead of producing misleading all-class metrics. Review rare classes and split size.

Explicit IDs must be unique and nonmissing. Numeric nonfinite features become missing. Prediction uses the training feature types, including numeric-looking categories and case-insensitive true/false values for boolean features. Review entity leakage and duplicate records yourself: the generic workflow does not infer entities or automatically remove duplicates.

## Models and metrics

Classification compares a prior/majority `DummyClassifier` with balanced-weight logistic regression. Metrics: accuracy, balanced accuracy, macro F1, class-level precision/recall/F1, and a confusion matrix. Binary ROC AUC includes its named positive class; multiclass AUC is not implemented. Regression compares a median `DummyRegressor` with Ridge and reports MAE, RMSE, and R².

The linear pipeline imputes numeric medians, standardizes numeric features, fills missing categories, and one-hot encodes them. Every fitted preprocessing step uses only training rows. Unknown categories are ignored; cardinality is capped at 50 categories per column. This is a tabular baseline, not an arbitrary text/image model.

Default selection uses balanced accuracy or RMSE. `--metric` selects another supported metric. The dummy can win. Choose the official metric; do not optimize an unrelated number. ROC AUC selection requires binary labels. Balanced classifier probabilities are not calibrated.

```powershell
bun run datathon --data datathon/data/train.csv --target value --task regression --id-column record_id --metric rmse --output datathon/runs/regression-01
```

The same single holdout selects between two models. It is not an untouched final test, and it does not establish hidden-test performance. There is no automatic hyperparameter search, cross-validation, threshold tuning, causal explanation, or business-impact estimate. Add case-specific methods only when needed.

## Predict an unlabeled table

Add `--predict datathon/data/test.csv` to a model run. The file must contain the feature columns and declared ID, with no target. After evaluation, the selected model and preprocessing are refitted on all labeled input rows. `submission.csv` preserves the input order and original IDs, including CSV leading zeros.

The generic submission contains the configured ID and target columns, or only the target without an ID. Classification outputs class labels, not probabilities. Check the organizer's column names, required probabilities/labels, alignment, and file format before submission. Saved metrics describe the earlier holdout models, not the refitted submission model.

## Artifacts and privacy

Every EDA run writes `eda.json`, `run.json`, and standalone `report.html` with embedded PNG charts. Model runs add `metrics.json`, `validation_predictions.csv`, and `split.csv`. Source row indexes are zero-based loaded-table positions, not physical CSV line numbers. Metadata records source SHA-256, Python/dependency versions, seed, features/options, split/counts, and removed-target count. Optional predictions also record their source hash and row count.

Validation exports retain the original ID column name. If it collides with `row_index`, `actual`, `dummy_prediction`, or `linear_prediction`, that report column receives a leading underscore.

Outputs must be new or empty; existing nonempty runs are never overwritten. Models are not pickled or loaded from untrusted files. Reproduce predictions by rerunning the recorded configuration against matching source hashes.

`datathon/data/`, `datathon/runs/`, `.artifacts/`, and `.venv/` are ignored. Reports/predictions can contain sensitive categories, IDs, and targets. Keep them local until sharing is approved. Custom output paths outside ignored directories need your own exclusions. Do not commit competition data or credentials.

## During the competition

1. Turn the brief into a deliverables checklist and confirm permitted tools/data.
2. Identify the target/metric; inspect missingness, imbalance, duplicates, and leakage; choose the split.
3. Retain a measured baseline, source hash, and configuration. Compare improvements on the same valid split.
4. Show one input-to-result flow, a measured comparison, and an explanation of errors/limits. Use the web app when it helps demonstrate the result.
5. Prepare a two-minute pitch and a backup recording. Complete the case README: data, method, metric, results, reproduction, and limitations.

References: [leakage guidance](https://scikit-learn.org/stable/common_pitfalls.html), [ColumnTransformer](https://scikit-learn.org/stable/modules/generated/sklearn.compose.ColumnTransformer.html), [group splits](https://scikit-learn.org/stable/modules/generated/sklearn.model_selection.GroupShuffleSplit.html), [pandas CSV loading](https://pandas.pydata.org/docs/reference/api/pandas.read_csv.html).
