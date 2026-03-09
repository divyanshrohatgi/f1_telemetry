/**
 * Homepage — F1.com-inspired dark cinematic design.
 *
 * Layout:
 *   ┌────────────────────────────────────────────────┐
 *   │ HERO: GP Name + Circuit Map | Timing Tower     │
 *   │       Stat Cards Row                           │
 *   ├────────────────────────────────────────────────┤
 *   │ "This Weekend" sticky strip                    │
 *   ├────────────────────────────────────────────────┤
 *   │ FEATURED: Insight cards (3-col grid)           │
 *   ├────────────────────────────────────────────────┤
 *   │ STANDINGS: WDC / WCC side-by-side              │
 *   ├────────────────────────────────────────────────┤
 *   │ SEASON TIMELINE + Progress                     │
 *   ├────────────────────────────────────────────────┤
 *   │ PITSENSE TEASER                                │
 *   └────────────────────────────────────────────────┘
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
} from '../../types/f1.types';
import { api } from '../../api/client';
import { formatLapTime } from '../../utils/formatting';
import { getCountryCode } from '../../constants/countryFlags';
import CircuitMap from '../CircuitMap/CircuitMap';
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

// ─── HOMEPAGE HEADER ────────────────────────────────────────────────────────

function HomepageHeader({ onNavigate }: { onNavigate: (mode: AppMode) => void }) {
  const [hoveredNav, setHoveredNav] = useState<string | null>(null);

  const navItems = [
    { label: 'Latest', key: 'latest' },
    { label: 'Schedule', key: 'schedule' },
    { label: 'Standings', key: 'standings' },
    { label: 'Drivers', key: 'drivers' },
    { label: 'Teams', key: 'teams' },
    { label: 'Live Timing', key: 'live' },
  ];

  return (
    <header className="f1-header">
      {/* Top red accent bar */}
      <div className="f1-header-accent" />
      
      {/* Main header content */}
      <div className="f1-header-main">
        <div className="f1-header-inner">
          {/* Logo */}
          <div 
            className="f1-logo" 
            onClick={() => onNavigate('home')}
            style={{ cursor: 'pointer' }}
          >
            <svg viewBox="0 0 80 20" fill="none" style={{ height: 28, width: 'auto' }}>
              <path d="M5 0h25l-5 20H0l5-20z" fill="#E10600"/>
              <path d="M12 4h10l-3 12H9l3-12z" fill="#fff"/>
              <path d="M35 0h12l-5 20H30l5-20zm18 0h10l-5 20H46l5-20z" fill="#fff"/>
            </svg>
          </div>

          {/* Navigation */}
          <nav className="f1-nav">
            {navItems.map((item) => (
              <button
                key={item.key}
                className={`f1-nav-item ${hoveredNav === item.key ? 'hovered' : ''}`}
                onMouseEnter={() => setHoveredNav(item.key)}
                onMouseLeave={() => setHoveredNav(null)}
                onClick={() => {
                  if (item.key === 'live' || item.key === 'latest') {
                    onNavigate('latest');
                  } else if (item.key === 'schedule' || item.key === 'standings' || item.key === 'drivers' || item.key === 'teams') {
                    onNavigate('latest');
                  }
                }}
              >
                {item.label}
                {['Schedule', 'Standings', 'Drivers', 'Teams'].includes(item.label) && (
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="currentColor" style={{ marginLeft: 4 }}>
                    <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none"/>
                  </svg>
                )}
              </button>
            ))}
          </nav>

          {/* Right actions */}
          <div className="f1-header-actions">
            <button className="f1-signin-btn">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="8" r="4"/>
                <path d="M4 20c0-4 4-6 8-6s8 2 8 6"/>
              </svg>
              SIGN IN
            </button>
            <button className="f1-subscribe-btn" onClick={() => onNavigate('analysis')}>
              ANALYSIS
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
        FAILED TO LOAD HOMEPAGE DATA
      </div>
      <div style={{ fontSize: 12, color: '#666', marginBottom: 20 }}>{message}</div>
      <button onClick={onRetry} className="hero-cta" style={{ width: 'auto', padding: '10px 28px', display: 'inline-block' }}>
        RETRY
      </button>
    </div>
  );
}

// ─── HERO SECTION (F1.com-style) ────────────────────────────────────────────

