# Race Strategy Simulation — How It Works

GridInsight ships **two** independent strategy-simulation engines. They answer
slightly different questions and have different fidelity. This document explains
what each one does, the model behind it, and where the code lives.

| | **Strategy Simulator** | **What-If Engine** |
|---|---|---|
| Question | "Replay this driver's whole race under a tyre/pit plan I design from scratch." | "Change one of this driver's pit stops — what happens to the field?" |
| Input | Starting compound + a full list of pit stops | A single change (move one stop / change its compound) |
| Pace model | ML degradation curves + fuel + traffic + median base pace | Peer-lap median (real laps from other drivers), physics fallback |
| Endpoint | `POST /api/v1/simulate/{year}/{gp}/{session_type}` | `POST /api/v1/whatif/simulate` |
| Service | [`services/simulator.py`](../backend/services/simulator.py) | [`services/whatif_engine.py`](../backend/services/whatif_engine.py) |
| Route | [`api/routes/simulate.py`](../backend/api/routes/simulate.py) | [`api/routes/whatif.py`](../backend/api/routes/whatif.py) |
| Frontend | `Simulator/SimulatorView.tsx` (the "Simulator" tab) | not currently wired to a UI |

The **Simulator tab** the user sees calls the first engine (`/api/v1/simulate`).
The What-If engine is a separate, more constrained implementation that powers
single-decision counterfactuals.

---

## 1. The Strategy Simulator (`simulator.py`)

### Goal & core idea

Let a user define a complete strategy (starting tyre + every pit stop) and
replay the driver's entire race under it, returning lap-by-lap times, tyre ages,
positions versus the rest of the field, and a final classification.

The guiding principle is **anchor to reality, model only the difference**:

> Up to the lap where the user's strategy first differs from what actually
> happened, replay the driver's *real* lap times. Only from that "divergence
> lap" onward do we switch to the synthetic pace model.

This is what makes the tool trustworthy: feeding in the driver's *actual*
strategy reproduces the real race exactly (time delta `0.0`, identical
positions). Any difference you see is caused by the change you made, not by
model error in the part of the race you didn't touch.

### Inputs

```jsonc
POST /api/v1/simulate/2023/Bahrain/RACE
{
  "driver_code": "VER",
  "starting_compound": "SOFT",        // optional; defaults to actual stint-1 tyre
  "pit_stops": [
    { "lap": 14, "compound": "SOFT" }, // lap = the IN-LAP (last lap before the stop)
    { "lap": 36, "compound": "HARD" }
  ]
}
```

`lap` is the **in-lap** — the last lap of the stint before the stop. The
frontend pre-fills these from the strategy endpoint using each stint's
`end_lap`, so opening the tab and hitting *Simulate* with no edits round-trips
the driver's real race.

### Pipeline (step by step)

The numbered comments in `simulate_race_strategy()` map to these stages:

1. **Load the session & weather.** FastF1 laps for the whole field; mean track
   and air temp (defaults 30 °C / 25 °C if weather is missing) feed the ML model.

2. **Build the driver's actual lap data.** `actual_lap_times[lap] = seconds`
   for every lap with a valid time. `actual_race_time_total` is their sum — the
   real race time we compare against.

3. **Base pace = median of clean laps.** `pick_quicklaps()` filters out
   in/out laps and safety-car laps; we take the **median** as a robust
   representative pace, and the modal compound of those laps as `best_compound`.

4. **Per-circuit pit loss.** Looked up from
   [`data/pit_loss_by_circuit.json`](../backend/data/pit_loss_by_circuit.json)
   (fuzzy circuit-key match), default `22.0 s`.

5. **ML degradation curves.** For every compound used in the strategy, call
   `predict_degradation_curve()` (see §3). Each curve is a list of
   `predicted_delta` (seconds lost to tyre wear) indexed by tyre age.

6. **Compound pace offsets.** A median lap is on one compound; other compounds
   are offset from it (`SOFT −0.8`, `MEDIUM 0.0`, `HARD +0.5`, `INTER +3`,
   `WET +5`), re-based so `best_compound` sits at the measured median.

