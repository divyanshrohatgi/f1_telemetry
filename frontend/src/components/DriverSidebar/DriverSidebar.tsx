/**
 * DriverSidebar — driver list grouped by team, with selection state.
 * Shows "COMPARE FASTEST LAPS" button when 2+ drivers are selected.
 */

import React from 'react';
import type { SessionMetadata, DriverSessionInfo } from '../../types/f1.types';

interface DriverSidebarProps {
  sessionMeta: SessionMetadata | null;
  selectedDrivers: string[];
  onDriverToggle: (driverCode: string) => void;
  hoveredDriver: string | null;
  onDriverHover: (driverCode: string | null) => void;
  onCompare?: () => void;
}

const DriverSidebar: React.FC<DriverSidebarProps> = ({
  sessionMeta,
  selectedDrivers,
  onDriverToggle,
  hoveredDriver,
  onDriverHover,
  onCompare,
}) => {
  if (!sessionMeta) {
    return (
      <div className="p-3">
        <div className="label mb-3">DRIVERS</div>
        <div className="text-xs" style={{ color: 'var(--color-text-tertiary)' }}>
          Load a session to see drivers
        </div>
      </div>
    );
  }

  // Group drivers by team
  const teamGroups: Record<string, DriverSessionInfo[]> = {};
  Object.values(sessionMeta.drivers).forEach((driver) => {
    const team = driver.team_name;
    if (!teamGroups[team]) teamGroups[team] = [];
    teamGroups[team].push(driver);
  });
  const sortedTeams = Object.keys(teamGroups).sort();

  return (
    <div className="flex flex-col" style={{ height: '100%', overflow: 'hidden' }}>
      {/* Scrollable driver list */}
      <div className="p-2 space-y-0.5 overflow-y-auto flex-1">
        <div className="label mb-2 px-1">
          DRIVERS
          {selectedDrivers.length > 0 && (
            <span style={{ color: 'var(--color-text-tertiary)', fontWeight: 'normal', marginLeft: 6 }}>
              {selectedDrivers.length} selected
            </span>
          )}
        </div>

        {sortedTeams.map((teamName) => (
          <div key={teamName} className="mb-1">
            {/* Team header */}
            <div className="flex items-center gap-1.5 px-1 py-0.5 mb-0.5">
              <div
                className="w-0.5 h-3 rounded-full shrink-0"
                style={{ background: teamGroups[teamName][0]?.team_color ?? '#fff' }}
              />
              <span
                className="text-2xs uppercase tracking-wider truncate"
                style={{ color: 'var(--color-text-tertiary)' }}
              >
                {teamName}
              </span>
            </div>

            {/* Driver rows */}
            {teamGroups[teamName].map((driver) => {
              const isSelected = selectedDrivers.includes(driver.code);
              const isHovered = hoveredDriver === driver.code;

              return (
                <button
                  key={driver.code}
                  onClick={() => onDriverToggle(driver.code)}
                  onMouseEnter={() => onDriverHover(driver.code)}
                  onMouseLeave={() => onDriverHover(null)}
                  className="w-full flex items-center gap-2 px-2 py-1.5 rounded transition-all duration-150 text-left"
                  style={{
                    background: isSelected
                      ? `${driver.team_color}22`
                      : isHovered
                      ? 'var(--color-panel)'
                      : 'transparent',
                    border: isSelected
                      ? `1px solid ${driver.team_color}66`
                      : '1px solid transparent',
                    cursor: 'pointer',
                  }}
                >
                  {/* Team color bar */}
                  <div
                    className="w-0.5 h-5 rounded-full shrink-0"
                    style={{ background: driver.team_color }}
                  />

                  {/* Driver number */}
                  <span
                    className="mono text-2xs font-bold shrink-0 w-4 text-center"
                    style={{ color: driver.team_color }}
                  >
                    {driver.driver_number}
                  </span>

                  {/* Driver code */}
                  <span
                    className="mono text-xs font-semibold tracking-wider uppercase"
                    style={{
                      color: isSelected ? driver.team_color : 'var(--color-text-primary)',
                    }}
                  >
                    {driver.code}
                  </span>

                  {/* Selection dot */}
                  {isSelected && (
                    <div
                      className="ml-auto w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: driver.team_color }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Compare button — pinned at bottom when 2+ drivers selected */}
      {selectedDrivers.length >= 2 && onCompare && (
        <div style={{ padding: '8px 10px', borderTop: '1px solid var(--color-border)', flexShrink: 0 }}>
          <button
            onClick={onCompare}
            style={{
              width: '100%',
              padding: '7px 0',
              background: 'transparent',
              border: '1px solid var(--color-border)',
              color: 'var(--color-text-secondary)',
              borderRadius: 3,
              fontSize: 9,
              fontFamily: 'JetBrains Mono',
              fontWeight: 'bold',
              letterSpacing: '0.1em',
              cursor: 'pointer',
              transition: 'all 0.12s',
            }}
            onMouseEnter={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = '#E10600';
              b.style.color = '#E10600';
            }}
            onMouseLeave={(e) => {
              const b = e.currentTarget as HTMLButtonElement;
              b.style.borderColor = 'var(--color-border)';
              b.style.color = 'var(--color-text-secondary)';
            }}
          >
            COMPARE FASTEST LAPS
          </button>
        </div>
      )}
    </div>
  );
};

export default DriverSidebar;
