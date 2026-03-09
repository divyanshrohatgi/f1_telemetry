/**
 * TelemetryPlot — D3-based multi-channel telemetry viewer with synced crosshair.
 *
 * All channels share the same X-axis (distance in metres).
 * Hovering on any channel shows a synchronized vertical crosshair on ALL channels.
 * Channels are driven by configuration — adding a new channel requires only a config update.
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import * as d3 from 'd3';
import type { TelemetryPoint, TelemetryResponse } from '../../types/f1.types';
import { formatLapTime } from '../../utils/formatting';
import EmptyState from '../common/EmptyState';
import { PanelSkeleton } from '../common/LoadingSpinner';

// ---------------------------------------------------------------------------
// Channel configuration — add new channels here, component renders them all
// ---------------------------------------------------------------------------
interface TelemetryChannel {
  key: keyof TelemetryPoint;
  label: string;
  unit: string;
  color: string;
  height: number;       // pixel height of this channel's chart
  yDomain?: [number, number];
  format?: (v: number | boolean | null) => string;
  isBinary?: boolean;   // renders as on/off fill, not a line
}

const CHANNELS: TelemetryChannel[] = [
  {
    key: 'speed',
    label: 'SPEED',
    unit: 'km/h',
    color: '#FFFFFF',
    height: 120,
    format: (v) => `${Math.round(v as number)} km/h`,
  },
  {
    key: 'throttle',
    label: 'THROTTLE',
    unit: '%',
    color: '#00FF87',
    height: 80,
    yDomain: [0, 100],
    format: (v) => `${Math.round(v as number)}%`,
  },
  {
    key: 'brake',
    label: 'BRAKE',
    unit: '',
    color: '#FF4444',
    height: 40,
    yDomain: [0, 1],
    isBinary: true,
    format: (v) => ((v as boolean) ? 'ON' : 'OFF'),
  },
  {
    key: 'gear',
    label: 'GEAR',
    unit: '',
    color: '#888888',
    height: 60,
    yDomain: [0, 8],
    format: (v) => `${v}`,
  },
  {
    key: 'rpm',
    label: 'RPM',
    unit: 'rpm',
    color: '#FFC906',
    height: 80,
    format: (v) => `${Math.round(v as number).toLocaleString()}`,
  },
  {
    key: 'drs',
    label: 'DRS',
    unit: '',
    color: '#39B54A',
    height: 40,
    yDomain: [0, 14],
    isBinary: true,
    format: (v) => ((v as number) >= 10 ? 'OPEN' : 'CLOSED'),
  },
];

const MARGIN = { left: 54, right: 16, top: 4, bottom: 24 };

interface TelemetryPlotProps {
  telemetry: TelemetryResponse | null;
  isLoading: boolean;
  driverColor: string;
  onCrosshairMove?: (distance: number | null) => void;
}

interface CrosshairState {
  distance: number;
  x: number;
  values: Record<string, number | boolean | null>;
}

const TelemetryPlot: React.FC<TelemetryPlotProps> = ({ telemetry, isLoading, driverColor, onCrosshairMove }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRefs = useRef<(SVGSVGElement | null)[]>([]);
  const [crosshair, setCrosshair] = useState<CrosshairState | null>(null);
  const [containerWidth, setContainerWidth] = useState(800);

  // Observe container width for responsive sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width && width > 0) setContainerWidth(width);
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  const chartWidth = containerWidth - MARGIN.left - MARGIN.right;

  // Build D3 x-scale (shared)
  const xMax = telemetry?.lap_distance ?? 1;
  const xScale = d3.scaleLinear()
    .domain([0, xMax])
    .range([0, chartWidth]);

  // Handle crosshair movement across any channel
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!telemetry) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - MARGIN.left;
      if (mouseX < 0 || mouseX > chartWidth) {
        setCrosshair(null);
        return;
      }

      const distance = xScale.invert(mouseX);

      // Bisect to find nearest point
      const bisect = d3.bisectLeft(
        telemetry.points.map((p) => p.distance),
        distance
      );
      const nearestIdx = Math.min(bisect, telemetry.points.length - 1);
      const pt = telemetry.points[nearestIdx];
      if (!pt) return;

      // Extract all channel values at this point
      const values: Record<string, number | boolean | null> = {};
      CHANNELS.forEach((ch) => {
        values[ch.key as string] = pt[ch.key] as number | boolean | null;
      });

      const state = { distance: pt.distance, x: xScale(pt.distance), values };
      setCrosshair(state);
      onCrosshairMove?.(pt.distance);
    },
    [telemetry, xScale, chartWidth, onCrosshairMove]
  );

  const handleMouseLeave = useCallback(() => {
    setCrosshair(null);
    onCrosshairMove?.(null);
  }, [onCrosshairMove]);

  if (isLoading) return <PanelSkeleton rows={4} />;
  if (!telemetry || !telemetry.points.length) {
    return (
      <EmptyState
        message="No telemetry data"
        subMessage="Select a lap from the Lap Times tab or use Fastest Lap"
      />
    );
  }

  return (
    <div ref={containerRef} className="w-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0">
        <div className="label">
          TELEMETRY — LAP {telemetry.lap_number}
          {telemetry.lap_time && (
            <span className="mono ml-3" style={{ color: driverColor }}>
              {formatLapTime(telemetry.lap_time)}
            </span>
          )}
        </div>
        {crosshair && (
          <div className="mono text-2xs" style={{ color: '#888' }}>
            {Math.round(crosshair.distance)} m
          </div>
        )}
      </div>

      {/* Crosshair tooltip */}
      {crosshair && (
        <div
          className="absolute z-10 pointer-events-none"
          style={{
            right: 24,
            top: 40,
            background: '#1E1E1E',
            border: '1px solid #333',
            borderRadius: 4,
            padding: '8px 12px',
            minWidth: 160,
          }}
        >
          <div className="label mb-1.5">{Math.round(crosshair.distance)} m</div>
          {CHANNELS.map((ch) => {
            const val = crosshair.values[ch.key as string];
            return (
              <div key={ch.key as string} className="flex justify-between gap-4 mb-0.5">
                <span className="text-2xs" style={{ color: '#555' }}>{ch.label}</span>
                <span className="mono text-2xs" style={{ color: ch.color }}>
                  {ch.format ? ch.format(val) : val != null ? String(val) : '—'}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Channel charts */}
      <div className="relative">
        {CHANNELS.map((channel, idx) => {
          // Build y-scale for this channel
          const values = telemetry.points
            .map((p) => {
              const v = p[channel.key];
              if (channel.isBinary) return typeof v === 'boolean' ? (v ? 1 : 0) : (v as number) >= 10 ? 1 : 0;
              return v as number;
            })
            .filter((v) => v != null && !isNaN(v));

          let yMin = channel.yDomain?.[0] ?? (values.length ? d3.min(values)! : 0);
          let yMax = channel.yDomain?.[1] ?? (values.length ? d3.max(values)! : 1);

          // Small padding
          const pad = (yMax - yMin) * 0.05;
          if (!channel.yDomain) {
            yMin -= pad;
            yMax += pad;
          }

          const yScale = d3.scaleLinear()
            .domain([yMin, yMax])
            .range([channel.height - MARGIN.top - MARGIN.bottom, 0]);

          // Build the line/area path
          const processedPoints = telemetry.points
            .map((p) => {
              const rawVal = p[channel.key];
              let numVal: number;

              if (channel.isBinary) {
                numVal = typeof rawVal === 'boolean' ? (rawVal ? 1 : 0) : (rawVal as number) >= 10 ? 1 : 0;
              } else {
                numVal = rawVal as number;
              }

              return {
                distance: p.distance,
                value: numVal,
              };
            })
            .filter((p) => p.value != null && !isNaN(p.value));

          const lineGen = d3.line<{ distance: number; value: number }>()
            .x((d) => xScale(d.distance))
            .y((d) => yScale(d.value))
            .curve(channel.isBinary ? d3.curveStepAfter : d3.curveCatmullRom.alpha(0.5))
            .defined((d) => d.value != null && !isNaN(d.value));

          const areaGen = d3.area<{ distance: number; value: number }>()
            .x((d) => xScale(d.distance))
            .y0(yScale(yMin))
            .y1((d) => yScale(d.value))
            .curve(channel.isBinary ? d3.curveStepAfter : d3.curveCatmullRom.alpha(0.5))
            .defined((d) => d.value != null && !isNaN(d.value));

          const linePath = lineGen(processedPoints) ?? '';
          const areaPath = areaGen(processedPoints) ?? '';

          const isLastChannel = idx === CHANNELS.length - 1;

          return (
            <div
              key={channel.key as string}
              style={{
                borderBottom: isLastChannel ? 'none' : '1px solid #2A2A2A',
                position: 'relative',
              }}
            >
              <svg
                ref={(el) => { svgRefs.current[idx] = el; }}
                width="100%"
                height={channel.height}
                onMouseMove={(e) => handleMouseMove(e)}
                onMouseLeave={handleMouseLeave}
                style={{ display: 'block', cursor: 'crosshair' }}
              >
                <g transform={`translate(${MARGIN.left},${MARGIN.top})`}>
                  {/* Area fill */}
                  <path
                    d={areaPath}
                    fill={channel.color}
                    fillOpacity={channel.isBinary ? 0.3 : 0.06}
                  />

                  {/* Line */}
                  <path
                    d={linePath}
                    fill="none"
                    stroke={channel.color}
                    strokeWidth={channel.isBinary ? 1.5 : 2}
                    strokeOpacity={0.9}
                  />

                  {/* Y-axis gridlines */}
                  {yScale.ticks(3).map((tick) => (
                    <line
                      key={tick}
                      x1={0}
                      x2={chartWidth}
                      y1={yScale(tick)}
                      y2={yScale(tick)}
                      stroke="#2A2A2A"
                      strokeWidth={1}
                    />
                  ))}

                  {/* Y-axis ticks */}
                  {yScale.ticks(3).map((tick) => (
                    <text
                      key={tick}
                      x={-6}
                      y={yScale(tick) + 3}
                      textAnchor="end"
                      style={{
                        fill: '#555',
                        fontSize: 9,
                        fontFamily: 'JetBrains Mono',
                      }}
                    >
                      {Math.round(tick)}
                    </text>
                  ))}

                  {/* Crosshair vertical line */}
                  {crosshair && (
                    <line
                      x1={crosshair.x}
                      x2={crosshair.x}
                      y1={0}
                      y2={channel.height - MARGIN.top - MARGIN.bottom}
                      stroke="rgba(255,255,255,0.25)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                      pointerEvents="none"
                    />
                  )}

                  {/* Crosshair dot */}
                  {crosshair && crosshair.values[channel.key as string] != null && (
                    <circle
                      cx={crosshair.x}
                      cy={yScale(
                        channel.isBinary
                          ? ((crosshair.values[channel.key as string] as boolean)
                              ? 1
                              : (crosshair.values[channel.key as string] as number) >= 10
                              ? 1
                              : 0)
                          : (crosshair.values[channel.key as string] as number)
                      )}
                      r={3}
                      fill={channel.color}
                      pointerEvents="none"
                    />
                  )}

                  {/* X-axis (last channel only) */}
                  {isLastChannel && (
                    <>
                      <line
                        x1={0}
                        x2={chartWidth}
                        y1={channel.height - MARGIN.top - MARGIN.bottom}
                        y2={channel.height - MARGIN.top - MARGIN.bottom}
                        stroke="#333"
                      />
                      {xScale.ticks(10).map((tick) => (
                        <g key={tick} transform={`translate(${xScale(tick)},${channel.height - MARGIN.top - MARGIN.bottom})`}>
                          <text
                            y={14}
                            textAnchor="middle"
                            style={{ fill: '#555', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                          >
                            {tick >= 1000 ? `${(tick / 1000).toFixed(1)}k` : tick}
                          </text>
                        </g>
                      ))}
                      <text
                        x={chartWidth / 2}
                        y={channel.height - MARGIN.top - MARGIN.bottom + 20}
                        textAnchor="middle"
                        style={{ fill: '#555', fontSize: 9, fontFamily: 'JetBrains Mono' }}
                      >
                        DISTANCE (m)
                      </text>
                    </>
                  )}
                </g>

                {/* Channel label (left side) */}
                <text
                  x={8}
                  y={channel.height / 2}
                  style={{
                    fill: channel.color,
                    fontSize: 9,
                    fontFamily: 'JetBrains Mono',
                    fontWeight: 'bold',
                    letterSpacing: '0.1em',
                  }}
                  dominantBaseline="middle"
                  transform={`rotate(-90, 8, ${channel.height / 2})`}
                >
                  {channel.label}
                </text>
              </svg>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TelemetryPlot;
