"""
Train the production IPO listing-gain model and save it for the API.

This mirrors the "retail" walk-forward model from notebook 05: an averaged
GradientBoosting + RandomForest ensemble, using only information a retail
investor can see by bidding day 3 (early subscription, GMP, market mood).

Steps:
  1. Load data/processed/ipo_features.csv
  2. Report an HONEST score via walk-forward (train past -> predict future)
  3. Fit the FINAL model on ALL rows (that is what we deploy)
  4. Save models + feature metadata + metrics to models/model.joblib

Run:  python train_model.py
"""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor, RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score

# --- paths -----------------------------------------------------------------
ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "processed" / "ipo_features.csv"
MODEL_DIR = ROOT / "models"
MODEL_PATH = MODEL_DIR / "model.joblib"

TARGET = "listing_gain_close_pct"

# Only what a retail investor knows by bidding day 3 (the deployable model).
RETAIL_FEATURES = [
    "issue_size_cr",
    "sub_day1_x",
    "sub_day2_x",
    "gmp_day1_pct",
    "gmp_day2_pct",
    "gmp_day3_pct",
    "nifty_ret_5d",
    "nifty_ret_1m",
    "nifty_drawdown",
]

# Human-friendly labels + helper text for the frontend form.
FEATURE_LABELS = {
    "issue_size_cr": ("Issue size (₹ crore)", "Total IPO issue size in crore."),
    "sub_day1_x": ("Subscription day 1 (x)", "Times subscribed by end of day 1."),
    "sub_day2_x": ("Subscription day 2 (x)", "Times subscribed by end of day 2."),
    "gmp_day1_pct": ("GMP day 1 (%)", "Grey market premium over issue price, day 1."),
    "gmp_day2_pct": ("GMP day 2 (%)", "Grey market premium over issue price, day 2."),
    "gmp_day3_pct": ("GMP day 3 (%)", "Grey market premium over issue price, day 3."),
    "nifty_ret_5d": ("Nifty 5-day return (%)", "Nifty 50 return over the last 5 days."),
    "nifty_ret_1m": ("Nifty 1-month return (%)", "Nifty 50 return over the last month."),
    "nifty_drawdown": ("Nifty drawdown (%)", "Nifty 50 drawdown from recent peak (negative)."),
}


def make_models() -> tuple[GradientBoostingRegressor, RandomForestRegressor]:
    """The same two estimators the notebooks settled on, fresh each call."""
    gb = GradientBoostingRegressor(
        n_estimators=200, max_depth=1, learning_rate=0.05,
        loss="absolute_error", random_state=42,
    )
    rf = RandomForestRegressor(n_estimators=300, max_depth=3, random_state=42)
    return gb, rf


def walk_forward_score(df: pd.DataFrame, features: list[str]) -> dict:
    """Honest out-of-time evaluation: train on the past, predict the next 5 IPOs."""
    df_time = df.sort_values("list_date").reset_index(drop=True)
    start = int((df_time["year"] <= 2024).sum())  # predict from first 2025 IPO

    preds: list[float] = []
    i = start
    while i < len(df_time):
        train = df_time.iloc[:i]
        test = df_time.iloc[i : i + 5]

        lo, hi = train[TARGET].quantile([0.02, 0.98])
        y_clip = train[TARGET].clip(lo, hi)

        gb, rf = make_models()
        gb.fit(train[features], y_clip)
        rf.fit(train[features], y_clip)
        batch = (gb.predict(test[features]) + rf.predict(test[features])) / 2
        preds.extend(batch)
        i += 5

    actual = df_time.iloc[start:][TARGET].values
    pred = np.array(preds)
    return {
        "r2": round(float(r2_score(actual, pred)), 3),
        "mae": round(float(mean_absolute_error(actual, pred)), 2),
        "n_test": int(len(actual)),
        "test_period": "2025–26 (out-of-time)",
    }


def main() -> None:
    df = pd.read_csv(DATA, parse_dates=["list_date"])
    print(f"Loaded {len(df)} IPOs from {DATA.relative_to(ROOT)}")

    # 1) honest score (what we report to users as accuracy)
    metrics = walk_forward_score(df, RETAIL_FEATURES)
    print(f"Honest walk-forward  ->  R2 {metrics['r2']}   MAE {metrics['mae']}pp"
          f"   ({metrics['n_test']} test IPOs, {metrics['test_period']})")

    # 2) final production model: fit on ALL rows, with the same outlier clip
    lo, hi = df[TARGET].quantile([0.02, 0.98])
    y_clip = df[TARGET].clip(lo, hi)
    gb, rf = make_models()
    gb.fit(df[RETAIL_FEATURES], y_clip)
    rf.fit(df[RETAIL_FEATURES], y_clip)
    print(f"Trained final model on all {len(df)} rows.")

    # 3) per-feature defaults (median) and ranges for the UI
    feature_meta = []
    for f in RETAIL_FEATURES:
        col = df[f]
        label, help_text = FEATURE_LABELS[f]
        feature_meta.append({
            "name": f,
            "label": label,
            "help": help_text,
            "default": round(float(col.median()), 2),
            "min": round(float(col.min()), 2),
            "max": round(float(col.max()), 2),
        })

    # 4) save everything the API needs in one artifact
    artifact = {
        "gb": gb,
        "rf": rf,
        "features": RETAIL_FEATURES,
        "feature_meta": feature_meta,
        "target": TARGET,
        "metrics": metrics,
        "n_samples": int(len(df)),
        "sklearn_version": __import__("sklearn").__version__,
        "trained_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
    MODEL_DIR.mkdir(exist_ok=True)
    joblib.dump(artifact, MODEL_PATH)
    print(f"Saved model -> {MODEL_PATH.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