function HeroSection({
  data,
  onNavigate,
}: {
  data: HomepageData;
  onNavigate: (mode: AppMode) => void;
}) {
  const hero = data.hero;
  if (!hero) return null;

  const driversToShow = hero.top5.slice(0, 5);

return (
    <section className="hero-wrapper">
      {/* Speed lines effect */}
      <div className="hero-speed-lines" />
      {/* Bottom gradient fade */}
      <div className="hero-bottom-fade" />
      
      <div className="hero-inner">
        {/* LEFT: GP Name + Circuit */}
        <div className="hero-left">
{/* LIVE badge + temperature */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div className="live-badge">
              <div className="live-dot" />
              LIVE
            </div>
            <span style={{ fontSize: 13, color: '#999', fontFamily: 'JetBrains Mono', fontWeight: 500 }}>
              23.1°C
            </span>
          </div>

          {/* GP Name — F1.com style with arrow */}
          <h1 className="hero-gp-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontStyle: 'italic' }}>{hero.gp_name.toUpperCase().split(' ')[0]}</span>
            <span style={{ fontWeight: 300, fontStyle: 'normal' }}>{hero.year}</span>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" style={{ marginLeft: 8 }}>
              <path d="M9 6L15 12L9 18" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </h1>

          {/* Circuit label */}
          <div className="hero-circuit-label" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span className={`fi fi-${getCountryCode(hero.country).toLowerCase()} fis`} style={{ borderRadius: 2, fontSize: 16 }} />
            {hero.circuit_name}
          </div>

          {/* Circuit Map — real track layout from telemetry, with fallback */}
          {hero.circuit_points && hero.circuit_points.length > 0 ? (
            <div style={{ marginTop: 24, background: 'rgba(0,0,0,0.3)', borderRadius: 8, padding: '8px 0', border: '1px solid #2A2A2A' }}>
              <CircuitMap
                circuitPoints={hero.circuit_points}
                circuitRotation={hero.circuit_rotation}
                trackColor="#E10600"
              />
            </div>
          ) : (
            <div className="circuit-map-container" style={{ marginTop: 24 }}>
              <svg width="200" height="120" viewBox="0 0 200 120" fill="none" style={{ opacity: 0.4 }}>
                <path
                  d="M30 90 Q30 30 70 30 Q130 30 140 50 Q160 80 170 60 Q180 30 160 20 Q130 10 100 20 Q60 30 50 60 Q40 90 30 90Z"
                  stroke="#555" strokeWidth="2" fill="none" strokeLinecap="round"
                />
                <circle cx="30" cy="90" r="4" fill="#E10600" />
                <circle cx="140" cy="50" r="3" fill="#27F4D2" />
                <circle cx="100" cy="20" r="3" fill="#FFD700" />
              </svg>
            </div>
          )}

          {/* Stat cards */}
          <div className="stat-cards-row">
            <div className="stat-card">
              <div className="stat-card-label">LAPS LED</div>
              <div className="stat-card-value">{hero.laps_led_count || '—'}</div>
              <div className="stat-card-sub">{hero.laps_led_driver ?? ''}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">FASTEST LAP</div>
              <div className="stat-card-value">{hero.fastest_lap_time ? formatLapTime(hero.fastest_lap_time) : '—'}</div>
              <div className="stat-card-sub">{hero.fastest_lap_driver ?? ''}</div>
            </div>
            <div className="stat-card">
              <div className="stat-card-label">SAFETY CARS</div>
              <div className="stat-card-value">{hero.safety_car_count}</div>
              <div className="stat-card-sub">&nbsp;</div>
            </div>
          </div>
        </div>

        {/* RIGHT: Timing Tower */}
        <div className="hero-right">
          <div className="timing-tower">
            {/* Lap counter */}
            <div className="lap-counter">
              <div>
                <div className="lap-label">LAP</div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 2 }}>
                  <span className="lap-number">{hero.total_laps}</span>
                  <span className="lap-total">/{hero.total_laps}</span>
                </div>
              </div>
            </div>

            {/* Timing rows */}
            {driversToShow.map((d: HeroDriver, i: number) => {
              const [firstName, lastName] = splitName(d.full_name);
              return (
                <div key={d.driver_code} className="timing-row">
                  <span className="timing-pos">{d.position ?? i + 1}</span>
                  <div className="timing-team-bar" style={{ background: d.team_color }} />
                  {/* Driver headshot */}
                  {d.headshot_url ? (
                    <img
                      src={d.headshot_url}
                      alt={d.driver_code}
                      style={{
                        width: 32, height: 32, borderRadius: '50%',
                        objectFit: 'cover', objectPosition: 'top center',
                        border: `2px solid ${d.team_color}55`, flexShrink: 0,
                      }}
                      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div style={{
                      width: 32, height: 32, borderRadius: '50%',
                      background: d.team_color + '22', border: `2px solid ${d.team_color}44`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}>
                      <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', fontWeight: 700, color: d.team_color }}>{d.driver_code}</span>
                    </div>
                  )}
                  <span className="timing-name">
                    <span className="timing-name-first">{firstName} </span>
                    <span className="timing-name-last">{lastName}</span>
                  </span>
                  <span className={`timing-gap ${d.gap_to_leader === 'LEADER' ? 'leader' : ''}`}>
                    {d.gap_to_leader === 'LEADER' ? 'LEADER' : d.gap_to_leader ?? '—'}
                  </span>
                </div>
              );
            })}

{/* CTA */}
            <button className="hero-cta" onClick={() => onNavigate('latest')}>
              JOIN LIVE SESSION
            </button>
          </div>
        </div>
      </div>
    </section>
  );
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
          <span className="countdown-value" style={{ fontSize: 16, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#E10600', letterSpacing: '0.04em' }}>
            {countdown || '—'}
          </span>
        </div>
      </div>
    </section>
  );
}

// ─── FEATURED INSIGHTS (3-col card grid like F1.com) ────────────────────────

// Grayscale backgrounds with subtle gradients for F1.com look
const INSIGHT_GRADIENTS: Record<string, string> = {
  biggest_mover: 'linear-gradient(145deg, #2A2A2A 0%, #1A1A1A 100%)',
  speed_king: 'linear-gradient(145deg, #333 0%, #1A1A1A 100%)',
  best_strategy: 'linear-gradient(145deg, #2A2A2A 0%, #111 100%)',
};

function FeaturedInsights({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  if (data.insights.length === 0) return null;

  return (
    <section className="featured-section">
      <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#888', letterSpacing: '0.15em', fontWeight: 700, marginBottom: 20, textTransform: 'uppercase' as const }}>
        FEATURED
      </div>
      <div className="featured-grid">
        {data.insights.map((insight: RaceInsight, i: number) => (
          <div key={i} className="featured-card" onClick={() => onNavigate('latest')}>
            {/* Image area with headshot + gradient */}
            <div
              className="featured-card-image"
              style={{ background: INSIGHT_GRADIENTS[insight.type] ?? 'linear-gradient(135deg, #333 0%, #111 100%)' }}
            >
{insight.headshot_url ? (
                <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
                  {/* Grayscale driver photo */}
                  <img
                    src={insight.headshot_url}
                    alt={insight.driver_code ?? ''}
                    style={{
                      width: '100%',
                      height: '100%',
                      objectFit: 'cover',
                      objectPosition: 'top center',
                      filter: 'grayscale(100%) contrast(1.1)',
                      opacity: 0.85,
                    }}
                    onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
                  />
                  {/* Overlay gradient for text readability */}
                  <div style={{
                    position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%',
                    background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, transparent 100%)',
                  }} />
                  {/* Text overlay like F1.com */}
                  <div style={{ position: 'absolute', bottom: 12, left: 14, right: 14, zIndex: 2 }}>
                    <div style={{ 
                      fontSize: 14, fontWeight: 800, color: '#fff', 
                      lineHeight: 1.3, textTransform: 'uppercase' as const,
                      textShadow: '0 1px 3px rgba(0,0,0,0.8)',
                    }}>
                      {insight.title}
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ 
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: '100%', height: '100%', background: '#222',
                }}>
                  <div style={{ 
                    fontSize: 14, fontWeight: 800, color: '#fff', 
                    textTransform: 'uppercase' as const, textAlign: 'center', padding: 16,
                  }}>
                    {insight.title}
                  </div>
                </div>
              )}
            </div>
<div className="featured-card-body">
              <div className="featured-card-title">
                {insight.detail}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ─── STANDINGS ──────────────────────────────────────────────────────────────

function StandingsSection({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  if (data.drivers_standings.length === 0) return null;

  const maxDriverPts = data.drivers_standings[0]?.points || 1;
  const maxConPts = data.constructors_standings[0]?.points || 1;

  return (
    <section className="standings-section">
      <div className="standings-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
          <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#888', letterSpacing: '0.15em', fontWeight: 700 }}>
            CHAMPIONSHIP
          </span>
          <div style={{ flex: 1, height: 1, background: '#2A2A2A' }} />
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555' }}>AFTER ROUND {data.standings_round}</span>
        </div>

        <div className="standings-grid">
          {/* WDC */}
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
                  <div className="standings-bar-fill"
                    style={{ background: `linear-gradient(90deg, ${d.team_color}CC, ${d.team_color}33)`, width: `${(d.points / maxDriverPts) * 100}%` }}
                  />
                </div>
                <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#ccc', width: 42, textAlign: 'right' }}>
                  {d.points}
                </span>
              </div>
            ))}
            <button onClick={() => onNavigate('latest')} style={{
              marginTop: 12, fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E10600',
              background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em',
            }}>
              FULL STANDINGS →
            </button>
          </div>

          {/* WCC */}
          <div>
            <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.12em', marginBottom: 16, fontWeight: 600 }}>
              CONSTRUCTORS
            </div>
            {data.constructors_standings.map((c: ConstructorStanding) => (
              <div key={c.team_name} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#555', width: 20, textAlign: 'right' }}>{c.position}</span>
                <div style={{ width: 4, height: 22, borderRadius: 2, background: c.team_color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 600, color: '#F0F0F0', width: 85, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {c.team_name}
                </span>
                <div className="standings-bar-track">
                  <div className="standings-bar-fill"
                    style={{ background: `linear-gradient(90deg, ${c.team_color}CC, ${c.team_color}33)`, width: `${(c.points / maxConPts) * 100}%` }}
                  />
                </div>
                <span style={{ fontSize: 12, fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#ccc', width: 42, textAlign: 'right' }}>
                  {c.points}
                </span>
              </div>
            ))}
            <button onClick={() => onNavigate('latest')} style={{
              marginTop: 12, fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E10600',
              background: 'none', border: 'none', cursor: 'pointer', letterSpacing: '0.08em',
            }}>
              FULL STANDINGS →
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── SEASON TIMELINE ────────────────────────────────────────────────────────

function SeasonTimeline({ data, onNavigate }: { data: HomepageData; onNavigate: (mode: AppMode) => void }) {
  if (data.season_nodes.length === 0) return null;
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    const nextEl = container.querySelector('.timeline-next');
    if (nextEl) nextEl.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }, [data.season_nodes]);

  return (
    <section className="timeline-section">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#888', letterSpacing: '0.15em', fontWeight: 700 }}>
          {data.season_year} SEASON
        </span>
        <div style={{ flex: 1, height: 1, background: '#2A2A2A' }} />
      </div>

      <div ref={scrollRef} className="timeline-scroll">
        <div className="timeline-track" style={{ minWidth: data.season_nodes.length * 64 }}>
          {data.season_nodes.map((node: SeasonRaceNode, i: number) => (
            <React.Fragment key={node.round_number}>
              {i > 0 && (
                <div className="timeline-connector" style={{ background: node.is_completed ? '#555' : '#2A2A2A' }} />
              )}
              <div
                className={`timeline-node ${node.is_next ? 'timeline-next' : ''}`}
                onClick={() => node.is_completed && onNavigate('latest')}
                title={`${node.gp_name} · ${node.date}${node.winner ? ` · 🏆 ${node.winner}` : ''}`}
              >
                <div className={`timeline-dot ${node.is_next ? 'next' : ''}`} style={{
                  width: node.is_next ? 16 : 10,
                  height: node.is_next ? 16 : 10,
                  background: node.is_completed ? '#888' : node.is_next ? '#E10600' : 'transparent',
                  border: node.is_completed ? 'none' : node.is_next ? '2px solid #E10600' : '2px solid #333',
                }} />
                <span className="timeline-label" style={{
                  color: node.is_next ? '#E10600' : node.is_completed ? '#666' : '#333',
                  fontWeight: node.is_next ? 700 : 400,
                }}>
                  {node.country.slice(0, 3).toUpperCase()}
                </span>
              </div>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Season progress */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'center', gap: 12 }}>
        <div className="season-progress-bar">
          <div
            className="season-progress-fill"
            style={{ width: data.total_races > 0 ? `${(data.completed_races / data.total_races) * 100}%` : '0%' }}
          />
        </div>
        <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#666', whiteSpace: 'nowrap' }}>
          Race {data.completed_races} of {data.total_races}
        </span>
      </div>
    </section>
  );
}

// ─── PITSENSE TEASER ────────────────────────────────────────────────────────

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
            <span style={{ fontSize: 13, fontWeight: 700, color: '#27F4D2', fontFamily: 'JetBrains Mono', letterSpacing: '0.1em' }}>
              PITSENSE
            </span>
            <span style={{ fontSize: 9, color: '#555', fontFamily: 'JetBrains Mono', letterSpacing: '0.08em' }}>
              — AI STRATEGY ENGINE
            </span>
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
            <div style={{
              padding: '6px 14px', borderRadius: 4, background: 'rgba(39,244,210,0.1)',
              border: '1px solid rgba(39,244,210,0.2)', fontSize: 12, fontFamily: 'JetBrains Mono',
              fontWeight: 700, color: '#27F4D2',
            }}>
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

// ─── RETURN VISITOR BANNER ──────────────────────────────────────────────────

function ReturnVisitorBanner({ onNavigate }: { onNavigate: (mode: AppMode) => void }) {
  const [lastSession, setLastSession] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    try { const last = localStorage.getItem('gridinsight_last_session'); if (last) setLastSession(last); } catch { /* */ }
  }, []);

  if (!lastSession || dismissed) return null;

  return (
    <div className="return-banner" style={{ padding: '10px 24px', display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'center' }}>
      <span style={{ fontSize: 11, color: '#888' }}>Continue where you left off →</span>
      <button onClick={() => onNavigate('latest')} style={{
        fontSize: 10, fontFamily: 'JetBrains Mono', color: '#E10600',
        background: 'none', border: '1px solid #E1060044', borderRadius: 4, padding: '4px 12px', cursor: 'pointer',
      }}>
        {lastSession}
      </button>
      <button onClick={() => setDismissed(true)} style={{ fontSize: 14, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
    </div>
  );
}

// ─── BOOKMARK PROMPT ────────────────────────────────────────────────────────

function BookmarkPrompt() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      const count = parseInt(localStorage.getItem('gridinsight_visit_count') ?? '0', 10);
      localStorage.setItem('gridinsight_visit_count', String(count + 1));
      if (count + 1 >= 3 && !localStorage.getItem('gridinsight_bookmark_dismissed')) setShow(true);
    } catch { /* */ }
  }, []);

  if (!show) return null;

  return (
    <div className="bookmark-prompt" style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: '#1A1A1A', border: '1px solid #333', borderRadius: 8,
      padding: '12px 20px', display: 'flex', alignItems: 'center', gap: 12,
      boxShadow: '0 8px 32px rgba(0,0,0,0.6)', zIndex: 100, maxWidth: 440,
    }}>
      <span style={{ fontSize: 16 }}>📌</span>
      <span style={{ fontSize: 11, color: '#888', flex: 1 }}>
        Bookmark GridInsight for race data every weekend. No account needed.
      </span>
      <button onClick={() => { setShow(false); try { localStorage.setItem('gridinsight_bookmark_dismissed', '1'); } catch { /* */ } }}
        style={{ fontSize: 14, color: '#555', background: 'none', border: 'none', cursor: 'pointer' }}>✕</button>
    </div>
  );
}

// ─── MAIN HOMEPAGE ──────────────────────────────────────────────────────────

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

      {/* Hero — F1.com-style split layout */}
      <HeroSection data={data} onNavigate={onNavigate} />

      {/* Sticky "This Weekend" strip */}
      <WeekendStrip data={data} />

      {/* Featured insights — 3-col card grid */}
      <FeaturedInsights data={data} onNavigate={onNavigate} />

      {/* Championship standings */}
      <StandingsSection data={data} onNavigate={onNavigate} />

      {/* Season timeline */}
      <SeasonTimeline data={data} onNavigate={onNavigate} />

      {/* PitSense AI teaser */}
      <PitSenseTeaser data={data} onNavigate={onNavigate} />

      {/* Bookmark prompt */}
      <BookmarkPrompt />
    </div>
  );
};

export default Homepage;
