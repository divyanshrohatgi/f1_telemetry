/**
 * CircuitMap — shared SVG track layout component.
 * Used in both DriverComparison (coloured by faster driver) and TelemetryView (single colour).
 */

import React from 'react';
import type { CircuitPoint } from '../../types/f1.types';

interface CircuitMapProps {
  circuitPoints: CircuitPoint[];
  /** Rotation angle from FastF1 circuit_info, plus any user offset */
  circuitRotation?: number;
  /** Comparison mode: d1/d2 codes + their colors for segment coloring */
  d1?: string;
  d2?: string;
  c1?: string;
  c2?: string;
  /** Single-driver mode: all segments drawn in this color */
  trackColor?: string;
  sectorDistances?: number[];
  hoveredDistance?: number | null;
  lapDistance?: number;
  /** If provided, shows a rotate button */
  onRotate?: () => void;
}

const CircuitMap: React.FC<CircuitMapProps> = ({
  circuitPoints,
  circuitRotation = 0,
  d1,
  d2,
  c1,
  c2,
  trackColor,
  sectorDistances = [],
  hoveredDistance,
  lapDistance,
  onRotate,
}) => {
  if (!circuitPoints.length) {
    return (
      <div className="flex items-center justify-center" style={{ height: 180, color: '#333' }}>
        <span className="mono text-2xs">NO POSITION DATA</span>
      </div>
    );
  }

  // Apply rotation around center
  const angleRad = (circuitRotation * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const rotatedPoints = circuitRotation === 0 ? circuitPoints : circuitPoints.map((p) => {
    const cx = p.x - 0.5;
    const cy = p.y - 0.5;
    return { ...p, x: cx * cosA - cy * sinA + 0.5, y: cx * sinA + cy * cosA + 0.5 };
  });

  const W = 560;
  const H = 200;
  const PAD = 18;

  const xs = rotatedPoints.map((p) => p.x);
  const ys = rotatedPoints.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xRange = Math.max(xMax - xMin, 0.001);
  const yRange = Math.max(yMax - yMin, 0.001);

  const scale = Math.min((W - 2 * PAD) / xRange, (H - 2 * PAD) / yRange);
  const xOff = (W - xRange * scale) / 2;
  const yOff = (H - yRange * scale) / 2;

  const toSvg = (pt: { x: number; y: number }) => ({
    sx: xOff + (pt.x - xMin) * scale,
    sy: H - yOff - (pt.y - yMin) * scale,
  });

  // Segment coloring — use CSS var for equal so it adapts to light/dark
  const EQUAL_COLOR = 'var(--color-border)';

  const segColor = (faster: string | null): string => {
    if (trackColor) return trackColor;
    if (!faster) return EQUAL_COLOR;
    if (d1 && c1 && faster === d1) return c1;
    if (d2 && c2 && faster === d2) return c2;
    return EQUAL_COLOR;
  };

  type Segment = { pts: CircuitPoint[]; faster: string | null };
  const segments: Segment[] = [];
  if (rotatedPoints.length > 0) {
    let cur: Segment = { pts: [rotatedPoints[0]], faster: rotatedPoints[0].faster_driver };
    for (let i = 1; i < rotatedPoints.length; i++) {
      const pt = rotatedPoints[i];
      if (pt.faster_driver === cur.faster) {
        cur.pts.push(pt);
      } else {
        cur.pts.push(pt);
        segments.push(cur);
        cur = { pts: [pt], faster: pt.faster_driver };
      }
    }
    segments.push(cur);
  }

  const ptToPolyline = (pts: CircuitPoint[]) =>
    pts.map((p) => { const s = toSvg(p); return `${s.sx.toFixed(1)},${s.sy.toFixed(1)}`; }).join(' ');

  // Sector markers
  const sectorMarkers = sectorDistances.map((sd) => {
    const maxDist = circuitPoints[circuitPoints.length - 1]?.distance ?? 1;
    const idx = Math.min(Math.round((sd / maxDist) * (circuitPoints.length - 1)), circuitPoints.length - 1);
    const pt = circuitPoints[idx];
    return pt ? toSvg(pt) : null;
  });

  const startPt = circuitPoints[0] ? toSvg(circuitPoints[0]) : null;

  // Hover marker — must use rotatedPoints since toSvg() is built from rotated bounds
  let hoverMarker: { sx: number; sy: number } | null = null;
  if (hoveredDistance != null && lapDistance && rotatedPoints.length > 1) {
    const maxDist = circuitPoints[circuitPoints.length - 1]?.distance ?? lapDistance;
    const idx = Math.min(Math.round((hoveredDistance / maxDist) * (rotatedPoints.length - 1)), rotatedPoints.length - 1);
    const pt = rotatedPoints[Math.max(0, idx)];
    if (pt) hoverMarker = toSvg(pt);
  }

  const baseColor = trackColor ?? c1 ?? '#555';

  return (
    <div style={{ position: 'relative' }}>
      <div className="label mb-2">CIRCUIT MAP</div>

      {onRotate && (
        <button
          onClick={onRotate}
          className="absolute top-0 right-0 mono text-2xs px-2 py-1 rounded"
          style={{
            background: 'var(--color-elevated)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          ↻ ROTATE
        </button>
      )}

      <svg
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        style={{ overflow: 'visible', display: 'block' }}
      >
        {/* Grey background track */}
        <polyline
          points={rotatedPoints.map((p) => { const s = toSvg(p); return `${s.sx.toFixed(1)},${s.sy.toFixed(1)}`; }).join(' ')}
          fill="none"
          stroke="#222"
          strokeWidth={7}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Coloured segments */}
        {segments.map((seg, i) => (
          <polyline
            key={i}
            points={ptToPolyline(seg.pts)}
            fill="none"
            stroke={segColor(seg.faster)}
            strokeWidth={trackColor || seg.faster ? 3 : 2}
            strokeLinejoin="round"
            strokeLinecap="round"
            strokeOpacity={trackColor || seg.faster ? 0.85 : 0.35}
          />
        ))}

        {/* Sector boundary markers */}
        {sectorMarkers.map((m, i) =>
          m ? (
            <g key={i}>
              <circle cx={m.sx} cy={m.sy} r={4} fill="#0A0A0A" stroke="#888" strokeWidth={1.5} />
              <text x={m.sx + 6} y={m.sy + 4} style={{ fill: '#888', fontSize: 8, fontFamily: 'JetBrains Mono' }}>
                S{i + 2}
              </text>
            </g>
          ) : null
        )}

        {/* Start/Finish */}
        {startPt && (
          <rect x={startPt.sx - 3} y={startPt.sy - 5} width={6} height={10} fill="#FFFFFF" rx={1} />
        )}

        {/* Hover position marker */}
        {hoverMarker && (
          <g>
            <circle cx={hoverMarker.sx} cy={hoverMarker.sy} r={7} fill={baseColor} stroke="#000" strokeWidth={1.5} opacity={0.9} />
            <circle cx={hoverMarker.sx} cy={hoverMarker.sy} r={3} fill="#fff" />
          </g>
        )}
      </svg>

      {/* Legend — only in comparison mode */}
      {d1 && d2 && c1 && c2 && !trackColor && (
        <div className="flex items-center justify-center gap-5 mt-1">
          {[{ code: d1, color: c1 }, { code: d2, color: c2 }].map(({ code, color }) => (
            <div key={code} className="flex items-center gap-1.5">
              <div style={{ width: 14, height: 3, background: color, borderRadius: 2 }} />
              <span className="mono text-2xs" style={{ color }}>{code} faster</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <div style={{ width: 14, height: 3, background: 'var(--color-border)', borderRadius: 2 }} />
            <span className="mono text-2xs" style={{ color: 'var(--color-text-tertiary)' }}>equal</span>
          </div>
        </div>
      )}
    </div>
  );
};

export default CircuitMap;
