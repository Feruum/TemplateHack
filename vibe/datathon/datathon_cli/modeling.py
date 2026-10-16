"""Train-only preprocessing and explicit validation of baseline models."""

from dataclasses import dataclass

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.dummy import DummyClassifier, DummyRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression, Ridge
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix, f1_score, mean_absolute_error, r2_score, recall_score, root_mean_squared_error, roc_auc_score
from sklearn.model_selection import GroupShuffleSplit, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler


@dataclass(frozen=True)
class Options:
    target: str
    task: str
    id_column: str | None = None
    group_column: str | None = None
    time_column: str | None = None
    drop_columns: tuple[str, ...] = ()
    validation_size: float = .2
    seed: int = 42
    metric: str | None = None


@dataclass
class PreparedData:
    frame: pd.DataFrame
    X: pd.DataFrame
    y: pd.Series
    missing_targets: int


def normalize_features(frame: pd.DataFrame, reference: pd.DataFrame | None = None) -> pd.DataFrame:
    frame = frame.copy()
    for name in frame:
        schema = reference[name] if reference is not None else frame[name]
        dtype = schema.dtype
        if pd.api.types.is_numeric_dtype(dtype) and not pd.api.types.is_bool_dtype(dtype):
            try:
                frame[name] = pd.to_numeric(frame[name], errors='raise').astype(float).replace([np.inf, -np.inf], np.nan)
            except (ValueError, TypeError) as error:
                raise ValueError(f'Feature {name!r} must be numeric as in training data.') from error
        elif pd.api.types.is_bool_dtype(dtype) or pd.api.types.infer_dtype(schema, skipna=True) == 'boolean':
            values = frame[name].map(lambda value: str(value).casefold() if pd.notna(value) else np.nan)
            if not values.dropna().isin(['true', 'false']).all():
                raise ValueError(f'Feature {name!r} must contain true/false or missing values as in training data.')
            frame[name] = values.map({'true': 'True', 'false': 'False'}).astype(object)
        else:
            frame[name] = frame[name].map(lambda value: str(value) if pd.notna(value) else np.nan).astype(object)
    return frame


def prepare_data(frame: pd.DataFrame, options: Options) -> PreparedData:
    if options.task not in {'classification', 'regression'}:
        raise ValueError('Task must be classification or regression.')
    if options.target not in frame:
        raise ValueError(f'Target column {options.target!r} is missing.')
    if not 0 < options.validation_size < 1:
        raise ValueError('Validation size must be greater than 0 and less than 1.')
    if options.group_column and options.time_column:
        raise ValueError('Choose a group split or a time split, not both.')
    excluded = {name for name in (options.id_column, options.group_column, options.time_column, *options.drop_columns) if name is not None}
    if options.target in excluded:
        raise ValueError('Target must not be used as an ID, group, time, or dropped column.')
    missing = excluded - set(frame.columns)
    if missing:
        raise ValueError(f'Configured columns are missing: {sorted(missing)}')
    if options.id_column:
        validate_ids(frame, options.id_column)
    present = frame[options.target].notna()
    labeled = frame.loc[present].copy()
    if len(labeled) < 10:
        raise ValueError('At least 10 labeled rows are required for a useful holdout split.')
    X = normalize_features(labeled.drop(columns=[options.target, *sorted(excluded)]))
    if X.shape[1] == 0:
        raise ValueError('No feature columns remain after excluding the target and declared metadata.')
    if options.task == 'regression':
        try:
            y = pd.to_numeric(labeled[options.target], errors='raise').astype(float)
        except (ValueError, TypeError) as error:
            raise ValueError('Regression targets must be numeric.') from error
        if not np.isfinite(y).all():
            raise ValueError('Regression targets must be finite numbers.')
        if y.nunique() < 2:
            raise ValueError('Regression target must contain at least two distinct values.')
    else:
        y = labeled[options.target].astype(str)
        if y.nunique() < 2:
            raise ValueError('Classification requires at least two target classes.')
    return PreparedData(labeled, X, y, int((~present).sum()))


def validate_ids(frame, column):
    if column not in frame or frame[column].isna().any() or frame[column].duplicated().any():
        raise ValueError(f'ID column {column!r} must be present, nonmissing, and unique. Use --group-column for repeated entities.')


def split_rows(data: PreparedData, options: Options):
    indexes = data.frame.index.to_numpy()
    if options.group_column:
        groups = data.frame[options.group_column]
        if groups.isna().any() or groups.nunique() < 2:
            raise ValueError('Group split requires at least two groups and no missing group values.')
        train, valid = next(GroupShuffleSplit(n_splits=1, test_size=options.validation_size, random_state=options.seed).split(data.X, data.y, groups))
        train, valid = indexes[train], indexes[valid]
    elif options.time_column:
        try:
            times = pd.to_datetime(data.frame[options.time_column], utc=True, errors='raise')
        except (ValueError, TypeError) as error:
            raise ValueError('Time split requires parseable timestamps.') from error
        if times.isna().any() or times.nunique() < 2:
            raise ValueError('Time split requires at least two timestamps and no missing times.')
        ordered = times.sort_values(kind='stable')
        cut = min(len(ordered) - 1, max(1, int(len(ordered) * (1 - options.validation_size))))
        threshold = ordered.iloc[cut]
        train, valid = indexes[(times < threshold).to_numpy()], indexes[(times >= threshold).to_numpy()]
    else:
        try:
            train, valid = train_test_split(indexes, test_size=options.validation_size, random_state=options.seed, stratify=data.y if options.task == 'classification' else None)
        except ValueError as error:
            raise ValueError(f'Cannot create the requested split; check class counts and validation size. {error}') from error
    if len(train) < 2 or len(valid) < 2:
        raise ValueError('Both training and validation must contain at least two rows; change the split.')
    if options.task == 'classification':
        if data.y.loc[train].nunique() < 2 or set(data.y.loc[valid]) != set(data.y.loc[train]):
            raise ValueError('Training and validation must both contain every target class; revise the split or validation size.')
    return train, valid


