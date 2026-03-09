/**
 * LatestRaceDashboard — three tabs:
 *   RESULTS  — full timing sheet for the most recent race
 *   SCHEDULE — 2026 season calendar + countdown to next race
 *   STANDINGS — driver & constructor championship standings
 */

import React, { useState, useEffect, useCallback } from 'react';
import type {
  SessionResultsResponse,
  DriverResult,
  LatestRaceInfo,
  TyreCompound,
  SeasonResponse,
  GrandPrixInfo,
  StandingsResponse,
  DriverStanding,
  ConstructorStanding,
} from '../../types/f1.types';
import { api } from '../../api/client';
import { formatLapTime } from '../../utils/formatting';
import { PanelSkeleton } from '../common/LoadingSpinner';
import FlagIcon from '../common/FlagIcon';
import EmptyState from '../common/EmptyState';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const COMPOUND_COLORS: Record<string, { bg: string; text: string }> = {
  SOFT:   { bg: '#C8002D', text: '#fff' },
  MEDIUM: { bg: '#FFC906', text: '#000' },
  HARD:   { bg: '#EFEFEF', text: '#000' },
  INTER:  { bg: '#39B54A', text: '#fff' },
  WET:    { bg: '#0067FF', text: '#fff' },
};

type DashTab = 'results' | 'schedule' | 'standings';
type StandingsTab = 'drivers' | 'constructors';

// ---------------------------------------------------------------------------
// Shared sub-components
// ---------------------------------------------------------------------------

function CompoundBadge({ compound, age }: { compound: TyreCompound | null; age: number }) {
  if (!compound) return <span style={{ color: '#444' }}>—</span>;
  const s = COMPOUND_COLORS[compound] ?? { bg: '#333', text: '#aaa' };
  return (
    <span style={{
      background: s.bg, color: s.text, borderRadius: 3, padding: '1px 5px',
      fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 'bold', letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {compound[0]}
      {age > 0 && <span style={{ fontWeight: 'normal', marginLeft: 2, opacity: 0.8 }}>{age}L</span>}
    </span>
  );
}

function SectorCell({ time, isOverallBest }: { time: number | null; isOverallBest: boolean }) {
  if (time === null) return <td style={{ textAlign: 'right', color: 'var(--color-text-tertiary)', padding: '0 8px' }}>—</td>;
  const style: React.CSSProperties = isOverallBest
    ? { color: '#fff', background: '#7B2FBE', borderRadius: 3, padding: '1px 5px', fontWeight: 'bold' }
    : { color: 'var(--color-text-primary)' };
  return (
    <td style={{ textAlign: 'right', padding: '0 6px', whiteSpace: 'nowrap' }}>
      <span style={{ ...style, fontSize: 11, fontFamily: 'JetBrains Mono' }}>{time.toFixed(3)}</span>
    </td>
  );
}

function PosBadge({ pos }: { pos: number | null }) {
  const colors: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
  const color = pos ? (colors[pos] ?? 'var(--color-text-tertiary)') : 'var(--color-border)';
  return (
    <div style={{
      width: 22, height: 22, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: pos && pos <= 3 ? color : 'transparent',
      border: pos && pos > 3 ? '1px solid var(--color-border)' : 'none',
    }}>
      <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: pos && pos <= 3 ? '#000' : color }}>
        {pos ?? '—'}
      </span>
    </div>
  );
}

