"""Descriptive EDA and a self-contained, escaped local HTML report."""

import base64
import html
import io
import json

import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd


def profile(frame: pd.DataFrame, target: str | None = None) -> dict:
    if target and target not in frame:
        raise ValueError(f'Target column {target!r} is missing.')
    columns = []
    for name in frame:
        series = frame[name]
        info = {'name': name, 'dtype': str(series.dtype), 'missing': int(series.isna().sum()), 'unique': int(series.nunique())}
        if pd.api.types.is_numeric_dtype(series):
            finite = pd.to_numeric(series).replace([np.inf, -np.inf], np.nan).dropna()
            info['nonfinite'] = int(np.isinf(series.to_numpy(dtype=float, na_value=np.nan)).sum())
            info['statistics'] = {key: float(value) if pd.notna(value) and np.isfinite(value) else None for key, value in finite.describe().to_dict().items()}
        else:
            info['top_values'] = {str(value): int(count) for value, count in series.value_counts().head(10).items()}
        columns.append(info)
    numeric = frame.select_dtypes(include='number').replace([np.inf, -np.inf], np.nan).iloc[:, :16]
    correlations = numeric.corr().replace([np.inf, -np.inf], np.nan)
    result = {
        'rows': len(frame), 'columns': columns, 'duplicate_rows': int(frame.duplicated().sum()),
        'target': target, 'correlation_columns': numeric.columns.tolist(),
        'correlations': correlations.astype(object).where(correlations.notna(), None).to_dict(),
        'warnings': [],
    }
    if result['duplicate_rows']:
        result['warnings'].append('Duplicate rows exist. Review repeated entities and use a group/time split when appropriate.')
    if target:
        result['missing_targets'] = int(frame[target].isna().sum())
    if any(column['unique'] > max(50, len(frame) * .8) and 'top_values' in column for column in columns):
        result['warnings'].append('High-cardinality text exists. Exclude identifiers; this baseline encodes at most 50 categories per feature and is not a text model.')
    result['warnings'].append('EDA describes the supplied table. Metrics use a separate holdout; preprocessing is fitted only on training rows.')
    return result


def figure_image(figure) -> str:
    buffer = io.BytesIO()
    figure.savefig(buffer, format='png', dpi=120, bbox_inches='tight')
    plt.close(figure)
    return base64.b64encode(buffer.getvalue()).decode('ascii')


def charts(frame: pd.DataFrame, target: str | None = None):
    output = []
    with plt.rc_context({'figure.figsize': (8, 3.6), 'axes.spines.top': False, 'axes.spines.right': False, 'axes.grid': True, 'grid.alpha': .15, 'font.size': 10}):
        figure, axes = plt.subplots()
        missing = frame.isna().sum().sort_values(ascending=False).head(12)
        axes.barh([str(name)[:45] for name in missing.index][::-1], missing.to_numpy()[::-1], color='#216a67')
        axes.set_xlabel('Missing rows')
        output.append(('Missing values (up to 12 columns)', figure_image(figure)))
        numeric = frame.select_dtypes(include='number').replace([np.inf, -np.inf], np.nan)
        for name in numeric.columns[:4]:
            values = numeric[name].dropna()
            if values.empty:
                continue
            figure, axes = plt.subplots()
            axes.hist(values, bins=min(30, max(5, int(np.sqrt(len(values))))), color='#216a67', edgecolor='white')
            axes.set_xlabel(str(name)[:80])
            axes.set_ylabel('Rows')
            output.append((f'Distribution: {name}', figure_image(figure)))
        if target:
            values = frame[target].dropna()
            figure, axes = plt.subplots()
            if pd.api.types.is_numeric_dtype(values) and values.nunique() > 20:
                axes.hist(values.replace([np.inf, -np.inf], np.nan).dropna(), bins=25, color='#8b5d36')
            else:
                counts = values.astype(str).value_counts().head(12)
                axes.barh(counts.index.tolist()[::-1], counts.to_numpy()[::-1], color='#8b5d36')
            axes.set_ylabel('Target distribution')
            output.append((f'Target: {target}', figure_image(figure)))
        if numeric.shape[1] >= 2:
            correlations = numeric.iloc[:, :16].corr()
            figure, axes = plt.subplots(figsize=(7, 5))
            image = axes.imshow(correlations.to_numpy(), vmin=-1, vmax=1, cmap='BrBG')
            axes.set_xticks(range(len(correlations)), correlations.columns, rotation=65, ha='right')
            axes.set_yticks(range(len(correlations)), correlations.columns)
            axes.grid(False)
            figure.colorbar(image, ax=axes, label='Pearson correlation')
            output.append(('Numeric correlations (up to 16 columns)', figure_image(figure)))
    return output


