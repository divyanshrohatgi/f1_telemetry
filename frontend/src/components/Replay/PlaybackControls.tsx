import React, { useCallback, useRef, useState } from 'react';
import type { ReplaySettings } from './useSettings';

// -----------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

// -----------------------------------------------------------------------
// Props
// -----------------------------------------------------------------------

interface PlaybackControlsProps {
  playing: boolean;
  speed: number;
  currentTime: number;  // seconds
  totalTime: number;    // seconds
  totalLaps: number;
  currentLap: number;
  finished: boolean;
  settings: ReplaySettings;
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSkip: (deltaSec: number) => void;
  onSpeedChange: (speed: number) => void;
}

const SPEED_OPTIONS = [0.5, 1, 2, 5, 10, 20];

// -----------------------------------------------------------------------
// Scrubber
// -----------------------------------------------------------------------

interface ScrubberProps {
  currentTime: number;
  totalTime: number;
  onSeek: (time: number) => void;
}

function Scrubber({ currentTime, totalTime, onSeek }: ScrubberProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const calcTime = useCallback(
    (clientX: number): number => {
      const el = trackRef.current;
      if (!el) return currentTime;
      const rect = el.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      return ratio * totalTime;
    },
    [totalTime, currentTime],
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    onSeek(calcTime(e.clientX));

    const onMove = (me: MouseEvent) => {
      onSeek(calcTime(me.clientX));
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!dragging) onSeek(calcTime(e.clientX));
  };

  const progress = totalTime > 0 ? (currentTime / totalTime) * 100 : 0;

  return (
    <div
      ref={trackRef}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
      style={{
        position: 'relative',
        height: 6,
        background: '#1E1E1E',
        borderRadius: 3,
        cursor: 'pointer',
        marginBottom: 6,
      }}
    >
      {/* Filled */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          height: '100%',
          width: `${progress}%`,
          background: '#E10600',
          borderRadius: 3,
          pointerEvents: 'none',
        }}
      />
      {/* Knob */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: `${progress}%`,
          transform: 'translate(-50%, -50%)',
          width: 12,
          height: 12,
          borderRadius: '50%',
          background: '#E10600',
          border: '2px solid #fff',
          pointerEvents: 'none',
          boxShadow: '0 1px 4px rgba(0,0,0,0.6)',
        }}
      />
    </div>
  );
}

// -----------------------------------------------------------------------
// Control button
// -----------------------------------------------------------------------

interface CtrlBtnProps {
  label: string;
  onClick: () => void;
  primary?: boolean;
  disabled?: boolean;
  title?: string;
}

function CtrlBtn({ label, onClick, primary = false, disabled = false }: CtrlBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        fontFamily: 'JetBrains Mono, monospace',
        fontSize: 11,
        fontWeight: primary ? 'bold' : 'normal',
        color: disabled ? '#333' : primary ? '#fff' : '#AAA',
        background: primary ? '#E10600' : 'transparent',
        border: primary ? 'none' : '1px solid #2A2A2A',
        borderRadius: 4,
        padding: primary ? '4px 12px' : '4px 8px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        minWidth: primary ? 40 : undefined,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {label}
    </button>
  );
}

// -----------------------------------------------------------------------
// PlaybackControls
// -----------------------------------------------------------------------

export default function PlaybackControls({
  playing,
  speed,
  currentTime,
  totalTime,
  totalLaps,
  currentLap,
  finished,
  settings,
  onPlayPause,
  onSeek,
  onSkip,
  onSpeedChange,
}: PlaybackControlsProps) {
  return (
    <div
      style={{
        background: 'rgba(13,13,13,0.96)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        border: '1px solid #1E1E1E',
        borderRadius: 8,
        padding: '8px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minWidth: 420,
        userSelect: 'none',
      }}
    >
      {/* Lap + time header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#AAA',
            letterSpacing: '0.06em',
          }}
        >
          LAP{' '}
          <span style={{ color: '#E0E0E0', fontWeight: 'bold' }}>
            {currentLap}
          </span>
          {totalLaps > 0 && (
            <span style={{ color: '#555' }}>/{totalLaps}</span>
          )}
        </span>
        {settings.showSessionTime && totalTime > 0 && (
          <span
            style={{
              fontSize: 10,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#666',
              letterSpacing: '0.04em',
            }}
          >
            {formatTime(currentTime)} / {formatTime(totalTime)}
          </span>
        )}
        {finished && (
          <span
            style={{
              fontSize: 9,
              fontFamily: 'JetBrains Mono, monospace',
              color: '#E10600',
              letterSpacing: '0.1em',
              fontWeight: 'bold',
            }}
          >
            FINISHED
          </span>
        )}
      </div>

      {/* Scrubber */}
      <Scrubber currentTime={currentTime} totalTime={totalTime} onSeek={onSeek} />

      {/* Transport controls */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
        }}
      >
        <CtrlBtn label="◄◄" onClick={() => onSkip(-300)} title="-5m" />
        <CtrlBtn label="◄ -30s" onClick={() => onSkip(-30)} />
        <CtrlBtn label="◄ -5s" onClick={() => onSkip(-5)} />
        <CtrlBtn label={playing ? '⏸' : '▶'} onClick={onPlayPause} primary />
        <CtrlBtn label="+5s ►" onClick={() => onSkip(5)} />
        <CtrlBtn label="+30s ►" onClick={() => onSkip(30)} />
        <CtrlBtn label="►► +5m" onClick={() => onSkip(300)} />
      </div>

      {/* Speed selector */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          justifyContent: 'center',
        }}
      >
        {SPEED_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            style={{
              fontFamily: 'JetBrains Mono, monospace',
              fontSize: 10,
              fontWeight: s === speed ? 'bold' : 'normal',
              color: s === speed ? '#fff' : '#666',
              background: s === speed ? '#E10600' : 'transparent',
              border: s === speed ? 'none' : '1px solid #2A2A2A',
              borderRadius: 3,
              padding: '2px 8px',
              cursor: 'pointer',
              minWidth: 36,
            }}
          >
            {s}x
          </button>
        ))}
      </div>
    </div>
  );
}
