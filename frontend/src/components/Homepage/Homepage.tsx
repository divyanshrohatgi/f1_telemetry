/**
 * Homepage — F1.com-inspired dark cinematic design.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import type {
  HomepageData,
  HeroDriver,
  RaceInsight,
  SeasonRaceNode,
  DriverStanding,
  ConstructorStanding,
  AppMode,
  CircuitPoint,
} from '../../types/f1.types';
import { api } from '../../api/client';
import { formatLapTime } from '../../utils/formatting';
import { getCountryCode } from '../../constants/countryFlags';
import './Homepage.css';

// ─── Helpers ────────────────────────────────────────────────────────────────

function useCountdown(targetDate: string | null): string {
  const [display, setDisplay] = useState('');
  useEffect(() => {
    if (!targetDate) { setDisplay(''); return; }
    const target = new Date(targetDate + 'T14:00:00');
    const tick = () => {
      const diff = target.getTime() - Date.now();
      if (diff <= 0) { setDisplay('RACE WEEKEND'); return; }
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

function splitName(fullName: string): [string, string] {
  const parts = fullName.split(' ');
  if (parts.length <= 1) return ['', fullName];
  return [parts.slice(0, -1).join(' '), parts[parts.length - 1]];
}

// ─── HOME CIRCUIT MAP ────────────────────────────────────────────────────────
// Custom renderer — uses a square-ish viewBox so it fills the track-map-area properly.

function HomeCircuitMap({ points, rotation, teamColor }: {
  points: CircuitPoint[];
  rotation: number;
  teamColor: string;
}) {
  if (!points.length) return null;

  const angleRad = (rotation * Math.PI) / 180;
  const cosA = Math.cos(angleRad);
  const sinA = Math.sin(angleRad);

  const rotated = rotation === 0 ? points : points.map((p) => {
    const cx = p.x - 0.5, cy = p.y - 0.5;
    return { ...p, x: cx * cosA - cy * sinA + 0.5, y: cx * sinA + cy * cosA + 0.5 };
  });

  const xs = rotated.map((p) => p.x);
  const ys = rotated.map((p) => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);

  const W = 400, H = 260, PAD = 24;
  const xRange = Math.max(xMax - xMin, 0.001);
  const yRange = Math.max(yMax - yMin, 0.001);
  const scale = Math.min((W - 2 * PAD) / xRange, (H - 2 * PAD) / yRange);
  const xOff = (W - xRange * scale) / 2;
  const yOff = (H - yRange * scale) / 2;

  const polyline = rotated.map((p) => {
    const sx = xOff + (p.x - xMin) * scale;
    const sy = H - yOff - (p.y - yMin) * scale;
    return `${sx.toFixed(1)},${sy.toFixed(1)}`;
  }).join(' ');

  // Start/finish line position
  const first = rotated[0];
  const sfx = xOff + (first.x - xMin) * scale;
  const sfy = H - yOff - (first.y - yMin) * scale;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%' }}
      preserveAspectRatio="xMidYMid meet"
    >
      {/* Shadow/background track */}
      <polyline points={polyline} fill="none" stroke="#1A1A1A" strokeWidth={14}
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Dark track base */}
      <polyline points={polyline} fill="none" stroke="#2A2A2A" strokeWidth={10}
        strokeLinejoin="round" strokeLinecap="round" />
      {/* Colored track */}
      <polyline points={polyline} fill="none" stroke={teamColor} strokeWidth={4}
        strokeLinejoin="round" strokeLinecap="round" strokeOpacity={0.9} />
      {/* Start/finish marker */}
      <rect x={sfx - 4} y={sfy - 7} width={8} height={14} fill="#fff" rx={1} opacity={0.9} />
    </svg>
  );
}

// ─── F1 Widget Logo ──────────────────────────────────────────────────────────

function F1Logo() {
  return (
    <svg viewBox="0 0 80 20" fill="none" style={{ height: 18, width: 'auto' }}>
      <path d="M5 0h25l-5 20H0l5-20z" fill="#E10600"/>
      <path d="M12 4h10l-3 12H9l3-12z" fill="#fff"/>
      <path d="M35 0h12l-5 20H30l5-20zm18 0h10l-5 20H46l5-20z" fill="#fff"/>
    </svg>
  );
}