def make_pipeline(X: pd.DataFrame, task: str, seed: int):
    numeric = X.select_dtypes(include='number').columns.tolist()
    categorical = [name for name in X if name not in numeric]
    transformers = []
    if numeric:
        transformers.append(('numeric', Pipeline([
            ('impute', SimpleImputer(strategy='median', keep_empty_features=True)),
            ('scale', StandardScaler()),
        ]), numeric))
    if categorical:
        transformers.append(('categorical', Pipeline([
            ('impute', SimpleImputer(strategy='constant', fill_value='(missing)', keep_empty_features=True)),
            ('encode', OneHotEncoder(handle_unknown='ignore', max_categories=50)),
        ]), categorical))
    model = LogisticRegression(max_iter=1000, class_weight='balanced', random_state=seed) if task == 'classification' else Ridge(alpha=1., solver='lsqr')
    return Pipeline([('preprocess', ColumnTransformer(transformers, remainder='drop')), ('model', model)])


def score_predictions(task, truth, predicted, probabilities=None, classes=None):
    if task == 'regression':
        return {'mae': float(mean_absolute_error(truth, predicted)), 'rmse': float(root_mean_squared_error(truth, predicted)), 'r2': float(r2_score(truth, predicted))}
    labels = sorted(set(truth) | set(predicted)) if classes is None else list(classes)
    result = {
        'accuracy': float(accuracy_score(truth, predicted)),
        'balanced_accuracy': float(recall_score(truth, predicted, labels=labels, average='macro', zero_division=0)),
        'f1_macro': float(f1_score(truth, predicted, labels=labels, average='macro', zero_division=0)),
        'labels': labels,
        'confusion_matrix': confusion_matrix(truth, predicted, labels=labels).tolist(),
        'per_class': classification_report(truth, predicted, labels=labels, output_dict=True, zero_division=0),
        'roc_auc': None,
    }
    if probabilities is not None and len(labels) == 2 and len(set(truth)) == 2:
        result['roc_auc'] = float(roc_auc_score(np.asarray(truth) == labels[1], probabilities[:, 1]))
        result['positive_class'] = labels[1]
    return result


def evaluate(data: PreparedData, options: Options):
    allowed = {'accuracy', 'balanced_accuracy', 'f1_macro', 'roc_auc'} if options.task == 'classification' else {'mae', 'rmse', 'r2'}
    metric = options.metric or ('balanced_accuracy' if options.task == 'classification' else 'rmse')
    if metric not in allowed:
        raise ValueError(f'Metric {metric!r} is not supported for {options.task}; choose from {sorted(allowed)}.')
    train, valid = split_rows(data, options)
    X_train, X_valid = data.X.loc[train], data.X.loc[valid]
    y_train, y_valid = data.y.loc[train], data.y.loc[valid]
    linear = make_pipeline(X_train, options.task, options.seed)
    dummy = DummyClassifier(strategy='prior', random_state=options.seed) if options.task == 'classification' else DummyRegressor(strategy='median')
    models = {'dummy': dummy, 'linear': linear}
    metrics, predictions = {}, {}
    for name, model in models.items():
        model.fit(X_train, y_train)
        predictions[name] = model.predict(X_valid)
        probabilities = model.predict_proba(X_valid) if options.task == 'classification' else None
        metrics[name] = score_predictions(options.task, y_valid, predictions[name], probabilities, model.classes_ if options.task == 'classification' else None)
        if metrics[name][metric] is None:
            raise ValueError('ROC AUC selection requires binary labels with both classes in validation; use another metric.')
    lower_is_better = metric in {'mae', 'rmse'}
    select = min if lower_is_better else max
    selected = select(models, key=lambda name: metrics[name][metric])
    scores = {'primary_metric': metric, 'direction': 'minimize' if lower_is_better else 'maximize', 'selected_model': selected, 'models': metrics}
    rows = pd.DataFrame({'row_index': valid, 'actual': y_valid.to_numpy(), 'dummy_prediction': predictions['dummy'], 'linear_prediction': predictions['linear']})
    if options.id_column:
        if options.id_column in rows:
            rows.rename(columns={options.id_column: f'_{options.id_column}'}, inplace=True)
        rows.insert(1, options.id_column, data.frame.loc[valid, options.id_column].to_numpy())
    split = pd.DataFrame({'row_index': [*train, *valid], 'partition': ['train'] * len(train) + ['validation'] * len(valid)})
    return scores, rows, split, models[selected]
