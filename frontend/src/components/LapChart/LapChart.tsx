/**
 * LapChart — GP Tempo-style session view.
 *
 * Layout:
 *   ┌─ Line chart: lap time vs lap number, one colored line per driver ─┐
 *   │  Compound-colored dots on each data point                         │
 *   │  SC/VSC yellow bands, pit reference lines                         │
 *   ├─ [Show outliers] button                                           ┤
 *   └─ Scrollable lap table: rows=drivers, cols=lap numbers             ┘
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
  ResponsiveContainer,
} from 'recharts';
import type { SessionMetadata, DriverLapsResponse } from '../../types/f1.types';
import { api } from '../../api/client';
import { formatLapTime } from '../../utils/formatting';
import { getCompoundColor } from '../../constants/compounds';
import EmptyState from '../common/EmptyState';
import { PanelSkeleton } from '../common/LoadingSpinner';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LapChartProps {
  sessionMeta: SessionMetadata;
  selectedDrivers: string[];
  hoveredDriver: string | null;
  onLapSelect?: (lap: number, driver?: string) => void;
}

type ChartRow = Record<string, number | string | boolean | null> & { lap: number };

// ---------------------------------------------------------------------------
// Compound dot renderer (factory to capture driver code)
// ---------------------------------------------------------------------------

function makeDot(code: string, teamColor: string) {
  return (props: any) => {
    const { cx, cy, payload } = props;
    if (cx == null || cy == null || payload[code] == null) return null;
    const compound = payload[`c_${code}`] as string | null;
    const isPit = payload[`p_${code}`] as boolean;
    const isEst = payload[`e_${code}`] as boolean;
    const fill = compound ? getCompoundColor(compound) : teamColor;
    if (isEst) {
      // Hollow diamond shape for estimated times
      const r = 5;
      return (
        <polygon
          key={`dot-${code}-${payload.lap}`}
          points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
          fill="none"
          stroke={teamColor}
          strokeWidth={1.5}
          opacity={0.6}
        />
      );
    }
    return (
      <circle
        key={`dot-${code}-${payload.lap}`}
        cx={cx}
        cy={cy}
        r={isPit ? 5.5 : 4}
        fill={fill}
        stroke={isPit ? teamColor : 'rgba(0,0,0,0.4)'}
        strokeWidth={isPit ? 1.5 : 1}
      />
    );
  };
}

// ---------------------------------------------------------------------------
// Tooltip
// ---------------------------------------------------------------------------

const ChartTooltip: React.FC<{
  active?: boolean;
  payload?: any[];
  label?: number;
  driverLapsMap: Record<string, DriverLapsResponse>;
}> = ({ active, payload, label, driverLapsMap }) => {
  if (!active || !payload?.length || label == null) return null;

  return (
    <div style={{
      background: 'var(--color-elevated)', border: '1px solid var(--color-border)', borderRadius: 5,
      padding: '8px 12px', minWidth: 160,
    }}>
      <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'JetBrains Mono', marginBottom: 6 }}>
        LAP {label}
      </div>
      {payload.map((p) => {
        if (p.value == null) return null;
        const code = p.dataKey as string;
        const color = p.stroke as string;
        const lapEntry = driverLapsMap[code]?.laps.find((l) => l.lap_number === label);
        const compound = lapEntry?.compound;
        const isEst = lapEntry?.is_estimated;
        return (
          <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            <div style={{ width: 2, height: 14, background: color, borderRadius: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color, minWidth: 32 }}>{code}</span>
            <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', color: 'var(--color-text-primary)', opacity: isEst ? 0.6 : 1 }}>
              {formatLapTime(p.value)}{isEst ? ' ~' : ''}
            </span>
            {compound && (
              <span style={{
                fontSize: 8, fontFamily: 'JetBrains Mono', fontWeight: 'bold',
                color: getCompoundColor(compound), marginLeft: 2,
              }}>
                {compound[0]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};



// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const LapChart: React.FC<LapChartProps> = ({
  sessionMeta,
  selectedDrivers,
  hoveredDriver,
  onLapSelect,
}) => {
  const [driverLapsMap, setDriverLapsMap] = useState<Record<string, DriverLapsResponse>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showOutliers, setShowOutliers] = useState(false);


  // Load laps for each selected driver
  useEffect(() => {
    if (selectedDrivers.length === 0) return;
    const fetchAll = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const results = await Promise.all(
          selectedDrivers.map((code) =>
            api.getDriverLaps(sessionMeta.year, sessionMeta.gp_name, sessionMeta.session_type, code)
          )
        );
        const map: Record<string, DriverLapsResponse> = {};
        results.forEach((r, i) => { map[selectedDrivers[i]] = r; });
        setDriverLapsMap(map);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load laps');
      } finally {
        setIsLoading(false);
      }
    };
    fetchAll();
  }, [selectedDrivers, sessionMeta]);

  // -------------------------------------------------------------------------
  // Outlier threshold: median + 10%
  // -------------------------------------------------------------------------
  const outlierThreshold = useMemo(() => {
    const times: number[] = [];
    selectedDrivers.forEach((code) => {
      driverLapsMap[code]?.laps.forEach((l) => {
        if (l.lap_time && l.is_accurate && !l.is_deleted && l.lap_time > 20 && l.lap_time < 300) {
          times.push(l.lap_time);
        }
      });
    });
    if (!times.length) return 999;
    times.sort((a, b) => a - b);
    const med = times[Math.floor(times.length / 2)];
    return med * 1.10;
  }, [selectedDrivers, driverLapsMap]);

  // -------------------------------------------------------------------------
  // Build merged chart data: [{lap: N, CODE1: time, c_CODE1: compound, ...}]
  // -------------------------------------------------------------------------
  const { chartData, allLapNumbers, pitLaps, scLaps } = useMemo(() => {
    const lapSet = new Set<number>();
    const pitSet = new Set<number>();
    const scSet = new Set<number>();

    selectedDrivers.forEach((code) => {
      driverLapsMap[code]?.laps.forEach((l) => lapSet.add(l.lap_number));
    });

    const sorted = Array.from(lapSet).sort((a, b) => a - b);

    const rows = sorted.map((lapNum): ChartRow => {
      const row: ChartRow = { lap: lapNum };

      selectedDrivers.forEach((code) => {
        const lap = driverLapsMap[code]?.laps.find((l) => l.lap_number === lapNum);

        if (lap && !lap.is_deleted) {
          const hasTime = lap.lap_time && lap.lap_time > 20;
          const isOutlier = hasTime && lap.lap_time! > outlierThreshold;
          // Include pit laps even with null lap_time so connectNulls bridges over them
          row[code] = hasTime && (showOutliers || !isOutlier) ? lap.lap_time! : null;
          row[`c_${code}`] = lap.compound ?? null;
          row[`p_${code}`] = lap.is_pit_in_lap;
          row[`e_${code}`] = lap.is_estimated;

          if (lap.is_pit_in_lap) pitSet.add(lapNum);
          const ts = lap.track_status ?? '';
          if (ts.includes('4') || ts.includes('6')) scSet.add(lapNum);
        } else {
          row[code] = null;
          row[`c_${code}`] = null;
          row[`p_${code}`] = false;
          row[`e_${code}`] = false;
        }
      });

      return row;
    });

    return { chartData: rows, allLapNumbers: sorted, pitLaps: pitSet, scLaps: scSet };
  }, [selectedDrivers, driverLapsMap, showOutliers, outlierThreshold]);

  // Y-axis range
  const { yMin, yMax } = useMemo(() => {
    const times: number[] = [];
    chartData.forEach((row) => {
      selectedDrivers.forEach((code) => {
        const v = row[code];
        if (typeof v === 'number' && v > 0) times.push(v);
      });
    });
    if (!times.length) return { yMin: 60, yMax: 120 };
    const mn = Math.min(...times);
    const mx = Math.max(...times);
    const pad = (mx - mn) * 0.12;
    return { yMin: mn - pad, yMax: mx + pad };
  }, [chartData, selectedDrivers]);

  // SC reference areas
  const scRanges = useMemo(() => buildRanges(Array.from(scLaps).sort((a, b) => a - b)), [scLaps]);

  // Per-driver fastest lap
  const fastestLapMap = useMemo(() => {
    const m: Record<string, number | null> = {};
    selectedDrivers.forEach((code) => {
      const resp = driverLapsMap[code];
      m[code] = resp?.fastest_lap_number ?? null;
    });
    return m;
  }, [selectedDrivers, driverLapsMap]);

  // -------------------------------------------------------------------------
  // Resolve per-driver colors — detect teammates (same color) and differentiate
  // -------------------------------------------------------------------------
  const resolvedStyles = useMemo(() => {
    const colorCount: Record<string, number> = {};
    const styles: Record<string, { color: string; dash: string }> = {};

    selectedDrivers.forEach((code) => {
      const raw = (driverLapsMap[code]?.team_color ?? sessionMeta.drivers[code]?.team_color ?? '#ffffff').toLowerCase();
      colorCount[raw] = (colorCount[raw] ?? 0) + 1;
    });

    const seen: Record<string, number> = {};
    selectedDrivers.forEach((code) => {
      const raw = (driverLapsMap[code]?.team_color ?? sessionMeta.drivers[code]?.team_color ?? '#ffffff').toLowerCase();
      seen[raw] = (seen[raw] ?? 0) + 1;
      if (colorCount[raw] > 1 && seen[raw] > 1) {
        // Lighten the color for the second driver on the same team
        const r = parseInt(raw.slice(1, 3), 16);
        const g = parseInt(raw.slice(3, 5), 16);
        const b = parseInt(raw.slice(5, 7), 16);
        const lighten = (v: number) => Math.min(255, v + Math.round((255 - v) * 0.55));
        const hex = (v: number) => lighten(v).toString(16).padStart(2, '0');
        styles[code] = { color: `#${hex(r)}${hex(g)}${hex(b)}`, dash: '6 3' };
      } else {
        styles[code] = { color: raw, dash: '' };
      }
    });

    return styles;
  }, [selectedDrivers, driverLapsMap, sessionMeta]);

  // -------------------------------------------------------------------------
  // Render guards
  // -------------------------------------------------------------------------
  if (selectedDrivers.length === 0) {
    return <EmptyState message="Select a driver" subMessage="Use the driver grid to add drivers to the chart" />;
  }
  if (isLoading) return <PanelSkeleton rows={2} />;
  if (error) return <EmptyState message="Failed to load lap data" subMessage={error} />;

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Line chart ── */}
      <div style={{ height: 310, flexShrink: 0, paddingTop: 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 24, bottom: 16, left: 52 }}>
            <CartesianGrid strokeDasharray="2 4" stroke="#1E1E1E" vertical={false} />

            {/* SC / VSC yellow bands */}
            {scRanges.map(([s, e], i) => (
              <ReferenceArea key={i} x1={s - 0.5} x2={e + 0.5}
                fill="rgba(255,200,0,0.07)" stroke="rgba(255,200,0,0.18)" strokeWidth={1} />
            ))}

            {/* Pit markers */}
            {Array.from(pitLaps).map((lap) => (
              <ReferenceLine key={`pit-${lap}`} x={lap}
                stroke="#555" strokeDasharray="3 3" strokeWidth={1}
                label={{ value: 'P', position: 'top', fill: '#555', fontSize: 8, fontFamily: 'JetBrains Mono' }}
              />
            ))}

            <XAxis
              dataKey="lap"
              type="number"
              domain={allLapNumbers.length ? [allLapNumbers[0], allLapNumbers[allLapNumbers.length - 1]] : [1, 1]}
              tick={{ fill: '#555', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#2A2A2A' }}
              tickLine={false}
              label={{ value: 'Lap number', position: 'insideBottomRight', fill: '#444', fontSize: 10, offset: -8 }}
            />

            <YAxis
              domain={[yMin, yMax]}
              tickFormatter={(v) => formatLapTime(v)}
              tick={{ fill: '#555', fontSize: 10, fontFamily: 'JetBrains Mono' }}
              axisLine={{ stroke: '#2A2A2A' }}
              tickLine={false}
              width={52}
              label={{ value: 'Lap time', angle: -90, position: 'insideLeft', fill: '#444', fontSize: 10, dx: -8 }}
            />

            <Tooltip
              content={
                <ChartTooltip
                  driverLapsMap={driverLapsMap}
                />
              }
              cursor={{ stroke: 'rgba(255,255,255,0.12)', strokeWidth: 1, strokeDasharray: '4 4' }}
            />

            {/* One Line per driver */}
            {selectedDrivers.map((code) => {
              const { color, dash } = resolvedStyles[code] ?? { color: '#ffffff', dash: '' };
              const opacity = hoveredDriver && hoveredDriver !== code ? 0.15 : 1;

              return (
                <Line
                  key={code}
                  type="monotone"
                  dataKey={code}
                  stroke={color}
                  strokeWidth={1.8}
                  strokeDasharray={dash || undefined}
                  dot={makeDot(code, color)}
                  activeDot={{ r: 6, fill: color, stroke: '#000', strokeWidth: 1.5 }}
                  connectNulls={true}
                  isAnimationActive={false}
                  opacity={opacity}
                  style={{ transition: 'opacity 0.2s' }}
                />
              );
            })}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* ── Controls bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '4px 16px',
        borderBottom: '1px solid var(--color-border)', flexShrink: 0,
      }}>
        <button
          onClick={() => setShowOutliers((v) => !v)}
          style={{
            fontSize: 10, fontFamily: 'JetBrains Mono', padding: '3px 12px',
            background: showOutliers ? 'var(--color-panel)' : 'transparent',
            border: `1px solid ${showOutliers ? 'var(--color-text-tertiary)' : 'var(--color-border)'}`,
            color: showOutliers ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
            borderRadius: 3, cursor: 'pointer',
          }}
        >
          {showOutliers ? '▲ Hide outliers' : '▼ Show outliers'}
        </button>

        {/* Driver legend */}
        <div style={{ display: 'flex', gap: 12, marginLeft: 8 }}>
          {selectedDrivers.map((code) => {
            const { color, dash } = resolvedStyles[code] ?? { color: '#fff', dash: '' };
            return (
              <div key={code} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <svg width={20} height={4} style={{ flexShrink: 0 }}>
                  <line x1={0} y1={2} x2={20} y2={2} stroke={color} strokeWidth={2}
                    strokeDasharray={dash || undefined} />
                </svg>
                <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color }}>{code}</span>
              </div>
            );
          })}
        </div>

        {/* Compound key + estimated marker */}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
          {[['S', '#FF3333'], ['M', '#FFC906'], ['H', '#CCCCCC'], ['I', '#39B54A'], ['W', '#0072C6']].map(([l, c]) => (
            <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: c }} />
              <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'JetBrains Mono' }}>{l}</span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'center', gap: 3, marginLeft: 4 }}>
            <svg width={10} height={10}><polygon points="5,0 10,5 5,10 0,5" fill="none" stroke="#666" strokeWidth={1.5} /></svg>
            <span style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'JetBrains Mono' }}>est.</span>
          </div>
        </div>
      </div>

      {/* ── Lap grid (responsive cards) ── */}
      <div style={{ flex: 1, overflow: 'auto', padding: '8px 12px' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
          gap: 4,
        }}>
          {allLapNumbers.map((lapNum) => {
            return (
              <div
                key={lapNum}
                style={{
                  background: 'var(--color-surface)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 4,
                  padding: '4px 6px',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s',
                }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-text-tertiary)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--color-border)'; }}
              >
                {/* Lap number header */}
                <div style={{
                  fontSize: 8, fontFamily: 'JetBrains Mono', color: 'var(--color-text-tertiary)',
                  letterSpacing: '0.08em', marginBottom: 2, textAlign: 'center',
                }}>
                  LAP {lapNum}
                </div>
                {/* Driver times stacked */}
                {selectedDrivers.map((code) => {
                  const resp = driverLapsMap[code];
                  const teamColor = resp?.team_color ?? sessionMeta.drivers[code]?.team_color ?? '#fff';
                  const lap = resp?.laps.find((l) => l.lap_number === lapNum);
                  const hasTime = !!(lap?.lap_time && !lap.is_deleted && lap.lap_time > 20);
                  const isEstimated = lap?.is_estimated ?? false;
                  const isFastest = lapNum === fastestLapMap[code];
                  const compound = lap?.compound;

                  return (
                    <div
                      key={code}
                      onClick={() => hasTime && onLapSelect?.(lapNum, code)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 4,
                        padding: '1px 2px', borderRadius: 2,
                        background: isFastest ? '#7B2FBE' : 'transparent',
                        cursor: hasTime ? 'pointer' : 'default',
                      }}
                    >
                      <span style={{
                        width: 3, height: 10, borderRadius: 1,
                        background: teamColor, flexShrink: 0,
                      }} />
                      <span style={{
                        fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: isFastest ? 'bold' : 'normal',
                        color: isFastest ? '#fff' : hasTime ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
                        flex: 1,
                      }}>
                        {hasTime ? `${formatLapTime(lap!.lap_time)}${isEstimated ? ' ~' : ''}` : '—'}
                      </span>
                      {compound && hasTime && (
                        <span style={{
                          width: 6, height: 6, borderRadius: '50%',
                          background: getCompoundColor(compound), flexShrink: 0,
                        }} />
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildRanges(sortedLaps: number[]): [number, number][] {
  if (!sortedLaps.length) return [];
  const ranges: [number, number][] = [];
  let start = sortedLaps[0], prev = sortedLaps[0];
  for (let i = 1; i < sortedLaps.length; i++) {
    if (sortedLaps[i] === prev + 1) { prev = sortedLaps[i]; }
    else { ranges.push([start, prev]); start = sortedLaps[i]; prev = sortedLaps[i]; }
  }
  ranges.push([start, prev]);
  return ranges;
}

export default LapChart;
