"""
FastAPI backend for the IPO Listing-Gain Predictor.

Endpoints
  GET  /            -> the web UI (static/index.html)
  GET  /health      -> liveness check (used by Render)
  GET  /api/meta    -> feature list, defaults/ranges, and model metrics
  POST /api/predict -> predict listing-day gain % from the 9 retail inputs

Run locally:  uvicorn app.main:app --reload
"""

from __future__ import annotations

from pathlib import Path

import joblib
import pandas as pd
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent.parent
MODEL_PATH = ROOT / "models" / "model.joblib"
STATIC_DIR = ROOT / "frontend"

# Load the model once at startup. Fail loudly if it is missing.
if not MODEL_PATH.exists():
    raise RuntimeError(
        f"Model not found at {MODEL_PATH}. Run `python train_model.py` first."
    )
ARTIFACT = joblib.load(MODEL_PATH)
GB, RF = ARTIFACT["gb"], ARTIFACT["rf"]
FEATURES: list[str] = ARTIFACT["features"]

app = FastAPI(
    title="IPO Listing-Gain Predictor",
    description="Predicts an Indian mainboard IPO's listing-day gain % from "
    "pre-listing signals (GMP, early subscription, Nifty mood).",
    version="1.0.0",
)

# The frontend is deployed separately (Vercel), so allow browsers on any
# origin to call this API. It is a public, read-only educational endpoint.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


class IPOInput(BaseModel):
    """The 9 retail features, all known by bidding day 3."""

    issue_size_cr: float = Field(..., description="Total issue size in ₹ crore", gt=0)
    sub_day1_x: float = Field(..., description="Times subscribed by end of day 1", ge=0)
    sub_day2_x: float = Field(..., description="Times subscribed by end of day 2", ge=0)
    gmp_day1_pct: float = Field(..., description="GMP over issue price, day 1 (%)")
    gmp_day2_pct: float = Field(..., description="GMP over issue price, day 2 (%)")
    gmp_day3_pct: float = Field(..., description="GMP over issue price, day 3 (%)")
    nifty_ret_5d: float = Field(..., description="Nifty 50 return, last 5 days (%)")
    nifty_ret_1m: float = Field(..., description="Nifty 50 return, last month (%)")
    nifty_drawdown: float = Field(..., description="Nifty 50 drawdown from peak (%)")


def interpret(gain: float) -> str:
    """Plain-English read on the predicted number."""
    if gain >= 15:
        return "Strong listing gain expected."
    if gain >= 5:
        return "Modest listing gain expected."
    if gain > -5:
        return "Roughly flat listing expected."
    return "Likely to list below the issue price."


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "model_trained_at": ARTIFACT["trained_at"]}


@app.get("/api/meta")
def meta() -> dict:
    """Everything the frontend needs to build the form and show accuracy."""
    return {
        "feature_meta": ARTIFACT["feature_meta"],
        "metrics": ARTIFACT["metrics"],
        "n_samples": ARTIFACT["n_samples"],
        "trained_at": ARTIFACT["trained_at"],
    }


@app.post("/api/predict")
def predict(payload: IPOInput) -> dict:
    # Build a single-row frame in the exact feature order the model expects.
    row = payload.model_dump()
    X = pd.DataFrame([row])[FEATURES]
    gain = float((GB.predict(X) + RF.predict(X))[0] / 2)
    return {
        "predicted_gain_pct": round(gain, 2),
        "interpretation": interpret(gain),
        "mae_pp": ARTIFACT["metrics"]["mae"],  # +/- typical error, in pp
        "disclaimer": "Educational model, not investment advice.",
    }


# Also serve the frontend as a fallback (so the Render URL shows the app too).
# Mounted last and only if the folder exists, so it never shadows /api routes.
if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=STATIC_DIR, html=True), name="frontend")
