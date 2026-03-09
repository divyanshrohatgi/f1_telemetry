/**
 * PitSense™ — AI Pit Strategy Engine
 * Predicts tyre degradation curves and optimal pit windows using ML.
 */

import React, { useState } from 'react';
import {
  XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Area, AreaChart,
} from 'recharts';
import { api } from '../../api/client';
import type { DegradationRequest, DegradationResponse, PitWindowRequest, PitWindowResponse, TyreCompound } from '../../types/f1.types';
import { useTheme } from '../../context/ThemeContext';

const PITSENSE_TEAL = '#27F4D2';

const COMPOUNDS: TyreCompound[] = ['SOFT', 'MEDIUM', 'HARD', 'INTER', 'WET'];

const COMPOUND_COLORS: Record<TyreCompound, string> = {
  SOFT: '#FF3333',
  MEDIUM: '#FFC906',
  HARD: '#CCCCCC',
  INTER: '#39B54A',
  WET: '#0072C6',
  UNKNOWN: '#666666',
};

const URGENCY_CONFIG = {
  now:   { color: '#FF4444', label: 'PIT NOW', bg: 'rgba(255,68,68,0.12)' },
  soon:  { color: '#FFC906', label: 'PIT SOON', bg: 'rgba(255,201,6,0.12)' },
  watch: { color: '#27F4D2', label: 'WATCH', bg: 'rgba(39,244,210,0.10)' },
  ok:    { color: '#00FF87', label: 'STABLE', bg: 'rgba(0,255,135,0.10)' },
};

