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
| Data | FastF1 3.7 (official F1 timing data, 2018–present) |
| ML | scikit-learn GradientBoostingRegressor (degradation model) |

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
./venv/Scripts/activate
python -m uvicorn api.main:app --reload --port 8000
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

Visit `http://localhost:5173`

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

## Training the Degradation Model

```bash
cd backend
./venv/Scripts/python.exe ml/train.py --seasons 2022 2023 2024
```

Model is saved to `backend/ml/saved_models/`. Without a trained model the API returns a linear fallback curve.
