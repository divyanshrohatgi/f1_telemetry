import { useEffect, useRef, useState, useCallback } from 'react';
import { drawTrack, drawDrivers, createCoordTransform } from '../../utils/trackRenderer';
import type { TrackPoint, DriverMarker } from '../../utils/trackRenderer';
import type { ReplayDriver, BattleZone } from './types';

interface TrackCanvasProps {
  trackPoints: TrackPoint[];
  rotation: number;
  drivers: ReplayDriver[];
  selectedDrivers: string[];
  trackStatus: string;
  playbackSpeed: number;
  showDriverNames: 'all' | 'selected' | 'none';
  // Advanced features
  battleZones?: BattleZone[];
  overtakeFlashes?: Map<string, 'gained' | 'lost'>;
  fastestLapFlash?: { abbr: string; expiry: number } | null;
  focusedDriver?: string | null;
}

const BASE_INTERP_MS = 750;
const RING_DURATION_MS = 1400;

interface PosEntry {
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  startTime: number;
  duration: number;
}

const TRACK_STATUS_OVERLAYS: Record<string, { bg: string; color: string; label: string }> = {
  sc:     { bg: '#F5C518', color: '#000000', label: 'SAFETY CAR' },
  vsc:    { bg: '#F5A500', color: '#000000', label: 'VIRTUAL SC' },
  yellow: { bg: '#F5C518', color: '#000000', label: 'YELLOW FLAG' },
  red:    { bg: '#E10600', color: '#FFFFFF', label: 'RED FLAG' },
};

const COMPOUND_COLORS: Record<string, string> = {
  S: '#FF3333', SOFT: '#FF3333',
  M: '#FFC906', MEDIUM: '#FFC906',
  H: '#CCCCCC', HARD: '#CCCCCC',
  I: '#39B54A', INTER: '#39B54A',
  W: '#0072C6', WET: '#0072C6',
};

function compoundLetter(c: string | null): string {
  if (!c) return '?';
  const u = c.toUpperCase();
  if (u === 'SOFT' || u === 'S') return 'S';
  if (u === 'MEDIUM' || u === 'M') return 'M';
  if (u === 'HARD' || u === 'H') return 'H';
  if (u.startsWith('INTER') || u === 'I') return 'I';
  if (u === 'WET' || u === 'W') return 'W';
  return u[0] ?? '?';
}

