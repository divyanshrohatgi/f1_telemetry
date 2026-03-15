import { useState, useEffect } from 'react';
import { Radio } from 'lucide-react';
import type { LiveSession } from '../../hooks/useLiveStatus';

// ── Types ────────────────────────────────────────────────────────────────────

interface LiveDriver {
  position: number;
  driver_number: number;
  name_acronym: string;
  full_name: string;
  team_name: string;
  team_color: string;
  gap_to_leader: number | null;
  gap_to_leader_raw: string | null;
  interval: number | null;
  interval_raw: string | null;
  last_lap_time: number | null;
  compound: string | null;
  tyre_age: number;
  is_pit_out_lap: boolean;
  st_speed: number | null;
}

interface LiveWeather {
  air_temp: number | null;
  track_temp: number | null;
  humidity: number | null;
  wind_speed: number | null;
  rainfall: number;
}

interface LiveRaceData {
  session: { name: string; gp: string; circuit: string; current_lap: number } | null;
  drivers: LiveDriver[];
  weather: LiveWeather | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function formatLap(seconds: number | null): string {
  if (seconds === null || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = (seconds % 60).toFixed(3).padStart(6, '0');
  return `${m}:${s}`;
}

function formatGap(raw: string | null, parsed: number | null): string {
  if (raw === null) return 'LEADER';
  if (raw.toUpperCase().includes('LAP')) return raw;
  if (parsed === null) return raw;
  return `+${parsed.toFixed(3)}`;
}

const COMPOUND_COLORS: Record<string, { bg: string; text: string }> = {
  SOFT:         { bg: '#C8002D', text: '#fff' },
  MEDIUM:       { bg: '#FFC906', text: '#000' },
  HARD:         { bg: '#EFEFEF', text: '#000' },
  INTERMEDIATE: { bg: '#39B54A', text: '#fff' },
  WET:          { bg: '#0067FF', text: '#fff' },
};

// ── Sub-components ────────────────────────────────────────────────────────────

function CompoundBadge({ compound, age }: { compound: string | null; age: number }) {
  if (!compound) return <span style={{ color: '#444' }}>—</span>;
  const key = compound.toUpperCase();
  const s = COMPOUND_COLORS[key] ?? { bg: '#333', text: '#aaa' };
  const letter = key === 'INTERMEDIATE' ? 'I' : key[0];
  return (
    <span style={{
      background: s.bg, color: s.text, borderRadius: 3, padding: '1px 5px',
      fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 'bold',
      letterSpacing: '0.06em', whiteSpace: 'nowrap',
    }}>
      {letter}
      {age > 0 && <span style={{ fontWeight: 'normal', marginLeft: 2, opacity: 0.8 }}>{age}L</span>}
    </span>
  );
}

function PosBadge({ pos }: { pos: number }) {
  const medals: Record<number, string> = { 1: '#FFD700', 2: '#C0C0C0', 3: '#CD7F32' };
  const bg = medals[pos];
  return (
    <div style={{
      width: 24, height: 24, borderRadius: 3,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: bg ?? 'transparent',
      border: bg ? 'none' : '1px solid #2A2A2A',
    }}>
      <span style={{
        fontSize: 11, fontFamily: 'JetBrains Mono', fontWeight: 'bold',
        color: bg ? '#000' : '#666',
      }}>
        {pos}
      </span>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function LiveRaceDashboard({ session }: { session: LiveSession }) {
  const [data, setData] = useState<LiveRaceData | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      fetch('/api/v1/live/race')
        .then(r => r.json())
        .then((d: LiveRaceData) => {
          if (!cancelled) { setData(d); setLastUpdate(new Date()); }
        })
        .catch(() => {});
    };
    poll();
    const id = setInterval(poll, 5_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const meta = data?.session;
  const drivers = data?.drivers ?? [];
  const weather = data?.weather;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#0A0A0A' }}>

      {/* Session header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '8px 16px', borderBottom: '1px solid #1E1E1E', flexShrink: 0,
        background: '#0D0D0D',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Radio size={12} style={{ color: '#E10600', animation: 'pulse-live 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 10, fontWeight: 700, color: '#E10600', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em' }}>LIVE</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: '#F0F0F0', fontFamily: 'Titillium Web, sans-serif' }}>
            {session.gp}
          </span>
          <span style={{ fontSize: 11, color: '#555', fontFamily: 'JetBrains Mono' }}>
            {session.name}
          </span>
          {meta?.current_lap ? (
            <span style={{ fontSize: 10, color: '#888', fontFamily: 'JetBrains Mono' }}>
              LAP {meta.current_lap}
            </span>
          ) : null}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {weather && (
            <>
              <span style={{ fontSize: 10, color: '#555', fontFamily: 'JetBrains Mono' }}>
                Air {weather.air_temp}°C
              </span>
              <span style={{ fontSize: 10, color: '#555', fontFamily: 'JetBrains Mono' }}>
                Track {weather.track_temp}°C
              </span>
              {(weather.rainfall ?? 0) > 0 && (
                <span style={{ fontSize: 10, color: '#3B82F6', fontFamily: 'JetBrains Mono' }}>Rain</span>
              )}
            </>
          )}
          {lastUpdate && (
            <span style={{ fontSize: 9, color: '#333', fontFamily: 'JetBrains Mono' }}>
              {lastUpdate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Timing tower */}
      <div style={{ flex: 1, overflow: 'auto' }}>
        {drivers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#555', fontFamily: 'JetBrains Mono', fontSize: 12 }}>
            Waiting for timing data…
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #1A1A1A' }}>
                {['POS', 'DRIVER', 'TEAM', 'GAP', 'INTERVAL', 'LAST LAP', 'TYRE', 'SPEED'].map(h => (
                  <th key={h} style={{
                    padding: '6px 8px', textAlign: 'left', fontSize: 8,
                    color: '#444', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em',
                    fontWeight: 600, whiteSpace: 'nowrap',
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {drivers.map((drv, i) => (
                <tr
                  key={drv.driver_number}
                  style={{
                    borderBottom: '1px solid #111',
                    background: i % 2 === 0 ? '#0A0A0A' : '#0D0D0D',
                  }}
                >
                  {/* Position */}
                  <td style={{ padding: '7px 8px 7px 12px', width: 40 }}>
                    <PosBadge pos={drv.position} />
                  </td>

                  {/* Driver */}
                  <td style={{ padding: '7px 12px 7px 4px', minWidth: 110 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 3, height: 20, borderRadius: 2, background: drv.team_color, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontFamily: 'JetBrains Mono', fontWeight: 'bold', color: drv.team_color }}>
                          {drv.name_acronym}
                        </div>
                        <div style={{ fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono' }}>
                          #{drv.driver_number}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Team */}
                  <td style={{ padding: '7px 8px', minWidth: 120 }}>
                    <span style={{ fontSize: 11, color: '#888', fontFamily: 'Titillium Web, sans-serif', whiteSpace: 'nowrap' }}>
                      {drv.team_name}
                    </span>
                  </td>

                  {/* Gap to leader */}
                  <td style={{ padding: '7px 8px', minWidth: 80 }}>
                    <span style={{
                      fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 'bold',
                      color: drv.position === 1 ? '#FFD700' : '#CCC',
                      whiteSpace: 'nowrap',
                    }}>
                      {formatGap(drv.gap_to_leader_raw, drv.gap_to_leader)}
                    </span>
                  </td>

                  {/* Interval */}
                  <td style={{ padding: '7px 8px', minWidth: 70 }}>
                    <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#888', whiteSpace: 'nowrap' }}>
                      {drv.position === 1 ? '—' : formatGap(drv.interval_raw, drv.interval)}
                    </span>
                  </td>

                  {/* Last lap */}
                  <td style={{ padding: '7px 8px', minWidth: 80 }}>
                    <span style={{
                      fontSize: 12, fontFamily: 'JetBrains Mono',
                      color: drv.is_pit_out_lap ? '#FFC906' : '#CCC',
                      whiteSpace: 'nowrap',
                    }}>
                      {drv.is_pit_out_lap ? 'PIT OUT' : formatLap(drv.last_lap_time)}
                    </span>
                  </td>

                  {/* Tyre */}
                  <td style={{ padding: '7px 8px' }}>
                    <CompoundBadge compound={drv.compound} age={drv.tyre_age} />
                  </td>

                  {/* Speed trap */}
                  <td style={{ padding: '7px 12px 7px 8px' }}>
                    <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#666', whiteSpace: 'nowrap' }}>
                      {drv.st_speed ? `${drv.st_speed} km/h` : '—'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