// ─── HOMEPAGE HEADER ────────────────────────────────────────────────────────

function HomepageHeader({ onNavigate }: { onNavigate: (mode: AppMode) => void }) {
  const navItems = [
    { label: 'Latest Race', key: 'latest' },
    { label: 'Schedule', key: 'schedule' },
    { label: 'Standings', key: 'standings' },
    { label: 'Analysis', key: 'analysis' },
  ];

  return (
    <header className="f1-header">
      <div className="f1-header-accent" />
      <div className="f1-header-main">
        <div className="f1-header-inner">
          <div className="f1-logo" onClick={() => onNavigate('home')} style={{ cursor: 'pointer' }}>
            <svg viewBox="0 0 80 20" fill="none" style={{ height: 28, width: 'auto' }}>
              <path d="M5 0h25l-5 20H0l5-20z" fill="#E10600"/>
              <path d="M12 4h10l-3 12H9l3-12z" fill="#fff"/>
              <path d="M35 0h12l-5 20H30l5-20zm18 0h10l-5 20H46l5-20z" fill="#fff"/>
            </svg>
          </div>

          <nav className="f1-nav">
            {navItems.map((item) => (
              <button
                key={item.key}
                className="f1-nav-item"
                onClick={() => onNavigate(item.key === 'analysis' ? 'analysis' : 'latest')}
              >
                {item.label}
              </button>
            ))}
          </nav>

          <div className="f1-header-actions">
            <button className="f1-subscribe-btn" onClick={() => onNavigate('analysis')}>
              ANALYSIS →
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

// ─── Loading / Error ────────────────────────────────────────────────────────

function LoadingSkeleton() {
  return (
    <div style={{ padding: '60px 40px', maxWidth: 1200, margin: '0 auto' }}>
      <div className="skeleton-shimmer" style={{ height: 320, marginBottom: 24 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton-shimmer" style={{ height: 200 }} />
        ))}
      </div>
    </div>
  );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={{ padding: '120px 24px', textAlign: 'center' }}>
      <div style={{ fontSize: 14, color: '#E10600', fontFamily: 'JetBrains Mono', marginBottom: 12 }}>
        FAILED TO LOAD
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 20 }}>{message}</div>
      <button onClick={onRetry} className="f1-subscribe-btn" style={{ display: 'inline-block' }}>
        RETRY
      </button>
    </div>
  );
}

// ─── TRACK INFO CARD (left side of hero) ────────────────────────────────────