export default function TrackCanvas({
  trackPoints,
  rotation,
  drivers,
  selectedDrivers,
  trackStatus,
  playbackSpeed,
  showDriverNames,
  battleZones,
  overtakeFlashes,
  fastestLapFlash,
  focusedDriver,
}: TrackCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const posRef = useRef<Map<string, PosEntry>>(new Map());
  const driversRef = useRef<ReplayDriver[]>([]);
  const trackStatusRef = useRef(trackStatus);
  const speedRef = useRef(playbackSpeed);
  const showNamesRef = useRef(showDriverNames);
  const selectedRef = useRef(selectedDrivers);
  const trackPointsRef = useRef(trackPoints);
  const rotationRef = useRef(rotation);
  const battleZonesRef = useRef(battleZones ?? []);
  const overtakeFlashesRef = useRef(overtakeFlashes ?? new Map<string, 'gained' | 'lost'>());
  const fastestLapFlashRef = useRef(fastestLapFlash ?? null);
  const focusedDriverRef = useRef(focusedDriver ?? null);

  // Overtake ring animation: abbr → startTime (performance.now())
  const overtakeRingStartsRef = useRef<Map<string, number>>(new Map());

  // Hover state
  const [hoveredAbbr, setHoveredAbbr] = useState<string | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);
  const hoveredAbbrRef = useRef<string | null>(null);

  useEffect(() => {
    trackStatusRef.current = trackStatus;
    speedRef.current = playbackSpeed;
    showNamesRef.current = showDriverNames;
    selectedRef.current = selectedDrivers;
    trackPointsRef.current = trackPoints;
    rotationRef.current = rotation;
    battleZonesRef.current = battleZones ?? [];
    fastestLapFlashRef.current = fastestLapFlash ?? null;
    focusedDriverRef.current = focusedDriver ?? null;
  }, [trackStatus, playbackSpeed, showDriverNames, selectedDrivers, trackPoints, rotation, battleZones, fastestLapFlash, focusedDriver]);

  // Track overtake ring animations
  useEffect(() => {
    if (!overtakeFlashes) return;
    overtakeFlashesRef.current = overtakeFlashes;
    const now = performance.now();
    overtakeFlashes.forEach((_, abbr) => {
      if (!overtakeRingStartsRef.current.has(abbr)) {
        overtakeRingStartsRef.current.set(abbr, now);
      }
    });
    // Remove rings for drivers no longer flashing
    overtakeRingStartsRef.current.forEach((_, abbr) => {
      if (!overtakeFlashes.has(abbr)) {
        overtakeRingStartsRef.current.delete(abbr);
      }
    });
  }, [overtakeFlashes]);

  useEffect(() => {
    const active = drivers.filter((d) => !(d.retired && d.x === 0 && d.y === 0));
    driversRef.current = active;

    const now = performance.now();
    const duration = BASE_INTERP_MS / Math.max(speedRef.current, 0.25);

    for (const drv of active) {
      const entry = posRef.current.get(drv.abbr);
      if (!entry) {
        posRef.current.set(drv.abbr, {
          prevX: drv.x,
          prevY: drv.y,
          targetX: drv.x,
          targetY: drv.y,
          startTime: now,
          duration,
        });
      } else {
        const elapsed = now - entry.startTime;
        const t = Math.min(elapsed / entry.duration, 1);
        entry.prevX = entry.prevX + (entry.targetX - entry.prevX) * t;
        entry.prevY = entry.prevY + (entry.targetY - entry.prevY) * t;
        entry.targetX = drv.x;
        entry.targetY = drv.y;
        entry.startTime = now;
        entry.duration = duration;
      }
    }
  }, [drivers]);

  // Animation loop
  useEffect(() => {
    let running = true;
    let animationFrameId: number;

    const animate = () => {
      if (!running) return;

      const canvas = canvasRef.current;
      if (!canvas) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      const dpr = window.devicePixelRatio || 1;
      const { w, h } = sizeRef.current;

      if (w === 0 || h === 0) {
        animationFrameId = requestAnimationFrame(animate);
        return;
      }

      if (
        canvas.width !== Math.round(w * dpr) ||
        canvas.height !== Math.round(h * dpr)
      ) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const tp = trackPointsRef.current;
      const rot = rotationRef.current;
      const now = performance.now();

      // Build shared coordinate transform for extras
      const transform = tp.length > 0 ? createCoordTransform(tp, w, h, rot) : null;

      // Compute interpolated positions for all drivers
      const curr = driversRef.current;
      const interpolated: DriverMarker[] = curr.map((drv) => {
        const entry = posRef.current.get(drv.abbr);
        let x = drv.x;
        let y = drv.y;
        if (entry) {
          const elapsed = now - entry.startTime;
          const t = Math.min(elapsed / entry.duration, 1);
          x = entry.prevX + (entry.targetX - entry.prevX) * t;
          y = entry.prevY + (entry.targetY - entry.prevY) * t;
        }
        return {
          abbr: drv.abbr,
          x,
          y,
          color: drv.color,
          position: drv.position,
          retired: drv.retired,
          in_pit: drv.in_pit,
        };
      });

      // ── Focus mode: apply zoom transform centered on focused driver ──────
      const focAbbr = focusedDriverRef.current;
      let focusApplied = false;
      if (focAbbr && transform) {
        const focMarker = interpolated.find((m) => m.abbr === focAbbr);
        if (focMarker) {
          const [sx, sy] = transform({ x: focMarker.x, y: focMarker.y });
          const zoom = 2.5;
          ctx.save();
          ctx.translate(w / 2 - zoom * sx, h / 2 - zoom * sy);
          ctx.scale(zoom, zoom);
          focusApplied = true;
        }
      }

      // ── Draw track ────────────────────────────────────────────────────────
      drawTrack(ctx, tp, w, h, rot, trackStatusRef.current);

      // ── Fastest lap flash: purple track overlay ───────────────────────────
      const flFlash = fastestLapFlashRef.current;
      if (flFlash && tp.length > 0) {
        const remaining = flFlash.expiry - Date.now();
        if (remaining > 0) {
          const opacity = Math.min(1, remaining / 3000) * 0.65;
          const flTransform = createCoordTransform(tp, w, h, rot);
          ctx.save();
          ctx.globalAlpha = opacity;
          ctx.beginPath();
          ctx.strokeStyle = '#7B2FBE';
          ctx.lineWidth = 14;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          const [startX, startY] = flTransform(tp[0]);
          ctx.moveTo(startX, startY);
          for (let i = 1; i < tp.length; i++) {
            const [px, py] = flTransform(tp[i]);
            ctx.lineTo(px, py);
          }
          ctx.closePath();
          ctx.stroke();
          ctx.restore();
        }
      }


      // ── Draw drivers ──────────────────────────────────────────────────────
      drawDrivers(
        ctx,
        interpolated,
        tp,
        w,
        h,
        rot,
        selectedRef.current,
        showNamesRef.current,
        hoveredAbbrRef.current,
      );

      // ── Overtake rings ────────────────────────────────────────────────────
      if (transform) {
        overtakeRingStartsRef.current.forEach((startTime, abbr) => {
          const elapsed = now - startTime;
          if (elapsed > RING_DURATION_MS) {
            overtakeRingStartsRef.current.delete(abbr);
            return;
          }
          const t = elapsed / RING_DURATION_MS;
          const marker = interpolated.find((m) => m.abbr === abbr);
          if (!marker) return;
          const [sx, sy] = transform({ x: marker.x, y: marker.y });
          const direction = overtakeFlashesRef.current.get(abbr);
          const color = direction === 'gained' ? '#4ADE80' : '#F87171';
          ctx.save();
          ctx.globalAlpha = 1 - t;
          ctx.beginPath();
          ctx.arc(sx, sy, 8 + t * 22, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();
          ctx.restore();
        });
      }

      // Restore focus zoom
      if (focusApplied) ctx.restore();

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => {
      running = false;
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  // Resize observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    sizeRef.current = { w: rect.width, h: rect.height };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        sizeRef.current = {
          w: entry.contentRect.width,
          h: entry.contentRect.height,
        };
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Mouse hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const { w, h } = sizeRef.current;
    const tp = trackPointsRef.current;
    if (tp.length === 0 || w === 0 || h === 0) return;

    const transform = createCoordTransform(tp, w, h, rotationRef.current);
    const now = performance.now();

    let closest: string | null = null;
    let closestDist = 16; // px hit radius

    for (const drv of driversRef.current) {
      if (drv.retired) continue;
      const entry = posRef.current.get(drv.abbr);
      if (!entry) continue;

      const elapsed = now - entry.startTime;
      const t = Math.min(elapsed / entry.duration, 1);
      const ix = entry.prevX + (entry.targetX - entry.prevX) * t;
      const iy = entry.prevY + (entry.targetY - entry.prevY) * t;
      const [sx, sy] = transform({ x: ix, y: iy });
      const dist = Math.sqrt((sx - mouseX) ** 2 + (sy - mouseY) ** 2);

      if (dist < closestDist) {
        closestDist = dist;
        closest = drv.abbr;
      }
    }

    hoveredAbbrRef.current = closest;
    setHoveredAbbr(closest);
    setTooltipPos(closest ? { x: mouseX, y: mouseY } : null);
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoveredAbbrRef.current = null;
    setHoveredAbbr(null);
    setTooltipPos(null);
  }, []);

  const overlay = TRACK_STATUS_OVERLAYS[trackStatus?.toLowerCase()] ?? null;
  const hoveredDriver = hoveredAbbr ? driversRef.current.find((d) => d.abbr === hoveredAbbr) : null;

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      style={{ width: '100%', height: '100%', backgroundColor: 'transparent', position: 'relative' }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />

      {/* Track status badge */}
      {overlay && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            left: '50%',
            transform: 'translateX(-50%)',
            background: overlay.bg,
            color: overlay.color,
            padding: '5px 14px',
            borderRadius: 4,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 'bold',
            fontSize: 12,
            letterSpacing: '0.12em',
            pointerEvents: 'none',
            userSelect: 'none',
            boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
          }}
        >
          {overlay.label}
        </div>
      )}

      {/* Focus mode indicator */}
      {focusedDriver && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            background: '#7B2FBE',
            color: '#fff',
            padding: '3px 10px',
            borderRadius: 3,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 9,
            fontWeight: 'bold',
            letterSpacing: '0.1em',
            pointerEvents: 'none',
          }}
        >
          FOCUS: {focusedDriver}
        </div>
      )}

      {/* Hover tooltip */}
      {hoveredDriver && tooltipPos && (
        <div
          style={{
            position: 'absolute',
            left: tooltipPos.x + 14,
            top: tooltipPos.y - 10,
            background: 'rgba(10,10,10,0.95)',
            border: `1px solid ${hoveredDriver.color}66`,
            borderRadius: 6,
            padding: '6px 10px',
            pointerEvents: 'none',
            userSelect: 'none',
            minWidth: 130,
            boxShadow: '0 4px 16px rgba(0,0,0,0.7)',
            zIndex: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
            <div
              style={{
                width: 3,
                height: 20,
                borderRadius: 2,
                background: hoveredDriver.color,
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: 13,
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 'bold',
                color: '#fff',
              }}
            >
              {hoveredDriver.abbr}
            </span>
            {hoveredDriver.position !== null && (
              <span
                style={{
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#888',
                  marginLeft: 'auto',
                }}
              >
                P{hoveredDriver.position}
              </span>
            )}
          </div>

          {hoveredDriver.compound && (
            <div
              style={{
                fontSize: 10,
                fontFamily: 'JetBrains Mono, monospace',
                color: COMPOUND_COLORS[compoundLetter(hoveredDriver.compound)] ?? '#888',
                marginBottom: 3,
              }}
            >
              {compoundLetter(hoveredDriver.compound)} · {hoveredDriver.tyre_life ?? '?'} laps
            </div>
          )}

          {hoveredDriver.speed > 0 && (
            <div
              style={{
                fontSize: 10,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#AAA',
              }}
            >
              {Math.round(hoveredDriver.speed)} km/h
            </div>
          )}

          {hoveredDriver.in_pit && (
            <div
              style={{
                fontSize: 9,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#FFC906',
                fontWeight: 'bold',
                letterSpacing: '0.08em',
                marginTop: 3,
              }}
            >
              PIT LANE
            </div>
          )}
        </div>
      )}
    </div>
  );
}
