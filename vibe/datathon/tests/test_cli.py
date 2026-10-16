import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

import pandas as pd


ROOT = Path(__file__).resolve().parents[1]


def command(*args):
    return subprocess.run([sys.executable, '-m', 'datathon_cli', *map(str, args)], cwd=ROOT, text=True, encoding='utf-8', capture_output=True, timeout=60)


class CommandTests(unittest.TestCase):
    def test_demo_completes_both_tasks_and_saves_reproducible_artifacts(self):
        with tempfile.TemporaryDirectory() as folder:
            output = Path(folder) / 'demo'
            result = command('demo', '--output', output)
            self.assertEqual(result.returncode, 0, result.stderr)
            for task in ['classification', 'regression']:
                run = output / task
                metrics = json.loads((run / 'metrics.json').read_text())
                self.assertEqual(len(metrics['models']), 2)
                self.assertIn(metrics['selected_model'], metrics['models'])
                self.assertTrue((run / 'validation_predictions.csv').is_file())
                self.assertTrue((run / 'split.csv').is_file())
                self.assertIn('data:image/png;base64,', (run / 'report.html').read_text(encoding='utf-8'))
                metadata = json.loads((run / 'run.json').read_text())
                self.assertEqual(metadata['seed'], 42)
                self.assertTrue(metadata['synthetic'])
                self.assertEqual(len(metadata['source_sha256']), 64)
                self.assertNotIn('sample_id', metadata['features'])

    def test_run_handles_multiclass_and_preserves_unlabeled_ids_and_order(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            frame = pd.DataFrame({'id': [f'{i:03}' for i in range(90)], 'x': list(range(90)), 'label': ['a', 'b', 'c'] * 30})
            source = folder / 'labeled.csv'
            frame.to_csv(source, index=False)
            prediction = folder / 'unlabeled.csv'
            pd.DataFrame({'id': ['009', '001'], 'x': [92, 93]}).to_csv(prediction, index=False)
            result = command('run', '--data', source, '--target', 'label', '--task', 'classification', '--id-column', 'id', '--predict', prediction, '--output', folder / 'run')
            self.assertEqual(result.returncode, 0, result.stderr)
            submission = pd.read_csv(folder / 'run' / 'submission.csv', dtype={'id': str})
            self.assertEqual(submission.columns.tolist(), ['id', 'label'])
            self.assertEqual(submission['id'].tolist(), ['009', '001'])
            metrics = json.loads((folder / 'run' / 'metrics.json').read_text())
            self.assertEqual(len(metrics['models']['linear']['confusion_matrix']), 3)

    def test_eda_escapes_untrusted_column_names_and_never_overwrites_a_run(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            source = folder / 'input.csv'
            pd.DataFrame({'<script>alert(1)</script>': [1, None, 3], 'category': ['a', 'b', 'c']}).to_csv(source, index=False)
            output = folder / 'eda'
            result = command('eda', '--data', source, '--output', output)
            self.assertEqual(result.returncode, 0, result.stderr)
            html = (output / 'report.html').read_text(encoding='utf-8')
            self.assertNotIn('<script>alert(1)</script>', html)
            self.assertIn('&lt;script&gt;', html)
            before = (output / 'eda.json').read_bytes()
            result = command('eda', '--data', source, '--output', output)
            self.assertNotEqual(result.returncode, 0)
            self.assertEqual((output / 'eda.json').read_bytes(), before)

    def test_invalid_metric_and_prediction_schema_fail_with_actionable_errors(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            source = folder / 'input.csv'
            pd.DataFrame({'x': range(30), 'label': ['a', 'b'] * 15}).to_csv(source, index=False)
            result = command('run', '--data', source, '--target', 'label', '--task', 'classification', '--metric', 'rmse', '--output', folder / 'run')
            self.assertNotEqual(result.returncode, 0)
            self.assertIn('metric', result.stderr.lower())
            self.assertFalse((folder / 'run' / 'metrics.json').exists())

    def test_prediction_uses_training_types_when_a_category_is_all_missing(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            source = folder / 'input.csv'
            pd.DataFrame({'x': range(40), 'kind': ['a', 'b'] * 20, 'label': ['yes', 'no'] * 20}).to_csv(source, index=False)
            prediction = folder / 'predict.csv'
            pd.DataFrame({'x': [41, 42], 'kind': [None, None]}).to_csv(prediction, index=False)
            result = command('run', '--data', source, '--target', 'label', '--task', 'classification', '--predict', prediction, '--output', folder / 'run')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(len(pd.read_csv(folder / 'run' / 'submission.csv')), 2)

    def test_boolean_csv_features_retain_the_training_meaning_at_prediction(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            source = folder / 'input.csv'
            pd.DataFrame({'flag': ['true', 'false'] * 20, 'label': ['yes', 'no'] * 20}).to_csv(source, index=False)
            prediction = folder / 'predict.csv'
            pd.DataFrame({'flag': ['true', 'false', 'TRUE', 'False']}).to_csv(prediction, index=False)
            result = command('run', '--data', source, '--target', 'label', '--task', 'classification', '--predict', prediction, '--output', folder / 'run')
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(pd.read_csv(folder / 'run' / 'submission.csv')['label'].tolist(), ['yes', 'no', 'yes', 'no'])

    def test_prediction_missing_features_has_no_partial_output(self):
        with tempfile.TemporaryDirectory() as folder:
            folder = Path(folder)
            source = folder / 'input.csv'
            pd.DataFrame({'x': range(40), 'label': ['yes', 'no'] * 20}).to_csv(source, index=False)
            prediction = folder / 'predict.csv'
            pd.DataFrame({'other': [1, 2]}).to_csv(prediction, index=False)
            result = command('run', '--data', source, '--target', 'label', '--task', 'classification', '--predict', prediction, '--output', folder / 'run')
            self.assertEqual(result.returncode, 2)
            self.assertIn('missing feature', result.stderr)
            self.assertFalse((folder / 'run').exists())


if __name__ == '__main__':
    unittest.main()