function WeatherChip({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{value}</span>
      <span style={{ fontSize: 8, color: 'var(--color-text-tertiary)', fontFamily: 'JetBrains Mono', letterSpacing: '0.08em' }}>{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Results tab
// ---------------------------------------------------------------------------

function DriverRow({ driver, isEven }: { driver: DriverResult; isEven: boolean }) {
  const isRetired = driver.status && driver.status !== 'Finished' && !driver.status.startsWith('+');
  const isDNF = driver.status && !['Finished', ''].includes(driver.status) && !driver.status.includes('Lap');
  return (
    <tr
      style={{ background: isEven ? 'var(--color-bg)' : 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', opacity: isDNF ? 0.65 : 1 }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-panel)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = isEven ? 'var(--color-bg)' : 'var(--color-surface)'; }}
    >
      <td style={{ padding: '6px 8px 6px 12px', width: 36 }}><PosBadge pos={driver.position} /></td>
      <td style={{ padding: '6px 8px', width: 40 }}>
        <div style={{ width: 30, height: 22, borderRadius: 3, background: driver.team_color + '33', border: `1px solid ${driver.team_color}66`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: driver.team_color }}>{driver.driver_number}</span>
        </div>
      </td>
      <td style={{ padding: '6px 12px 6px 4px', minWidth: 130 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 3, height: 18, borderRadius: 2, background: driver.team_color, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: driver.team_color, lineHeight: 1.2 }}>{driver.driver_code}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'JetBrains Mono', lineHeight: 1.2, whiteSpace: 'nowrap' }}>{driver.team_name.length > 14 ? driver.team_name.slice(0, 14) + '…' : driver.team_name}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '6px 12px', textAlign: 'right', minWidth: 90 }}>
        {driver.gap_to_leader === 'LEADER'
          ? <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#FFD700', fontWeight: 'bold' }}>LEADER</span>
          : isRetired
            ? <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E10600' }}>{driver.gap_to_leader ?? driver.status}</span>
            : <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--color-text-primary)' }}>{driver.gap_to_leader ?? '—'}</span>
        }
      </td>
      <td style={{ padding: '6px 10px', textAlign: 'right', whiteSpace: 'nowrap' }}>
        <span style={{
          fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: driver.is_best_lap ? 'bold' : 'normal',
          color: driver.is_best_lap ? '#fff' : 'var(--color-text-primary)',
          background: driver.is_best_lap ? '#7B2FBE' : 'transparent',
          padding: driver.is_best_lap ? '2px 6px' : undefined,
          borderRadius: driver.is_best_lap ? 3 : undefined,
        }}>{formatLapTime(driver.best_lap_time)}</span>
      </td>
      <SectorCell time={driver.best_s1} isOverallBest={driver.is_best_s1} />
      <SectorCell time={driver.best_s2} isOverallBest={driver.is_best_s2} />
      <SectorCell time={driver.best_s3} isOverallBest={driver.is_best_s3} />
      <td style={{ padding: '6px 10px', textAlign: 'center' }}><CompoundBadge compound={driver.compound} age={driver.tyre_age} /></td>
      <td style={{ padding: '6px 10px', textAlign: 'center' }}>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: driver.pit_stops > 0 ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)' }}>{driver.pit_stops > 0 ? driver.pit_stops : '—'}</span>
      </td>
      <td style={{ padding: '6px 10px 6px 4px', textAlign: 'right' }}>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: 'var(--color-text-secondary)' }}>{driver.laps_completed}</span>
      </td>
    </tr>
  );
}

