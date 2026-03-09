/**
 * F1 data formatting utilities.
 */

/**
 * Format a lap time in seconds to F1 display format: 1:23.456
 * Minutes are shown in normal weight; milliseconds are smaller.
 */
export function formatLapTime(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return '—';

  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  const secStr = secs.toFixed(3).padStart(6, '0');

  if (mins > 0) {
    return `${mins}:${secStr}`;
  }
  return secStr;
}

/**
 * Format a delta time with sign: +1.234s or -0.456s
 */
export function formatDelta(seconds: number | null | undefined): string {
  if (seconds == null || isNaN(seconds)) return '—';
  const sign = seconds >= 0 ? '+' : '';
  return `${sign}${seconds.toFixed(3)}s`;
}

/**
 * Returns the CSS color class for a delta value.
 */
export function getDeltaColor(delta: number | null | undefined): string {
  if (delta == null) return '#F0F0F0';
  if (delta < 0) return 'var(--delta-positive)';   // faster = green
  if (delta > 0) return 'var(--delta-negative)';   // slower = red
  return '#F0F0F0';
}

/**
 * Format temperature in Celsius.
 */
export function formatTemp(celsius: number | null | undefined): string {
  if (celsius == null) return '—';
  return `${celsius.toFixed(1)}°C`;
}

/**
 * Format speed in km/h.
 */
export function formatSpeed(kph: number | null | undefined): string {
  if (kph == null) return '—';
  return `${Math.round(kph)} km/h`;
}

/**
 * Format distance in metres or kilometres.
 */
export function formatDistance(metres: number | null | undefined): string {
  if (metres == null) return '—';
  if (metres >= 1000) return `${(metres / 1000).toFixed(2)} km`;
  return `${Math.round(metres)} m`;
}

/**
 * Format RPM.
 */
export function formatRPM(rpm: number | null | undefined): string {
  if (rpm == null) return '—';
  return `${Math.round(rpm).toLocaleString()} rpm`;
}

/**
 * Format a session type abbreviation to a readable label.
 */
export function formatSessionType(type: string): string {
  const map: Record<string, string> = {
    FP1: 'Practice 1',
    FP2: 'Practice 2',
    FP3: 'Practice 3',
    Q: 'Qualifying',
    SQ: 'Sprint Qualifying',
    SS: 'Sprint Shootout',
    R: 'Race',
    S: 'Sprint',
  };
  return map[type] ?? type;
}

/**
 * Truncate a name to 3-letter code if needed.
 */
export function driverCode(code: string): string {
  return code.toUpperCase().slice(0, 3);
}

/**
 * Parse DRS integer to boolean (F1 encodes DRS as 0/8/10/12/14).
 */
export function drsActive(drs: number | null | undefined): boolean {
  if (drs == null) return false;
  return drs >= 10;
}