def build_report(frame, eda, metadata, scores=None) -> str:
    escape = lambda value: html.escape(str(value), quote=True)
    warnings = [*eda['warnings'], *metadata.get('warnings', [])]
    summary = 'Synthetic data - environment verification only.' if metadata.get('synthetic') else 'Local data - review this report before sharing.'
    rows = ''.join(f'<tr><th>{escape(column["name"])}</th><td>{escape(column["dtype"])}</td><td>{column["missing"]}</td><td>{column["unique"]}</td></tr>' for column in eda['columns'])
    figures = ''.join(f'<figure><img alt="{escape(title)}" src="data:image/png;base64,{pixels}"><figcaption>{escape(title)}</figcaption></figure>' for title, pixels in charts(frame, eda.get('target')))
    evaluation = ''
    if scores:
        metric = scores['primary_metric']
        results = ''.join(f'<tr><th>{escape(name)}</th><td>{values[metric]:.6g}</td></tr>' for name, values in scores['models'].items())
        evaluation = f'<h2>Validation results</h2><p>Primary metric: {escape(metric)} ({escape(scores["direction"])}). Selected model: <strong>{escape(scores["selected_model"])}</strong>.</p><table><thead><tr><th>Model</th><th>{escape(metric)}</th></tr></thead><tbody>{results}</tbody></table><p>These are model-selection holdout scores, not an independent final test. See metrics.json for all scores and class-level results.</p><details><summary>All metrics</summary><pre>{escape(json.dumps(scores, indent=2, ensure_ascii=False))}</pre></details>'
    return f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Datathon data report</title>
<style>body{{margin:0;background:#f5f4ef;color:#202b2d;font:16px/1.6 system-ui,sans-serif}}main{{max-width:1060px;margin:auto;padding:40px 24px}}h1{{font-size:40px;line-height:1.15}}h2{{margin-top:42px}}.notice{{padding:16px;border-left:4px solid #216a67;background:#e5efeb}}table{{width:100%;border-collapse:collapse;display:block;overflow:auto}}th,td{{padding:9px 16px;text-align:left;border-bottom:1px solid #d3d9d4}}figure{{margin:24px 0;background:white;padding:18px}}img{{width:100%;height:auto}}figcaption{{color:#465958}}pre{{white-space:pre-wrap;overflow-wrap:anywhere}}summary{{cursor:pointer}}code{{overflow-wrap:anywhere}}</style></head>
<body><main><p>TemplateHack / local data workflow</p><h1>Datathon data report</h1><p class="notice">{escape(summary)}</p>
<p>{eda['rows']} rows / {len(eda['columns'])} columns / {eda['duplicate_rows']} exact duplicate rows</p>
<p>Source: <code>{escape(metadata['source'])}</code><br>SHA-256: <code>{escape(metadata['source_sha256'])}</code></p>
<ul>{''.join(f'<li>{escape(warning)}</li>' for warning in warnings)}</ul>{evaluation}
<h2>Schema and missing values</h2><table><thead><tr><th>Column</th><th>Type</th><th>Missing</th><th>Unique</th></tr></thead><tbody>{rows}</tbody></table>
<h2>Exploratory analysis</h2>{figures}<details><summary>Run configuration and environment</summary><pre>{escape(json.dumps(metadata, indent=2, ensure_ascii=False))}</pre></details>
</main></body></html>'''
