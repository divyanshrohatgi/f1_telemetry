/**
 * StrategyViewer — horizontal stint timeline for all drivers.
 * Each driver row shows their stints as colored segments.
 */

import React, { useState, useEffect } from 'react';
import type { SessionMetadata, StrategyResponse, DriverStrategy, Stint } from '../../types/f1.types';
import { api } from '../../api/client';
import { getCompoundColor, getCompoundLabel } from '../../constants/compounds';
import EmptyState from '../common/EmptyState';
import { PanelSkeleton } from '../common/LoadingSpinner';

interface StrategyViewerProps {
  sessionMeta: SessionMetadata;
}

const StrategyViewer: React.FC<StrategyViewerProps> = ({ sessionMeta }) => {
  const [data, setData] = useState<StrategyResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredDriver, setHoveredDriver] = useState<string | null>(null);
  const [tooltipStint, setTooltipStint] = useState<{ driver: string; stint: Stint; x: number; y: number } | null>(null);

  useEffect(() => {
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const result = await api.getStrategy(
          sessionMeta.year,
          sessionMeta.gp_name,
          sessionMeta.session_type
        );
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load strategy');
      } finally {
        setIsLoading(false);
      }
    };
    load();
  }, [sessionMeta]);

  if (isLoading) return <PanelSkeleton rows={5} />;
  if (error) return <EmptyState message="Failed to load strategy data" subMessage={error} />;
  if (!data || !data.drivers.length) return <EmptyState message="No strategy data available" />;

  const maxLap = Math.max(...data.drivers.flatMap((d) => d.stints.map((s) => s.end_lap)));

  return (
    <div className="w-full h-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 shrink-0" style={{ borderBottom: '1px solid #333' }}>
        <div className="label">TYRE STRATEGY</div>
        <div className="flex items-center gap-4">
          {['SOFT', 'MEDIUM', 'HARD', 'INTER', 'WET'].map((c) => (
            <div key={c} className="flex items-center gap-1">
              <div className="w-3 h-3 rounded-sm" style={{ background: getCompoundColor(c) }} />
              <span className="text-2xs" style={{ color: '#555' }}>{c}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Lap number ruler */}
      <div className="flex items-center px-4 py-1" style={{ borderBottom: '1px solid #2A2A2A' }}>
        <div className="shrink-0" style={{ width: 80 }} />
        <div className="flex-1 relative" style={{ height: 16 }}>
          {Array.from({ length: Math.min(Math.ceil(maxLap / 5) + 1, 20) }, (_, i) => i * 5).map((lap) => (
            <span
              key={lap}
              className="absolute mono text-2xs"
              style={{
                left: `${(lap / maxLap) * 100}%`,
                color: '#555',
                transform: 'translateX(-50%)',
                top: 0,
              }}
            >
              {lap || 1}
            </span>
          ))}
        </div>
      </div>

      {/* Driver rows — derived from session data, not hardcoded */}
      <div className="px-4 py-2 space-y-1">
        {data.drivers.map((driver) => (
          <DriverRow
            key={driver.driver_code}
            driver={driver}
            maxLap={maxLap}
            isHovered={hoveredDriver === driver.driver_code}
            onHover={(code) => setHoveredDriver(code)}
            onStintHover={(stint, x, y) =>
              setTooltipStint(stint ? { driver: driver.driver_code, stint, x, y } : null)
            }
          />
        ))}
      </div>

      {/* Pit stop summary */}
      <div className="px-4 pb-4">
        <div className="label mb-2 mt-4">PIT STOP SUMMARY</div>
        <div className="grid grid-cols-4 gap-2">
          {data.drivers.slice(0, 20).map((driver) => (
            <div
              key={driver.driver_code}
              className="flex items-center gap-2 text-2xs"
              style={{ color: '#888' }}
            >
              <span className="mono" style={{ color: driver.team_color, width: 28 }}>
                {driver.driver_code}
              </span>
              <span>{driver.total_pit_stops} stop{driver.total_pit_stops !== 1 ? 's' : ''}</span>
              {driver.total_pit_time > 0 && (
                <span style={{ color: '#555' }}>
                  ({driver.total_pit_time.toFixed(1)}s)
                </span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Stint tooltip */}
      {tooltipStint && (
        <StintTooltip
          driver={tooltipStint.driver}
          stint={tooltipStint.stint}
          x={tooltipStint.x}
          y={tooltipStint.y}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Driver row component
// ---------------------------------------------------------------------------
interface DriverRowProps {
  driver: DriverStrategy;
  maxLap: number;
  isHovered: boolean;
  onHover: (code: string | null) => void;
  onStintHover: (stint: Stint | null, x: number, y: number) => void;
}

const DriverRow: React.FC<DriverRowProps> = ({
  driver,
  maxLap,
  isHovered,
  onHover,
  onStintHover,
}) => {
  return (
    <div
      className="flex items-center gap-2 py-0.5 transition-opacity duration-150"
      style={{ opacity: isHovered ? 1 : 0.85 }}
      onMouseEnter={() => onHover(driver.driver_code)}
      onMouseLeave={() => onHover(null)}
    >
      {/* Driver label */}
      <div className="shrink-0 flex items-center gap-1.5" style={{ width: 80 }}>
        {driver.finishing_position != null && (
          <span
            className="mono text-2xs"
            style={{ color: '#555', width: 14, textAlign: 'right' }}
          >
            {driver.finishing_position}
          </span>
        )}
        <div className="w-0.5 h-4 rounded-full" style={{ background: driver.team_color }} />
        <span
          className="mono text-xs font-semibold tracking-wider"
          style={{ color: driver.team_color }}
        >
          {driver.driver_code}
        </span>
      </div>

      {/* Stint bar */}
      <div className="flex-1 flex items-center" style={{ height: 22, position: 'relative' }}>
        {driver.stints.map((stint, idx) => {
          const left = ((stint.start_lap - 1) / maxLap) * 100;
          const width = ((stint.end_lap - stint.start_lap + 1) / maxLap) * 100;
          const compoundColor = getCompoundColor(stint.compound);

          return (
            <React.Fragment key={stint.stint_number}>
              {/* Pit stop gap before this stint (except first) */}
              {idx > 0 && stint.pit_duration != null && (
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    left: `${left}%`,
                    top: 0,
                    width: 2,
                    height: '100%',
                    background: '#444',
                    transform: 'translateX(-1px)',
                    zIndex: 1,
                  }}
                />
              )}

              {/* Stint block */}
              <div
                className="absolute rounded-sm flex items-center justify-center cursor-pointer transition-all duration-100"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(width, 0.5)}%`,
                  height: '100%',
                  background: compoundColor,
                  opacity: 0.85,
                  border: '1px solid rgba(0,0,0,0.3)',
                  zIndex: 0,
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  onStintHover(stint, rect.left + rect.width / 2, rect.top);
                }}
                onMouseLeave={() => onStintHover(null, 0, 0)}
              >
                {width > 4 && (
                  <span
                    className="mono font-bold"
                    style={{
                      fontSize: 9,
                      color: ['MEDIUM', 'HARD', 'SOFT'].includes(stint.compound) ? '#111' : '#fff',
                      lineHeight: 1,
                    }}
                  >
                    {getCompoundLabel(stint.compound)}
                  </span>
                )}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Stint tooltip
// ---------------------------------------------------------------------------
interface StintTooltipProps {
  driver: string;
  stint: Stint;
  x: number;
  y: number;
}

const StintTooltip: React.FC<StintTooltipProps> = ({ driver, stint, x, y }) => {
  const compoundColor = getCompoundColor(stint.compound);

  return (
    <div
      className="fixed z-50 pointer-events-none"
      style={{
        left: x,
        top: y - 120,
        transform: 'translateX(-50%)',
        background: '#1E1E1E',
        border: '1px solid #333',
        borderRadius: 4,
        padding: '8px 12px',
        minWidth: 150,
      }}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className="w-3 h-3 rounded-sm" style={{ background: compoundColor }} />
        <span className="mono text-xs font-bold" style={{ color: compoundColor }}>
          {stint.compound}
        </span>
        <span className="label">{driver}</span>
      </div>
      <div className="space-y-0.5 text-2xs">
        <Row label="LAPS" value={`${stint.start_lap} – ${stint.end_lap}`} />
        <Row label="STINT LENGTH" value={`${stint.end_lap - stint.start_lap + 1} laps`} />
        <Row label="TYRE AGE" value={`${stint.tyre_life}L`} />
        {stint.pit_duration != null && (
          <Row label="PIT STOP" value={`${stint.pit_duration.toFixed(1)}s`} />
        )}
        {stint.avg_pace != null && (
          <Row
            label="AVG PACE"
            value={`${Math.floor(stint.avg_pace / 60)}:${(stint.avg_pace % 60).toFixed(3).padStart(6, '0')}`}
          />
        )}
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="flex justify-between gap-4">
    <span style={{ color: '#555' }}>{label}</span>
    <span className="mono" style={{ color: '#F0F0F0' }}>{value}</span>
  </div>
);

export default StrategyViewer;
