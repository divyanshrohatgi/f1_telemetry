export interface TrackPoint {
  x: number;
  y: number;
}

export interface DriverMarker {
  abbr: string;
  x: number;
  y: number;
  color: string;
  position: number | null;
  retired?: boolean;
  in_pit?: boolean;
}

const TRACK_STATUS_COLORS: Record<string, string> = {
  green: "#3A3A4A",
  yellow: "#F5C518",
  sc: "#F5C518",
  vsc: "#F5C518",
  red: "#E10600",
};

const PAD_X = 40;
const PAD_TOP = 60;
const PAD_BOTTOM = 90;

// ---------------------------------------------------------------------------
// Shared coordinate transform — used by both drawTrack/drawDrivers and
// the hover hit-test in TrackCanvas.tsx
// ---------------------------------------------------------------------------

export type CoordTransform = (point: { x: number; y: number }) => [number, number];

export function createCoordTransform(
  trackPoints: TrackPoint[],
  width: number,
  height: number,
  rotation: number,
): CoordTransform {
  const w = width - PAD_X * 2;
  const h = height - PAD_TOP - PAD_BOTTOM;

  const rad = (rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const cx = 0.5;
  const cy = 0.5;

  const rotated = trackPoints.map((p) => {
    const dx = p.x - cx;
    const dy = p.y - cy;
    return { x: dx * cos - dy * sin + cx, y: dx * sin + dy * cos + cy };
  });

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of rotated) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
  }

  const rangeX = maxX - minX || 1;
  const rangeY = maxY - minY || 1;
  const scale = Math.min(w / rangeX, h / rangeY);
  const offsetX = PAD_X + (w - rangeX * scale) / 2;
  const offsetY = PAD_TOP + (h - rangeY * scale) / 2;

  return (point) => {
    const dx = point.x - cx;
    const dy = point.y - cy;
    const rx = dx * cos - dy * sin + cx;
    const ry = dx * sin + dy * cos + cy;
    return [
      offsetX + (rx - minX) * scale,
      offsetY + (maxY - ry) * scale,
    ];
  };
}

// ---------------------------------------------------------------------------
// drawTrack
// ---------------------------------------------------------------------------

export function drawTrack(
  ctx: CanvasRenderingContext2D,
  points: TrackPoint[],
  width: number,
  height: number,
  rotation: number,
  trackStatus: string = "green",
) {
  if (points.length === 0) return;

  const transform = createCoordTransform(points, width, height, rotation);

  ctx.beginPath();
  ctx.strokeStyle = TRACK_STATUS_COLORS[trackStatus] || "#3A3A4A";
  ctx.lineWidth = 12;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const [sx, sy] = transform(points[0]);
  ctx.moveTo(sx, sy);
  for (let i = 1; i < points.length; i++) {
    const [px, py] = transform(points[i]);
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.strokeStyle = "#4A4A5A";
  ctx.lineWidth = 2;
  ctx.moveTo(sx, sy);
  for (let i = 1; i < points.length; i++) {
    const [px, py] = transform(points[i]);
    ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.stroke();

  // Start/finish line marker
  const [fx, fy] = transform(points[0]);
  const [nx, ny] = transform(points[1] ?? points[0]);
  const trackAngle = Math.atan2(ny - fy, nx - fx);
  const perpAngle = trackAngle + Math.PI / 2;
  const markerLen = 8;
  ctx.beginPath();
  ctx.moveTo(fx - Math.cos(perpAngle) * markerLen, fy - Math.sin(perpAngle) * markerLen);
  ctx.lineTo(fx + Math.cos(perpAngle) * markerLen, fy + Math.sin(perpAngle) * markerLen);
  ctx.strokeStyle = "#FFFFFF";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.stroke();
}

// ---------------------------------------------------------------------------
// drawDrivers
// ---------------------------------------------------------------------------

export function drawDrivers(
  ctx: CanvasRenderingContext2D,
  drivers: DriverMarker[],
  trackPoints: TrackPoint[],
  width: number,
  height: number,
  rotation: number,
  highlightedDrivers: string[],
  showNames: 'all' | 'selected' | 'none' = 'selected',
  hoveredDriver?: string | null,
): void {
  if (trackPoints.length === 0) return;

  const transform = createCoordTransform(trackPoints, width, height, rotation);

  for (const drv of drivers) {
    // Skip retired drivers entirely
    if (drv.retired) continue;

    const [sx, sy] = transform({ x: drv.x, y: drv.y });

    const isHighlighted = highlightedDrivers.includes(drv.abbr);
    const isHovered = drv.abbr === hoveredDriver;
    const isInPit = drv.in_pit === true;

    const radius = isHovered ? 12 : isHighlighted ? 10 : 7;

    ctx.save();

    if (isInPit) {
      ctx.globalAlpha = 0.4;
    }

    // Glow ring for highlighted/hovered
    if (isHighlighted || isHovered) {
      ctx.beginPath();
      ctx.arc(sx, sy, radius + 8, 0, Math.PI * 2);
      ctx.fillStyle = drv.color + (isHovered ? "50" : "30");
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(sx, sy, radius, 0, Math.PI * 2);
    ctx.fillStyle = drv.color;
    ctx.strokeStyle = isHighlighted || isHovered ? "#FFFFFF" : drv.color;
    ctx.lineWidth = isHighlighted || isHovered ? 1.5 : 1;
    ctx.fill();
    ctx.stroke();

    // Label logic
    const showLabel =
      showNames === 'all' ||
      (showNames === 'selected' && (isHighlighted || isHovered));

    if (showLabel) {
      const fontSize = isHighlighted || isHovered ? 12 : 10;
      ctx.font = `800 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.fillStyle = "#FFFFFF";
      ctx.textAlign = "center";
      ctx.globalAlpha = isInPit ? 0.4 : 1;
      ctx.fillText(drv.abbr, sx, sy - radius - 4);
    }

    ctx.restore();
  }
}
