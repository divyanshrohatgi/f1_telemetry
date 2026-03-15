import React from 'react';
import type { ReplayDriver, BattleZone } from './types';
import type { ReplaySettings } from './useSettings';

// -----------------------------------------------------------------------
// Compound helpers
// -----------------------------------------------------------------------
const COMPOUND_COLORS: Record<string, string> = {
  S: '#FF3333', SOFT: '#FF3333',
  M: '#FFC906', MEDIUM: '#FFC906',
  H: '#CCCCCC', HARD: '#CCCCCC',
  I: '#39B54A', INTER: '#39B54A', INTERMEDIATE: '#39B54A',
  W: '#0072C6', WET: '#0072C6',
};

const EXPECTED_TYRE_LIFE: Record<string, number> = {
  S: 25, M: 35, H: 50, I: 40, W: 60,
};

function compoundLetter(compound: string | null): string {
  if (!compound) return '?';
  const upper = compound.toUpperCase();
  if (upper === 'SOFT' || upper === 'S') return 'S';
  if (upper === 'MEDIUM' || upper === 'M') return 'M';
  if (upper === 'HARD' || upper === 'H') return 'H';
  if (upper === 'INTER' || upper === 'INTERMEDIATE' || upper === 'I') return 'I';
  if (upper === 'WET' || upper === 'W') return 'W';
  return upper[0] ?? '?';
}

function compoundColor(compound: string | null): string {
  if (!compound) return '#555';
  const letter = compoundLetter(compound);
  return COMPOUND_COLORS[letter] ?? '#555';
}

// -----------------------------------------------------------------------
// Gap / interval utilities
// -----------------------------------------------------------------------

function parseGapSeconds(gap: number | string | null): number | null {
  if (gap === null) return 0; // leader
  if (typeof gap === 'number') return gap;
  if (gap === 'PIT' || gap === 'OUT') return null;
  const n = parseFloat(String(gap).replace('+', ''));
  return isNaN(n) ? null : n;
}

function computeIntervals(sorted: ReplayDriver[]): Map<string, string> {
  const intervals = new Map<string, string>();

  for (let i = 0; i < sorted.length; i++) {
    const drv = sorted[i];

    if (drv.retired) { intervals.set(drv.abbr, 'OUT'); continue; }
    if (drv.in_pit)  { intervals.set(drv.abbr, 'PIT'); continue; }
    if (drv.gap === null || drv.position === 1) { intervals.set(drv.abbr, 'LEADER'); continue; }

    // Find the car directly ahead by position
    const prevDriver = sorted.find(
      (d) => !d.retired && d.position === (drv.position ?? 0) - 1,
    );

    const currGap = parseGapSeconds(drv.gap);
    const prevGap = prevDriver ? parseGapSeconds(prevDriver.gap) : 0;

    if (currGap !== null && prevGap !== null) {
      const diff = Math.max(0, currGap - prevGap);
      intervals.set(drv.abbr, `+${diff.toFixed(3)}`);
    } else {
      intervals.set(drv.abbr, drv.gap ? String(drv.gap) : '—');
    }
  }

  return intervals;
}

function formatGap(gap: number | string | null): string {
  if (gap === null) return 'LEADER';
  if (typeof gap === 'number') return `+${gap.toFixed(3)}`;
  return String(gap);
}

// -----------------------------------------------------------------------
// Width calculator
// -----------------------------------------------------------------------
function calcWidth(settings: ReplaySettings, isRace: boolean): number {
  let w = 106; // pos(24) + color bar(4) + driver(30) + flags(16) + spacing
  if (settings.showTeamAbbr) w += 28;
  if (isRace && settings.showGridChange) w += 24;
  if (settings.showGapToLeader) w += 60;
  if (isRace && settings.showPitStops) w += 24;
  if (isRace && settings.showTyreHistory) w += 36;
  if (settings.showTyreType) w += 24;
  if (settings.showTyreAge) w += 20;
  if (isRace && settings.showPitPrediction) w += 40;
  return Math.max(w, 200);
}

// -----------------------------------------------------------------------
// Sub-components
// -----------------------------------------------------------------------

interface CompoundCircleProps {
  compound: string | null;
  dimmed?: boolean;
  size?: number;
  tyreLife?: number | null;
}