function TrackInfoCard({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  const hero = data.hero;
  if (!hero) return null;

  return (
    <div className="track-info-card">
      {/* Race title */}
      <div className="track-info-title">
        FORMULA 1 {hero.year} {hero.gp_name.toUpperCase()}
      </div>
      <div className="track-info-location">
        <span
          className={`fi fi-${getCountryCode(hero.country).toLowerCase()} fis`}
          style={{ borderRadius: 2, fontSize: 14, flexShrink: 0 }}
        />
        <span>{hero.circuit_name}</span>
      </div>

      {/* Circuit Map */}
      <div className="track-map-area">
        {hero.circuit_points && hero.circuit_points.length > 0 ? (
          <HomeCircuitMap
            points={hero.circuit_points}
            rotation={hero.circuit_rotation}
            teamColor={hero.top5[0]?.team_color ?? '#27F4D2'}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', opacity: 0.2 }}>
            <svg width="260" height="160" viewBox="0 0 260 160" fill="none">
              <path d="M40 120 Q40 40 90 40 Q170 40 185 65 Q210 105 225 80 Q240 40 210 25 Q170 10 130 25 Q80 40 65 80 Q50 120 40 120Z"
                stroke="#666" strokeWidth="4" fill="none" strokeLinecap="round" />
            </svg>
          </div>
        )}
      </div>

      {/* Stats row — always show all 3 */}
      <div className="track-stats-row">
        <div className="track-stat">
          <div className="track-stat-label">NUMBER OF LAPS</div>
          <div className="track-stat-value">{hero.total_laps || '—'}</div>
        </div>
        <div className="track-stat">
          <div className="track-stat-label">CIRCUIT LENGTH</div>
          <div className="track-stat-value">
            {hero.circuit_length_km ? hero.circuit_length_km.toFixed(3) : '—'}
            {hero.circuit_length_km && <span className="track-stat-unit"> km</span>}
          </div>
        </div>
        <div className="track-stat">
          <div className="track-stat-label">RACE DISTANCE</div>
          <div className="track-stat-value">
            {hero.race_distance_km ? hero.race_distance_km.toFixed(1) : '—'}
            {hero.race_distance_km && <span className="track-stat-unit"> km</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── TIMING TOWER CARD (right side of hero) ──────────────────────────────────

function TimingTowerCard({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  const hero = data.hero;
  if (!hero) return null;

  return (
    <div className="widget-card">
      {/* Card header */}
      <div className="widget-header">
        <F1Logo />
        <span className="widget-badge">RACE</span>
      </div>

      {/* GP name + lap counter */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 16 }}>
        <span style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>{hero.gp_name}</span>
        <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', color: '#888' }}>
          Lap {hero.total_laps} / {hero.total_laps}
        </span>
      </div>

      {/* Timing rows */}
      {hero.top5.map((d: HeroDriver, i: number) => (
        <div key={d.driver_code} className="widget-timing-row">
          <span className="widget-pos">{d.position ?? i + 1}</span>

          {/* Team color bar */}
          <div style={{ width: 3, height: 28, borderRadius: 2, background: d.team_color, flexShrink: 0 }} />

          {/* Headshot or initials */}
          {d.headshot_url ? (
            <img
              src={d.headshot_url}
              alt={d.driver_code}
              style={{
                width: 28, height: 28, borderRadius: '50%',
                objectFit: 'cover', objectPosition: 'top center', flexShrink: 0,
              }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: d.team_color + '33',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', fontWeight: 700, color: d.team_color }}>
                {d.driver_code.slice(0, 2)}
              </span>
            </div>
          )}

          <span className="widget-driver-code">{d.driver_code}</span>

          <span className="widget-gap">
            {d.gap_to_leader === 'LEADER' ? 'Leader' : (d.gap_to_leader ?? '—')}
          </span>

          {/* Tyre compound pill (using fastest_lap_driver as a proxy for compound info) */}
          <div className="widget-compound" style={{
            background: i === 0 ? 'rgba(255,200,0,0.15)' : 'rgba(200,200,200,0.1)',
            color: i === 0 ? '#FFD700' : '#aaa',
          }}>
            M
          </div>
        </div>
      ))}

      <button className="widget-cta" onClick={() => onNavigate('latest')}>
        VIEW RACE DATA
      </button>
    </div>
  );
}

// ─── PERFORMANCE CARD (third hero card) ──────────────────────────────────────

function PerformanceCard({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  const hero = data.hero;
  if (!hero) return null;

  const mover = data.insights.find((i) => i.type === 'biggest_mover');
  const speedKing = data.insights.find((i) => i.type === 'speed_king');
  const strategy = data.insights.find((i) => i.type === 'best_strategy');

  function DriverBlock({ insight, label }: { insight: RaceInsight; label: string }) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', borderBottom: '1px solid #22252B' }}>
        {insight.headshot_url ? (
          <img src={insight.headshot_url} alt={insight.driver_code ?? ''} style={{
            width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', objectPosition: 'top center',
            border: `2px solid ${insight.team_color}55`, flexShrink: 0,
          }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
        ) : (
          <div style={{ width: 40, height: 40, borderRadius: '50%', background: insight.team_color + '22',
            border: `2px solid ${insight.team_color}44`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 700, color: insight.team_color }}>{insight.driver_code}</span>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.1em', marginBottom: 2 }}>{label}</div>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#fff', fontFamily: 'JetBrains Mono' }}>{insight.driver_code}</div>
          <div style={{ fontSize: 11, color: '#888', marginTop: 1 }}>{insight.detail}</div>
        </div>
        <div style={{ fontSize: 16, fontFamily: 'JetBrains Mono', fontWeight: 800,
          color: insight.type === 'biggest_mover' ? '#27C93F' : insight.type === 'speed_king' ? '#E10600' : '#FFD700',
          flexShrink: 0 }}>
          {insight.headline}
        </div>
      </div>
    );
  }

  return (
    <div className="widget-card" style={{ display: 'flex', flexDirection: 'column' }}>
      <div className="widget-header">
        <F1Logo />
        <span className="widget-badge">HIGHLIGHTS</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: '#fff', marginBottom: 4 }}>{hero.gp_name}</div>
      <div style={{ flex: 1 }}>
        {mover && <DriverBlock insight={mover} label="BIGGEST MOVER" />}
        {speedKing && <DriverBlock insight={speedKing} label="TOP SPEED" />}
        {strategy && <DriverBlock insight={strategy} label="WINNING STRATEGY" />}
        {/* Fastest lap stat */}
        {hero.fastest_lap_driver && (
          <div style={{ padding: '12px 0', borderBottom: '1px solid #22252B' }}>
            <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.1em', marginBottom: 4 }}>FASTEST LAP</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#A855F7', fontFamily: 'JetBrains Mono' }}>{hero.fastest_lap_driver}</span>
              <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#A855F7' }}>
                {hero.fastest_lap_time ? formatLapTime(hero.fastest_lap_time) : '—'}
              </span>
            </div>
          </div>
        )}
        {/* Safety cars */}
        {hero.safety_car_count > 0 && (
          <div style={{ padding: '12px 0' }}>
            <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.1em', marginBottom: 4 }}>SAFETY CAR</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#FFD700', fontFamily: 'JetBrains Mono' }}>
              {hero.safety_car_count}× deployed
            </div>
          </div>
        )}
      </div>
      <button className="widget-cta" onClick={() => onNavigate('analysis')}>
        OPEN ANALYSIS →
      </button>
    </div>
  );
}

