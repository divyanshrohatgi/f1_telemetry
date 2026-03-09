/**
 * DriverComparison — Professional head-to-head fastest-lap analysis.
 *
 * Layout:
 *   ┌─ Header: driver badges, lap times, overall delta ──────────────┐
 *   ├─ Circuit map (track layout, sector-coloured) │ Sector table ───┤
 *   ├─ SPEED      (both drivers overlaid, D3, synced crosshair) ─────┤
 *   ├─ THROTTLE   (both drivers) ───────────────────────────────────-┤
 *   ├─ BRAKE      (both drivers, binary) ────────────────────────────┤
 *   ├─ GEAR       (both drivers, step) ──────────────────────────────┤
 *   ├─ RPM        (both drivers) ────────────────────────────────────┤
 *   ├─ DELTA      (cumulative gap, positive = d1 ahead) ─────────────┤
 *   └─ Mini-sector advantage bars ───────────────────────────────────┘
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import * as d3 from 'd3';
import type {
  SessionMetadata,
  ComparisonResponse,
  ComparisonLapPoint,
} from '../../types/f1.types';
import { api } from '../../api/client';
import { formatLapTime, getDeltaColor } from '../../utils/formatting';
import EmptyState from '../common/EmptyState';
import { PanelSkeleton } from '../common/LoadingSpinner';
import CircuitMap from '../CircuitMap/CircuitMap';

// ---------------------------------------------------------------------------
// Channel configuration
// ---------------------------------------------------------------------------

interface CompChannel {
  d1key: keyof ComparisonLapPoint;
  d2key: keyof ComparisonLapPoint;
  label: string;
  unit: string;
  height: number;
  yDomain?: [number, number];
  isBinary?: boolean;
  isStep?: boolean;
  format?: (v: number) => string;
}

const COMP_CHANNELS: CompChannel[] = [
  {
    d1key: 'speed_d1', d2key: 'speed_d2',
    label: 'SPEED', unit: 'km/h', height: 110,
    format: (v) => `${Math.round(v)}`,
  },
  {
    d1key: 'throttle_d1', d2key: 'throttle_d2',
    label: 'THROTTLE', unit: '%', height: 72,
    yDomain: [0, 100],
    format: (v) => `${Math.round(v)}`,
  },
  {
    d1key: 'brake_d1', d2key: 'brake_d2',
    label: 'BRAKE', unit: '', height: 38,
    yDomain: [0, 1], isBinary: true,
  },
  {
    d1key: 'gear_d1', d2key: 'gear_d2',
    label: 'GEAR', unit: '', height: 56,
    yDomain: [1, 8], isStep: true,
    format: (v) => `${Math.round(v)}`,
  },
  {
    d1key: 'rpm_d1', d2key: 'rpm_d2',
    label: 'RPM', unit: 'rpm', height: 72,
    format: (v) => `${Math.round(v / 1000).toFixed(1)}k`,
  },
];

const MARGIN = { left: 54, right: 16, top: 4, bottom: 4 };
const DELTA_HEIGHT = 72;

// ---------------------------------------------------------------------------
// Crosshair state shared across all channel charts
// ---------------------------------------------------------------------------

interface CrosshairState {
  distance: number;
  x: number;
  values: Partial<Record<keyof ComparisonLapPoint, number>>;
}

// CircuitMap is now a shared component — imported above

// ---------------------------------------------------------------------------
// Main DriverComparison component
// ---------------------------------------------------------------------------

interface DriverComparisonProps {
  sessionMeta: SessionMetadata;
  driver1: string;
  driver2: string;
}

const DriverComparison: React.FC<DriverComparisonProps> = ({
  sessionMeta,
  driver1,
  driver2,
}) => {
  const [data, setData] = useState<ComparisonResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [crosshair, setCrosshair] = useState<CrosshairState | null>(null);
  const [rotationOffset, setRotationOffset] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(800);
  const [lap1Num, setLap1Num] = useState<number | null>(null); // null = fastest
  const [lap2Num, setLap2Num] = useState<number | null>(null);

  // Responsive width
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setContainerWidth(w);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Fetch comparison data
  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      setCrosshair(null);
      try {
        const result = await api.getComparison(
          sessionMeta.year,
          sessionMeta.gp_name,
          sessionMeta.session_type,
          driver1,
          driver2,
          lap1Num ?? undefined,
          lap2Num ?? undefined
        );
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load comparison');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [driver1, driver2, sessionMeta, lap1Num, lap2Num]);

  // Crosshair handler (shared across all channel SVGs)
  const chartWidth = containerWidth - MARGIN.left - MARGIN.right;
  const xMax = data?.lap_distance ?? 1;
  const xScale = d3.scaleLinear().domain([0, xMax]).range([0, chartWidth]);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!data?.points.length) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - MARGIN.left;
      if (mouseX < 0 || mouseX > chartWidth) { setCrosshair(null); return; }

      const dist = xScale.invert(mouseX);
      const pts = data.points;
      const bisect = d3.bisectLeft(pts.map((p) => p.distance), dist);
      const idx = Math.min(bisect, pts.length - 1);
      const pt = pts[idx];
      if (!pt) return;

      const values: CrosshairState['values'] = {};
      COMP_CHANNELS.forEach((ch) => {
        values[ch.d1key] = pt[ch.d1key] as number;
        values[ch.d2key] = pt[ch.d2key] as number;
      });
      values.delta = pt.delta ?? undefined;

      setCrosshair({ distance: pt.distance, x: xScale(pt.distance), values });
    },
    [data, xScale, chartWidth]
  );

  const handleMouseLeave = useCallback(() => setCrosshair(null), []);

  if (isLoading) return <PanelSkeleton rows={5} />;
  if (error) return <EmptyState message="Failed to load comparison" subMessage={error} />;
  if (!data) return null;

  const c1Raw = data.driver1_team_color;
  const c2Raw = data.driver2_team_color;
  const c1 = c1Raw;
  // Same-team fix: lighten c2 by 55% so it's always visually distinct (works in both themes)
  const isSameTeam = c1Raw.toLowerCase() === c2Raw.toLowerCase();
  const c2 = (() => {
    if (!isSameTeam) return c2Raw;
    const raw = c2Raw.replace('#', '');
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    const l = (v: number) => Math.min(255, v + Math.round((255 - v) * 0.55));
    const h = (v: number) => l(v).toString(16).padStart(2, '0');
    return `#${h(r)}${h(g)}${h(b)}`;
  })();
  const d1 = data.driver1_code;
  const d2 = data.driver2_code;
  const overallDelta = data.driver1_lap_time != null && data.driver2_lap_time != null
    ? data.driver2_lap_time - data.driver1_lap_time
    : null;

  // -------------------------------------------------------------------------
  // Build channel paths
  // -------------------------------------------------------------------------

  const buildChannelSvg = (channel: CompChannel) => {
    const pts = data.points;
    const rawVals1 = pts.map((p) => {
      const v = p[channel.d1key] as number;
      return channel.isBinary ? (v >= 0.5 ? 1 : 0) : v;
    }).filter((v) => v != null && !isNaN(v));
    const rawVals2 = pts.map((p) => {
      const v = p[channel.d2key] as number;
      return channel.isBinary ? (v >= 0.5 ? 1 : 0) : v;
    }).filter((v) => v != null && !isNaN(v));

    const allVals = [...rawVals1, ...rawVals2];
    let yMin = channel.yDomain?.[0] ?? (allVals.length ? d3.min(allVals)! : 0);
    let yMax = channel.yDomain?.[1] ?? (allVals.length ? d3.max(allVals)! : 1);
    if (!channel.yDomain) {
      const pad = (yMax - yMin) * 0.06;
      yMin -= pad; yMax += pad;
    }

    const innerH = channel.height - MARGIN.top - MARGIN.bottom;
    const yScale = d3.scaleLinear().domain([yMin, yMax]).range([innerH, 0]);

    const curve = channel.isBinary || channel.isStep ? d3.curveStepAfter : d3.curveCatmullRom.alpha(0.5);

    const lineGen = d3.line<ComparisonLapPoint>()
      .defined((p) => {
        const v = p[channel.d1key];
        return v != null && !isNaN(v as number);
      })
      .x((p) => xScale(p.distance))
      .y((p) => {
        const v = p[channel.d1key] as number;
        return yScale(channel.isBinary ? (v >= 0.5 ? 1 : 0) : v);
      })
      .curve(curve);

    const lineGen2 = d3.line<ComparisonLapPoint>()
      .defined((p) => {
        const v = p[channel.d2key];
        return v != null && !isNaN(v as number);
      })
      .x((p) => xScale(p.distance))
      .y((p) => {
        const v = p[channel.d2key] as number;
        return yScale(channel.isBinary ? (v >= 0.5 ? 1 : 0) : v);
      })
      .curve(curve);

    const path1 = lineGen(pts) ?? '';
    const path2 = lineGen2(pts) ?? '';

    // Crosshair dot Y positions
    const crosshairY1 = crosshair?.values[channel.d1key] != null
      ? yScale(channel.isBinary
          ? ((crosshair.values[channel.d1key] as number) >= 0.5 ? 1 : 0)
          : (crosshair.values[channel.d1key] as number))
      : null;
    const crosshairY2 = crosshair?.values[channel.d2key] != null
      ? yScale(channel.isBinary
          ? ((crosshair.values[channel.d2key] as number) >= 0.5 ? 1 : 0)
          : (crosshair.values[channel.d2key] as number))
      : null;

    return { path1, path2, yScale, yMin, yMax, innerH, crosshairY1, crosshairY2 };
  };

  // Delta channel
  const buildDeltaSvg = () => {
    const pts = data.points;
    const deltas = pts.map((p) => p.delta).filter((v): v is number => v != null && !isNaN(v));
    const dMax = Math.max(Math.abs(d3.max(deltas) ?? 0.5), Math.abs(d3.min(deltas) ?? 0.5), 0.1);
    const innerH = DELTA_HEIGHT - MARGIN.top - MARGIN.bottom;
    const yScale = d3.scaleLinear().domain([-dMax, dMax]).range([innerH, 0]);

    const lineGen = d3.line<ComparisonLapPoint>()
      .defined((p) => p.delta != null && !isNaN(p.delta!))
      .x((p) => xScale(p.distance))
      .y((p) => yScale(p.delta!))
      .curve(d3.curveCatmullRom.alpha(0.5));

    // Area above/below zero: colour by who's ahead
    // Build two areas: positive (d1 ahead → c1), negative (d2 ahead → c2)
    const areaPos = d3.area<ComparisonLapPoint>()
      .defined((p) => p.delta != null)
      .x((p) => xScale(p.distance))
      .y0(yScale(0))
      .y1((p) => Math.min(yScale(p.delta!), yScale(0)))
      .curve(d3.curveCatmullRom.alpha(0.5));

    const areaNeg = d3.area<ComparisonLapPoint>()
      .defined((p) => p.delta != null)
      .x((p) => xScale(p.distance))
      .y0(yScale(0))
      .y1((p) => Math.max(yScale(p.delta!), yScale(0)))
      .curve(d3.curveCatmullRom.alpha(0.5));

    return {
      linePath: lineGen(pts) ?? '',
      areaPos: areaPos(pts) ?? '',
      areaNeg: areaNeg(pts) ?? '',
      yScale, innerH, dMax,
    };
  };

  // Render x-axis ticks (shared bottom)
  const renderXAxis = (innerH: number) => (
    <>
      <line x1={0} x2={chartWidth} y1={innerH} y2={innerH} stroke="var(--color-border)" />
      {xScale.ticks(10).map((tick) => (
        <g key={tick} transform={`translate(${xScale(tick)},${innerH})`}>
          <line y2={4} stroke="#333" />
          <text
            y={14}
            textAnchor="middle"
            style={{ fill: 'var(--color-text-tertiary)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
          >
            {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick}
          </text>
        </g>
      ))}
      <text
        x={chartWidth / 2}
        y={innerH + 22}
        textAnchor="middle"
        style={{ fill: 'var(--color-text-tertiary)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
      >
        DISTANCE (m)
      </text>
    </>
  );

  // Sector boundary lines
  const sectorLines = (innerH: number) =>
    (data.sector_distances ?? []).map((sd, i) => (
      <g key={i} transform={`translate(${xScale(sd)},0)`}>
        <line y1={0} y2={innerH} stroke="var(--color-border)" strokeWidth={1} strokeDasharray="3 3" />
        {i === 0 && (
          <text y={10} textAnchor="middle" style={{ fill: 'var(--color-text-tertiary)', fontSize: 8, fontFamily: 'JetBrains Mono' }}>
            S2
          </text>
        )}
        {i === 1 && (
          <text y={10} textAnchor="middle" style={{ fill: 'var(--color-text-tertiary)', fontSize: 8, fontFamily: 'JetBrains Mono' }}>
            S3
          </text>
        )}
      </g>
    ));

  // (channel count used for future reference line logic)

  // -------------------------------------------------------------------------
  // Crosshair tooltip data
  // -------------------------------------------------------------------------
  const tooltipRows = crosshair
    ? COMP_CHANNELS.map((ch) => {
        const v1 = crosshair.values[ch.d1key] as number | undefined;
        const v2 = crosshair.values[ch.d2key] as number | undefined;
        const fmt = ch.format ?? ((v: number) => String(Math.round(v)));
        return {
          label: ch.label,
          v1: v1 != null && !isNaN(v1) ? fmt(v1) : '—',
          v2: v2 != null && !isNaN(v2) ? fmt(v2) : '—',
        };
      })
    : [];

  // -------------------------------------------------------------------------
  // Mini-sector bar colours
  // -------------------------------------------------------------------------
  const miniStep = Math.max(1, Math.floor(data.mini_sectors.length / 60));
  const miniSectors = data.mini_sectors.filter((_, i) => i % miniStep === 0);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="w-full h-full overflow-y-auto" ref={containerRef}>

      {/* ── Header ── */}
      <div
        className="flex items-center gap-4 px-4 py-2.5 shrink-0 flex-wrap"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        <div className="label">LAP COMPARISON</div>

        {/* Driver 1 + lap selector */}
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-5 rounded-full shrink-0" style={{ background: c1 }} />
          <div>
            <div className="mono text-sm font-bold" style={{ color: c1 }}>{d1}</div>
            <div className="mono text-2xs" style={{ color: 'var(--color-text-secondary)' }}>
              {formatLapTime(data.driver1_lap_time)}
            </div>
          </div>
          <select
            value={lap1Num ?? ''}
            onChange={(e) => setLap1Num(e.target.value ? Number(e.target.value) : null)}
            style={{
              fontSize: 9, fontFamily: 'JetBrains Mono', padding: '2px 4px',
              background: 'var(--color-elevated)', color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)', borderRadius: 3, outline: 'none',
            }}
          >
            <option value="">FASTEST</option>
            {Array.from({ length: sessionMeta.total_laps || 70 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>L{n}</option>
            ))}
          </select>
        </div>

        <div className="mono text-xs" style={{ color: 'var(--color-text-tertiary)' }}>vs</div>

        {/* Driver 2 + lap selector */}
        <div className="flex items-center gap-2">
          <div className="w-0.5 h-5 rounded-full shrink-0" style={{ background: c2 }} />
          <div>
            <div className="mono text-sm font-bold" style={{ color: c2 }}>{d2}</div>
            <div className="mono text-2xs" style={{ color: 'var(--color-text-secondary)' }}>
              {formatLapTime(data.driver2_lap_time)}
            </div>
          </div>
          <select
            value={lap2Num ?? ''}
            onChange={(e) => setLap2Num(e.target.value ? Number(e.target.value) : null)}
            style={{
              fontSize: 9, fontFamily: 'JetBrains Mono', padding: '2px 4px',
              background: 'var(--color-elevated)', color: 'var(--color-text-primary)',
              border: '1px solid var(--color-border)', borderRadius: 3, outline: 'none',
            }}
          >
            <option value="">FASTEST</option>
            {Array.from({ length: sessionMeta.total_laps || 70 }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>L{n}</option>
            ))}
          </select>
        </div>

        {/* Overall delta */}
        {overallDelta !== null && (
          <div
            className="ml-auto mono text-base font-bold px-3 py-1 rounded"
            style={{
              color: getDeltaColor(overallDelta),
              background: getDeltaColor(overallDelta) + '18',
              border: `1px solid ${getDeltaColor(overallDelta)}44`,
            }}
          >
            {overallDelta > 0 ? '+' : ''}{overallDelta.toFixed(3)}s
            <span className="mono text-2xs ml-2" style={{ color: 'var(--color-text-secondary)' }}>
              {overallDelta > 0 ? `${d2} behind` : `${d2} ahead`}
            </span>
          </div>
        )}
      </div>

      {/* ── Top row: Circuit map & Sector Dominance ── */}
      <div
        className="grid grid-cols-1 lg:grid-cols-2 gap-6 px-4 py-3"
        style={{ borderBottom: '1px solid var(--color-border)' }}
      >
        {/* Left: Circuit Map */}
        <div className="flex flex-col items-center relative">
          <div style={{ width: '100%', maxWidth: 500 }}>
            <CircuitMap
              circuitPoints={data.circuit_points ?? []}
              circuitRotation={(data.circuit_rotation ?? 0) + rotationOffset}
              d1={d1}
              d2={d2}
              c1={c1}
              c2={c2}
              sectorDistances={data.sector_distances ?? []}
              hoveredDistance={crosshair?.distance ?? null}
              lapDistance={data.lap_distance}
              onRotate={() => setRotationOffset(r => (r + 90) % 360)}
            />
          </div>
          {/* Compact sector times row */}
          <div style={{ display: 'flex', justifyContent: 'center', gap: 24, marginTop: 8 }}>
            {['S1', 'S2', 'S3', 'LAP'].map((label, si) => {
              const d1t = si < 3 ? (data.driver1_sector_times ?? [])[si] : data.driver1_lap_time;
              const d2t = si < 3 ? (data.driver2_sector_times ?? [])[si] : data.driver2_lap_time;
              return (
                <div key={label} style={{ textAlign: 'center' }}>
                  <div className="mono text-2xs" style={{ color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{label}</div>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <span className="mono text-xs" style={{ color: c1 }}>{d1t != null ? d1t.toFixed(3) : '—'}</span>
                    <span className="mono text-xs" style={{ color: c2 }}>{d2t != null ? d2t.toFixed(3) : '—'}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right: Sector Dominance */}
        {data.sector_distances.length >= 2 && (
          <div className="flex flex-col justify-center py-2">
            <div className="label mb-4">SECTOR DOMINANCE — AVERAGE SPEED</div>
            <div className="flex flex-col gap-5">
            {(() => {
              const sectorBounds = [0, data.sector_distances[0], data.sector_distances[1], data.lap_distance];
              return ['S1', 'S2', 'S3'].map((label, si) => {
                const dStart = sectorBounds[si];
                const dEnd = sectorBounds[si + 1];
                const sectorPts = data.points.filter(p => p.distance >= dStart && p.distance < dEnd);
                if (sectorPts.length === 0) return null;
                const avgSpd1 = sectorPts.reduce((s, p) => s + (p.speed_d1 ?? 0), 0) / sectorPts.length;
                const avgSpd2 = sectorPts.reduce((s, p) => s + (p.speed_d2 ?? 0), 0) / sectorPts.length;
                const maxSpd = Math.max(avgSpd1, avgSpd2, 1);
                const dominant = avgSpd1 > avgSpd2 ? d1 : avgSpd2 > avgSpd1 ? d2 : null;
                const diff = Math.abs(avgSpd1 - avgSpd2);

                return (
                  <div key={label} style={{ flex: 1 }}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="mono" style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontWeight: 'bold' }}>{label}</span>
                      {dominant && (
                        <span className="mono" style={{ fontSize: 8, color: dominant === d1 ? c1 : c2, fontWeight: 'bold' }}>
                          {dominant} +{diff.toFixed(1)} km/h
                        </span>
                      )}
                    </div>
                    {/* Driver 1 bar */}
                    <div className="flex items-center gap-2 mb-1">
                      <span className="mono" style={{ fontSize: 9, color: c1, width: 28, textAlign: 'right', fontWeight: 'bold' }}>{d1}</span>
                      <div style={{ flex: 1, height: 12, background: 'var(--color-muted)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          width: `${(avgSpd1 / maxSpd) * 100}%`, height: '100%',
                          background: dominant === d1 ? c1 : c1 + '66', borderRadius: 2,
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--color-text-secondary)', width: 36, textAlign: 'right' }}>{Math.round(avgSpd1)}</span>
                    </div>
                    {/* Driver 2 bar */}
                    <div className="flex items-center gap-2">
                      <span className="mono" style={{ fontSize: 9, color: c2, width: 28, textAlign: 'right', fontWeight: 'bold' }}>{d2}</span>
                      <div style={{ flex: 1, height: 12, background: 'var(--color-muted)', borderRadius: 2, overflow: 'hidden' }}>
                        <div style={{
                          width: `${(avgSpd2 / maxSpd) * 100}%`, height: '100%',
                          background: dominant === d2 ? c2 : c2 + '66', borderRadius: 2,
                          transition: 'width 0.3s ease',
                        }} />
                      </div>
                      <span className="mono" style={{ fontSize: 9, color: 'var(--color-text-secondary)', width: 36, textAlign: 'right' }}>{Math.round(avgSpd2)}</span>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
        )}
      </div>

      {/* ── Channel charts ── */}
      <div className="relative">

        {/* Floating crosshair tooltip */}
        {crosshair && tooltipRows.length > 0 && (
          <div
            className="absolute z-20 pointer-events-none"
            style={{
              right: MARGIN.right + 4,
              top: 4,
              background: 'var(--color-elevated)',
              border: '1px solid var(--color-border)',
              borderRadius: 5,
              padding: '8px 12px',
              minWidth: 180,
            }}
          >
            <div
              className="mono mb-2"
              style={{ fontSize: 10, color: 'var(--color-text-tertiary)', borderBottom: '1px solid var(--color-border)', paddingBottom: 6 }}
            >
              {Math.round(crosshair.distance)} m
            </div>
            <div
              className="grid gap-y-1 gap-x-3 mb-2"
              style={{ gridTemplateColumns: '60px 1fr 1fr', fontSize: 9, fontFamily: 'JetBrains Mono' }}
            >
              <div />
              <div style={{ color: c1, fontWeight: 'bold', textAlign: 'right' }}>{d1}</div>
              <div style={{ color: c2, fontWeight: 'bold', textAlign: 'right' }}>{d2}</div>
              {tooltipRows.map(({ label, v1, v2 }) => (
                <React.Fragment key={label}>
                  <div style={{ color: 'var(--color-text-tertiary)' }}>{label}</div>
                  <div style={{ color: 'var(--color-text-primary)', textAlign: 'right' }}>{v1}</div>
                  <div style={{ color: 'var(--color-text-primary)', textAlign: 'right' }}>{v2}</div>
                </React.Fragment>
              ))}
              <div style={{ color: 'var(--color-text-tertiary)' }}>DELTA</div>
              <div
                style={{
                  color: crosshair.values.delta != null ? getDeltaColor(-(crosshair.values.delta as number)) : '#555',
                  textAlign: 'right',
                  gridColumn: '2 / 4',
                }}
              >
                {crosshair.values.delta != null
                  ? `${(crosshair.values.delta as number) > 0 ? '+' : ''}${(crosshair.values.delta as number).toFixed(3)}s`
                  : '—'}
              </div>
            </div>
          </div>
        )}

        {/* ── Per-channel SVG ── */}
        {COMP_CHANNELS.map((channel, idx) => {
          const { path1, path2, yScale, innerH, crosshairY1, crosshairY2 } = buildChannelSvg(channel);

          return (
            <div
              key={channel.label}
              style={{ borderBottom: '1px solid var(--color-border)', position: 'relative' }}
            >
              <svg
                width="100%"
                height={channel.height}
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{ display: 'block', cursor: 'crosshair' }}
              >
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                  {/* Grid lines */}
                  {yScale.ticks(3).map((tick) => (
                    <line
                      key={tick}
                      x1={0} x2={chartWidth}
                      y1={yScale(tick)} y2={yScale(tick)}
                      stroke="var(--color-border)" strokeWidth={1}
                    />
                  ))}

                  {/* Sector boundaries */}
                  {sectorLines(innerH)}

                  {/* D1 line (solid) */}
                  <path
                    d={path1}
                    fill="none"
                    stroke={c1}
                    strokeWidth={channel.isBinary ? 1.5 : 2}
                    strokeOpacity={0.9}
                  />

                  {/* D2 line (dashed) */}
                  <path
                    d={path2}
                    fill="none"
                    stroke={c2}
                    strokeWidth={channel.isBinary ? 1.5 : 2}
                    strokeOpacity={0.85}
                    strokeDasharray={channel.isBinary ? undefined : '5 3'}
                  />

                  {/* Y-axis ticks */}
                  {yScale.ticks(3).map((tick) => (
                    <text
                      key={tick}
                      x={-6} y={yScale(tick) + 3}
                      textAnchor="end"
                      style={{ fill: 'var(--color-text-tertiary)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                    >
                      {channel.format ? channel.format(tick) : Math.round(tick)}
                    </text>
                  ))}

                  {/* Crosshair vertical */}
                  {crosshair && (
                    <line
                      x1={crosshair.x} x2={crosshair.x}
                      y1={0} y2={innerH}
                      stroke="rgba(255,255,255,0.2)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      pointerEvents="none"
                    />
                  )}

                  {/* Crosshair dots */}
                  {crosshair && crosshairY1 != null && (
                    <circle cx={crosshair.x} cy={crosshairY1} r={3} fill={c1} pointerEvents="none" />
                  )}
                  {crosshair && crosshairY2 != null && (
                    <circle cx={crosshair.x} cy={crosshairY2} r={3} fill={c2} pointerEvents="none" />
                  )}
                </g>

                {/* Channel label (rotated, left) */}
                <text
                  x={8} y={channel.height / 2}
                  style={{ fill: 'var(--color-text-tertiary)', fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 'bold', letterSpacing: '0.08em' }}
                  dominantBaseline="middle"
                  transform={`rotate(-90, 8, ${channel.height / 2})`}
                >
                  {channel.label}
                </text>

                {/* Driver legend dots (top-right of first channel) */}
                {idx === 0 && (
                  <g transform={`translate(${MARGIN.left + chartWidth - 110}, ${MARGIN.top + 8})`}>
                    <line x1={0} x2={16} y1={0} y2={0} stroke={c1} strokeWidth={2} />
                    <text x={20} y={4} style={{ fill: c1, fontSize: 9, fontFamily: 'JetBrains Mono' }}>{d1}</text>
                    <line x1={50} x2={66} y1={0} y2={0} stroke={c2} strokeWidth={2} strokeDasharray="5 3" />
                    <text x={70} y={4} style={{ fill: c2, fontSize: 9, fontFamily: 'JetBrains Mono' }}>{d2}</text>
                  </g>
                )}
              </svg>
            </div>
          );
        })}

        {/* ── Delta chart ── */}
        {(() => {
          const { linePath, areaPos, areaNeg, yScale, innerH } = buildDeltaSvg();
          const crosshairDeltaY = crosshair?.values.delta != null
            ? yScale(crosshair.values.delta as number)
            : null;

          return (
            <div style={{ borderBottom: '1px solid var(--color-border)', position: 'relative' }}>
              <svg
                width="100%"
                height={DELTA_HEIGHT + 28} // extra for x-axis
                onMouseMove={handleMouseMove}
                onMouseLeave={handleMouseLeave}
                style={{ display: 'block', cursor: 'crosshair' }}
              >
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                  {/* Grid */}
                  {yScale.ticks(3).map((tick) => (
                    <line
                      key={tick}
                      x1={0} x2={chartWidth}
                      y1={yScale(tick)} y2={yScale(tick)}
                      stroke="var(--color-border)" strokeWidth={1}
                    />
                  ))}

                  {/* Zero line */}
                  <line
                    x1={0} x2={chartWidth}
                    y1={yScale(0)} y2={yScale(0)}
                    stroke="var(--color-border)" strokeWidth={1}
                  />

                  {/* Sector boundaries */}
                  {sectorLines(innerH)}

                  {/* Area fill: d1 ahead (positive → c1 tinted) */}
                  <path d={areaPos} fill={c1} fillOpacity={0.12} />
                  {/* Area fill: d2 ahead (negative → c2 tinted) */}
                  <path d={areaNeg} fill={c2} fillOpacity={0.12} />

                  {/* Delta line */}
                  <path d={linePath} fill="none" stroke="#FFFFFF" strokeWidth={1.5} strokeOpacity={0.7} />

                  {/* Y-axis labels */}
                  {yScale.ticks(3).map((tick) => (
                    <text
                      key={tick}
                      x={-6} y={yScale(tick) + 3}
                      textAnchor="end"
                      style={{ fill: 'var(--color-text-tertiary)', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                    >
                      {tick > 0 ? '+' : ''}{tick.toFixed(1)}s
                    </text>
                  ))}

                  {/* X-axis */}
                  {renderXAxis(innerH)}

                  {/* Crosshair */}
                  {crosshair && (
                    <>
                      <line
                        x1={crosshair.x} x2={crosshair.x}
                        y1={0} y2={innerH}
                        stroke="rgba(255,255,255,0.2)" strokeWidth={1} strokeDasharray="3 3"
                        pointerEvents="none"
                      />
                      {crosshairDeltaY != null && (
                        <circle cx={crosshair.x} cy={crosshairDeltaY} r={3} fill="#FFFFFF" pointerEvents="none" />
                      )}
                    </>
                  )}
                </g>

                {/* Label */}
                <text
                  x={8} y={(DELTA_HEIGHT) / 2}
                  style={{ fill: 'var(--color-text-tertiary)', fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 'bold', letterSpacing: '0.08em' }}
                  dominantBaseline="middle"
                  transform={`rotate(-90, 8, ${DELTA_HEIGHT / 2})`}
                >
                  DELTA
                </text>
              </svg>
            </div>
          );
        })()}
      </div>

      {/* ── Mini-sector bars ── */}
      <div className="px-4 pt-3 pb-4">
        <div className="label mb-2">MINI SECTORS — who was faster ({data.mini_sectors.length})</div>
        <div className="flex gap-px" style={{ height: 18 }}>
          {miniSectors.map((ms, i) => (
            <div
              key={i}
              title={`Sector ${ms.sector_index + 1}: ${ms.faster_driver ?? 'equal'}`}
              style={{
                flex: 1,
                background: ms.faster_driver === d1 ? c1 : ms.faster_driver === d2 ? c2 : '#333',
                opacity: ms.faster_driver ? 0.85 : 0.3,
                borderRadius: 1,
              }}
            />
          ))}
        </div>
        <div className="flex items-center gap-5 mt-2">
          {[{ code: d1, color: c1 }, { code: d2, color: c2 }].map(({ code, color }) => {
            const count = data.mini_sectors.filter((ms) => ms.faster_driver === code).length;
            const pct = data.mini_sectors.length > 0 ? Math.round((count / data.mini_sectors.length) * 100) : 0;
            return (
              <div key={code} className="flex items-center gap-1.5">
                <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
                <span className="mono text-2xs" style={{ color }}>
                  {code}: {count} ({pct}%)
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default DriverComparison;
