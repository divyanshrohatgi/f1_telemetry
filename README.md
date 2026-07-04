# GridInsight — F1 Telemetry Dashboard

A Formula 1 analytics dashboard powered by real timing data via FastF1. Covers every session from 2018 to the current season.

---

## Features

### Latest Race
Overview of the most recently completed Grand Prix — podium results, fastest lap, race winner stats, and a scrollable full classification table with gap, interval, and tyre compound per driver.

### Lap Times
Full lap-by-lap chart for any session. Configurable per driver, with:
- Compound-coloured dots (soft/medium/hard/inter/wet) on each data point
- Safety car and VSC periods highlighted as yellow bands
- Pit stop markers with reference lines
- Estimated pit in/out lap times (calculated from LapStartTime delta, shown with `~` and hollow diamond markers)
- Same-team colour differentiation (second driver gets a lightened colour + dashed line)
- Outlier toggle to show or hide slow laps
- Scrollable lap grid cards with compound indicator and fastest lap highlight

### Telemetry
Per-driver telemetry for any lap, plotted against distance:
- Speed, throttle, brake, gear, RPM, and DRS channels
- D3-powered synced crosshair across all channels
- Circuit map showing live position dot that tracks the crosshair
- Rotate button to re-orient the circuit layout
- Lap selector (specific lap or session fastest)
- Driver switcher when multiple drivers are selected

### Comparison
Head-to-head telemetry overlay between any two drivers:
- Shared SVG chart with driver 1 solid, driver 2 dashed
- Delta chart showing time gap across the lap
- Circuit map coloured by who was faster in each mini-sector
- Sector dominance panel with average speed bars per sector
- Lap selector for each driver independently
- Rotate button for circuit layout

### Strategy
Tyre stint timeline showing compound changes, pit stop laps, and stint lengths per driver across the full race.

### Weather
Session weather data — air temp, track temp, humidity, wind speed, rainfall over time.

### PitSense
Degradation curve and pit window prediction tool:
- Select compound, circuit conditions, tyre age
- Returns a degradation curve with confidence interval band
- Cliff lap indicator (where pace falls off sharply)
- Pit window urgency rating: NOW / SOON / WATCH / STABLE
- Inputs for gap ahead/behind and pit loss time

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS 3 |
| Charts | Recharts (lap/strategy), D3 (telemetry/comparison SVG) |
| Flags | flag-icons (SVG sprite, no emoji dependency) |
| Backend | Python 3.9, FastAPI, uvicorn |
| Data | FastF1 3.3 (official F1 timing data, 2018–present) |
| ML | XGBoost gradient-boosted regressor (tyre degradation model) |

---

## Running Locally

**Requirements:** Python 3.9+, Node.js 18+

### Backend

```bat
cd backend
start.bat
```

Or manually:
```bash
cd backend
python -m venv .venv            # first time only
.venv/Scripts/pip install -r requirements.txt   # first time only
.venv/Scripts/python -m uvicorn api.main:app --reload --port 8002
```

The first time a session is loaded FastF1 will download data from F1 servers. Subsequent loads use the local cache at `backend/cache/`.

### Frontend

```bat
cd frontend
start.bat
```

Or manually:
```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5174`

The Vite dev server proxies `/api` and `/ws` to the backend at `http://localhost:8002`, so the backend must be running on 8002 (the default in `backend/start.bat`).

---

## Project Structure

```
f1_tele/
├── backend/
│   ├── api/
│   │   ├── main.py              # FastAPI app, middleware, route registration
│   │   └── routes/              # One file per feature (sessions, laps, telemetry, ...)
│   ├── services/
│   │   ├── fastf1_loader.py     # Session loading + in-memory cache
│   │   ├── lap_processor.py     # Lap cleaning, pit detection, time estimation
│   │   ├── telemetry_processor.py # LTTB downsampling, circuit GPS extraction
│   │   └── results_processor.py
│   ├── models/schemas.py        # Pydantic response models
│   ├── config/seasons.py        # Team colours per season
│   ├── ml/                      # Degradation model training + inference
│   └── cache/                   # FastF1 disk cache (gitignored)
│
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── LapChart/        # Lap times tab
    │   │   ├── TelemetryPlot/   # Telemetry tab (D3)
    │   │   ├── DriverComparison/ # Comparison tab (D3)
    │   │   ├── CircuitMap/      # Shared SVG circuit layout component
    │   │   ├── LatestRace/      # Latest race dashboard
    │   │   ├── Strategy/        # Tyre strategy timeline
    │   │   ├── Weather/         # Weather charts
    │   │   ├── DegradationPredictor/ # PitSense panel
    │   │   ├── TopBar/          # Session info + theme toggle
    │   │   └── common/          # EmptyState, LoadingSpinner, FlagIcon, TabNav
    │   ├── api/client.ts        # All API calls
    │   ├── types/f1.types.ts    # TypeScript interfaces
    │   └── constants/           # Team colours, compound colours, country flags
    └── index.html               # Meta tags, OG tags, JSON-LD
```

---

## Data Coverage