const PitSense: React.FC = () => {
  const { isDark } = useTheme();

  const [form, setForm] = useState<DegradationRequest>({
    compound: 'MEDIUM',
    circuit_id: 'monza',
    track_temp: 40,
    air_temp: 28,
    max_laps: 40,
  });

  const [pitForm, setPitForm] = useState<Omit<PitWindowRequest, 'compound' | 'circuit_id' | 'track_temp' | 'air_temp'>>({
    current_tyre_age: 15,
    gap_ahead: null,
    gap_behind: null,
    pit_loss_time: 23,
  });

  const [curve, setCurve] = useState<DegradationResponse | null>(null);
  const [window, setWindow] = useState<PitWindowResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const runPrediction = async () => {
    setLoading(true);
    setError(null);
    try {
      const [curveData, windowData] = await Promise.all([
        api.pitSenseCurve(form),
        api.pitSenseWindow({
          ...form,
          current_tyre_age: pitForm.current_tyre_age,
          gap_ahead: pitForm.gap_ahead,
          gap_behind: pitForm.gap_behind,
          pit_loss_time: pitForm.pit_loss_time,
        }),
      ]);
      setCurve(curveData);
      setWindow(windowData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Prediction failed');
    } finally {
      setLoading(false);
    }
  };

  const compoundColor = COMPOUND_COLORS[form.compound];
  const urgency = window ? URGENCY_CONFIG[window.urgency] : null;

  const panelBg = isDark ? '#1A1A1A' : '#FFFFFF';
  const borderColor = isDark ? '#2A2A2A' : '#E5E5E5';
  const inputBg = isDark ? '#111' : '#F5F5F5';
  const labelColor = isDark ? '#666' : '#999';
  const textPrimary = isDark ? '#F0F0F0' : '#111';
  const textSecondary = isDark ? '#888' : '#555';

  return (
    <div
      className="h-full overflow-y-auto"
      style={{ background: 'var(--color-bg)', padding: '20px 24px' }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-5">
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '4px 12px', borderRadius: 6,
          background: `${PITSENSE_TEAL}18`,
          border: `1px solid ${PITSENSE_TEAL}44`,
        }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: PITSENSE_TEAL }} />
          <span style={{
            fontFamily: 'JetBrains Mono', fontSize: 11, fontWeight: 700,
            letterSpacing: '0.12em', color: PITSENSE_TEAL,
          }}>
            PITSENSE™
          </span>
        </div>
        <span style={{ color: textSecondary, fontSize: 11 }}>
          AI Pit Strategy Engine — Tyre Degradation &amp; Window Predictor
        </span>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 16, alignItems: 'start' }}>

        {/* ── Input Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Compound selector */}
          <div style={{ background: panelBg, border: `1px solid ${borderColor}`, borderRadius: 6, padding: 14 }}>
            <div className="label" style={{ marginBottom: 10, color: PITSENSE_TEAL, letterSpacing: '0.1em' }}>
              TYRE COMPOUND
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {COMPOUNDS.map((c) => (
                <button
                  key={c}
                  onClick={() => setForm((f) => ({ ...f, compound: c }))}
                  style={{
                    padding: '4px 10px', borderRadius: 4, fontSize: 10,
                    fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.06em',
                    cursor: 'pointer', transition: 'all 0.12s',
                    border: `1px solid ${form.compound === c ? COMPOUND_COLORS[c] : borderColor}`,
                    background: form.compound === c ? `${COMPOUND_COLORS[c]}22` : 'transparent',
                    color: form.compound === c ? COMPOUND_COLORS[c] : textSecondary,
                  }}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Circuit & conditions */}
          <div style={{ background: panelBg, border: `1px solid ${borderColor}`, borderRadius: 6, padding: 14 }}>
            <div className="label" style={{ marginBottom: 10, color: PITSENSE_TEAL, letterSpacing: '0.1em' }}>
              CONDITIONS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <FormField label="Circuit" value={form.circuit_id}
                onChange={(v) => setForm((f) => ({ ...f, circuit_id: v }))}
                type="text" labelColor={labelColor} inputBg={inputBg} borderColor={borderColor} textPrimary={textPrimary} />
              <FormField label="Track temp (°C)" value={form.track_temp}
                onChange={(v) => setForm((f) => ({ ...f, track_temp: +v }))}
                type="number" min={15} max={65}
                labelColor={labelColor} inputBg={inputBg} borderColor={borderColor} textPrimary={textPrimary} />
              <FormField label="Air temp (°C)" value={form.air_temp}
                onChange={(v) => setForm((f) => ({ ...f, air_temp: +v }))}
                type="number" min={5} max={45}
                labelColor={labelColor} inputBg={inputBg} borderColor={borderColor} textPrimary={textPrimary} />
              <FormField label="Max laps" value={form.max_laps}
                onChange={(v) => setForm((f) => ({ ...f, max_laps: +v }))}
                type="number" min={10} max={70}
                labelColor={labelColor} inputBg={inputBg} borderColor={borderColor} textPrimary={textPrimary} />
            </div>
          </div>

          {/* Pit window inputs */}
          <div style={{ background: panelBg, border: `1px solid ${borderColor}`, borderRadius: 6, padding: 14 }}>
            <div className="label" style={{ marginBottom: 10, color: PITSENSE_TEAL, letterSpacing: '0.1em' }}>
              PIT WINDOW INPUTS
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <FormField label="Current tyre age (laps)" value={pitForm.current_tyre_age}
                onChange={(v) => setPitForm((f) => ({ ...f, current_tyre_age: +v }))}
                type="number" min={0} max={70}
                labelColor={labelColor} inputBg={inputBg} borderColor={borderColor} textPrimary={textPrimary} />
              <FormField label="Gap ahead (s)" value={pitForm.gap_ahead ?? ''}
                onChange={(v) => setPitForm((f) => ({ ...f, gap_ahead: v === '' ? null : +v }))}
                type="number" placeholder="optional"
                labelColor={labelColor} inputBg={inputBg} borderColor={borderColor} textPrimary={textPrimary} />
              <FormField label="Gap behind (s)" value={pitForm.gap_behind ?? ''}
                onChange={(v) => setPitForm((f) => ({ ...f, gap_behind: v === '' ? null : +v }))}
                type="number" placeholder="optional"
                labelColor={labelColor} inputBg={inputBg} borderColor={borderColor} textPrimary={textPrimary} />
              <FormField label="Pit stop time loss (s)" value={pitForm.pit_loss_time}
                onChange={(v) => setPitForm((f) => ({ ...f, pit_loss_time: +v }))}
                type="number" min={15} max={40}
                labelColor={labelColor} inputBg={inputBg} borderColor={borderColor} textPrimary={textPrimary} />
            </div>
          </div>

          {/* Run button */}
          <button
            onClick={runPrediction}
            disabled={loading}
            style={{
              padding: '10px 0', borderRadius: 6, fontSize: 11,
              fontFamily: 'JetBrains Mono', fontWeight: 700, letterSpacing: '0.1em',
              cursor: loading ? 'wait' : 'pointer',
              background: loading ? `${PITSENSE_TEAL}30` : `${PITSENSE_TEAL}22`,
              border: `1px solid ${PITSENSE_TEAL}${loading ? '44' : '88'}`,
              color: loading ? `${PITSENSE_TEAL}88` : PITSENSE_TEAL,
              transition: 'all 0.15s',
            }}
          >
            {loading ? 'COMPUTING…' : '⚡ RUN PITSENSE™'}
          </button>

          {error && (
            <div style={{
              padding: '8px 12px', borderRadius: 4, fontSize: 10,
              background: 'rgba(225,6,0,0.1)', border: '1px solid rgba(225,6,0,0.3)',
              color: '#E10600', fontFamily: 'JetBrains Mono',
            }}>
              {error}
            </div>
          )}
        </div>

        {/* ── Output Panel ── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {!curve ? (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              minHeight: 300, gap: 12,
              background: panelBg, border: `1px solid ${borderColor}`, borderRadius: 6,
            }}>
              <div style={{ fontSize: 32 }}>🏎️</div>
              <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: PITSENSE_TEAL, letterSpacing: '0.08em' }}>
                CONFIGURE &amp; RUN TO SEE PREDICTIONS
              </div>
              <div style={{ fontSize: 10, color: textSecondary, maxWidth: 280, textAlign: 'center' }}>
                Select a tyre compound, enter track conditions, and click RUN PITSENSE™
              </div>
            </div>
          ) : (
            <>
              {/* Pit window recommendation card */}
              {window && urgency && (
                <div style={{
                  background: urgency.bg,
                  border: `1px solid ${urgency.color}44`,
                  borderLeft: `3px solid ${urgency.color}`,
                  borderRadius: 6, padding: '12px 16px',
                  display: 'flex', alignItems: 'center', gap: 16,
                }}>
                  <div>
                    <div style={{
                      fontFamily: 'JetBrains Mono', fontSize: 13, fontWeight: 700,
                      color: urgency.color, letterSpacing: '0.08em',
                    }}>
                      {urgency.label}
                    </div>
                    <div style={{ fontSize: 10, color: textSecondary, marginTop: 2 }}>
                      Window: Lap {window.recommended_window_start}–{window.recommended_window_end}
                    </div>
                  </div>
                  <div style={{ flex: 1, fontSize: 11, color: textPrimary }}>
                    {window.explanation}
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11, color: textSecondary }}>
                      DEG LOSS
                    </div>
                    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 16, color: urgency.color, fontWeight: 700 }}>
                      +{window.cumulative_loss_at_window.toFixed(2)}s
                    </div>
                  </div>
                </div>
              )}

              {/* Degradation curve chart */}
              <div style={{ background: panelBg, border: `1px solid ${borderColor}`, borderRadius: 6, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '2px 8px', borderRadius: 4,
                    background: `${compoundColor}18`,
                    border: `1px solid ${compoundColor}44`,
                  }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: compoundColor }} />
                    <span style={{ fontFamily: 'JetBrains Mono', fontSize: 10, color: compoundColor, fontWeight: 700 }}>
                      {curve.compound}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: textSecondary }}>
                    Tyre degradation curve — {form.circuit_id} / {form.track_temp}°C
                  </span>
                  {curve.cliff_lap && (
                    <span style={{
                      marginLeft: 'auto', fontSize: 10, fontFamily: 'JetBrains Mono',
                      color: '#FF4444', background: 'rgba(255,68,68,0.1)',
                      padding: '2px 8px', borderRadius: 4, border: '1px solid rgba(255,68,68,0.3)',
                    }}>
                      CLIFF: LAP {curve.cliff_lap}
                    </span>
                  )}
                </div>

                <ResponsiveContainer width="100%" height={240}>
                  <AreaChart data={curve.degradation_curve} margin={{ top: 4, right: 16, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="degGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={compoundColor} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={compoundColor} stopOpacity={0.02} />
                      </linearGradient>
                      <linearGradient id="ciGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={compoundColor} stopOpacity={0.12} />
                        <stop offset="95%" stopColor={compoundColor} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#1E1E1E' : '#EBEBEB'} />
                    <XAxis
                      dataKey="tyre_age"
                      tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: isDark ? '#555' : '#999' }}
                      label={{ value: 'Tyre Age (laps)', position: 'insideBottom', offset: -2, fontSize: 9, fill: isDark ? '#555' : '#999' }}
                    />
                    <YAxis
                      tick={{ fontFamily: 'JetBrains Mono', fontSize: 9, fill: isDark ? '#555' : '#999' }}
                      tickFormatter={(v) => `+${v.toFixed(1)}s`}
                      label={{ value: 'Time Loss (s)', angle: -90, position: 'insideLeft', offset: 10, fontSize: 9, fill: isDark ? '#555' : '#999' }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: isDark ? '#1E1E1E' : '#FAFAFA',
                        border: `1px solid ${borderColor}`,
                        borderRadius: 4, fontSize: 10, fontFamily: 'JetBrains Mono',
                        color: textPrimary,
                      }}
                      formatter={(value, name) => {
                        const v = typeof value === 'number' ? value : 0;
                        if (name === 'predicted_delta') return [`+${v.toFixed(3)}s`, 'Δ Time'];
                        if (name === 'ci_upper') return [`+${v.toFixed(3)}s`, '95% CI Upper'];
                        if (name === 'ci_lower') return [`+${v.toFixed(3)}s`, '95% CI Lower'];
                        return [`${v}`, String(name)];
                      }}
                      labelFormatter={(v) => `Lap ${v}`}
                    />
                    {/* CI band */}
                    <Area dataKey="ci_upper" stroke="none" fill="url(#ciGradient)" />
                    {/* Main curve */}
                    <Area
                      dataKey="predicted_delta"
                      stroke={compoundColor}
                      strokeWidth={2}
                      fill="url(#degGradient)"
                      dot={false}
                      activeDot={{ r: 3, fill: compoundColor }}
                    />
                    {/* Cliff reference */}
                    {curve.cliff_lap && (
                      <ReferenceLine
                        x={curve.cliff_lap}
                        stroke="#FF4444"
                        strokeDasharray="4 3"
                        strokeWidth={1.5}
                        label={{ value: 'CLIFF', position: 'top', fontSize: 9, fill: '#FF4444', fontFamily: 'JetBrains Mono' }}
                      />
                    )}
                    {/* Current tyre age marker */}
                    {pitForm.current_tyre_age > 0 && (
                      <ReferenceLine
                        x={pitForm.current_tyre_age}
                        stroke={PITSENSE_TEAL}
                        strokeDasharray="3 3"
                        strokeWidth={1.5}
                        label={{ value: 'NOW', position: 'top', fontSize: 9, fill: PITSENSE_TEAL, fontFamily: 'JetBrains Mono' }}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Stats row */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
                <StatCard
                  label="PEAK LOSS" isDark={isDark}
                  value={`+${Math.max(...curve.degradation_curve.map((p) => p.predicted_delta)).toFixed(3)}s`}
                  color={compoundColor} panelBg={panelBg} borderColor={borderColor} textSecondary={textSecondary}
                />
                <StatCard
                  label="CLIFF LAP" isDark={isDark}
                  value={curve.cliff_lap ? `LAP ${curve.cliff_lap}` : 'NONE'}
                  color={curve.cliff_lap ? '#FF4444' : '#555'} panelBg={panelBg} borderColor={borderColor} textSecondary={textSecondary}
                />
                <StatCard
                  label="WINDOW" isDark={isDark}
                  value={window ? `L${window.recommended_window_start}–${window.recommended_window_end}` : '—'}
                  color={urgency?.color ?? '#555'} panelBg={panelBg} borderColor={borderColor} textSecondary={textSecondary}
                />
              </div>

              <div style={{
                fontSize: 9, color: labelColor, fontFamily: 'JetBrains Mono',
                padding: '6px 10px', background: isDark ? '#111' : '#F5F5F5',
                borderRadius: 4, border: `1px solid ${borderColor}`,
              }}>
                Model: GradientBoostingRegressor — trained on 2022–2024 race data. Predictions are estimates based on historical patterns and may not reflect current conditions.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

interface FormFieldProps {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type: string;
  min?: number;
  max?: number;
  placeholder?: string;
  labelColor: string;
  inputBg: string;
  borderColor: string;
  textPrimary: string;
}

const FormField: React.FC<FormFieldProps> = ({
  label, value, onChange, type, min, max, placeholder,
  labelColor, inputBg, borderColor, textPrimary,
}) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
    <span style={{ fontSize: 9, color: labelColor, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
      {label}
    </span>
    <input
      type={type}
      value={value}
      min={min}
      max={max}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: inputBg, border: `1px solid ${borderColor}`, borderRadius: 4,
        padding: '4px 8px', fontSize: 11, fontFamily: 'JetBrains Mono',
        color: textPrimary, outline: 'none', width: '100%',
      }}
    />
  </div>
);

interface StatCardProps {
  label: string;
  value: string;
  color: string;
  panelBg: string;
  borderColor: string;
  textSecondary: string;
  isDark: boolean;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, color, panelBg, borderColor, textSecondary }) => (
  <div style={{
    background: panelBg, border: `1px solid ${borderColor}`, borderRadius: 6,
    padding: '10px 14px',
  }}>
    <div style={{ fontSize: 9, color: textSecondary, fontFamily: 'JetBrains Mono', letterSpacing: '0.1em', marginBottom: 4 }}>
      {label}
    </div>
    <div style={{ fontFamily: 'JetBrains Mono', fontSize: 15, fontWeight: 700, color }}>
      {value}
    </div>
  </div>
);

export default PitSense;
