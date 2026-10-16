import unittest

import numpy as np
import pandas as pd

from datathon_cli.modeling import Options, evaluate, prepare_data, split_rows, make_pipeline, normalize_features, score_predictions


class ModelingTests(unittest.TestCase):
    def setUp(self):
        self.frame = pd.DataFrame({
            'id': [f'{i:03}' for i in range(60)],
            'x': np.arange(60, dtype=float),
            'category': ['a', 'b', None] * 20,
            'group': np.repeat(np.arange(12), 5),
            'time': pd.date_range('2026-01-01', periods=60).astype(str),
            'label': ['no', 'yes'] * 30,
        })

    def test_random_split_is_reproducible_disjoint_and_stratified(self):
        options = Options(target='label', task='classification', id_column='id')
        prepared = prepare_data(self.frame, options)
        train, valid = split_rows(prepared, options)
        self.assertEqual(set(train) & set(valid), set())
        self.assertEqual(set(train) | set(valid), set(prepared.frame.index))
        self.assertEqual(set(prepared.y.loc[valid]), {'no', 'yes'})
        other = split_rows(prepared, options)
        np.testing.assert_array_equal(train, other[0])
        np.testing.assert_array_equal(valid, other[1])
        self.assertNotIn('id', prepared.X.columns)
        self.assertNotIn('label', prepared.X.columns)

    def test_group_split_never_reuses_an_entity(self):
        options = Options(target='label', task='classification', group_column='group')
        prepared = prepare_data(self.frame, options)
        train, valid = split_rows(prepared, options)
        self.assertFalse(set(prepared.frame.loc[train, 'group']) & set(prepared.frame.loc[valid, 'group']))
        self.assertNotIn('group', prepared.X.columns)

    def test_time_split_has_strictly_earlier_training_rows(self):
        frame = self.frame.copy()
        frame.loc[40:50, 'time'] = frame.loc[40, 'time']
        options = Options(target='label', task='classification', time_column='time')
        prepared = prepare_data(frame, options)
        train, valid = split_rows(prepared, options)
        self.assertLess(pd.to_datetime(frame.loc[train, 'time']).max(), pd.to_datetime(frame.loc[valid, 'time']).min())
        self.assertNotIn('time', prepared.X.columns)

    def test_preprocessor_does_not_learn_validation_values_or_categories(self):
        train = pd.DataFrame({'x': [1., 3., None, 5.], 'kind': ['a', 'a', 'b', None]})
        valid = pd.DataFrame({'x': [1000000., None], 'kind': ['validation-only', 'a']})
        pipeline = make_pipeline(train, 'classification', seed=42)
        pipeline.fit(train, ['no', 'yes', 'no', 'yes'])
        preprocessing = pipeline.named_steps['preprocess']
        numeric = preprocessing.named_transformers_['numeric']
        self.assertEqual(numeric.named_steps['impute'].statistics_[0], 3.)
        categories = preprocessing.named_transformers_['categorical'].named_steps['encode'].categories_[0]
        self.assertNotIn('validation-only', categories)
        self.assertEqual(len(pipeline.predict(valid)), 2)

    def test_metrics_match_known_classification_and_regression_errors(self):
        classification = score_predictions('classification', ['a', 'a', 'b', 'b'], ['a', 'b', 'b', 'b'])
        self.assertAlmostEqual(classification['accuracy'], .75)
        self.assertAlmostEqual(classification['balanced_accuracy'], .75)
        regression = score_predictions('regression', [0., 2.], [1., 2.])
        self.assertAlmostEqual(regression['mae'], .5)
        self.assertAlmostEqual(regression['rmse'], np.sqrt(.5))

    def test_invalid_targets_and_leaking_column_configuration_fail(self):
        for options in [
            Options(target='missing', task='classification'),
            Options(target='label', task='classification', id_column='label'),
            Options(target='label', task='classification', group_column='group', time_column='time'),
            Options(target='label', task='regression'),
        ]:
            with self.assertRaises(ValueError):
                prepare_data(self.frame, options)

    def test_missing_labels_are_removed_and_nonfinite_regression_labels_fail(self):
        frame = self.frame.copy()
        frame.loc[0, 'label'] = None
        prepared = prepare_data(frame, Options(target='label', task='classification'))
        self.assertEqual(prepared.missing_targets, 1)
        self.assertEqual(len(prepared.frame), 59)
        frame['label'] = np.arange(60, dtype=float)
        frame.loc[0, 'label'] = np.inf
        with self.assertRaises(ValueError):
            prepare_data(frame, Options(target='label', task='regression'))

    def test_declared_ids_must_be_present_and_unique(self):
        for value in [None, self.frame.loc[1, 'id']]:
            frame = self.frame.copy()
            frame.loc[0, 'id'] = value
            with self.assertRaises(ValueError):
                prepare_data(frame, Options(target='label', task='classification', id_column='id'))

    def test_validation_export_preserves_ids_named_like_report_columns(self):
        for name in ['row_index', 'actual', 'dummy_prediction', 'linear_prediction']:
            frame = self.frame.rename(columns={'id': name})
            options = Options(target='label', task='classification', id_column=name)
            _, rows, _, _ = evaluate(prepare_data(frame, options), options)
            self.assertTrue(rows.columns.is_unique)
            self.assertEqual(len(rows.columns), 5)
            self.assertEqual(set(rows[name]), set(frame.loc[rows['_row_index' if name == 'row_index' else 'row_index'], name]))

    def test_prediction_normalization_retains_training_category_types(self):
        train = normalize_features(pd.DataFrame({'kind': ['1', '2', 'X'], 'x': [1., 2., 3.]}))
        prediction = normalize_features(pd.DataFrame({'kind': [1, 2], 'x': [4., 5.]}), reference=train)
        self.assertEqual(prediction['kind'].tolist(), ['1', '2'])
        booleans = pd.DataFrame({'flag': [True, False, None]})
        prediction = normalize_features(pd.DataFrame({'flag': ['true', 'FALSE', None]}), reference=booleans)
        self.assertEqual(prediction['flag'].tolist()[:2], ['True', 'False'])
        self.assertTrue(pd.isna(prediction.loc[2, 'flag']))
        with self.assertRaises(ValueError):
            normalize_features(pd.DataFrame({'flag': ['unknown']}), reference=booleans)

    def test_macro_f1_uses_the_full_class_set(self):
        scores = score_predictions('classification', ['a', 'a'], ['a', 'a'], classes=['a', 'b'])
        self.assertEqual(scores['f1_macro'], .5)
        self.assertEqual(scores['balanced_accuracy'], .5)

    def test_time_split_rejects_validation_that_omits_a_class(self):
        frame = self.frame.copy()
        frame.loc[48:, 'label'] = 'yes'
        options = Options(target='label', task='classification', time_column='time')
        prepared = prepare_data(frame, options)
        with self.assertRaises(ValueError):
            split_rows(prepared, options)


if __name__ == '__main__':
    unittest.main()