- **Seasons:** 2018–present (limited by FastF1 availability)
- **Session types:** FP1, FP2, FP3, Qualifying, Sprint, Race
- **Drivers:** Always pulled live from session results — no hardcoded rosters
- **Team colours:** Sourced from FastF1 with per-season fallback config

---

## Tyre Degradation Model

The PitSense degradation curves, pit-window urgency rating, and the strategy
simulator's tyre term are all driven by a machine-learning model that predicts
**lap-time loss from tyre wear**.

### Architecture overview

A single-stream tabular pipeline. Raw FastF1 timing data is converted to
per-lap degradation samples, branched into separate dry- and wet-condition
models, then served as lap-by-lap curves to the strategy features.

```
            +-------------------------------------+
            |        FastF1 session data          |
            |   2022–2025, every race weekend     |
            |   laps + weather + telemetry        |
            +------------------+------------------+
                               |
            +------------------V------------------+
            |   Feature Engineering               |
            |   (ml/feature_engineering.py)       |
            |   - per-stint reference lap         |
            |     (stint start, tyres warmed)     |
            |   - target = lap_time_delta vs ref  |
            |   - fuel-corrected lap times        |
            |   - circuit label-encoding          |
            |   - compound one-hot (S/M/H/I/W)    |
            |   - outlier clip: delta ∈ [-1.5,6]s |
            |   => 73,061 laps x 15 features      |
            +------------------+------------------+
                               |
                  +------------+------------+
                  |                         |
        +---------V---------+     +---------V---------+
        |    Dry samples    |     |    Wet samples    |
        +---------+---------+     +---------+---------+
                  |                         |
        +---------V---------+     +---------V---------+
        |   XGBRegressor    |     |   XGBRegressor    |
        |  1000 trees, d=6  |     |  1000 trees, d=6  |
        |  lr 0.05, subsamp |     |  lr 0.05, subsamp |
        |  0.8, early stop  |     |  0.8, early stop  |
        +---------+---------+     +---------+---------+
                  |                         |
                  +------------+------------+
                               |
            +------------------V------------------+
            |   Inference (ml/model_registry.py)  |
            |   - predict delta per tyre age 1..N |
            |   - monotonic guard + light smooth  |
            |   - confidence band + cliff lap     |
            +------------------+------------------+
                               |
          +-----------------+--+---------------+
          |                 |                  |
    +-----V-----+    +------V------+   +-------V--------+
    | PitSense  |    | Pit-window  |   |   Strategy     |
    | deg curve |    |  urgency    |   |  simulator     |
    +-----------+    +-------------+   +----------------+
```

### Model components

**Feature engineering** (`ml/feature_engineering.py`)
- **Target:** `lap_time_delta` — seconds slower than the stint's reference lap
  (taken a few laps in, once tyres are at temperature), so the model learns
  *wear* rather than absolute pace.
- **Fuel correction:** lap times are de-trended for fuel burn before computing
  the delta, so degradation isn't confounded with the car getting lighter.
- **Outlier handling:** deltas outside [−1.5, 6.0] s (safety cars, traffic laps,
  errors) are dropped.
- **Encoding:** circuit is label-encoded; compound is one-hot (soft / medium /
  hard / inter / wet).

**Feature set (15)**
- Tyre: `tyre_age`, `is_fresh_tyre`
- Conditions: `track_temp`, `air_temp`, `humidity`
- Context: `circuit_encoded`, `position`
- Pace proxies: `speed_i1`, `speed_i2`, `speed_st` (sector / speed-trap speeds)
- Compound one-hots: `compound_{SOFT,MEDIUM,HARD,INTER,WET}`

**Model** (`ml/train.py`)
- `XGBRegressor` (gradient-boosted trees) inside a scikit-learn `Pipeline`.
- **Two models**, dry and wet, selected at inference by track conditions.
- Hyperparameters: 1000 trees, `max_depth=6`, `learning_rate=0.05`,
  `subsample=0.8`, `colsample_bytree=0.8`, `min_child_weight=20`, early stopping
  (50 rounds on validation MAE).
- 85 / 15 train/test split, trained on **73,061 laps** across **2022–2025**.

**Inference** (`ml/model_registry.py`)
- Builds the degradation curve by predicting the delta at each tyre age 1…N.
- Applies a monotonic guard (degradation shouldn't drop sharply mid-stint) and
  light smoothing, then derives a confidence band and the "cliff" lap where
  pace falls off.
- Falls back to a linear curve if no trained model is present, so endpoints
  always respond.

### Model performance

Held-out test set (15% split):

| Model | MAE | R² |
|---|---|---|
| **Dry** | **0.487 s** | 0.473 |
| **Wet** | **0.526 s** | 0.508 |

Mean absolute error under ~0.5 s/lap means a typical prediction lands within
about half a second of the real lap-time loss. R² in the ~0.47–0.51 range
reflects how noisy real tyre degradation is — lap times are also shaped by fuel,
traffic, track evolution, and driver inputs, which the model deliberately leaves
out so it isolates the tyre-wear signal.

### Training

```bash
cd backend
.venv/Scripts/python.exe ml/train.py --seasons 2022 2023 2024 2025
```

Per-lap features are extracted and cached to
`backend/data/training_data_<range>.parquet`; the dry and wet models are saved
to `backend/ml/saved_models/`.
