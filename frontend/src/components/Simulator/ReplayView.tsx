import React, { useState, useMemo } from 'react';
import type { SessionMetadata } from '../../types/f1.types';
import { useReplaySocket } from '../../hooks/useReplaySocket';
import LiveTrackMap from './LiveTrackMap';
import ReplayControls from './ReplayControls';
import type { DriverMarker } from '../../utils/trackRenderer';

interface ReplayViewProps {
  sessionMeta: SessionMetadata;
}

const COMPOUND_COLORS: Record<string, string> = {
  SOFT: '#FF3333', MEDIUM: '#FFC906', HARD: '#CCCCCC',
  INTER: '#39B54A', WET: '#0072C6',
};

const ReplayView: React.FC<ReplayViewProps> = ({ sessionMeta }) => {
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  // Parse session key: "{year}_{gp}_{session_type}"
  const parts = sessionMeta.session_key.split('_');
  const year = parseInt(parts[0], 10);
  const sessionType = parts[parts.length - 1].toUpperCase();
  const gp = parts.slice(1, -1).join('_');

  const {
    status, playing, speed, frame, totalTime, totalLaps, finished,
    play, pause, setSpeed, seek, seekToLap, reset,
  } = useReplaySocket(year, gp, sessionType);

  // Convert replay drivers → DriverMarker for LiveTrackMap
  const driverMarkers = useMemo<DriverMarker[]>(() => {
    if (!frame) return [];
    return frame.drivers.map(d => ({
      abbr: d.abbr,
      x: d.x,
      y: d.y,
      color: d.color,
      position: d.position,
    }));
  }, [frame]);

  // Track points: pull from sessionMeta circuit data (not available here directly)
  // We use an empty array — LiveTrackMap handles the empty-track case gracefully
  // In a future iteration, fetch /api/v1/telemetry for circuit_points
  const trackPoints = useMemo(() => {
    const info = sessionMeta as any;
    if (info.circuit_points) return info.circuit_points;
    return [];
  }, [sessionMeta]);
  const trackRotation: number = (sessionMeta as any).circuit_rotation ?? 0;

  const currentTime = frame?.timestamp ?? 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#0D0D0D' }}>
      {/* ── Status overlay ───────────────────────────────────────────── */}
      {status.kind !== 'ready' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 10,
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          background: 'rgba(0,0,0,0.85)', gap: 16,
        }}>
          {status.kind === 'error' ? (
            <>
              <div style={{ fontSize: 12, color: '#E10600', fontFamily: 'JetBrains Mono' }}>
                REPLAY UNAVAILABLE
              </div>
              <div style={{ fontSize: 11, color: '#666', maxWidth: 340, textAlign: 'center' }}>
                {status.message}
              </div>
            </>
          ) : (
            <>
              <div style={{ width: 36, height: 36, border: '3px solid #E10600', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
              <div style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#888' }}>
                {status.kind === 'connecting' ? 'CONNECTING…' : status.message.toUpperCase()}
              </div>
              <div style={{ fontSize: 10, color: '#555', fontFamily: 'JetBrains Mono' }}>
                First load builds replay data — may take 1–3 min
              </div>
            </>
          )}
        </div>
      )}

      {/* ── Main content ─────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Track map */}
        <div style={{ flex: 1, padding: 16, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 20, left: 20, zIndex: 2 }}>
            <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.12em' }}>
              {sessionMeta.year} · {sessionMeta.gp_name.toUpperCase()} · REPLAY
            </div>
            {frame && (
              <div style={{ fontSize: 14, fontWeight: 700, color: '#F0F0F0', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                T+{frame.timestamp.toFixed(0)}s
              </div>
            )}
          </div>
          <LiveTrackMap
            trackPoints={trackPoints}
            rotation={trackRotation}
            drivers={driverMarkers}
            highlightedDrivers={selectedDriver ? [selectedDriver] : []}
            playbackSpeed={speed}
            showDriverNames={true}
          />
        </div>

        {/* Timing tower */}
        <div style={{
          width: 240, borderLeft: '1px solid #1E1E1E',
          background: '#111', overflowY: 'auto', flexShrink: 0,
          display: 'flex', flexDirection: 'column',
        }}>
          <div style={{ padding: '12px 14px 8px', borderBottom: '1px solid #1E1E1E' }}>
            <div style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.12em' }}>
              ORDER
            </div>
          </div>
          {(frame?.drivers ?? []).map((d) => {
            const isSelected = d.abbr === selectedDriver;
            const cColor = COMPOUND_COLORS[d.compound ?? ''] ?? '#444';
            return (
              <div
                key={d.abbr}
                onClick={() => setSelectedDriver(isSelected ? null : d.abbr)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '6px 14px',
                  borderBottom: '1px solid #1A1A1A',
                  background: isSelected ? '#1A1A1A' : 'transparent',
                  cursor: 'pointer',
                }}
              >
                <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#555', width: 16, textAlign: 'center' }}>
                  {d.position ?? '—'}
                </span>
                <div style={{ width: 2, height: 22, borderRadius: 1, background: d.color, flexShrink: 0 }} />
                <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'JetBrains Mono', color: '#F0F0F0', flex: 1 }}>
                  {d.abbr}
                </span>
                {d.compound && (
                  <div style={{
                    width: 18, height: 18, borderRadius: 3,
                    background: cColor, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 9, fontWeight: 700, color: d.compound === 'MEDIUM' || d.compound === 'HARD' ? '#111' : '#fff' }}>
                      {d.compound === 'INTER' ? 'I' : d.compound?.[0] ?? '?'}
                    </span>
                  </div>
                )}
                <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555' }}>
                  {d.speed > 0 ? `${Math.round(d.speed)}` : ''}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Playback controls */}
      <ReplayControls
        playing={playing}
        speed={speed}
        currentTime={currentTime}
        totalTime={totalTime}
        totalLaps={totalLaps}
        finished={finished}
        onPlay={play}
        onPause={pause}
        onReset={reset}
        onSeek={seek}
        onSeekToLap={seekToLap}
        onSetSpeed={setSpeed}
      />

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default ReplayView;
