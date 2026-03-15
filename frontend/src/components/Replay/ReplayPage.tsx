import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import type { SessionMetadata } from '../../types/f1.types';
import { useReplaySocket } from '../../hooks/useReplaySocket';
import { useSettings } from './useSettings';
import TrackCanvas from './TrackCanvas';
import Leaderboard from './Leaderboard';
import TelemetryBar from './TelemetryBar';
import PlaybackControls from './PlaybackControls';
import SessionBanner from './SessionBanner';
import type { SessionMeta, BattleZone, RCMessage } from './types';

interface ReplayPageProps {
  sessionMeta: SessionMetadata;
  onBack?: () => void;
}

// ── RC helpers ────────────────────────────────────────────────────────────

function rcCategoryColor(category: string): string {
  const c = category.toLowerCase();
  if (c.includes('flag') || c.includes('yellow') || c.includes('red')) return '#F5C518';
  if (c.includes('safety') || c.includes('sc')) return '#FF8C00';
  if (c.includes('incident') || c.includes('penalty')) return '#E10600';
  return '#555';
}

function formatRCTime(t: number): string {
  const min = Math.floor(t / 60);
  const sec = Math.floor(t % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

// ── Main component ────────────────────────────────────────────────────────

export default function ReplayPage({ sessionMeta, onBack }: ReplayPageProps) {
  const [selectedDrivers, setSelectedDrivers] = useState<string[]>([]);
  const [settings, updateSettings] = useSettings();

  // Parse session key: "{year}_{gp}_{session_type}"
  const parts = sessionMeta.session_key.split('_');
  const year = parseInt(parts[0], 10);
  const sessionType = parts[parts.length - 1].toUpperCase();
  const gp = parts.slice(1, -1).join('_');

  const {
    status, playing, speed, frame, totalTime, totalLaps, finished,
    trackPoints, trackRotation, rcMessages,
    play, pause, setSpeed, seek, skip, reset,
  } = useReplaySocket(year, gp, sessionType);

  // ── Advanced feature state ─────────────────────────────────────────────
  const [battleZones, setBattleZones] = useState<BattleZone[]>([]);
  const [gapTrends, setGapTrends] = useState<Map<string, 'closing' | 'growing' | 'stable'>>(new Map());
  const [overtakeFlashes, setOvertakeFlashes] = useState<Map<string, 'gained' | 'lost'>>(new Map());
  const [fastestLapFlash, setFastestLapFlash] = useState<{ abbr: string; expiry: number } | null>(null);
  const [showFLToast, setShowFLToast] = useState(false);
  const [pitEntryTimes, setPitEntryTimes] = useState<Map<string, number>>(new Map());
  const [focusedDriver, setFocusedDriver] = useState<string | null>(null);
  const [showRC, setShowRC] = useState(false);

  const gapBuffersRef = useRef<Map<string, number[]>>(new Map());
  const prevPositionsRef = useRef<Map<string, number>>(new Map());
  const prevFastestLapRef = useRef<string | null>(null);
  const pitEntryTimesRef = useRef<Map<string, number>>(new Map());
  const overtakeFlashTimeoutsRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      overtakeFlashTimeoutsRef.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  // ── Frame-driven feature computation ──────────────────────────────────
  useEffect(() => {
    if (!frame) return;
    const { drivers, timestamp: ts } = frame;

    // 1. Gap trend arrows — ring buffer last 10 gaps per driver
    const newTrends = new Map<string, 'closing' | 'growing' | 'stable'>();
    for (const drv of drivers) {
      if (drv.gap === null || typeof drv.gap !== 'number' || drv.retired || drv.in_pit) continue;
      const buf = gapBuffersRef.current.get(drv.abbr) ?? [];
      buf.push(drv.gap);
      if (buf.length > 10) buf.shift();
      gapBuffersRef.current.set(drv.abbr, buf);
      if (buf.length >= 5) {
        const delta = buf[buf.length - 1] - buf[0];
        newTrends.set(drv.abbr, delta < -0.5 ? 'closing' : delta > 0.5 ? 'growing' : 'stable');
      }
    }
    setGapTrends(newTrends);

    // 2. Pit stop timer — track when each driver entered pit
    for (const drv of drivers) {
      if (drv.in_pit && !pitEntryTimesRef.current.has(drv.abbr)) {
        pitEntryTimesRef.current.set(drv.abbr, ts);
      } else if (!drv.in_pit) {
        pitEntryTimesRef.current.delete(drv.abbr);
      }
    }
    setPitEntryTimes(new Map(pitEntryTimesRef.current));

    // 3. Overtake / position change detection
    const newFlashes: [string, 'gained' | 'lost'][] = [];
    for (const drv of drivers) {
      if (drv.position === null || drv.retired) {
        prevPositionsRef.current.delete(drv.abbr);
        continue;
      }
      const prev = prevPositionsRef.current.get(drv.abbr);
      if (prev !== undefined && prev !== drv.position) {
        const direction: 'gained' | 'lost' = drv.position < prev ? 'gained' : 'lost';
        newFlashes.push([drv.abbr, direction]);
        const existing = overtakeFlashTimeoutsRef.current.get(drv.abbr);
        if (existing) clearTimeout(existing);
        const to = setTimeout(() => {
          setOvertakeFlashes((p) => {
            const n = new Map(p);
            n.delete(drv.abbr);
            return n;
          });
          overtakeFlashTimeoutsRef.current.delete(drv.abbr);
        }, 2000);
        overtakeFlashTimeoutsRef.current.set(drv.abbr, to);
      }
      prevPositionsRef.current.set(drv.abbr, drv.position);
    }
    if (newFlashes.length > 0) {
      setOvertakeFlashes((prev) => {
        const next = new Map(prev);
        newFlashes.forEach(([abbr, dir]) => next.set(abbr, dir));
        return next;
      });
    }

    // 4. Battle zones — adjacent pairs with gap < 1.0s
    const sorted = [...drivers]
      .filter((d) => !d.retired && d.position !== null)
      .sort((a, b) => (a.position ?? 999) - (b.position ?? 999));
    const battles: BattleZone[] = [];
    for (let i = 1; i < sorted.length; i++) {
      const curr = sorted[i];
      const prev = sorted[i - 1];
      const currGap = typeof curr.gap === 'number' ? curr.gap : null;
      const prevGap = prev.gap === null ? 0 : (typeof prev.gap === 'number' ? prev.gap : null);
      if (currGap !== null && prevGap !== null) {
        const interval = currGap - prevGap;
        if (interval >= 0 && interval < 1.0) {
          battles.push({ driverA: prev.abbr, driverB: curr.abbr, gapSeconds: interval });
        }
      }
    }
    setBattleZones(battles);

    // 5. Fastest lap flash
    const fl = drivers.find((d) => d.has_fastest_lap);
    const flAbbr = fl?.abbr ?? null;
    if (flAbbr && flAbbr !== prevFastestLapRef.current) {
      setFastestLapFlash({ abbr: flAbbr, expiry: Date.now() + 3000 });
      prevFastestLapRef.current = flAbbr;
    }
  }, [frame]);

  // FL toast auto-dismiss
  useEffect(() => {
    if (!fastestLapFlash) return;
    setShowFLToast(true);
    const t = setTimeout(() => setShowFLToast(false), 3000);
    return () => clearTimeout(t);
  }, [fastestLapFlash?.abbr]);

  // ── Standard handlers ──────────────────────────────────────────────────
  const handlePlayPause = useCallback(() => {
    if (playing) pause(); else play();
  }, [playing, play, pause]);

  const handleDriverSelect = useCallback((abbr: string) => {
    setSelectedDrivers((prev) => {
      if (prev.includes(abbr)) return prev.filter((a) => a !== abbr);
      if (prev.length >= 2) return [prev[1], abbr];
      return [...prev, abbr];
    });
  }, []);

  const handleIntervalModeToggle = useCallback(() => {
    updateSettings({ intervalMode: settings.intervalMode === 'leader' ? 'interval' : 'leader' });
  }, [settings.intervalMode, updateSettings]);

  const handleDriverFocus = useCallback((abbr: string | null) => {
    setFocusedDriver(abbr);
  }, []);

  const isRace = sessionType === 'R' || sessionType === 'S';

  const replayMeta = useMemo<SessionMeta>(() => ({
    year: sessionMeta.year,
    gp_name: sessionMeta.gp_name,
    circuit_name: sessionMeta.circuit_name,
    country_code: sessionMeta.country,
    session_type: sessionMeta.session_type,
  }), [sessionMeta]);

  const drivers = frame?.drivers ?? [];
  const currentLap = frame?.lap ?? 0;
  const currentTime = frame?.timestamp ?? 0;
  const trackStatus = frame?.status ?? 'green';
  const weather = frame?.weather ?? null;

  // RC messages visible at current time (last 4)
  const visibleRCMessages: RCMessage[] = useMemo(() => {
    return rcMessages
      .filter((m) => m.t <= currentTime)
      .slice(-4);
  }, [rcMessages, currentTime]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#0A0A0A',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* ── Status overlay (loading / error) ───────────────────────── */}
      {status.kind !== 'ready' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0,0,0,0.88)',
            gap: 16,
          }}
        >
          {status.kind === 'error' ? (
            <>
              <div
                style={{
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#E10600',
                  fontWeight: 'bold',
                  letterSpacing: '0.1em',
                }}
              >
                REPLAY UNAVAILABLE
              </div>
              <div
                style={{
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#666',
                  maxWidth: 360,
                  textAlign: 'center',
                  lineHeight: 1.6,
                }}
              >
                {status.message}
              </div>
              <button
                onClick={reset}
                style={{
                  marginTop: 8,
                  padding: '6px 18px',
                  background: '#1A1A1A',
                  border: '1px solid #333',
                  borderRadius: 4,
                  color: '#888',
                  fontFamily: 'JetBrains Mono, monospace',
                  fontSize: 10,
                  cursor: 'pointer',
                  letterSpacing: '0.08em',
                }}
              >
                RETRY
              </button>
            </>
          ) : (
            <>
              <div
                style={{
                  width: 40,
                  height: 40,
                  border: '3px solid #E10600',
                  borderTopColor: 'transparent',
                  borderRadius: '50%',
                  animation: 'replaySpin 0.8s linear infinite',
                }}
              />
              <div
                style={{
                  fontSize: 11,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#AAA',
                  letterSpacing: '0.08em',
                  fontWeight: 'bold',
                }}
              >
                {status.kind === 'connecting'
                  ? 'CONNECTING…'
                  : status.message.toUpperCase()}
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontFamily: 'JetBrains Mono, monospace',
                  color: '#444',
                  maxWidth: 300,
                  textAlign: 'center',
                  lineHeight: 1.6,
                }}
              >
                First load builds replay data — this may take 1–3 minutes
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Session banner (top) ─────────────────────────────────────── */}
      <SessionBanner
        sessionMeta={replayMeta}
        weather={weather}
        settings={settings}
        onSettingsChange={updateSettings}
        showRCMessages={showRC}
        onToggleRC={() => setShowRC((v) => !v)}
        onBack={onBack}
      />

      {/* ── Fastest lap toast ─────────────────────────────────────────── */}
      {showFLToast && fastestLapFlash && (
        <div
          style={{
            position: 'absolute',
            top: 52,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            background: '#7B2FBE',
            color: '#fff',
            padding: '5px 16px',
            borderRadius: 4,
            fontFamily: 'JetBrains Mono, monospace',
            fontSize: 11,
            fontWeight: 'bold',
            letterSpacing: '0.1em',
            boxShadow: '0 2px 16px rgba(123,47,190,0.6)',
            pointerEvents: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          ⏱ FASTEST LAP — {fastestLapFlash.abbr}
        </div>
      )}

      {/* ── Main body: track + leaderboard ──────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden', minHeight: 0 }}>
        {/* Track canvas area */}
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          <TrackCanvas
            trackPoints={trackPoints}
            rotation={trackRotation}
            drivers={drivers}
            selectedDrivers={selectedDrivers}
            trackStatus={trackStatus}
            playbackSpeed={speed}
            showDriverNames={settings.showDriverNames}
            battleZones={battleZones}
            overtakeFlashes={overtakeFlashes}
            fastestLapFlash={fastestLapFlash}
            focusedDriver={focusedDriver}
          />

          {/* Telemetry bar overlay */}
          {settings.showTelemetry && selectedDrivers.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 80,
                left: 16,
                zIndex: 5,
              }}
            >
              <TelemetryBar
                drivers={drivers}
                selectedDrivers={selectedDrivers}
                year={year}
              />
            </div>
          )}

          {/* RC messages panel */}
          {showRC && visibleRCMessages.length > 0 && (
            <div
              style={{
                position: 'absolute',
                bottom: 16,
                left: 16,
                zIndex: 10,
                maxWidth: 320,
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                pointerEvents: 'none',
              }}
            >
              {visibleRCMessages.map((msg, i) => (
                <div
                  key={i}
                  style={{
                    background: 'rgba(10,10,10,0.92)',
                    border: '1px solid #2A2A2A',
                    borderLeft: `3px solid ${rcCategoryColor(msg.category)}`,
                    borderRadius: 4,
                    padding: '4px 8px',
                  }}
                >
                  <div style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#666', marginBottom: 2 }}>
                    {formatRCTime(msg.t)} · {msg.category.toUpperCase()}
                    {msg.racing_number && (
                      <span style={{ color: '#888', marginLeft: 6 }}>#{msg.racing_number}</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#CCC', lineHeight: 1.4 }}>
                    {msg.message}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Leaderboard (right side) */}
        <Leaderboard
          drivers={drivers}
          isRace={isRace}
          settings={settings}
          selectedDrivers={selectedDrivers}
          onDriverSelect={handleDriverSelect}
          onIntervalModeToggle={handleIntervalModeToggle}
          gapTrends={gapTrends}
          pitEntryTimes={pitEntryTimes}
          currentTimestamp={currentTime}
          overtakeFlashes={overtakeFlashes}
          battleZones={battleZones}
          focusedDriver={focusedDriver}
          onDriverFocus={handleDriverFocus}
        />
      </div>

      {/* ── Playback controls (bottom) ───────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '8px 12px',
          background: '#0A0A0A',
          borderTop: '1px solid #1A1A1A',
          flexShrink: 0,
        }}
      >
        <PlaybackControls
          playing={playing}
          speed={speed}
          currentTime={currentTime}
          totalTime={totalTime}
          totalLaps={totalLaps}
          currentLap={currentLap}
          finished={finished}
          settings={settings}
          onPlayPause={handlePlayPause}
          onSeek={seek}
          onSkip={skip}
          onSpeedChange={setSpeed}
        />
      </div>

      <style>{`
        @keyframes replaySpin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
