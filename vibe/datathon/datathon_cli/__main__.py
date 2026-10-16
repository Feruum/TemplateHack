"""Command-line entrypoint for reproducible local tabular experiments."""

import argparse
from dataclasses import asdict
from datetime import datetime, timezone
from importlib.metadata import version
import json
from pathlib import Path
import platform
import sys

import pandas as pd

from .data import load_dataset, source_fingerprint
from .demo import make_demo_data
from .modeling import Options, evaluate, normalize_features, prepare_data, validate_ids
from .reporting import build_report, profile


def empty_output(path: Path):
    if path.exists() and (not path.is_dir() or any(path.iterdir())):
        raise ValueError(f'Output already exists and is not empty: {path}. Choose a new run directory.')


def write_json(path: Path, content):
    path.write_text(json.dumps(content, indent=2, ensure_ascii=False, allow_nan=False) + '\n', encoding='utf-8')


def run_workflow(source: Path, output: Path, options: Options | None = None, target=None, prediction_path=None, delimiter=None, synthetic=False):
    empty_output(output)
    preserve = [name for name in (options.id_column, options.group_column) if name] if options else []
    frame = load_dataset(source, preserve=preserve, delimiter=delimiter)
    target = options.target if options else target
    eda = profile(frame, target)
    metadata = {
        'source': source.name, 'source_sha256': source_fingerprint(source), 'synthetic': synthetic,
        'created_at_utc': datetime.now(timezone.utc).isoformat(), 'python': platform.python_version(),
        'dependencies': {name: version(name) for name in ['pandas', 'numpy', 'scikit-learn', 'matplotlib']},
        'warnings': [],
    }
    scores = predictions = split = submission = None
    if options:
        data = prepare_data(frame, options)
        scores, predictions, split, model = evaluate(data, options)
        metadata.update(asdict(options))
        metadata.update({'features': data.X.columns.tolist(), 'labeled_rows': len(data.frame), 'missing_targets_removed': data.missing_targets, 'train_rows': int((split['partition'] == 'train').sum()), 'validation_rows': int((split['partition'] == 'validation').sum()), 'split': 'group' if options.group_column else 'time' if options.time_column else 'random-stratified' if options.task == 'classification' else 'random'})
        metadata['warnings'].append('A single validation split selects between dummy and linear models. Reserve an independent test set for final claims.')
        if options.task == 'classification':
            metadata['warnings'].append('The linear classifier uses balanced class weights; probabilities are not calibrated.')
        if not options.id_column:
            metadata['warnings'].append('No ID column was declared. Review unique identifiers and exclude them with --id-column or --drop-column.')
        if prediction_path:
            categories = data.X.select_dtypes(exclude='number').columns.tolist()
            unlabeled = load_dataset(prediction_path, preserve=[*preserve, *categories], delimiter=delimiter)
            missing = set(data.X.columns) - set(unlabeled.columns)
            if missing:
                raise ValueError(f'Prediction data is missing feature columns: {sorted(missing)}')
            if options.id_column and options.id_column not in unlabeled:
                raise ValueError('Prediction data is missing the configured ID column.')
            if options.id_column:
                validate_ids(unlabeled, options.id_column)
            if options.target in unlabeled:
                raise ValueError('Prediction data must be unlabeled; remove the target column before prediction.')
            X_prediction = normalize_features(unlabeled[data.X.columns], reference=data.frame[data.X.columns])
            model.fit(data.X, data.y)
            submission = pd.DataFrame({options.target: model.predict(X_prediction)})
            if options.id_column:
                submission.insert(0, options.id_column, unlabeled[options.id_column].to_numpy())
            metadata['prediction_source'] = prediction_path.name
            metadata['prediction_source_sha256'] = source_fingerprint(prediction_path)
            metadata['prediction_rows'] = len(unlabeled)
            metadata['prediction_model_refit_on_all_labeled_rows'] = True
    document = build_report(frame, eda, metadata, scores)
    output.mkdir(parents=True, exist_ok=True)
    write_json(output / 'eda.json', eda)
    write_json(output / 'run.json', metadata)
    (output / 'report.html').write_text(document, encoding='utf-8')
    if scores:
        write_json(output / 'metrics.json', scores)
        predictions.to_csv(output / 'validation_predictions.csv', index=False)
        split.to_csv(output / 'split.csv', index=False)
    if submission is not None:
        submission.to_csv(output / 'submission.csv', index=False)
    return scores


def main(argv=None):
    parser = argparse.ArgumentParser(description='Local tabular EDA and measured baselines; no network calls or AI keys.')
    commands = parser.add_subparsers(dest='command', required=True)
    for name in ('eda', 'run'):
        command = commands.add_parser(name)
        command.add_argument('--data', required=True, type=Path)
        command.add_argument('--output', required=True, type=Path)
        command.add_argument('--target', required=name == 'run')
        command.add_argument('--delimiter', help='Single-character CSV delimiter; TSV uses a tab automatically.')
        if name == 'run':
            command.add_argument('--task', required=True, choices=['classification', 'regression'])
            command.add_argument('--id-column')
            split = command.add_mutually_exclusive_group()
            split.add_argument('--group-column')
            split.add_argument('--time-column')
            command.add_argument('--drop-column', action='append', default=[])
            command.add_argument('--validation-size', type=float, default=.2)
            command.add_argument('--seed', type=int, default=42)
            command.add_argument('--metric', help='Classification: balanced_accuracy, accuracy, f1_macro, roc_auc (binary). Regression: rmse, mae, r2.')
            command.add_argument('--predict', type=Path, help='Optional unlabeled table for submission.csv after refitting the selected model.')
    demo = commands.add_parser('demo')
    demo.add_argument('--output', type=Path, required=True)
    demo.add_argument('--seed', type=int, default=42)
    args = parser.parse_args(argv)
    try:
        if args.command == 'demo':
            empty_output(args.output)
            input_dir = args.output / 'synthetic-inputs'
            input_dir.mkdir(parents=True)
            for task, frame, target in zip(['classification', 'regression'], make_demo_data(args.seed), ['outcome', 'value']):
                source = input_dir / f'{task}.csv'
                frame.to_csv(source, index=False)
                scores = run_workflow(source, args.output / task, Options(target=target, task=task, id_column='sample_id', seed=args.seed), synthetic=True)
                print(f'SYNTHETIC {task}: {json.dumps(scores, ensure_ascii=True)}')
        elif args.command == 'eda':
            run_workflow(args.data, args.output, target=args.target, delimiter=args.delimiter)
        else:
            options = Options(target=args.target, task=args.task, id_column=args.id_column, group_column=args.group_column, time_column=args.time_column, drop_columns=tuple(args.drop_column), validation_size=args.validation_size, seed=args.seed, metric=args.metric)
            scores = run_workflow(args.data, args.output, options, prediction_path=args.predict, delimiter=args.delimiter)
            print(json.dumps(scores, indent=2, ensure_ascii=True))
        print(f'Report: {(args.output / "report.html") if args.command != "demo" else args.output}')
        return 0
    except (ValueError, OSError, pd.errors.ParserError) as error:
        print(f'Datathon error: {error}', file=sys.stderr)
        return 2


if __name__ == '__main__':
    sys.exit(main())
