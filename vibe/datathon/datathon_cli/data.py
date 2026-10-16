"""Load explicit local table formats without executing serialized objects."""

import csv
import hashlib
import json
from pathlib import Path

import pandas as pd


def load_dataset(path: Path, preserve=(), delimiter: str | None = None) -> pd.DataFrame:
    path = Path(path)
    suffix = path.suffix.lower()
    if not path.is_file():
        raise ValueError(f'Dataset file does not exist: {path}')
    if suffix in {'.csv', '.tsv'}:
        separator = delimiter or ('\t' if suffix == '.tsv' else ',')
        if len(separator) != 1:
            raise ValueError('The delimiter must be one character.')
        try:
            with path.open(encoding='utf-8-sig', newline='') as stream:
                reader = csv.reader(stream, delimiter=separator, strict=True)
                headers = next(reader, [])
                if not headers or any(not header.strip() for header in headers) or len(set(headers)) != len(headers):
                    raise ValueError('Dataset column names must be nonempty and unique.')
                for row in reader:
                    if row and len(row) != len(headers):
                        raise ValueError(f'CSV record ending on line {reader.line_num} has {len(row)} fields; expected {len(headers)}.')
        except csv.Error as error:
            raise ValueError(f'Malformed CSV: {error}') from error
        frame = pd.read_csv(path, sep=separator, encoding='utf-8-sig', index_col=False, dtype={name: 'str' for name in preserve if name in headers})
    elif suffix in {'.json', '.jsonl', '.ndjson'}:
        with path.open(encoding='utf-8-sig') as stream:
            records = [json.loads(line) for line in stream if line.strip()] if suffix != '.json' else json.load(stream)
        if not isinstance(records, list) or not records or not all(isinstance(row, dict) for row in records):
            raise ValueError('JSON datasets must contain a nonempty list of row objects (or one object per JSONL line).')
        frame = pd.DataFrame.from_records(records)
    else:
        raise ValueError('Supported formats: CSV, TSV, JSON records, JSONL/NDJSON. Export other formats to CSV.')
    if frame.empty or not len(frame.columns):
        raise ValueError('Dataset must contain at least one data row and column.')
    if not frame.columns.is_unique or any(not isinstance(name, str) or not name.strip() for name in frame.columns):
        raise ValueError('Dataset column names must be nonempty strings and unique.')
    for name in frame:
        if frame[name].map(lambda value: isinstance(value, (list, dict))).any():
            raise ValueError(f'Column {name!r} contains nested objects; flatten the dataset first.')
    return frame


def source_fingerprint(path: Path) -> str:
    with Path(path).open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()
