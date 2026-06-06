import csv
import importlib.util
import pathlib

MODULE_PATH = pathlib.Path(__file__).resolve().parents[1] / 'train_pipeline.py'
spec = importlib.util.spec_from_file_location('minimal_train_pipeline', MODULE_PATH)
train_pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(train_pipeline)


def rows(n=40):
    data = []
    for i in range(n):
        data.append({
            'timestamp': f'2026-01-01T00:{i:02d}:00Z',
            'symbol': 'SPY',
            'open': 100 + i,
            'high': 101 + i,
            'low': 99 + i,
            'close': 100.5 + i,
            'volume': 1000 + i,
        })
    return data


def test_make_labels_uses_next_open_and_drops_last_horizon_rows():
    data = rows(10)
    labels = train_pipeline.make_labels(data, horizon=3, cost_bps=0, tau_up=0.0001, tau_dn=0.0001)
    expected_return = (data[3]['close'] - data[1]['open']) / data[1]['open']
    assert labels[0] == (2 if expected_return > 0.0001 else 1)
    assert labels[-3:] == [None, None, None]


def test_feature_builder_uses_past_and_current_rows_only():
    data = rows(25)
    featured, names = train_pipeline.compute_features(data)
    original_ret_1 = featured[10]['ret_1']
    data[20]['close'] = 99999
    featured_after, _ = train_pipeline.compute_features(data)
    assert featured_after[10]['ret_1'] == original_ret_1
    assert 'ret_20' in names


def test_chronological_split_has_no_shuffle_and_horizon_gap():
    split = train_pipeline.chronological_split(120, horizon=10)
    assert split['shuffle'] is False
    assert split['val'][0] - split['train'][1] >= 10
    assert split['test'][0] - split['val'][1] >= 10


def test_train_pipeline_works_on_synthetic_csv(tmp_path):
    csv_path = tmp_path / 'features_snapshot.csv'
    with csv_path.open('w', newline='') as handle:
        writer = csv.writer(handle)
        writer.writerow(['timestamp', 'symbol', 'open', 'high', 'low', 'close', 'volume'])
        price = 100.0
        for i in range(160):
            open_ = price
            close = open_ + ((i % 20) - 10) * 0.03 + (0.2 if i % 13 == 0 else -0.02)
            writer.writerow([f'2026-01-01T00:{i:02d}:00Z', 'SPY', open_, max(open_, close) + 0.1, min(open_, close) - 0.1, close, 1000 + i])
            price = close
    args = train_pipeline.parse_args(['--dataset', str(csv_path), '--output-dir', str(tmp_path / 'artifacts'), '--symbol', 'SPY', '--timeframe', '1m', '--horizon', '10', '--min-samples', '80'])
    result = train_pipeline.train(args)
    assert result['ok'] is True
    assert result['status'] == 'trained'
    assert (pathlib.Path(result['artifactPath']) / 'manifest.json').exists()
