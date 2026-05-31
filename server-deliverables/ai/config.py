"""
config.py — Constants and configuration for the entire ML pipeline.

All numeric parameters are documented with their purpose and units.
Import this module everywhere; never hard-code magic numbers elsewhere.
"""

# ---------------------------------------------------------------------------
# Label construction
# ---------------------------------------------------------------------------

# Number of forward bars used to compute the exit price for labelling.
# e.g. HORIZON=5 on 1-minute bars → exit 5 minutes after entry.
HORIZON: int = 5

# Minimum net return (absolute value) to call a move LONG or SHORT.
# Moves with |r_net| <= TAU are labelled NEUTRAL.
# Expressed as a decimal fraction (0.001 = 10 bps).
TAU: float = 0.001

# Round-trip transaction cost in basis points (broker commission both sides).
COST_BPS: int = 8

# Slippage per side in basis points (market-impact / half-spread estimate).
SLIPPAGE_BPS: int = 2

# ---------------------------------------------------------------------------
# Train / val / test split ratios  (must sum to 1.0)
# ---------------------------------------------------------------------------

TRAIN_RATIO: float = 0.70
VAL_RATIO: float = 0.15
TEST_RATIO: float = 0.15

# ---------------------------------------------------------------------------
# Training guards
# ---------------------------------------------------------------------------

# Minimum number of labelled samples required before training is attempted.
MIN_SAMPLES: int = 100

# Global random seed for reproducibility.
SEED: int = 42

# Maximum XGBoost boosting rounds before early stopping kicks in.
MAX_BOOST_ROUNDS: int = 300

# Number of rounds without improvement that triggers early stopping.
EARLY_STOPPING: int = 30

# ---------------------------------------------------------------------------
# Runtime / serving
# ---------------------------------------------------------------------------

# Maximum allowed inference latency in milliseconds before a timeout error.
INFER_TIMEOUT_MS: int = 400

# Path to the subprocess worker used by the inference server.
WORKER_PATH: str = "server-deliverables/ai/inference/infer_worker.py"

# Directory where trained model artefacts are persisted.
MODEL_DIR: str = "server-deliverables/ai/models"

# Path to the SQLite model-registry database.
REGISTRY_DB: str = "server-deliverables/ai/registry/registry.db"

# Directory where dataset snapshots (Parquet) are stored.
SNAPSHOT_DIR: str = "server-deliverables/ai/data"

# ---------------------------------------------------------------------------
# Label / feature versioning
# ---------------------------------------------------------------------------

# Version string embedded in every artefact to track the label definition.
LABEL_SPEC_VERSION: str = "tradable_v1"

# Version string for the feature engineering specification.
FEATURE_VERSION: str = "p1_v1"

# ---------------------------------------------------------------------------
# Class mapping (label integer ↔ direction string)
# ---------------------------------------------------------------------------

# Maps direction string to integer label used by all sklearn / XGBoost models.
CLASS_MAPPING: dict[str, int] = {"SHORT": 0, "NEUTRAL": 1, "LONG": 2}

# Reverse mapping — integer label back to human-readable direction string.
IDX_TO_CLASS: dict[int, str] = {0: "SHORT", 1: "NEUTRAL", 2: "LONG"}

# ---------------------------------------------------------------------------
# Population Stability Index (PSI) drift thresholds
# ---------------------------------------------------------------------------

# PSI value above which a feature drift WARNING is emitted.
PSI_WARNING_THRESHOLD: float = 0.10

# PSI value above which a feature drift CRITICAL alert is emitted.
PSI_CRITICAL_THRESHOLD: float = 0.20

# ---------------------------------------------------------------------------
# XGBoost default hyper-parameters
# ---------------------------------------------------------------------------

XGBOOST_PARAMS: dict = {
    # Multi-class softmax — outputs per-class probabilities.
    "objective": "multi:softprob",
    "num_class": 3,
    # Evaluation metrics tracked during boosting.
    "eval_metric": ["mlogloss", "merror"],
    # Histogram-based tree builder — fast on large datasets.
    "tree_method": "hist",
    # Step size shrinkage to prevent overfitting.
    "eta": 0.05,
    # Maximum tree depth; controls model complexity.
    "max_depth": 4,
    # Minimum sum of instance weight (Hessian) in a child node.
    "min_child_weight": 5,
    # Fraction of training samples used per tree (row sub-sampling).
    "subsample": 0.8,
    # Fraction of features used per tree (column sub-sampling).
    "colsample_bytree": 0.8,
    # L2 regularisation on leaf weights.
    "reg_lambda": 1.0,
    "seed": 42,
}

# ---------------------------------------------------------------------------
# LightGBM default hyper-parameters
# ---------------------------------------------------------------------------

LGBM_PARAMS: dict = {
    # Multi-class objective.
    "objective": "multiclass",
    "num_class": 3,
    # Primary evaluation metric.
    "metric": "multi_logloss",
    # Step size shrinkage.
    "learning_rate": 0.05,
    # Maximum tree depth (-1 = no limit; positive value caps depth).
    "max_depth": 4,
    # Minimum number of data points in a leaf node.
    "min_child_samples": 10,
    # Row sub-sampling fraction.
    "subsample": 0.8,
    # Column sub-sampling fraction.
    "colsample_bytree": 0.8,
    # L2 regularisation.
    "reg_lambda": 1.0,
    "seed": 42,
    # Suppress LightGBM progress output.
    "verbose": -1,
}
