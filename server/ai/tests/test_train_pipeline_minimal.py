import runpy
from pathlib import Path

TEST_PATH = Path(__file__).resolve().parents[3] / 'server-deliverables' / 'ai' / 'tests' / 'test_train_pipeline_minimal.py'
globals().update({k: v for k, v in runpy.run_path(str(TEST_PATH)).items() if k.startswith('test_')})
