import type { ReplayDriver } from './types';

// -----------------------------------------------------------------------
// Bar pips helper
// -----------------------------------------------------------------------

interface PipsProps {
  filled: number; // 0–5
  color: string;
  emptyColor?: string;
}

const PIP_HEIGHTS = [6, 9, 12, 15, 18];

function Pips({ filled, color, emptyColor = '#2A2A2A' }: PipsProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2 }}>
      {PIP_HEIGHTS.map((h, i) => (
        <div
          key={i}
          style={{
            width: 4,
            height: h,
            borderRadius: 1,
            background: i < filled ? color : emptyColor,
          }}
        />
      ))}
    </div>
  );
}

function mapToPips(value: number, min: number, max: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  const ratio = (clamped - min) / (max - min);
  return Math.round(ratio * 5);
}

// -----------------------------------------------------------------------
// Single driver telemetry row
// -----------------------------------------------------------------------

interface DriverTelRowProps {
  driver: ReplayDriver;
  year: number;
}

function DriverTelRow({ driver, year }: DriverTelRowProps) {
  const throttlePips = mapToPips(driver.throttle, 0, 100);
  const brakePips = driver.brake ? 5 : 0;
  const rpmPips = mapToPips(driver.rpm, 0, 15000);
  const rpmDisplay =
    driver.rpm >= 10000
      ? `${(driver.rpm / 1000).toFixed(1)}k`
      : `${(driver.rpm / 1000).toFixed(1)}k`;
  const drsActive = driver.drs >= 10;
  const showDrs = year < 2026;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        borderBottom: '1px solid #1A1A1A',
      }}
    >
      {/* Driver code */}
      <div style={{ width: 30, flexShrink: 0 }}>
        <span
          style={{
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 'bold',
            color: driver.color,
          }}
        >
          {driver.abbr}
        </span>
      </div>

      {/* Speed */}
      <div style={{ width: 36, flexShrink: 0, textAlign: 'right' }}>
        <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono, monospace', color: '#E0E0E0', fontWeight: 'bold' }}>
          {Math.round(driver.speed)}
        </span>
        <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#666', marginLeft: 2 }}>
          km/h
        </span>
      </div>

      {/* Throttle */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#666', letterSpacing: '0.06em' }}>
          THR
        </span>
        <Pips filled={throttlePips} color="#22C55E" />
      </div>

      {/* Brake */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#666', letterSpacing: '0.06em' }}>
          BRK
        </span>
        <Pips filled={brakePips} color="#E10600" />
      </div>

      {/* Gear */}
      <div style={{ width: 20, flexShrink: 0, textAlign: 'center' }}>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#AAA' }}>
          G{driver.gear}
        </span>
      </div>

      {/* RPM */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#888' }}>
          {rpmDisplay}
        </span>
        <Pips filled={rpmPips} color="#F59E0B" />
      </div>

      {/* DRS */}
      {showDrs && (
        <div style={{ flexShrink: 0 }}>
          <span
            style={{
              fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              fontWeight: 'bold',
              letterSpacing: '0.06em',
              padding: '1px 4px',
              borderRadius: 2,
              border: `1px solid ${drsActive ? '#22C55E' : '#444'}`,
              color: drsActive ? '#22C55E' : '#444',
            }}
          >
            DRS
          </span>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// TelemetryBar
// -----------------------------------------------------------------------

interface TelemetryBarProps {
  drivers: ReplayDriver[];
  selectedDrivers: string[];
  year: number;
}

export default function TelemetryBar({ drivers, selectedDrivers, year }: TelemetryBarProps) {
  const selected = drivers.filter((d) => selectedDrivers.includes(d.abbr));

  if (selected.length === 0) return null;

  return (
    <div
      style={{
        background: 'rgba(13,13,13,0.92)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid #1E1E1E',
        borderRadius: 6,
        overflow: 'hidden',
        minWidth: 320,
      }}
    >
      {selected.map((driver) => (
        <DriverTelRow key={driver.abbr} driver={driver} year={year} />
      ))}
    </div>
  );
}
