import React from 'react';

interface ReplayControlsProps {
  playing: boolean;
  speed: number;
  currentTime: number;
  totalTime: number;
  totalLaps: number;
  finished: boolean;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onSeek: (t: number) => void;
  onSeekToLap: (lap: number) => void;
  onSetSpeed: (s: number) => void;
}

const SPEEDS = [0.25, 0.5, 1, 2, 5, 10, 25];

function fmtTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

const ReplayControls: React.FC<ReplayControlsProps> = ({
  playing, speed, currentTime, totalTime, totalLaps, finished,
  onPlay, onPause, onReset, onSeek, onSeekToLap, onSetSpeed,
}) => {
  const progress = totalTime > 0 ? currentTime / totalTime : 0;

  return (
    <div style={{
      background: '#111',
      borderTop: '1px solid #1E1E1E',
      padding: '12px 20px',
      display: 'flex',
      flexDirection: 'column',
      gap: 10,
      flexShrink: 0,
    }}>
      {/* Scrubber */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#888', width: 44, textAlign: 'right', flexShrink: 0 }}>
          {fmtTime(currentTime)}
        </span>
        <div
          style={{ flex: 1, height: 4, background: '#2A2A2A', borderRadius: 2, cursor: 'pointer', position: 'relative' }}
          onClick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const t = ((e.clientX - rect.left) / rect.width) * totalTime;
            onSeek(Math.max(0, Math.min(totalTime, t)));
          }}
        >
          <div style={{ width: `${progress * 100}%`, height: '100%', background: '#E10600', borderRadius: 2 }} />
          <div style={{
            position: 'absolute', top: '50%', left: `${progress * 100}%`,
            transform: 'translate(-50%, -50%)',
            width: 10, height: 10, borderRadius: '50%', background: '#fff',
          }} />
        </div>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono', color: '#555', width: 44, flexShrink: 0 }}>
          {fmtTime(totalTime)}
        </span>
      </div>

      {/* Controls row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Reset */}
        <button onClick={onReset} style={btnStyle}>⏮</button>

        {/* Play / Pause */}
        <button
          onClick={playing ? onPause : onPlay}
          style={{ ...btnStyle, width: 36, height: 36, fontSize: 16, background: '#E10600', borderColor: '#E10600', color: '#fff' }}
        >
          {playing ? '⏸' : '▶'}
        </button>

        {/* Finished badge */}
        {finished && (
          <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono', color: '#FFD700', letterSpacing: '0.08em' }}>
            FINISHED
          </span>
        )}

        {/* Speed selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginLeft: 8 }}>
          <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.1em' }}>SPEED</span>
          {SPEEDS.map(s => (
            <button
              key={s}
              onClick={() => onSetSpeed(s)}
              style={{
                padding: '3px 7px',
                fontSize: 10,
                fontFamily: 'JetBrains Mono',
                background: speed === s ? '#E10600' : 'transparent',
                color: speed === s ? '#fff' : '#666',
                border: `1px solid ${speed === s ? '#E10600' : '#2A2A2A'}`,
                borderRadius: 3,
                cursor: 'pointer',
              }}
            >
              {s}×
            </button>
          ))}
        </div>

        {/* Lap jumper */}
        {totalLaps > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
            <span style={{ fontSize: 9, fontFamily: 'JetBrains Mono', color: '#555', letterSpacing: '0.1em' }}>LAP</span>
            {Array.from({ length: Math.min(totalLaps, 20) }, (_, i) => {
              const lap = Math.round(1 + (i * (totalLaps - 1)) / 19);
              return (
                <button key={lap} onClick={() => onSeekToLap(lap)} style={{ ...btnStyle, fontSize: 9, padding: '2px 6px' }}>
                  {lap}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

const btnStyle: React.CSSProperties = {
  width: 30, height: 30,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'transparent',
  color: '#888',
  border: '1px solid #2A2A2A',
  borderRadius: 4,
  cursor: 'pointer',
  fontSize: 13,
  fontFamily: 'JetBrains Mono',
};

export default ReplayControls;
