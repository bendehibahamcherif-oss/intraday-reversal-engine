#!/usr/bin/env python3
"""Compatibility entrypoint for the real ML training pipeline.

The mounted backend routes live in server-deliverables/ai in this repository;
this wrapper preserves the requested server/ai/train_pipeline.py path.
"""
from pathlib import Path
import runpy

PIPELINE = Path(__file__).resolve().parents[2] / 'server-deliverables' / 'ai' / 'train_pipeline.py'
runpy.run_path(str(PIPELINE), run_name='__main__')
