import hashlib
import tempfile
import unittest
from pathlib import Path

from datathon_cli.data import load_dataset, source_fingerprint


class LoadingTests(unittest.TestCase):
    def test_csv_preserves_declared_identifier_and_missing_values(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'input.csv'
            path.write_text('id,amount,category\n001,12,a\n002,,b\n', encoding='utf-8')
            frame = load_dataset(path, preserve=['id'])
            self.assertEqual(frame['id'].tolist(), ['001', '002'])
            self.assertEqual(int(frame['amount'].isna().sum()), 1)
            self.assertEqual(source_fingerprint(path), hashlib.sha256(path.read_bytes()).hexdigest())

    def test_duplicate_and_blank_headers_are_rejected_before_pandas_renames_them(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'input.csv'
            for content in ['x,x\n1,2\n', 'x,\n1,2\n']:
                path.write_text(content, encoding='utf-8')
                with self.assertRaises(ValueError):
                    load_dataset(path)

    def test_tsv_and_json_records_have_equivalent_values(self):
        with tempfile.TemporaryDirectory() as folder:
            tsv = Path(folder) / 'input.tsv'
            records = Path(folder) / 'input.json'
            tsv.write_text('x\ty\n1\t2\n3\t4\n', encoding='utf-8')
            records.write_text('[{"x":1,"y":2},{"x":3,"y":4}]', encoding='utf-8')
            self.assertEqual(load_dataset(tsv).to_dict('records'), load_dataset(records).to_dict('records'))

    def test_nested_values_and_unsupported_formats_are_rejected(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'input.json'
            path.write_text('[{"x":[1,2]}]', encoding='utf-8')
            with self.assertRaises(ValueError):
                load_dataset(path)
            path = Path(folder) / 'input.pkl'
            path.write_bytes(b'not a supported dataset')
            with self.assertRaises(ValueError):
                load_dataset(path)

    def test_malformed_csv_row_width_never_shifts_the_target(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / 'input.csv'
            for content in ['id,x,label\n001,10,yes,EXTRA\n002,20,no,EXTRA\n', 'id,x,label\n001,10\n002,20,no\n']:
                path.write_text(content, encoding='utf-8')
                with self.assertRaises(ValueError):
                    load_dataset(path)


if __name__ == '__main__':
    unittest.main()