function CompoundCircle({ compound, dimmed = false, size = 16, tyreLife }: CompoundCircleProps) {
  const letter = compoundLetter(compound);
  const color = compoundColor(compound);

  // Degradation bar: fraction of expected life remaining (1=fresh, 0=worn out)
  const expected = EXPECTED_TYRE_LIFE[letter];
  const degFraction = expected && tyreLife != null
    ? Math.max(0, 1 - tyreLife / expected)
    : null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          border: `2px solid ${dimmed ? color + '66' : color}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          opacity: dimmed ? 0.5 : 1,
        }}
      >
        <span
          style={{
            fontSize: size * 0.55,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 'bold',
            color: dimmed ? color + '99' : color,
            lineHeight: 1,
          }}
        >
          {letter}
        </span>
      </div>
      {degFraction !== null && (
        <div style={{ width: size, height: 2, background: '#1A1A1A', borderRadius: 1 }}>
          <div
            style={{
              width: `${degFraction * 100}%`,
              height: '100%',
              background: degFraction > 0.4 ? color : '#F87171',
              borderRadius: 1,
              opacity: dimmed ? 0.5 : 1,
            }}
          />
        </div>
      )}
    </div>
  );
}

interface FlagCellProps {
  driver: ReplayDriver;
}

function FlagCell({ driver }: FlagCellProps) {
  if (driver.has_fastest_lap) {
    return (
      <div
        title="Fastest lap"
        style={{
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#7B2FBE',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ fontSize: 7, color: '#fff' }}>⏱</span>
      </div>
    );
  }
  if (driver.flag === 'investigation') {
    return (
      <div
        title="Under investigation"
        style={{
          width: 0,
          height: 0,
          borderLeft: '6px solid transparent',
          borderRight: '6px solid transparent',
          borderBottom: '10px solid #F5A500',
          flexShrink: 0,
        }}
      />
    );
  }
  if (driver.flag === 'penalty') {
    return (
      <div
        title="Penalty"
        style={{
          width: 8,
          height: 8,
          borderRadius: '50%',
          background: '#E10600',
          flexShrink: 0,
        }}
      />
    );
  }
  return <div style={{ width: 12, height: 12, flexShrink: 0 }} />;
}

// -----------------------------------------------------------------------
// Driver row
// -----------------------------------------------------------------------

interface DriverRowProps {
  driver: ReplayDriver;
  index: number;
  isSelected: boolean;
  isRace: boolean;
  settings: ReplaySettings;
  onDriverSelect: (abbr: string) => void;
  onDriverFocus: (abbr: string | null) => void;
  displayGap: string;
  gapTrend?: 'closing' | 'growing' | 'stable';
  pitElapsed?: number | null;
  overtakeFlash?: 'gained' | 'lost' | null;
  isFocused?: boolean;
}

function DriverRow({
  driver,
  index,
  isSelected,
  isRace,
  settings,
  onDriverSelect,
  onDriverFocus,
  displayGap,
  gapTrend,
  pitElapsed,
  overtakeFlash,
  isFocused,
}: DriverRowProps) {
  const isRetired = driver.retired;
  const isInPit = driver.in_pit;
  const isEven = index % 2 === 0;

  let bgColor = isEven ? '#0D0D0D' : '#111111';
  if (isSelected) bgColor = '#1A1A1A';
  if (isRetired) bgColor = '#080808';
  if (overtakeFlash === 'gained') bgColor = '#0A2A0A';
  if (overtakeFlash === 'lost') bgColor = '#2A0A0A';

  const textColor = isRetired ? '#3A3A3A' : '#FFFFFF';
  const dimColor = isRetired ? '#2A2A2A' : '#888';

  const gridDiff =
    !isRetired && driver.position !== null && driver.grid_position !== null
      ? driver.grid_position - driver.position
      : null;

  // Gap cell content
  const gapNode = (): React.ReactNode => {
    if (isRetired) {
      return <span style={{ color: '#E10600', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 'bold' }}>OUT</span>;
    }
    if (isInPit) {
      const pitLabel = pitElapsed != null && pitElapsed > 0
        ? `${pitElapsed.toFixed(1)}s`
        : 'PIT';
      return <span style={{ color: '#FFC906', fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 'bold' }}>{pitLabel}</span>;
    }
    if (displayGap === 'LEADER') {
      return <span style={{ color: '#FFD700', fontFamily: 'JetBrains Mono, monospace', fontSize: 9, letterSpacing: '0.06em' }}>LEADER</span>;
    }

    const trendArrow = !gapTrend || gapTrend === 'stable' ? null : (
      <span style={{ fontSize: 8, color: gapTrend === 'closing' ? '#4ADE80' : '#F87171', marginLeft: 2 }}>
        {gapTrend === 'closing' ? '▼' : '▲'}
      </span>
    );

    return (
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
        <span style={{ color: '#E0E0E0', fontFamily: 'JetBrains Mono, monospace', fontSize: 10 }}>{displayGap}</span>
        {trendArrow}
      </span>
    );
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onDriverSelect(driver.abbr)}
      onDoubleClick={() => onDriverFocus(isFocused ? null : driver.abbr)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onDriverSelect(driver.abbr); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        height: 28,
        background: bgColor,
        borderBottom: '1px solid #1A1A1A',
        cursor: 'pointer',
        paddingLeft: 2,
        paddingRight: 4,
        gap: 0,
        userSelect: 'none',
        outline: isSelected ? '1px solid #E10600' : isFocused ? '1px solid #7B2FBE' : 'none',
        outlineOffset: -1,
        opacity: isRetired ? 0.55 : 1,
        transition: 'background 0.4s ease',
      }}
    >
      {/* Position (24px) */}
      <div style={{ width: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        {driver.position === 1 && !isRetired ? (
          <div
            style={{
              width: 18,
              height: 18,
              borderRadius: 3,
              background: '#E10600',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold', color: '#fff' }}>1</span>
          </div>
        ) : (
          <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: dimColor, fontWeight: 'bold' }}>
            {driver.position ?? '—'}
          </span>
        )}
      </div>

      {/* Team color bar (4px) */}
      <div
        style={{
          width: 4,
          height: 18,
          borderRadius: 2,
          background: isRetired ? '#2A2A2A' : driver.color,
          flexShrink: 0,
          marginRight: 4,
        }}
      />

      {/* Team abbr (28px, conditional) */}
      {settings.showTeamAbbr && (
        <div style={{ width: 28, flexShrink: 0, overflow: 'hidden' }}>
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: dimColor, letterSpacing: '0.04em' }}>
            {driver.team_abbr}
          </span>
        </div>
      )}

      {/* Driver code (30px) */}
      <div style={{ width: 30, flexShrink: 0 }}>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', fontWeight: 'bold', color: textColor }}>
          {driver.abbr}
        </span>
      </div>

      {/* Grid change (24px, race+conditional) */}
      {isRace && settings.showGridChange && (
        <div style={{ width: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {gridDiff !== null && gridDiff !== 0 ? (
            <span
              style={{
                fontSize: 9,
                fontFamily: 'JetBrains Mono, monospace',
                fontWeight: 'bold',
                color: gridDiff > 0 ? '#4ADE80' : '#F87171',
              }}
            >
              {gridDiff > 0 ? `▲${gridDiff}` : `▼${Math.abs(gridDiff)}`}
            </span>
          ) : (
            <span style={{ fontSize: 9, color: '#333' }}>—</span>
          )}
        </div>
      )}

      {/* Flags (16px) */}
      <div style={{ width: 16, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {!isRetired && <FlagCell driver={driver} />}
      </div>

      {/* Gap/Interval (60px, conditional) */}
      {settings.showGapToLeader && (
        <div
          style={{
            width: 60,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 4,
          }}
        >
          {gapNode()}
        </div>
      )}

      {/* Pit stops (24px, race+conditional) */}
      {isRace && settings.showPitStops && (
        <div style={{ width: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {driver.pit_stops > 0 ? (
            <div
              style={{
                width: 16,
                height: 16,
                borderRadius: 3,
                border: '1px solid #555',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#CCC' }}>
                {driver.pit_stops}
              </span>
            </div>
          ) : (
            <span style={{ fontSize: 9, color: '#333' }}>—</span>
          )}
        </div>
      )}

      {/* Tyre history (36px, race+conditional) */}
      {isRace && settings.showTyreHistory && (
        <div
          style={{
            width: 36,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 2,
          }}
        >
          {(driver.tyre_history ?? []).slice(-3).map((c, i) => (
            <CompoundCircle key={i} compound={c} dimmed size={12} />
          ))}
        </div>
      )}

      {/* Current compound with tyre deg bar (24px, conditional) */}
      {settings.showTyreType && (
        <div style={{ width: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CompoundCircle compound={driver.compound} size={16} tyreLife={driver.tyre_life} />
        </div>
      )}

      {/* Tyre age (20px, conditional) */}
      {settings.showTyreAge && (
        <div style={{ width: 20, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#AAA' }}>
            {driver.tyre_life ?? '—'}
          </span>
        </div>
      )}

      {/* Pit prediction (40px, race+conditional) */}
      {isRace && settings.showPitPrediction && (
        <div style={{ width: 40, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {driver.pit_prediction !== null ? (
            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono, monospace', color: '#FFC906' }}>
              {'\u2B10'} P{driver.pit_prediction}
            </span>
          ) : (
            <span style={{ fontSize: 9, color: '#333' }}>—</span>
          )}
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------
// Battle zone indicator
// -----------------------------------------------------------------------

interface BattleIndicatorProps {
  gapSeconds: number;
}

function BattleIndicator({ gapSeconds }: BattleIndicatorProps) {
  return (
    <div
      style={{
        height: 14,
        background: '#150800',
        borderTop: '1px solid #2A1400',
        borderBottom: '1px solid #2A1400',
        display: 'flex',
        alignItems: 'center',
        paddingLeft: 6,
        gap: 6,
      }}
    >
      <span
        style={{
          fontSize: 7,
          fontFamily: 'JetBrains Mono, monospace',
          color: '#FF8C00',
          letterSpacing: '0.1em',
          fontWeight: 'bold',
        }}
      >
        ⚡ BATTLE
      </span>
      <span style={{ fontSize: 7, fontFamily: 'JetBrains Mono, monospace', color: '#664400' }}>
        {gapSeconds.toFixed(3)}s
      </span>
    </div>
  );
}

// -----------------------------------------------------------------------
// Leaderboard
// -----------------------------------------------------------------------

interface LeaderboardProps {
  drivers: ReplayDriver[];
  isRace: boolean;
  settings: ReplaySettings;
  selectedDrivers: string[];
  onDriverSelect: (abbr: string) => void;
  onIntervalModeToggle: () => void;
  gapTrends?: Map<string, 'closing' | 'growing' | 'stable'>;
  pitEntryTimes?: Map<string, number>;
  currentTimestamp?: number;
  overtakeFlashes?: Map<string, 'gained' | 'lost'>;
  battleZones?: BattleZone[];
  focusedDriver?: string | null;
  onDriverFocus?: (abbr: string | null) => void;
}

export default function Leaderboard({
  drivers,
  isRace,
  settings,
  selectedDrivers,
  onDriverSelect,
  onIntervalModeToggle,
  gapTrends,
  pitEntryTimes,
  currentTimestamp,
  overtakeFlashes,
  battleZones,
  focusedDriver,
  onDriverFocus,
}: LeaderboardProps) {
  const width = calcWidth(settings, isRace);

  // Retired drivers sink to bottom
  const sorted = [...drivers].sort((a, b) => {
    if (a.retired && !b.retired) return 1;
    if (!a.retired && b.retired) return -1;
    if (a.position === null && b.position === null) return 0;
    if (a.position === null) return 1;
    if (b.position === null) return -1;
    return a.position - b.position;
  });

  const intervals = computeIntervals(sorted);

  const isBattleBetween = (abbrA: string, abbrB: string): BattleZone | null => {
    if (!battleZones) return null;
    return battleZones.find(
      (bz) => (bz.driverA === abbrA && bz.driverB === abbrB) ||
               (bz.driverA === abbrB && bz.driverB === abbrA),
    ) ?? null;
  };

  return (
    <div
      style={{
        width,
        minWidth: width,
        background: '#111',
        borderLeft: '2px solid #1E1E1E',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      {/* Header with interval/leader toggle */}
      <div
        style={{
          height: 28,
          display: 'flex',
          alignItems: 'stretch',
          background: '#0D0D0D',
          borderBottom: '1px solid #1E1E1E',
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', paddingLeft: 8 }}>
          <span
            style={{
              fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#666',
              letterSpacing: '0.1em',
            }}
          >
            TIMING TOWER
          </span>
        </div>
        {settings.showGapToLeader && (
          <button
            onClick={onIntervalModeToggle}
            style={{
              fontSize: 8,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#E10600',
              background: 'transparent',
              border: 'none',
              borderLeft: '1px solid #1E1E1E',
              padding: '0 8px',
              cursor: 'pointer',
              letterSpacing: '0.06em',
              fontWeight: 'bold',
            }}
          >
            {settings.intervalMode === 'leader' ? 'INTERVAL' : 'LEADER'}
          </button>
        )}
      </div>

      {/* Driver rows */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
        {sorted.map((driver, index) => {
          const gap = settings.intervalMode === 'interval'
            ? (intervals.get(driver.abbr) ?? '—')
            : formatGap(driver.gap);

          const prevDriver = index > 0 ? sorted[index - 1] : null;
          const battle = prevDriver ? isBattleBetween(prevDriver.abbr, driver.abbr) : null;

          const pitElapsed =
            pitEntryTimes?.has(driver.abbr) && currentTimestamp != null
              ? currentTimestamp - (pitEntryTimes.get(driver.abbr) ?? 0)
              : null;

          return (
            <React.Fragment key={driver.abbr}>
              {battle && <BattleIndicator gapSeconds={battle.gapSeconds} />}
              <DriverRow
                driver={driver}
                index={index}
                isSelected={selectedDrivers.includes(driver.abbr)}
                isRace={isRace}
                settings={settings}
                onDriverSelect={onDriverSelect}
                onDriverFocus={onDriverFocus ?? (() => {})}
                displayGap={gap}
                gapTrend={gapTrends?.get(driver.abbr)}
                pitElapsed={pitElapsed}
                overtakeFlash={overtakeFlashes?.get(driver.abbr) ?? null}
                isFocused={focusedDriver === driver.abbr}
              />
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