7. **Find the divergence lap.** Compare the user's pit schedule to the actual
   one. The divergence lap is the **first** lap where they differ — either a
   pit lap exists in one plan but not the other, **or** a shared pit lap fits a
   different compound. *(Compound comparison uses the **out-lap's** recorded
   tyre — the compound the driver actually switched **to** — because the in-lap
   still carries the old stint's tyre.)*

8. **Build traffic data.** Cumulative race time for every other driver at each
   lap, used to detect when our driver is in another car's dirty air.

9. **Run the lap loop.** For `lap = 1 … total_laps`:

   - Mark `is_pit_in` (matches a scheduled stop) and `is_pit_out` (lap after a
     stop).
   - **Before divergence** (`lap < diverge_lap` and a real time exists):
     `raw_lap_time = actual_lap_times[lap]` — replay reality verbatim. Real
     laps already contain real pit loss and real traffic, so nothing synthetic
     is added.
   - **At/after divergence** (modelled lap):
     ```
     raw = base_pace
         + (mid_lap - lap) * FUEL_BURN_PER_LAP   # fuel: heavy early, light late
         + deg_curve[compound][tyre_age]          # tyre wear from the ML model
         + noise                                  # deterministic ±0.15 s jitter
     if is_pit_out:  raw += pit_loss + 1.5        # stop cost + cold-tyre out-lap
     raw += traffic_penalty                       # dirty-air, modelled laps only
     ```
   - Accumulate `cumulative_time`; on a pit-in, switch compound and reset tyre
     age.

10. **Positions & standings.** Recompute cumulative times for the whole field
    (the target driver uses simulated times, everyone else uses actual), then
    rank every driver at every lap to get `position` / `gap_to_leader`
    (simulated) alongside `actual_position` / `actual_gap`. Final ranking gives
    `simulated_final_position` vs `actual_final_position` and a
    `position_change`.

### Key model assumptions

- **Fuel** is linear at `FUEL_BURN_PER_LAP = 0.06 s/lap`, referenced to
  *mid-race*. Since `base_pace` is the median lap (~mid-race fuel load), the
  correction is `(mid_lap − lap) × 0.06`: positive (slower) early, negative
  (faster) late, zero at half-distance. *(Referencing to mid-race matters — a
  naïve `− lap × 0.06` would make late laps several seconds too fast.)*
- **Pit loss** is charged to the **out-lap**, matching how FastF1 records it
  (the stationary time shows up on the lap leaving the pits, not entering).
- **Traffic / dirty air**: if the driver is 0.2–2.0 s behind a car, +1.0 s;
  2.0–4.0 s behind, +0.3 s. Applied only to modelled laps — real laps already
  reflect the traffic the driver was actually in.
- **Noise** is deterministic (based on `lap % 3`) so repeated runs are stable.

### Response shape

```jsonc
{
  "original_total_time": 5636.736,
  "simulated_total_time": 5624.498,
  "time_delta": -12.238,              // negative = faster than reality
  "actual_final_position": 1,
  "simulated_final_position": 1,
  "position_change": 0,
  "simulated_laps": [ /* per-lap: time, cumulative, compound, age, flags, positions */ ],
  "final_standings": [ /* every driver: actual vs simulated finishing position */ ]
}
```

---

## 2. The What-If Engine (`whatif_engine.py`)

### Goal & core idea

A tighter counterfactual: take **one** real pit stop and change *when* it
happens or *what tyre* goes on, then recompute the whole field's order. It is
built entirely on **real lap data** — for the laps it has to invent, it borrows
from *other drivers'* actual laps in similar conditions rather than a pure
physics formula.

v1 supports exactly one change per request.

### Inputs

```jsonc
POST /api/v1/whatif/simulate
{
  "year": 2023, "gp_name": "Bahrain", "session": "RACE",
  "changes": [{
    "driver": "VER",
    "original_pit_lap": 15,   // first lap on the new compound in the REAL race (stint i+1 start_lap)
    "new_pit_lap": 22,        // first lap on the new compound in the simulation
    "new_compound": "HARD"
  }]
}
```

### How a lap time is predicted (`_predict_lap`)

For any lap it has to synthesize, the engine first tries **peer laps**: real
laps by *other* drivers on the same compound, within ±3 laps of tyre age and ±4
of race lap, **excluding pit in/out laps** (whose times embed the pit-lane loss
and would contaminate green-flag pace — critical at tyre age 1). If ≥3 such laps
exist it uses their **median**, then shifts it by a **driver pace offset** —
how much faster/slower the driver's clean laps are than the field median
(clamped to ±2 s) — so a front-runner's synthesized laps aren't dragged toward
midfield pace. Only if peers are too sparse does it fall back to physics:

```
base (25th-percentile of the driver's own laps on that compound)
  + tyre_age × DEG_RATE[compound]
  + (total_laps/2 − lap_num) × 0.06     (fuel, referenced to mid-race)
```

The fuel term is referenced to mid-race (base ≈ a mid-distance lap): heavier
early, lighter late, zero at half-distance — a naive `− lap_num × 0.06` makes
late laps several seconds too fast on long synthetic stints.

### Building the simulated timeline

A single ordered pass keeps real laps wherever the strategy is unchanged and
synthesizes the rest, tracking a running cumulative time so traffic can be
modelled:

- **Pitting earlier (or same lap, new compound)** — keep real laps up to
  `new_pit_lap`; charge `pit_loss` on `new_pit_lap`; predict the new-compound
  stint afterward with tyre age counting from the new stop.
- **Pitting later** — keep real laps up to `original_pit_lap`; *extend* the old
  stint with predicted laps (tyre age keeps climbing) until `new_pit_lap`;
  charge `pit_loss` there; then predict the new-compound stint.

Pit loss comes from the per-circuit table (`pit_loss_by_circuit.json`, shared
with the Simulator) and is charged **once** on the in-lap; because the peer pool
excludes out-laps, it is not double-counted on the lap leaving the pits. The
out-lap gets a `COLD_TYRE_PENALTY` (1.5 s) warm-up cost.

### Traffic / dirty air

On each synthesized lap, the engine finds the nearest car ahead by cumulative
time and applies a dirty-air penalty (+1.0 s if within 0.2–2.0 s, +0.3 s if
2.0–4.0 s). Real (replayed) laps get no penalty — they already reflect the
traffic the driver was actually in.

### Field recomputation

Everyone else keeps their real lap times; only the target driver's timeline
changes. Cumulative times are rebuilt, and positions are derived with a
lap-aware sort (further-along driver first, then lower cumulative time), so
back-markers a lap down don't artificially outrank the leaders. **Track position
lost at a stop therefore falls out of the math** — rejoining behind cars shows
up as a position drop.

### Known limitations

- **An unchanged strategy does not return exactly zero delta.** After the
  changed stop the engine replaces real laps with clean-air predictions, so it
  cannot reproduce one-off real events (a lap stuck behind a backmarker, a slow
  zone, a VSC). Those show up as residual delta. Reproducing them would require
  replaying real laps wherever the post-stop stint matches reality — the
  divergence approach the Strategy Simulator uses (see §1).
- **The rest of the field is frozen** at their real lap times. They don't react
  to the target driver — no one gets held up behind them, no defending, no
  two-way undercut/overcut feedback. It is a one-sided "ghost" simulation.
- **One change only** (v1). Moving an early stop implies running the new
  compound to the end (ignoring the driver's later real stops), so it models a
  strategy conversion, not a small tweak.

### Response shape

```jsonc
{
  "summary": {
    "driver": "VER",
    "actual_position": 1, "simulated_position": 2,
    "position_change": -1,
    "time_delta": 8.4                 // positive = slower than reality
  },
  "actual_laps":    [ /* per-lap position, gap, time, compound, tyre_age */ ],
  "simulated_laps": [ /* same, with is_simulated flag on invented laps */ ],
  "all_drivers_actual_final":    [ /* full grid */ ],
  "all_drivers_simulated_final": [ /* full grid */ ]
}
```

---

## 3. The degradation model (shared dependency)

Both the Simulator's tyre term and the PitSense panel rely on
[`ml/model_registry.py`](../backend/ml/model_registry.py)'s
`predict_degradation_curve()`. It returns, per tyre age, the seconds lost to
tyre wear (`predicted_delta`) plus a confidence band.

- A per-season scikit-learn pipeline (gradient-boosted) is loaded from
  `ml/saved_models/`; separate models for **dry** and **wet**.
- Prediction is an **auto-regressive chain**: each lap's predicted delta feeds
  the next lap's `prev_lap_delta` and `delta_acceleration` features — the same
  setup used in training.
- Features include compound×age interactions, track/air temp, target-encoded
  circuit & team degradation, race-lap context, and speeds.
- Output is lightly smoothed (window 2) to tame step noise while preserving the
  "cliff" shape; a guard stops the curve from dropping sharply mid-stint.
- **No trained model?** It falls back to a linear curve
  (`age × per-compound rate`), so the API always returns something usable.

Train with:

```bash
cd backend
./venv/Scripts/python.exe ml/train.py --seasons 2022 2023 2024
```

---

## 4. Choosing between the two engines

- Designing a **whole strategy** from scratch, want field positions and a
  replay timeline → **Strategy Simulator** (`/api/v1/simulate`). This is the
  one wired to the Simulator tab.
- Asking a focused **"what if this one stop were different"** question with
  data-grounded peer-lap pacing → **What-If Engine** (`/api/v1/whatif/simulate`).

Both anchor to real lap data wherever the strategy is unchanged, so the
*unchanged* portion of the race is always faithful and only your decision moves
the result.
