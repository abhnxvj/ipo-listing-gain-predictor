# IPO Listing Gain Predictor

Predicting how much an Indian mainboard IPO (2022–2026) gains or loses on its **listing day**, using
only information known *before* it lists: the grey market premium (GMP), the subscription numbers, and
the mood of the wider market (Nifty 50).

The headline lesson of the project is about **honest evaluation**: a naive random train/test split
looks great (R² ~0.55) but is misleading, because the IPO market cooled sharply after 2024. A proper
walk-forward test — train on the past, predict the future, retrain as new IPOs arrive — gives a real,
leak-free score of about **R² 0.50**.

## Project structure

```
IPO-Predictor/
├── data/
│   ├── raw/          # original IPO, year-wise listing, and Nifty CSVs
│   └── processed/    # tidy tables produced by the notebooks
└── notebooks/
    ├── 01_Data_Collection.ipynb     # load and stack the raw files
    ├── 02_Insights_EDA.ipynb        # what actually drives listing gains
    ├── 03_Feature_Engineering.ipynb # clean, match dates, build features -> ipo_features.csv
    ├── 04_Model_Training.ipynb      # random split (misleading) vs walk-forward (honest)
    └── 05_Predictions.ipynb         # full vs retail model, and does it beat GMP?
```

Run the notebooks in order 01 → 05. Each reads from `data/processed/`, which notebook 01 (and 03)
populate, so 01 and 03 must run before the rest.

## The data

- **`ipo_data.csv`** — one row per IPO: issue price, 5-day GMP, subscription numbers, fundamentals,
  and the listing-day result (`listing_gain_close_pct`, the target).
- **`ipo22.csv … ipo26.csv`** — year-wise performance sheets; used only for each IPO's listing date.
- **`nif22.csv … nif26.csv`** — daily Nifty 50 close, used for market-mood features.

## The two models

- **Full model** — uses everything known by listing day, including the *final* subscription book.
- **Retail model** — uses only what a retail investor can see on **bidding day 3** (day-1/day-2
  subscription, GMP up to day 3, market mood). It trails the full model only slightly, which means the
  actionable version is almost as good as the academic one.

## Headline results (honest walk-forward, 2025–26 out-of-time)

- Full model: **R² ≈ 0.50**, MAE ≈ 11 percentage points
- Retail model: **R² ≈ 0.46**
- Raw GMP day-3 as a prediction: **R² ≈ 0.00** but correlation ≈ 0.52 — GMP has the *direction* but
  is miscalibrated in the cooled market; the model's job is to fix the *scale*.

## Tools

Plain `pandas`, `numpy`, `matplotlib`, and `scikit-learn` (LinearRegression, RandomForest,
GradientBoosting). No extra dependencies.

## Web app (deployed)

A FastAPI app serves the **retail model** behind a small web UI: enter the pre-listing
signals (issue size, early subscription, 3-day GMP, Nifty mood) and get a predicted
listing-day gain %.

```
train_model.py        # trains the retail GB+RF ensemble on all data -> models/model.joblib
models/model.joblib   # the committed production model (loaded at startup)
app/main.py           # FastAPI: /health, /api/meta, /api/predict, serves the UI
app/static/           # index.html + style.css + script.js (the frontend)
render.yaml           # Render Blueprint for one-click deploy
```

### Run locally

```bash
pip install -r requirements.txt
python train_model.py            # (re)build models/model.joblib
uvicorn app.main:app --reload    # open http://127.0.0.1:8000
```

### Deploy on Render

1. Push this repo to GitHub.
2. In Render: **New → Blueprint**, connect the repo. Render reads `render.yaml`
   (build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`).
3. Wait for the build; the live URL serves the same UI. `/health` is the health check.

The trained model is committed, so Render does **not** retrain — it just loads `models/model.joblib`.