function ResultsTable({ results, isLoading, onReload }: { results: SessionResultsResponse; isLoading: boolean; onReload: () => void }) {
  return (
    <>
      {/* Legend */}
      <div style={{ padding: '4px 16px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {(() => {
            const bestDriver = results.drivers.find(d => d.is_best_lap);
            const bestTime = bestDriver?.best_lap_time;
            return (
              <>
                <span style={{ background: '#7B2FBE', color: '#fff', fontSize: 8, fontFamily: 'JetBrains Mono', borderRadius: 2, padding: '1px 4px' }}>
                  {bestTime ? formatLapTime(bestTime) : 'BEST'}
                </span>
                <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'JetBrains Mono' }}>
                  FASTEST LAP{bestDriver ? ` — ${bestDriver.driver_code}` : ''}
                </span>
              </>
            );
          })()}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {Object.entries(COMPOUND_COLORS).map(([c, s]) => (
            <span key={c} style={{ background: s.bg, color: s.text, fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 'bold', borderRadius: 2, padding: '1px 5px' }}>{c[0]}</span>
          ))}
          <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'JetBrains Mono' }}>COMPOUND</span>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          {isLoading && <span style={{ fontSize: 9, color: '#E10600', fontFamily: 'JetBrains Mono' }}>● LOADING</span>}
          <button onClick={onReload} style={{ fontSize: 14, background: 'transparent', border: '1px solid var(--color-border)', borderRadius: 3, color: 'var(--color-text-tertiary)', padding: '2px 8px', cursor: 'pointer' }}>↺</button>
        </div>
      </div>
      {/* Table */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <thead>
            <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
              {[
                { label: 'POS', width: 36 }, { label: '#', width: 40 }, { label: 'DRIVER', width: 140 },
                { label: 'GAP', width: 90, right: true }, { label: 'BEST LAP', width: 100, right: true },
                { label: 'S1', width: 72, right: true }, { label: 'S2', width: 72, right: true }, { label: 'S3', width: 72, right: true },
                { label: 'TYRE', width: 64, center: true }, { label: 'PITS', width: 44, center: true }, { label: 'LAPS', width: 44, right: true },
              ].map(({ label, width, right, center }) => (
                <th key={label} style={{ width, textAlign: right ? 'right' : center ? 'center' : 'left', padding: '7px 8px', fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--color-text-secondary)', fontWeight: 'normal', letterSpacing: '0.08em' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {results.drivers.map((d, i) => <DriverRow key={d.driver_code} driver={d} isEven={i % 2 === 0} />)}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Schedule tab + countdown
// ---------------------------------------------------------------------------

function useCountdown(targetDate: string | null): string {
  const [display, setDisplay] = useState('');
  useEffect(() => {
    if (!targetDate) { setDisplay(''); return; }
    const target = new Date(targetDate + 'T00:00:00');
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setDisplay('Race weekend!'); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setDisplay(`${d}d ${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetDate]);
  return display;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function ScheduleTab({ year }: { year: number }) {
  const [season, setSeason] = useState<SeasonResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const today = new Date().toISOString().slice(0, 10);

  useEffect(() => {
    setLoading(true);
    api.getSeason(year).then(setSeason).catch(() => {}).finally(() => setLoading(false));
  }, [year]);

  // Find next upcoming race
  const nextRace = season?.grands_prix.find(gp => gp.date > today) ?? null;
  const countdown = useCountdown(nextRace?.date ?? null);

  if (loading) return <div style={{ padding: 24 }}><PanelSkeleton rows={10} /></div>;
  if (!season) return <EmptyState message="Schedule unavailable" subMessage="Could not load season calendar" />;

  // Group by month
  const byMonth: Record<string, GrandPrixInfo[]> = {};
  for (const gp of season.grands_prix) {
    const m = gp.date.slice(0, 7); // YYYY-MM
    if (!byMonth[m]) byMonth[m] = [];
    byMonth[m].push(gp);
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '0 0 24px' }}>
      {/* Countdown banner */}
      {nextRace && (
        <div style={{ padding: '12px 20px', background: 'var(--color-surface)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 9, color: '#E10600', fontFamily: 'JetBrains Mono', letterSpacing: '0.12em', marginBottom: 2 }}>NEXT RACE</div>
            <div style={{ fontSize: 15, fontWeight: 'bold', color: 'var(--color-text-primary)' }}>{nextRace.name}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'JetBrains Mono' }}>{nextRace.country} · {nextRace.location} · Round {nextRace.round_number}</div>
          </div>
          <div style={{ marginLeft: 'auto', textAlign: 'right' }}>
            <div style={{ fontSize: 9, color: 'var(--color-text-tertiary)', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em', marginBottom: 2 }}>COUNTDOWN</div>
            <div style={{ fontSize: 20, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: '#E10600', letterSpacing: '0.04em' }}>{countdown}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'JetBrains Mono' }}>{nextRace.date}</div>
          </div>
        </div>
      )}

      {/* Calendar */}
      {Object.entries(byMonth).map(([monthKey, gps]) => {
        const [yr, mo] = monthKey.split('-');
        const monthLabel = `${MONTH_NAMES[parseInt(mo) - 1]} ${yr}`;
        return (
          <div key={monthKey}>
            <div style={{ padding: '8px 20px 4px', fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em', borderBottom: '1px solid var(--color-border)', background: 'var(--color-bg)' }}>
              {monthLabel}
            </div>
            {gps.map((gp) => {
              const isPast = gp.date < today;
              const isNext = gp.date === nextRace?.date;
              return (
                <div key={gp.round_number} style={{
                  display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px',
                  borderBottom: '1px solid var(--color-border)',
                  background: isNext ? 'var(--color-surface)' : 'transparent',
                  opacity: isPast ? 0.45 : 1,
                }}>
                  {/* Round badge */}
                  <div style={{ width: 28, height: 28, borderRadius: 4, background: isNext ? '#E10600' : 'var(--color-surface)', border: isNext ? 'none' : '1px solid var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: isNext ? '#fff' : 'var(--color-text-tertiary)' }}>{gp.round_number}</span>
                  </div>
                  {/* Date box */}
                  <div style={{ textAlign: 'center', width: 32, flexShrink: 0 }}>
                    <div style={{ fontSize: 14, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: isPast ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', lineHeight: 1 }}>{gp.date.slice(8)}</div>
                    <div style={{ fontSize: 8, color: 'var(--color-text-tertiary)', fontFamily: 'JetBrains Mono' }}>{MONTH_NAMES[parseInt(gp.date.slice(5, 7)) - 1].toUpperCase()}</div>
                  </div>
                  {/* GP info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 'bold', color: isNext ? 'var(--color-text-primary)' : isPast ? 'var(--color-text-tertiary)' : 'var(--color-text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{gp.name}</div>
                    <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'JetBrains Mono' }}>{gp.country} · {gp.location}</div>
                  </div>
                  {/* Sessions */}
                  <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                    {gp.sessions.map(s => (
                      <span key={s} style={{ fontSize: 8, fontFamily: 'JetBrains Mono', padding: '1px 4px', borderRadius: 2, background: 'var(--color-surface)', color: 'var(--color-text-tertiary)', border: '1px solid var(--color-border)' }}>{s}</span>
                    ))}
                  </div>
                  {isPast && <span style={{ fontSize: 9, color: 'var(--color-border)', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>✓</span>}
                  {isNext && <span style={{ fontSize: 9, color: '#E10600', fontFamily: 'JetBrains Mono', flexShrink: 0 }}>NEXT</span>}
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Standings tab
// ---------------------------------------------------------------------------

function StandingsTab({ year }: { year: number }) {
  const [standings, setStandings] = useState<StandingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sub, setSub] = useState<StandingsTab>('drivers');

  useEffect(() => {
    setLoading(true);
    setError(null);
    api.getStandings(year)
      .then(setStandings)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load standings'))
      .finally(() => setLoading(false));
  }, [year]);

  if (loading) return <div style={{ padding: 24 }}><PanelSkeleton rows={22} /></div>;
  if (error || !standings) return <EmptyState message="Standings unavailable" subMessage={error ?? ''} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
      {/* After round badge + sub-tabs */}
      <div style={{ padding: '8px 16px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'JetBrains Mono' }}>AFTER ROUND {standings.round} · {year}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
          {(['drivers', 'constructors'] as StandingsTab[]).map(t => (
            <button key={t} onClick={() => setSub(t)} style={{
              fontSize: 9, fontFamily: 'JetBrains Mono', letterSpacing: '0.08em', padding: '3px 10px',
              background: sub === t ? '#E10600' : 'transparent',
              color: sub === t ? '#fff' : 'var(--color-text-tertiary)',
              border: sub === t ? 'none' : '1px solid var(--color-border)',
              borderRadius: 3, cursor: 'pointer', fontWeight: sub === t ? 'bold' : 'normal',
            }}>{t === 'drivers' ? 'DRIVERS' : 'CONSTRUCTORS'}</button>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {sub === 'drivers' ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                {['POS', 'DRIVER', 'TEAM', 'WINS', 'PTS'].map((h, i) => (
                  <th key={h} style={{ padding: '7px 12px', fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--color-text-secondary)', fontWeight: 'normal', letterSpacing: '0.08em', textAlign: i >= 3 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.drivers.map((d, i) => <DriverStandingRow key={d.driver_code} d={d} isEven={i % 2 === 0} />)}
            </tbody>
          </table>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)' }}>
                {['POS', 'CONSTRUCTOR', 'WINS', 'PTS'].map((h, i) => (
                  <th key={h} style={{ padding: '7px 12px', fontSize: 10, fontFamily: 'JetBrains Mono', color: 'var(--color-text-secondary)', fontWeight: 'normal', letterSpacing: '0.08em', textAlign: i >= 2 ? 'right' : 'left' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.constructors.map((c, i) => <ConstructorStandingRow key={c.team_name} c={c} isEven={i % 2 === 0} />)}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function DriverStandingRow({ d, isEven }: { d: DriverStanding; isEven: boolean }) {
  return (
    <tr
      style={{ background: isEven ? 'var(--color-bg)' : 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-panel)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = isEven ? 'var(--color-bg)' : 'var(--color-surface)'; }}
    >
      <td style={{ padding: '8px 12px', width: 48 }}>
        <PosBadge pos={d.position} />
      </td>
      <td style={{ padding: '8px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 3, height: 20, borderRadius: 2, background: d.team_color, flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 13, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: d.team_color }}>{d.driver_code}</div>
            <div style={{ fontSize: 10, color: 'var(--color-text-secondary)', fontFamily: 'JetBrains Mono' }}>{d.full_name}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '8px 12px' }}>
        <span style={{ fontSize: 11, color: 'var(--color-text-secondary)', fontFamily: 'JetBrains Mono' }}>{d.team_name}</span>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: d.wins > 0 ? '#FFD700' : 'var(--color-text-tertiary)' }}>{d.wins}</span>
      </td>
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: d.position === 1 ? '#FFD700' : 'var(--color-text-primary)' }}>{d.points}</span>
      </td>
    </tr>
  );
}

function ConstructorStandingRow({ c, isEven }: { c: ConstructorStanding; isEven: boolean }) {
  return (
    <tr
      style={{ background: isEven ? 'var(--color-bg)' : 'var(--color-surface)', borderBottom: '1px solid var(--color-border)' }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = 'var(--color-panel)'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLTableRowElement).style.background = isEven ? 'var(--color-bg)' : 'var(--color-surface)'; }}
    >
      <td style={{ padding: '10px 12px', width: 48 }}>
        <PosBadge pos={c.position} />
      </td>
      <td style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 4, height: 24, borderRadius: 2, background: c.team_color }} />
          <span style={{ fontSize: 12, fontWeight: 'bold', color: c.team_color }}>{c.team_name}</span>
        </div>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: c.wins > 0 ? '#FFD700' : 'var(--color-text-tertiary)' }}>{c.wins}</span>
      </td>
      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
        <span style={{ fontSize: 13, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: c.position === 1 ? '#FFD700' : 'var(--color-text-primary)' }}>{c.points}</span>
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

const LatestRaceDashboard: React.FC = () => {
  const [latestInfo, setLatestInfo] = useState<LatestRaceInfo | null>(null);
  const [results, setResults] = useState<SessionResultsResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DashTab>('results');

  const loadResults = useCallback(async (info: LatestRaceInfo) => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getSessionResults(info.year, info.gp_name, 'R');
      setResults(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load results');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const init = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const info = await api.getLatestRace();
        setLatestInfo(info);
        await loadResults(info);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to detect latest race');
        setIsLoading(false);
      }
    };
    init();
  }, []);

  const handleReload = useCallback(() => {
    if (latestInfo) loadResults(latestInfo);
  }, [latestInfo, loadResults]);

  if (isLoading && !results) {
    return (
      <div style={{ padding: 24 }}>
        <div style={{ color: 'var(--color-text-tertiary)', fontFamily: 'JetBrains Mono', fontSize: 11, marginBottom: 16 }}>Loading latest race data…</div>
        <PanelSkeleton rows={20} />
      </div>
    );
  }

  if (error && !results) {
    return <EmptyState message="Failed to load race data" subMessage={error} />;
  }

  if (!results || !latestInfo) return null;

  const TABS: { id: DashTab; label: string }[] = [
    { id: 'results',   label: 'RACE RESULTS' },
    { id: 'schedule',  label: 'SCHEDULE' },
    { id: 'standings', label: 'STANDINGS' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

      {/* Race header */}
      <div style={{ padding: '10px 16px', background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: 16, flexShrink: 0, flexWrap: 'wrap' }}>
        {/* Flag + Round badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <FlagIcon country={results.country} height={30} />
          <div style={{ background: '#E10600', color: '#fff', borderRadius: 4, padding: '2px 8px', fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 'bold', letterSpacing: '0.1em', textAlign: 'center', lineHeight: 1.3 }}>
            <div style={{ fontSize: 7, opacity: 0.8 }}>RND</div>
            <div>{latestInfo.round_number}</div>
          </div>
        </div>
        {/* Race name + circuit */}
        <div>
          <div style={{ fontSize: 16, fontWeight: 'bold', color: 'var(--color-text-primary)', letterSpacing: '0.04em' }}>{results.gp_name}</div>
          <div style={{ fontSize: 10, color: 'var(--color-text-tertiary)', fontFamily: 'JetBrains Mono', letterSpacing: '0.08em', display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>{results.country}</span>
            <span style={{ color: 'var(--color-border)' }}>·</span>
            <span>{results.circuit_name}</span>
            <span style={{ color: 'var(--color-border)' }}>·</span>
            <span>{results.date}</span>
          </div>
        </div>
        <div style={{ width: 1, height: 32, background: 'var(--color-border)', flexShrink: 0 }} />
        <div style={{ background: '#E10600', color: '#fff', borderRadius: 4, padding: '4px 10px', fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 'bold', letterSpacing: '0.08em' }}>RACE</div>
        {results.total_laps > 0 && (
          <div style={{ fontFamily: 'JetBrains Mono', fontSize: 11 }}>
            <span style={{ color: 'var(--color-text-tertiary)' }}>LAPS </span>
            <span style={{ color: 'var(--color-text-primary)', fontWeight: 'bold' }}>{results.total_laps}</span>
          </div>
        )}
        {results.weather_summary && (
          <>
            <div style={{ width: 1, height: 32, background: 'var(--color-border)', flexShrink: 0 }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {results.weather_summary.split('·').map((part, i) => (
                <WeatherChip key={i} label={i === 0 ? 'AIR' : 'TRACK'} value={part.trim()} />
              ))}
            </div>
          </>
        )}
        <div style={{ marginLeft: 'auto' }}>
          {isLoading && <span style={{ fontSize: 9, color: '#E10600', fontFamily: 'JetBrains Mono', marginRight: 8 }}>● LOADING</span>}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 0, background: 'var(--color-bg)', borderBottom: '1px solid var(--color-border)', flexShrink: 0 }}>
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setActiveTab(id)}
            style={{
              padding: '8px 20px',
              fontSize: 10,
              fontFamily: 'JetBrains Mono',
              letterSpacing: '0.1em',
              fontWeight: activeTab === id ? 'bold' : 'normal',
              color: activeTab === id ? 'var(--color-text-primary)' : 'var(--color-text-tertiary)',
              background: 'transparent',
              border: 'none',
              borderBottom: activeTab === id ? '2px solid #E10600' : '2px solid transparent',
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {activeTab === 'results' && (
          <ResultsTable results={results} isLoading={isLoading} onReload={handleReload} />
        )}
        {activeTab === 'schedule' && (
          <ScheduleTab year={latestInfo.year} />
        )}
        {activeTab === 'standings' && (
          <StandingsTab year={latestInfo.year} />
        )}
      </div>
    </div>
  );
};

export default LatestRaceDashboard;