// ─── INSIGHT WIDGET CARDS ────────────────────────────────────────────────────

function InsightCard({ insight, onNavigate }: { insight: RaceInsight; onNavigate: (mode: AppMode) => void }) {
  if (insight.type === 'biggest_mover') {
    // Battle / gap card style
    return (
      <div className="widget-card widget-card-dark" onClick={() => onNavigate('latest')}>
        <div className="widget-header">
          <F1Logo />
          <span className="widget-badge">RACE</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#888', letterSpacing: '0.1em', marginBottom: 8 }}>
            {insight.title}
          </div>
          {insight.headshot_url && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <img
                src={insight.headshot_url}
                alt={insight.driver_code ?? ''}
                style={{
                  width: 52, height: 52, borderRadius: '50%',
                  objectFit: 'cover', objectPosition: 'top center',
                  border: `2px solid ${insight.team_color}66`,
                }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
              <div>
                <div style={{ fontSize: 11, color: '#888', fontFamily: 'JetBrains Mono', marginBottom: 2 }}>
                  {insight.driver_code}
                </div>
                <div style={{ fontSize: 28, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#27C93F', letterSpacing: '-0.02em' }}>
                  {insight.headline}
                </div>
              </div>
            </div>
          )}
          {!insight.headshot_url && (
            <div style={{ fontSize: 28, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#27C93F', marginBottom: 4 }}>
              {insight.headline}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#666', fontFamily: 'JetBrains Mono' }}>{insight.detail}</div>
        </div>
      </div>
    );
  }

  if (insight.type === 'speed_king') {
    // Fastest lap purple style
    return (
      <div className="widget-card widget-card-purple" onClick={() => onNavigate('latest')}>
        <div className="widget-header">
          <F1Logo />
          <span className="widget-badge">RACE</span>
        </div>
        {/* Purple band */}
        <div className="widget-status-band widget-status-purple">
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#fff', letterSpacing: '-0.01em', lineHeight: 1 }}>
              {insight.title}
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
              {insight.headline}
            </div>
          </div>
          {insight.headshot_url && (
            <img
              src={insight.headshot_url}
              alt={insight.driver_code ?? ''}
              style={{
                height: 70, width: 52,
                objectFit: 'cover', objectPosition: 'top center',
                marginLeft: 'auto', flexShrink: 0,
              }}
              onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
            />
          )}
        </div>
        <div style={{ padding: '10px 0 4px', fontSize: 11, fontFamily: 'JetBrains Mono', color: '#888' }}>
          {insight.detail}
        </div>
      </div>
    );
  }

  if (insight.type === 'best_strategy') {
    // Winning strategy — neutral dark card
    return (
      <div className="widget-card widget-card-dark" onClick={() => onNavigate('latest')}>
        <div className="widget-header">
          <F1Logo />
          <span className="widget-badge">RACE</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#888', letterSpacing: '0.1em', marginBottom: 8 }}>
            {insight.title}
          </div>
          {insight.headshot_url && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <img
                src={insight.headshot_url}
                alt={insight.driver_code ?? ''}
                style={{
                  width: 48, height: 48, borderRadius: '50%',
                  objectFit: 'cover', objectPosition: 'top center',
                  border: `2px solid ${insight.team_color}55`,
                }}
                onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
              />
              <div>
                <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#888' }}>{insight.driver_code}</div>
                <div style={{ fontSize: 22, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#fff', letterSpacing: '0.04em' }}>
                  {insight.headline}
                </div>
              </div>
            </div>
          )}
          {!insight.headshot_url && (
            <div style={{ fontSize: 22, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#fff', marginBottom: 4 }}>
              {insight.headline}
            </div>
          )}
          <div style={{ fontSize: 11, color: '#666', fontFamily: 'JetBrains Mono' }}>{insight.detail}</div>
        </div>
      </div>
    );
  }

  return null;
}

// ─── WEEKEND STRIP ──────────────────────────────────────────────────────────

function WeekendStrip({ data }: { data: HomepageData }) {
  const countdown = useCountdown(data.next_race_date);
  if (!data.next_race_name) return null;

  return (
    <section className="weekend-strip">
      <div className="weekend-strip-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#E10600', animation: 'pulse-live 1.5s ease-in-out infinite' }} />
          <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E10600', letterSpacing: '0.1em', fontWeight: 700 }}>NEXT</span>
        </div>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#F0F0F0' }}>{data.next_race_name}</span>
        {data.next_race_country && (
          <span style={{ fontSize: 10, color: '#666', fontFamily: 'JetBrains Mono' }}>{data.next_race_country}</span>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 10, color: '#666', fontFamily: 'JetBrains Mono' }}>RACE IN</span>
          <span style={{ fontSize: 16, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#E10600', letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>
            {countdown || '—'}
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── HERO SECTION ────────────────────────────────────────────────────────────

function HeroSection({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  if (!data.hero) return null;
  return (
    <section className="hero-wrapper">
      <div className="hero-speed-lines" />
      <div className="hero-bottom-fade" />
      <div className="hero-inner">
        <TrackInfoCard data={data} onNavigate={onNavigate} />
        <TimingTowerCard data={data} onNavigate={onNavigate} />
        <PerformanceCard data={data} onNavigate={onNavigate} />
      </div>
    </section>
  );
}

// ─── FEATURED INSIGHTS ───────────────────────────────────────────────────────

function FeaturedInsights({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  if (data.insights.length === 0) return null;
  return (
    <section className="featured-section">
      <div className="section-label">FEATURED</div>
      <div className="featured-grid">
        {data.insights.map((insight: RaceInsight, i: number) => (
          <InsightCard key={i} insight={insight} onNavigate={onNavigate} />
        ))}
      </div>
    </section>
  );
}

// ─── STANDINGS ───────────────────────────────────────────────────────────────

function StandingsSection({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  if (data.drivers_standings.length === 0) return null;

  const maxDriverPts = data.drivers_standings[0]?.points || 1;
  const maxConPts = data.constructors_standings[0]?.points || 1;

  return (
    <section className="standings-section">
      <div className="standings-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <span className="section-label" style={{ margin: 0 }}>CHAMPIONSHIP</span>
          <div style={{ flex: 1, height: 1, background: '#2A2A2A' }} />
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555' }}>AFTER ROUND {data.standings_round}</span>
        </div>
        <div className="standings-grid">
          <div>
            <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.12em', marginBottom: 16, fontWeight: 600 }}>
              DRIVERS
            </div>
            {data.drivers_standings.map((d: DriverStanding) => (
              <div key={d.driver_code} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#555', width: 20, textAlign: 'right' }}>{d.position}</span>
                <div style={{ width: 4, height: 22, borderRadius: 2, background: d.team_color, flexShrink: 0 }} />
                <span style={{ fontSize: 13, fontWeight: 700, color: '#F0F0F0', width: 42, fontFamily: 'JetBrains Mono' }}>{d.driver_code}</span>
                <div className="standings-bar-track">
                  <div className="standings-bar-fill" style={{ background: `linear-gradient(90deg, ${d.team_color}CC, ${d.team_color}33)`, width: `${(d.points / maxDriverPts) * 100}%` }} />
                </div>
                <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#ccc', width: 42, textAlign: 'right' }}>{d.points}</span>
              </div>
            ))}
            <button onClick={() => onNavigate('latest')} className="standings-link">FULL STANDINGS →</button>
          </div>
          <div>
            <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.12em', marginBottom: 16, fontWeight: 600 }}>
              CONSTRUCTORS
            </div>
            {data.constructors_standings.map((c: ConstructorStanding) => (
              <div key={c.team_name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#555', width: 20, textAlign: 'right' }}>{c.position}</span>
                <div style={{ width: 4, height: 22, borderRadius: 2, background: c.team_color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#F0F0F0', width: 85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.team_name}</span>
                <div className="standings-bar-track">
                  <div className="standings-bar-fill" style={{ background: `linear-gradient(90deg, ${c.team_color}CC, ${c.team_color}33)`, width: `${(c.points / maxConPts) * 100}%` }} />
                </div>
                <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#ccc', width: 42, textAlign: 'right' }}>{c.points}</span>
              </div>
            ))}
            <button onClick={() => onNavigate('latest')} className="standings-link">FULL STANDINGS →</button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── SCHEDULE SECTION ─────────────────────────────────────────────────────────

function ScheduleSection({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  if (data.season_nodes.length === 0) return null;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const nextEl = container.querySelector<HTMLElement>('.schedule-card-next');
    if (nextEl) {
      nextEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
    }
  }, [data.season_nodes]);

  return (
    <section style={{ padding: '40px 0 48px', borderTop: '1px solid #2A2A2A' }}>
      {/* Header */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span className="section-label" style={{ margin: 0 }}>{data.season_year} SCHEDULE</span>
          <div style={{ flex: 1, height: 1, background: '#2A2A2A' }} />
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555' }}>
            {data.completed_races} / {data.total_races} RACES
          </span>
        </div>
      </div>

      {/* Horizontal scrollable cards */}
      <div ref={scrollRef} style={{ overflowX: 'auto', paddingBottom: 8, WebkitOverflowScrolling: 'touch' as any }}>
        <div style={{ display: 'flex', gap: 12, padding: '4px 40px', width: 'max-content' }}>
          {data.season_nodes.map((node: SeasonRaceNode) => (
            <div
              key={node.round_number}
              className={`schedule-card${node.is_next ? ' schedule-card-next' : ''}${node.is_completed ? ' schedule-card-done' : ''}`}
              onClick={() => node.is_completed && onNavigate('latest')}
            >
              {/* Top row: round + badge */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#555' }}>R{node.round_number}</span>
                {node.is_next && (
                  <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#fff', background: '#E10600', padding: '2px 7px', borderRadius: 3, letterSpacing: '0.08em' }}>
                    NEXT
                  </span>
                )}
                {node.is_completed && (
                  <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.06em' }}>DONE</span>
                )}
              </div>

              {/* Flag + GP name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                <span
                  className={`fi fi-${getCountryCode(node.country).toLowerCase()} fis`}
                  style={{ borderRadius: 2, fontSize: 16, flexShrink: 0 }}
                />
                <span style={{ fontSize: 13, fontWeight: 700, color: node.is_completed ? '#666' : '#F0F0F0', lineHeight: 1.2 }}>
                  {node.gp_name.replace(' Grand Prix', '').replace(' Grand Prix', '')}
                </span>
              </div>

              {/* Date */}
              <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#555', marginBottom: 12 }}>
                {new Date(node.date).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </div>

              {/* Divider */}
              <div style={{ height: 1, background: '#2A2D35', marginBottom: 12 }} />

              {/* Circuit stats */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {node.total_laps && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.08em' }}>LAPS</span>
                    <span style={{ fontSize: 14, fontFamily: 'JetBrains Mono', fontWeight: 700, color: node.is_completed ? '#666' : '#ccc' }}>{node.total_laps}</span>
                  </div>
                )}
                {node.race_distance_km && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                    <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.08em' }}>DISTANCE</span>
                    <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 600, color: node.is_completed ? '#555' : '#aaa' }}>{node.race_distance_km.toFixed(1)} km</span>
                  </div>
                )}
                {node.lap_record_time && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                    <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.08em', flexShrink: 0 }}>RECORD</span>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 600, color: '#A855F7' }}>{node.lap_record_time}</div>
                      <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555' }}>{node.lap_record_driver} {node.lap_record_year}</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── PITSENSE TEASER ─────────────────────────────────────────────────────────

function PitSenseTeaser({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  const hero = data.hero;
  if (!hero || hero.top5.length < 3) return null;
  const teaserDriver = hero.top5[2];

  return (
    <section style={{ maxWidth: 1200, margin: '0 auto', padding: '0 40px 48px' }}>
      <div className="pitsense-card">
        <div className="pitsense-accent" />
        <div style={{ paddingLeft: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#27F4D2', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em' }}>PITSENSE</span>
            <span style={{ fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono' }}>— AI STRATEGY ENGINE</span>
          </div>
          <div style={{ fontSize: 16, color: '#ccc', marginBottom: 20, lineHeight: 1.5 }}>
            What if <span style={{ color: teaserDriver.team_color, fontWeight: 700 }}>{teaserDriver.driver_code}</span> pitted
            3 laps earlier at {hero.gp_name.split(' ').pop()}?
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 24 }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono', marginBottom: 4 }}>ACTUAL</div>
              <div style={{ fontSize: 28, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#888' }}>P{teaserDriver.position}</div>
            </div>
            <div style={{ fontSize: 24, color: '#27F4D2' }}>→</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono', marginBottom: 4 }}>PREDICTED</div>
              <div style={{ fontSize: 28, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#27F4D2' }}>
                P{Math.max(1, (teaserDriver.position ?? 3) - 1)}
              </div>
            </div>
            <div style={{ padding: '6px 14px', borderRadius: 4, background: 'rgba(39,244,210,0.1)', border: '1px solid rgba(39,244,210,0.2)', fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#27F4D2' }}>
              +1 position
            </div>
          </div>
          <button className="pitsense-cta" onClick={() => onNavigate('analysis')}>
            TRY THE FULL SIMULATOR →
          </button>
        </div>
      </div>
    </section>
  );
}

// ─── RETURN VISITOR BANNER ───────────────────────────────────────────────────

function ReturnVisitorBanner({ onNavigate }: { onNavigate: (mode: AppMode) => void }) {
  const [lastSession, setLastSession] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try { const last = localStorage.getItem('gridinsight_last_session'); if (last) setLastSession(last); } catch { /**/ }
  }, []);

  if (!lastSession || dismissed) return null;

  return (
    <div className="return-banner" style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
      <span style={{ fontSize: 11, color: '#888' }}>Continue where you left off →</span>
      <button onClick={() => onNavigate('latest')} style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E10600', background: 'none', border: '1px solid #E1060044', borderRadius: 4, padding: '4px 12px', cursor: 'pointer' }}>
        {lastSession}
      </button>
      <button onClick={() => setDismissed(true)} style={{ fontSize: 14, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
    </div>
  );
}

// ─── MAIN HOMEPAGE ───────────────────────────────────────────────────────────

interface HomepageProps {
  onNavigate: (mode: AppMode) => void;
}

const Homepage: React.FC<HomepageProps> = ({ onNavigate }) => {
  const [data, setData] = useState<HomepageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getHomepageData();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load homepage data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  if (loading) return (
    <>
      <HomepageHeader onNavigate={onNavigate} />
      <LoadingSkeleton />
    </>
  );
  if (error || !data) return (
    <>
      <HomepageHeader onNavigate={onNavigate} />
      <ErrorState message={error ?? 'Unknown error'} onRetry={loadData} />
    </>
  );

  return (
    <div className="homepage-scroll">
      <HomepageHeader onNavigate={onNavigate} />
      <ReturnVisitorBanner onNavigate={onNavigate} />
      <HeroSection data={data} onNavigate={onNavigate} />
      <WeekendStrip data={data} />
      <StandingsSection data={data} onNavigate={onNavigate} />
      <ScheduleSection data={data} onNavigate={onNavigate} />
    </div>
  );
};

export default Homepage;
