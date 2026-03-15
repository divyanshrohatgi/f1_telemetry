import { useEffect, useRef } from "react";
import { drawTrack, drawDrivers } from "../../utils/trackRenderer";
import type { TrackPoint, DriverMarker } from "../../utils/trackRenderer";

interface LiveTrackMapProps {
  trackPoints: TrackPoint[];
  rotation: number;
  trackStatus?: string;
  drivers: DriverMarker[];
  highlightedDrivers: string[];
  playbackSpeed?: number;
  showDriverNames?: boolean;
}

const BASE_INTERP_MS = 750;

interface PosEntry {
  prevX: number;
  prevY: number;
  targetX: number;
  targetY: number;
  startTime: number;
  duration: number;
}

export default function LiveTrackMap({ 
  trackPoints, 
  rotation, 
  trackStatus = "green", 
  drivers, 
  highlightedDrivers, 
  playbackSpeed = 1, 
  showDriverNames = true 
}: LiveTrackMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });

  const posRef = useRef<Map<string, PosEntry>>(new Map());
  const driversRef = useRef<DriverMarker[]>([]);
  const trackStatusRef = useRef(trackStatus);
  const speedRef = useRef(playbackSpeed);
  const showNamesRef = useRef<'all' | 'selected' | 'none'>(showDriverNames ? 'all' : 'none');

  useEffect(() => {
    trackStatusRef.current = trackStatus;
    speedRef.current = playbackSpeed;
    showNamesRef.current = showDriverNames ? 'all' : 'none';
  }, [trackStatus, playbackSpeed, showDriverNames]);

  useEffect(() => {
    driversRef.current = drivers;
    const now = performance.now();
    const duration = BASE_INTERP_MS / Math.max(speedRef.current, 0.25);

    for (const drv of drivers) {
      const entry = posRef.current.get(drv.abbr);
      if (!entry) {
        posRef.current.set(drv.abbr, {
          prevX: drv.x, prevY: drv.y,
          targetX: drv.x, targetY: drv.y,
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

  // Animation Loop
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

      const ctx = canvas.getContext("2d");
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

      if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      drawTrack(ctx, trackPoints, w, h, rotation, trackStatusRef.current);

      const now = performance.now();
      const curr = driversRef.current;
      const interpolated: DriverMarker[] = curr.map((drv) => {
        const entry = posRef.current.get(drv.abbr);
        if (!entry) return drv;

        const elapsed = now - entry.startTime;
        const t = Math.min(elapsed / entry.duration, 1);
        const x = entry.prevX + (entry.targetX - entry.prevX) * t;
        const y = entry.prevY + (entry.targetY - entry.prevY) * t;

        return { ...drv, x, y };
      });

      drawDrivers(ctx, interpolated, trackPoints, w, h, rotation, highlightedDrivers, showNamesRef.current);

      animationFrameId = requestAnimationFrame(animate);
    };

    animationFrameId = requestAnimationFrame(animate);
    return () => { 
      running = false; 
      cancelAnimationFrame(animationFrameId);
    };
  }, [trackPoints, rotation, highlightedDrivers]);

  // Resize Observer
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    sizeRef.current = { w: rect.width, h: rect.height };

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        sizeRef.current = { w: entry.contentRect.width, h: entry.contentRect.height };
      }
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', backgroundColor: 'transparent' }}>
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%' }} />
    </div>
  );
}
