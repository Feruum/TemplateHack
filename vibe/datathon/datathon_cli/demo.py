"""Deterministic, explicitly synthetic smoke data, not a competition dataset."""

import numpy as np
import pandas as pd


def make_demo_data(seed: int = 42):
    rng = np.random.default_rng(seed)
    x = rng.normal(size=300)
    z = rng.normal(size=300)
    segment = rng.choice(['east', 'west', 'north'], size=300)
    signal = 3 * x - 2 * z + np.where(segment == 'east', 1., -1.)
    base = pd.DataFrame({'sample_id': [f'{index:05}' for index in range(300)], 'x': x, 'z': z, 'segment': segment})
    classification, regression = base.copy(), base.copy()
    classification['outcome'] = np.where(signal + rng.normal(scale=.4, size=300) > 0, 'yes', 'no')
    regression['value'] = 100 + signal * 8 + rng.normal(scale=.8, size=300)
    for frame in (classification, regression):
        frame.loc[[3, 17, 43, 89], 'x'] = np.nan
        frame.loc[[4, 25, 77], 'segment'] = None
    return classification, regression
