/**
 * PitSense™ — Session-Aware AI Pit Strategy Engine
 *
 * Automatically loads data from the current session. User picks a driver
 * then a stint; PitSense overlays actual vs predicted degradation and shows
 * green / SC / VSC pit window scenarios.
 */

import React, { useState, useEffect } from 'react';
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine,
} from 'recharts';
import { api } from '../../api/client';
import type {
  SessionMetadata, DriverStrategy, Stint,
  DegradationResponse, PitWindowResponse, TyreCompound, LapData,
} from '../../types/f1.types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const TEAL = '#27F4D2';
const FUEL_BURN = 0.065; // s per lap

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#FF3333', MEDIUM: '#FFC906', HARD: '#CCCCCC',
  INTER: '#39B54A', WET: '#0072C6', UNKNOWN: '#666666',
};

const URGENCY: Record<string, { color: string; label: string }> = {
  now:   { color: '#FF4444', label: 'PIT NOW' },
  soon:  { color: '#FFC906', label: 'PIT SOON' },
  watch: { color: '#27F4D2', label: 'WATCH' },
  ok:    { color: '#00FF87', label: 'STABLE' },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseWeather(summary: string | null): { airTemp: number; trackTemp: number } {
  let airTemp = 25, trackTemp = 38;
  if (summary) {
    const a = summary.match(/(\d+)°C\s+AIR/i);
    const t = summary.match(/(\d+)°C\s+TRACK/i);
    if (a) airTemp = parseInt(a[1]);
    if (t) trackTemp = parseInt(t[1]);
  }
  return { airTemp, trackTemp };
}

function toCircuitId(name: string): string {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

/** Compute fuel-corrected actual degradation for a stint's laps. */
function computeActualDeg(
  laps: LapData[],
  stintNum: number,
): { tyre_age: number; actual_delta: number }[] {
  const stintLaps = laps.filter(l => l.stint === stintNum);
  const clean = stintLaps.filter(
    l => l.lap_time !== null && !l.is_pit_out_lap && l.tyre_life !== null,
  );
  if (clean.length < 2) return [];

  // Base: fuel-corrected time at first clean lap
  const base = clean[0];
  const baseFC = base.lap_time! + (base.lap_number - 1) * FUEL_BURN;

  return clean.map(l => ({
    tyre_age: l.tyre_life!,
    actual_delta: Math.max(0, (l.lap_time! + (l.lap_number - 1) * FUEL_BURN) - baseFC),
  }));
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PitLoss { green: number; sc: number; vsc: number }

interface ChartPoint {
  tyre_age: number;
  predicted_delta: number | null;
  ci_upper: number | null;
  actual_delta: number | null;
}

interface PitSenseProps {
  sessionMeta?: SessionMetadata | null;
  onGoToSimulator?: (driver: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PitSense: React.FC<PitSenseProps> = ({ sessionMeta, onGoToSimulator }) => {
  const [strategy, setStrategy] = useState<DriverStrategy[]>([]);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);
  const [selectedStintNum, setSelectedStintNum] = useState<number | null>(null);
  const [allLaps, setAllLaps] = useState<LapData[]>([]);
  const [curve, setCurve] = useState<DegradationResponse | null>(null);
  const [winGreen, setWinGreen] = useState<PitWindowResponse | null>(null);
  const [winSC, setWinSC]     = useState<PitWindowResponse | null>(null);
  const [winVSC, setWinVSC]   = useState<PitWindowResponse | null>(null);
  const [pitLoss, setPitLoss] = useState<PitLoss>({ green: 22, sc: 16, vsc: 19 });
  const [loadingStrategy, setLoadingStrategy] = useState(false);
  const [loadingLaps, setLoadingLaps]         = useState(false);
  const [loadingPred, setLoadingPred]         = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [circuitId, setCircuitId] = useState<string>(
    sessionMeta?.circuit_name ? toCircuitId(sessionMeta.circuit_name) : ''
  );
  const [availableCircuits, setAvailableCircuits] = useState<Array<{ id: string; name: string }>>([]);
  const { airTemp, trackTemp } = parseWeather(sessionMeta?.weather_summary ?? null);

  // ── Reset + fetch strategy when session changes ──────────────────────────
  useEffect(() => {
    setStrategy([]); setSelectedDriver(null); setSelectedStintNum(null);
    setAllLaps([]); setCurve(null);
    setWinGreen(null); setWinSC(null); setWinVSC(null); setError(null);
    if (!sessionMeta) return;

    setLoadingStrategy(true);
    api.getStrategy(sessionMeta.year, sessionMeta.gp_name, sessionMeta.session_type)
      .then(r => setStrategy(r.drivers))
      .catch(() => setStrategy([]))
      .finally(() => setLoadingStrategy(false));

    if (circuitId) {
      api.pitLoss(circuitId)
        .then(d => setPitLoss({ green: d.green, sc: d.sc, vsc: d.vsc }))
        .catch(() => {/* use defaults */});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionMeta?.session_key]);

  // ── Sync circuitId when session changes ──────────────────────────────────
  useEffect(() => {
    if (sessionMeta?.circuit_name) {
      setCircuitId(toCircuitId(sessionMeta.circuit_name));
    }
  }, [sessionMeta?.session_key]);

  // ── Fetch all circuits in the season ─────────────────────────────────────
  useEffect(() => {
    if (!sessionMeta) return;
    fetch(`/api/v1/sessions/${sessionMeta.year}`)
      .then(r => r.json())
      .then(data => {
        const gps = data.grands_prix || data.events || data;
        if (Array.isArray(gps)) {
          const circuits = gps
            .map((gp: any) => ({
              id: toCircuitId(gp.location || gp.circuit || gp.name || ''),
              name: gp.location || gp.circuit || gp.name || gp.event_name || '',
            }))
            .filter((c: any) => c.id && c.name);
          setAvailableCircuits(circuits);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionMeta?.year]);

  // ── Fetch laps when driver changes ───────────────────────────────────────
  useEffect(() => {
    if (!selectedDriver || !sessionMeta) return;
    setAllLaps([]); setSelectedStintNum(null);
    setCurve(null); setWinGreen(null); setWinSC(null); setWinVSC(null);
    setLoadingLaps(true);
    api.getDriverLaps(sessionMeta.year, sessionMeta.gp_name, sessionMeta.session_type, selectedDriver)
      .then(r => setAllLaps(r.laps))
      .catch(() => setAllLaps([]))
      .finally(() => setLoadingLaps(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDriver, sessionMeta?.session_key]);

  // ── Run prediction when stint selected ───────────────────────────────────
  useEffect(() => {
    if (selectedStintNum === null || !selectedDriver || !sessionMeta) return;
    const drvStrat = strategy.find(d => d.driver_code === selectedDriver);
    const stint = drvStrat?.stints.find(s => s.stint_number === selectedStintNum);
    if (!stint) return;

    const compound = stint.compound as TyreCompound;
    const maxLaps = Math.min(stint.tyre_life + 10, 60);
    const baseReq = { compound, circuit_id: circuitId, track_temp: trackTemp, air_temp: airTemp };

    setLoadingPred(true); setCurve(null);
    setWinGreen(null); setWinSC(null); setWinVSC(null); setError(null);

    Promise.all([
      api.pitSenseCurve({ ...baseReq, max_laps: maxLaps }),
      api.pitSenseWindow({ ...baseReq, current_tyre_age: 1, gap_ahead: null, gap_behind: null, pit_loss_time: pitLoss.green }),
      api.pitSenseWindow({ ...baseReq, current_tyre_age: 1, gap_ahead: null, gap_behind: null, pit_loss_time: pitLoss.sc }),
      api.pitSenseWindow({ ...baseReq, current_tyre_age: 1, gap_ahead: null, gap_behind: null, pit_loss_time: pitLoss.vsc }),
    ])
      .then(([c, wG, wS, wV]) => { setCurve(c); setWinGreen(wG); setWinSC(wS); setWinVSC(wV); })
      .catch(e => setError(e?.message ?? 'Prediction failed'))
      .finally(() => setLoadingPred(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStintNum, selectedDriver, sessionMeta?.session_key, circuitId]);

  // ── Derived data ─────────────────────────────────────────────────────────
  const drvStrat = strategy.find(d => d.driver_code === selectedDriver) ?? null;
  const selectedStint = drvStrat?.stints.find(s => s.stint_number === selectedStintNum) ?? null;
  const compoundColor = selectedStint ? (COMPOUND_COLORS[selectedStint.compound] ?? TEAL) : TEAL;

  const actualDeg = selectedStintNum !== null ? computeActualDeg(allLaps, selectedStintNum) : [];

  // Merge predicted + actual into unified chart array
  const chartData: ChartPoint[] = (() => {
    const tMax = Math.max(
      curve?.degradation_curve.length ?? 0,
      actualDeg.length > 0 ? Math.max(...actualDeg.map(d => d.tyre_age)) : 0,
    );
    if (tMax === 0) return [];
    return Array.from({ length: tMax }, (_, i) => {
      const age = i + 1;
      const pred = curve?.degradation_curve.find(p => p.tyre_age === age);
      const actual = actualDeg.find(d => d.tyre_age === age);
      return {
        tyre_age: age,
        predicted_delta: pred?.predicted_delta ?? null,
        ci_upper: pred?.ci_upper ?? null,
        actual_delta: actual?.actual_delta ?? null,
      };
    });
  })();

  // ── Render ────────────────────────────────────────────────────────────────
  if (!sessionMeta) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
        <PitSenseBadge />
        <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#555', letterSpacing: '0.08em' }}>
          NO SESSION LOADED
        </div>
        <div style={{ fontSize: 10, color: '#444', textAlign: 'center', maxWidth: 280 }}>
          Load a session in the sidebar to analyse tyre strategy.
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--color-bg)', padding: '16px 20px' }}>
      {/* Pre-2022 accuracy warning */}
      {sessionMeta.year < 2022 && (
        <div style={{
          padding: '8px 12px', borderRadius: 6, marginBottom: 12,
          background: 'rgba(255,201,6,0.08)', border: '1px solid rgba(255,201,6,0.2)',
          fontSize: 10, color: '#FFC906', fontFamily: 'JetBrains Mono',
        }}>
          Predictions may be less accurate for pre-2022 races — model trained on 2022–2025 data.
        </div>
      )}
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <PitSenseBadge />
        <span style={{ fontSize: 11, color: '#555' }}>
          {sessionMeta.gp_name} {sessionMeta.year} · {sessionMeta.session_type}
        </span>
        {sessionMeta.weather_summary && (
          <span style={{ marginLeft: 'auto', fontSize: 10, color: '#444', fontFamily: 'JetBrains Mono' }}>
            {trackTemp}°C TRK · {airTemp}°C AIR
          </span>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 14, alignItems: 'start' }}>

        {/* ── Left: driver + stint picker ───────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Driver chips */}
          <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 9, color: TEAL, fontFamily: 'JetBrains Mono', letterSpacing: '0.12em', marginBottom: 10 }}>
              SELECT DRIVER
            </div>
            {loadingStrategy ? (
              <div style={{ fontSize: 10, color: '#444', fontFamily: 'JetBrains Mono' }}>LOADING…</div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {Object.entries(sessionMeta.drivers).map(([code, info]) => {
                  const isSelected = selectedDriver === code;
                  const color = info.team_color ? `#${info.team_color.replace('#', '')}` : '#888';
                  return (
                    <button
                      key={code}
                      onClick={() => setSelectedDriver(isSelected ? null : code)}
                      style={{
                        padding: '4px 10px', borderRadius: 4, cursor: 'pointer',
                        fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700,
                        transition: 'all 0.12s',
                        background: isSelected ? `${color}22` : 'transparent',
                        border: `1px solid ${isSelected ? color : '#333'}`,
                        color: isSelected ? color : '#666',
                      }}
                    >
                      {code}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Stint selector */}
          {selectedDriver && (
            <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8, padding: 12 }}>
              <div style={{ fontSize: 9, color: TEAL, fontFamily: 'JetBrains Mono', letterSpacing: '0.12em', marginBottom: 10 }}>
                SELECT STINT
              </div>
              {loadingLaps ? (
                <div style={{ fontSize: 10, color: '#444', fontFamily: 'JetBrains Mono' }}>LOADING LAPS…</div>
              ) : drvStrat ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {drvStrat.stints.map(stint => {
                    const isActive = selectedStintNum === stint.stint_number;
                    const color = COMPOUND_COLORS[stint.compound] ?? '#666';
                    return (
                      <button
                        key={stint.stint_number}
                        onClick={() => setSelectedStintNum(isActive ? null : stint.stint_number)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '7px 10px', borderRadius: 5, cursor: 'pointer',
                          textAlign: 'left', width: '100%', transition: 'all 0.12s',
                          background: isActive ? `${color}18` : 'transparent',
                          border: `1px solid ${isActive ? color : '#2A2A2A'}`,
                        }}
                      >
                        <div style={{ width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, color: isActive ? color : '#888' }}>
                            {stint.compound} · S{stint.stint_number}
                          </div>
                          <div style={{ fontSize: 9, color: '#555', marginTop: 1 }}>
                            L{stint.start_lap}–{stint.end_lap} · {stint.tyre_life} laps{!stint.fresh ? ' · used' : ''}
                          </div>
                        </div>
                        {stint.avg_pace && (
                          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 9, color: '#555' }}>
                            {stint.avg_pace.toFixed(3)}s
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div style={{ fontSize: 10, color: '#444' }}>No strategy data</div>
              )}
            </div>
          )}

          {/* Circuit selector + pit loss */}
          <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8, padding: 12 }}>
            <div style={{ fontSize: 9, color: TEAL, fontFamily: 'JetBrains Mono', letterSpacing: '0.12em', marginBottom: 8 }}>
              CIRCUIT
            </div>
            <select
              value={circuitId}
              onChange={e => setCircuitId(e.target.value)}
              style={{
                width: '100%', padding: '5px 7px', fontSize: 10,
                background: '#111', color: '#F0F0F0',
                border: '1px solid #2A2A2A', borderRadius: 4,
                outline: 'none', cursor: 'pointer', marginBottom: 10,
                fontFamily: 'JetBrains Mono',
              }}
            >
              {sessionMeta?.circuit_name && (
                <option value={toCircuitId(sessionMeta.circuit_name)}>
                  {sessionMeta.circuit_name} (current)
                </option>
              )}
              {availableCircuits
                .filter(c => c.id !== toCircuitId(sessionMeta?.circuit_name || ''))
                .map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
            </select>
            <div style={{ fontSize: 9, color: TEAL, fontFamily: 'JetBrains Mono', letterSpacing: '0.12em', marginBottom: 6 }}>
              PIT LOSS
            </div>
            {[
              { label: 'GREEN FLAG', value: pitLoss.green, color: '#00FF87' },
              { label: 'SAFETY CAR', value: pitLoss.sc, color: '#FFC906' },
              { label: 'VSC', value: pitLoss.vsc, color: TEAL },
            ].map(({ label, value, color }) => (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono' }}>{label}</span>
                <span style={{ fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700, color }}>{value.toFixed(1)}s</span>
              </div>
            ))}
          </div>

          {/* Test in Simulator CTA */}
          {onGoToSimulator && selectedDriver && (
            <button
              onClick={() => onGoToSimulator(selectedDriver)}
              style={{
                padding: '10px 0', borderRadius: 6, fontSize: 10,
                fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.08em',
                cursor: 'pointer', transition: 'all 0.15s',
                background: 'rgba(225,6,0,0.12)', border: '1px solid rgba(225,6,0,0.4)',
                color: '#E10600',
              }}
            >
              TEST IN SIMULATOR →
            </button>
          )}
        </div>

        {/* ── Right: chart + pit window scenarios ───────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!selectedStint ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: 320, gap: 10, background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8,
            }}>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: '#333', letterSpacing: '0.08em' }}>
                {selectedDriver ? 'SELECT A STINT' : 'SELECT A DRIVER'}
              </div>
              <div style={{ fontSize: 10, color: '#2A2A2A', maxWidth: 220, textAlign: 'center' }}>
                {selectedDriver
                  ? 'Click a stint on the left to see degradation analysis'
                  : 'Choose a driver from the list to view their stints'}
              </div>
            </div>
          ) : (
            <>
              {/* Chart */}
              <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 8, padding: '14px 16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: compoundColor }} />
                  <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: compoundColor, fontWeight: 700 }}>
                    {selectedStint.compound}
                  </span>
                  <span style={{ fontSize: 10, color: '#555' }}>
                    Stint {selectedStint.stint_number} · L{selectedStint.start_lap}–{selectedStint.end_lap}
                  </span>
                  {loadingPred && (
                    <span style={{ marginLeft: 'auto', fontSize: 9, color: TEAL, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em' }}>
                      COMPUTING…
                    </span>
                  )}
                  <div style={{ marginLeft: loadingPred ? 0 : 'auto', display: 'flex', gap: 12, alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 16, height: 2, background: compoundColor }} />
                      <span style={{ fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono' }}>PREDICTED</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFFFFF', border: '1px solid #666' }} />
                      <span style={{ fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono' }}>ACTUAL</span>
                    </div>
                  </div>
                </div>

                {error ? (
                  <div style={{ padding: '8px 12px', borderRadius: 4, fontSize: 10, background: 'rgba(225,6,0,0.1)', border: '1px solid rgba(225,6,0,0.3)', color: '#E10600', fontFamily: 'JetBrains Mono' }}>
                    {error}
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart data={chartData} margin={{ top: 4, right: 16, bottom: 4, left: 0 }}>
                      <defs>
                        <linearGradient id="ciGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor={compoundColor} stopOpacity={0.18} />
                          <stop offset="95%" stopColor={compoundColor} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1E1E1E" />
                      <XAxis
                        dataKey="tyre_age"
                        tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: '#444' }}
                        label={{ value: 'Tyre Age (laps)', position: 'insideBottom', offset: -2, fontSize: 9, fill: '#444' }}
                      />
                      <YAxis
                        tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: '#444' }}
                        tickFormatter={v => `+${(v as number).toFixed(1)}s`}
                        label={{ value: 'Time Loss (s)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 9, fill: '#444' }}
                      />
                      <Tooltip
                        contentStyle={{ background: '#1E1E1E', border: '1px solid #2A2A2A', borderRadius: 4, fontSize: 10, fontFamily: 'JetBrains Mono', color: '#CCC' }}
                        formatter={(value, name) => {
                          const v = typeof value === 'number' ? value : 0;
                          if (name === 'predicted_delta') return [`+${v.toFixed(3)}s`, 'Predicted Δ'];
                          if (name === 'actual_delta')    return [`+${v.toFixed(3)}s`, 'Actual Δ'];
                          return [`${v}`, String(name)];
                        }}
                        labelFormatter={v => `Tyre Age: ${v} laps`}
                      />
                      <Area dataKey="ci_upper" stroke="none" fill="url(#ciGrad)" legendType="none" isAnimationActive={false} connectNulls />
                      <Line
                        dataKey="predicted_delta"
                        stroke={compoundColor}
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 3 }}
                        connectNulls
                        isAnimationActive={false}
                      />
                      <Line
                        dataKey="actual_delta"
                        stroke="none"
                        dot={{ r: 3, fill: '#FFFFFF', stroke: '#666', strokeWidth: 1 }}
                        activeDot={{ r: 4, fill: '#FFFFFF' }}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                      {curve?.cliff_lap && (
                        <ReferenceLine
                          x={curve.cliff_lap}
                          stroke="#FF4444"
                          strokeDasharray="4 3"
                          strokeWidth={1.5}
                          label={{ value: 'CLIFF', position: 'top', fontSize: 9, fill: '#FF4444', fontFamily: 'JetBrains Mono' }}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>

              {/* Pit window scenarios */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                {[
                  { label: 'GREEN FLAG', loss: pitLoss.green, win: winGreen, color: '#00FF87' },
                  { label: 'SAFETY CAR', loss: pitLoss.sc,    win: winSC,    color: '#FFC906' },
                  { label: 'VSC',        loss: pitLoss.vsc,   win: winVSC,   color: TEAL },
                ].map(({ label, loss, win, color }) => (
                  <ScenarioCard key={label} label={label} pitLoss={loss} window={win} color={color} loading={loadingPred} />
                ))}
              </div>

              {/* Stats row */}
              {curve && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                  <MiniStat label="PEAK LOSS" value={`+${Math.max(...curve.degradation_curve.map(p => p.predicted_delta)).toFixed(2)}s`} color={compoundColor} />
                  <MiniStat label="CLIFF LAP" value={curve.cliff_lap ? `LAP ${curve.cliff_lap}` : 'NONE'} color={curve.cliff_lap ? '#FF4444' : '#444'} />
                  <MiniStat label="ACTUAL PTS" value={actualDeg.length > 0 ? `${actualDeg.length} laps` : 'NO DATA'} color={actualDeg.length > 0 ? '#FFFFFF' : '#444'} />
                </div>
              )}

              <div style={{ fontSize: 9, color: '#333', fontFamily: 'JetBrains Mono', padding: '5px 8px', background: '#111', borderRadius: 4, border: '1px solid #1E1E1E' }}>
                GradientBoosting model · 2022–2024 training data · Predictions are estimates based on historical patterns.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const PitSenseBadge: React.FC = () => (
  <div style={{
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '3px 10px', borderRadius: 5,
    background: `${TEAL}15`, border: `1px solid ${TEAL}44`,
  }}>
    <div style={{ width: 5, height: 5, borderRadius: '50%', background: TEAL }} />
    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: TEAL }}>
      PITSENSE™
    </span>
  </div>
);

interface ScenarioCardProps {
  label: string;
  pitLoss: number;
  window: PitWindowResponse | null;
  color: string;
  loading: boolean;
}

const ScenarioCard: React.FC<ScenarioCardProps> = ({ label, pitLoss, window, color, loading }) => {
  const urgency = window ? URGENCY[window.urgency] : null;
  return (
    <div style={{
      background: '#1A1A1A', border: `1px solid ${window ? color + '44' : '#2A2A2A'}`,
      borderTop: `2px solid ${window ? color : '#2A2A2A'}`,
      borderRadius: 8, padding: '10px 12px',
    }}>
      <div style={{ fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em', marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 9, color: '#444', marginBottom: 6 }}>
        Pit loss: <span style={{ color: color, fontFamily: 'JetBrains Mono', fontWeight: 700 }}>{pitLoss.toFixed(1)}s</span>
      </div>
      {loading && <div style={{ fontSize: 10, color: '#333', fontFamily: 'JetBrains Mono' }}>…</div>}
      {!loading && urgency && window && (
        <>
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 12, fontWeight: 700, color: urgency.color, marginBottom: 3 }}>
            {urgency.label}
          </div>
          <div style={{ fontSize: 9, color: '#555' }}>
            L{window.recommended_window_start}–{window.recommended_window_end}
          </div>
          <div style={{ fontSize: 9, color: '#444', marginTop: 4, lineHeight: 1.4 }}>
            {window.explanation}
          </div>
          {window.positions_lost != null && window.positions_lost > 0 && (
            <div style={{ fontSize: 9, color, marginTop: 4, fontFamily: 'JetBrains Mono', fontWeight: 700 }}>
              ~{window.positions_lost} position{window.positions_lost > 1 ? 's' : ''} lost during stop
            </div>
          )}
        </>
      )}
      {!loading && !window && (
        <div style={{ fontSize: 10, color: '#2A2A2A', fontFamily: 'JetBrains Mono' }}>SELECT STINT</div>
      )}
    </div>
  );
};

interface MiniStatProps { label: string; value: string; color: string }
const MiniStat: React.FC<MiniStatProps> = ({ label, value, color }) => (
  <div style={{ background: '#1A1A1A', border: '1px solid #2A2A2A', borderRadius: 6, padding: '8px 12px' }}>
    <div style={{ fontSize: 9, color: '#444', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em', marginBottom: 3 }}>{label}</div>
    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 14, fontWeight: 700, color }}>{value}</div>
  </div>
);

export default PitSense;
