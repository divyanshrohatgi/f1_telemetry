import { useRef, useEffect } from 'react';

interface Props {
  colors: string[];
  circuitPoints?: { x: number; y: number }[];
  rotation?: number;
}

export default function MiniTrackAnimation({ colors, circuitPoints, rotation = 0 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const cw = rect.width || 200;
    const ch = rect.height || 56;
    canvas.width = cw * dpr;
    canvas.height = ch * dpr;
    ctx.scale(dpr, dpr);

    // Build track points — use real circuit if provided, else deformed ellipse
    let trackPoints: [number, number][] = [];

    if (circuitPoints && circuitPoints.length > 10) {
      const numPoints = circuitPoints.length;
      const pad = 6;
      const rad = (rotation * Math.PI) / 180;
      const cos = Math.cos(rad), sin = Math.sin(rad);
      const rotated = circuitPoints.map(p => {
        const dx = p.x - 0.5, dy = p.y - 0.5;
        return { x: dx * cos - dy * sin + 0.5, y: dx * sin + dy * cos + 0.5 };
      });
      const xs = rotated.map(p => p.x);
      const ys = rotated.map(p => p.y);
      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const rx = maxX - minX || 1, ry = maxY - minY || 1;
      const scale = Math.min((cw - pad * 2) / rx, (ch - pad * 2) / ry);
      const ox = pad + ((cw - pad * 2) - rx * scale) / 2;
      const oy = pad + ((ch - pad * 2) - ry * scale) / 2;
      trackPoints = rotated.map(p => [
        ox + (p.x - minX) * scale,
        oy + (maxY - p.y) * scale,
      ]);
      // Downsample to ~120 points for smooth animation
      if (numPoints > 120) {
        const step = Math.ceil(numPoints / 120);
        trackPoints = trackPoints.filter((_, i) => i % step === 0);
      }
    } else {
      // Deformed ellipse fallback
      const cx = cw / 2, cy = ch / 2;
      const rx = cw * 0.38, ry = ch * 0.30;
      const n = 120;
      for (let i = 0; i < n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const wobble = Math.sin(angle * 3) * rx * 0.18;
        trackPoints.push([
          cx + (rx + wobble) * Math.cos(angle),
          cy + ry * Math.sin(angle),
        ]);
      }
    }

    const numPoints = trackPoints.length;
    const drivers = colors.map((color, i) => ({
      color,
      offset: i / colors.length,
      speed: 0.0025 + i * 0.0004,
    }));

    let animId: number;

    function draw() {
      ctx.clearRect(0, 0, cw, ch);

      // Track
      ctx.beginPath();
      ctx.moveTo(trackPoints[0][0], trackPoints[0][1]);
      for (const [x, y] of trackPoints) ctx.lineTo(x, y);
      ctx.closePath();
      ctx.strokeStyle = '#252525';
      ctx.lineWidth = 3;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Dots
      for (const drv of drivers) {
        drv.offset = (drv.offset + drv.speed) % 1;
        const idx = Math.floor(drv.offset * numPoints) % numPoints;
        const [dx, dy] = trackPoints[idx];
        ctx.beginPath();
        ctx.arc(dx, dy, 2.5, 0, Math.PI * 2);
        ctx.fillStyle = drv.color;
        ctx.fill();
      }

      animId = requestAnimationFrame(draw);
    }

    draw();
    return () => cancelAnimationFrame(animId);
  }, [colors, circuitPoints, rotation]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block' }}
    />
  );
}
