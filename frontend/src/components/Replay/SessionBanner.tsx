import React, { useRef, useState, useEffect } from 'react';
import type { WeatherData, SessionMeta } from './types';
import type { ReplaySettings } from './useSettings';

// -----------------------------------------------------------------------
// Session type badge colors
// -----------------------------------------------------------------------
function sessionBadgeStyle(type: string): React.CSSProperties {
  const upper = type.toUpperCase();
  if (upper === 'R' || upper === 'RACE') {
    return { background: '#E10600', color: '#fff' };
  }
  if (upper === 'Q' || upper.startsWith('QUAL')) {
    return { background: '#7B2FBE', color: '#fff' };
  }
  return { background: '#444', color: '#CCC' };
}

function sessionLabel(type: string): string {
  const upper = type.toUpperCase();
  if (upper === 'R') return 'RACE';
  if (upper === 'Q') return 'QUALI';
  if (upper === 'S' || upper === 'SS') return 'SPRINT';
  if (upper === 'SQ') return 'SPRINT Q';
  if (upper === 'FP1') return 'FP1';
  if (upper === 'FP2') return 'FP2';
  if (upper === 'FP3') return 'FP3';
  return upper;
}

// -----------------------------------------------------------------------
// Weather chips
// -----------------------------------------------------------------------

interface WindArrowProps {
  direction: number; // degrees
}

function WindArrow({ direction }: WindArrowProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        transform: `rotate(${direction}deg)`,
        fontSize: 12,
        lineHeight: 1,
      }}
    >
      ↑
    </span>
  );
}

interface WeatherChipsProps {
  weather: WeatherData;
  settings: ReplaySettings;
}

function WeatherChips({ weather, settings }: WeatherChipsProps) {
  const chips: React.ReactNode[] = [];

  if (settings.showAirTemp) {
    chips.push(
      <div key="air" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 11 }}>🌡</span>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#CCC' }}>
          {weather.air_temp.toFixed(1)}°C
        </span>
        <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#666', letterSpacing: '0.06em' }}>
          AIR
        </span>
      </div>,
    );
  }

  if (settings.showTrackTemp) {
    chips.push(
      <div key="track" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <span style={{ fontSize: 11 }}>🛣</span>
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#CCC' }}>
          {weather.track_temp.toFixed(1)}°C
        </span>
        <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#666', letterSpacing: '0.06em' }}>
          TRK
        </span>
      </div>,
    );
  }

  chips.push(
    <div key="hum" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#888' }}>
        {weather.humidity.toFixed(0)}%
      </span>
      <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#666', letterSpacing: '0.06em' }}>
        HUM
      </span>
    </div>,
  );

  chips.push(
    <div key="rain" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
      <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: weather.rainfall ? '#0072C6' : '#888' }}>
        {weather.rainfall ? 'Rain 🌧' : 'Dry'}
      </span>
    </div>,
  );

  if (settings.showWind) {
    chips.push(
      <div key="wind" style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
        <WindArrow direction={weather.wind_direction} />
        <span style={{ fontSize: 11, fontFamily: 'JetBrains Mono, monospace', color: '#CCC' }}>
          {weather.wind_speed.toFixed(1)} m/s
        </span>
        <span style={{ fontSize: 8, fontFamily: 'JetBrains Mono, monospace', color: '#666', letterSpacing: '0.06em' }}>
          WIND
        </span>
      </div>,
    );
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      {chips}
    </div>
  );
}

// -----------------------------------------------------------------------
// Settings panel
// -----------------------------------------------------------------------

interface SettingToggleProps {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  note?: string;
}

function SettingToggle({ label, value, onChange, note }: SettingToggleProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 0',
        gap: 8,
      }}
    >
      <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#CCC' }}>
        {label}
        {note && (
          <span style={{ fontSize: 9, color: '#666', marginLeft: 4 }}>{note}</span>
        )}
      </span>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 28,
          height: 14,
          borderRadius: 7,
          background: value ? '#E10600' : '#444',
          border: 'none',
          cursor: 'pointer',
          position: 'relative',
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
      >
        <div
          style={{
            position: 'absolute',
            top: 2,
            left: value ? 16 : 2,
            width: 10,
            height: 10,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s',
          }}
        />
      </button>
    </div>
  );
}

interface SettingsPanelProps {
  settings: ReplaySettings;
  onSettingsChange: (patch: Partial<ReplaySettings>) => void;
  isRace: boolean;
  onClose: () => void;
}

type ReplaySettingsBoolKeys = {
  [K in keyof ReplaySettings]: ReplaySettings[K] extends boolean ? K : never;
}[keyof ReplaySettings];

function SettingsPanel({ settings, onSettingsChange, isRace, onClose }: SettingsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  const toggle = (key: ReplaySettingsBoolKeys) => {
    onSettingsChange({ [key]: !settings[key] } as Partial<ReplaySettings>);
  };

  const groups: Array<{
    label: string;
    items: Array<{ key: ReplaySettingsBoolKeys; label: string; raceOnly?: boolean; note?: string }>;
  }> = [
    {
      label: 'LEADERBOARD',
      items: [
        { key: 'showTeamAbbr', label: 'Team abbr' },
        { key: 'showGridChange', label: 'Grid change', raceOnly: true },
        { key: 'showGapToLeader', label: 'Gap / Interval' },
        { key: 'showPitStops', label: 'Pit stops', raceOnly: true },
        { key: 'showPitPrediction', label: 'Pit prediction', raceOnly: true },
        { key: 'showTyreHistory', label: 'Tyre history', raceOnly: true },
        { key: 'showTyreType', label: 'Current tyre' },
        { key: 'showTyreAge', label: 'Tyre age' },
      ],
    },
    {
      label: 'MAP',
      items: [
        { key: 'showTelemetry', label: 'Telemetry bar' },
      ],
    },
    {
      label: 'WEATHER',
      items: [
        { key: 'showWeather', label: 'Show weather' },
        { key: 'showAirTemp', label: 'Air temp' },
        { key: 'showTrackTemp', label: 'Track temp' },
        { key: 'showWind', label: 'Wind' },
      ],
    },
    {
      label: 'OTHER',
      items: [
        { key: 'showRaceControl', label: 'Race control' },
        { key: 'showSessionTime', label: 'Session time', note: '(spoiler)' },
      ],
    },
  ];

  return (
    <div
      ref={panelRef}
      style={{
        position: 'absolute',
        top: 46,
        right: 0,
        width: 240,
        background: '#0D0D0D',
        border: '1px solid #2A2A2A',
        borderRadius: 6,
        boxShadow: '0 4px 24px rgba(0,0,0,0.7)',
        zIndex: 1000,
        padding: '8px 12px',
        maxHeight: 'calc(100vh - 60px)',
        overflowY: 'auto',
      }}
    >
      {groups.map((group) => {
        const visibleItems = group.items.filter((item) => !item.raceOnly || isRace);
        if (visibleItems.length === 0) return null;
        return (
          <div key={group.label} style={{ marginBottom: 12 }}>
            <div
              style={{
                fontSize: 8,
                fontFamily: 'JetBrains Mono, monospace',
                color: '#555',
                letterSpacing: '0.14em',
                marginBottom: 6,
                paddingBottom: 4,
                borderBottom: '1px solid #1A1A1A',
              }}
            >
              {group.label}
            </div>
            {/* Special cycle control for MAP group */}
            {group.label === 'MAP' && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '4px 0',
                  gap: 8,
                }}
              >
                <span style={{ fontSize: 10, fontFamily: 'JetBrains Mono, monospace', color: '#CCC' }}>
                  Driver labels
                </span>
                <div style={{ display: 'flex', gap: 2 }}>
                  {(['all', 'selected', 'none'] as const).map((opt) => (
                    <button
                      key={opt}
                      onClick={() => onSettingsChange({ showDriverNames: opt })}
                      style={{
                        fontSize: 8,
                        fontFamily: 'JetBrains Mono, monospace',
                        fontWeight: 'bold',
                        letterSpacing: '0.06em',
                        padding: '2px 5px',
                        borderRadius: 2,
                        border: 'none',
                        cursor: 'pointer',
                        background: settings.showDriverNames === opt ? '#E10600' : '#2A2A2A',
                        color: settings.showDriverNames === opt ? '#fff' : '#888',
                        textTransform: 'uppercase',
                      }}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {visibleItems.map((item) => (
              <SettingToggle
                key={item.key}
                label={item.label}
                value={settings[item.key] as boolean}
                onChange={() => toggle(item.key)}
                note={item.note}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------
// SessionBanner
// -----------------------------------------------------------------------

type ReplaySettingsPatch = Partial<ReplaySettings>;

interface SessionBannerProps {
  sessionMeta: SessionMeta;
  weather: WeatherData | null;
  settings: ReplaySettings;
  onSettingsChange: (patch: ReplaySettingsPatch) => void;
  showRCMessages: boolean;
  onToggleRC: () => void;
  onBack?: () => void;
}

export default function SessionBanner({
  sessionMeta,
  weather,
  settings,
  onSettingsChange,
  showRCMessages,
  onToggleRC,
  onBack,
}: SessionBannerProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const isRace =
    sessionMeta.session_type.toUpperCase() === 'R' ||
    sessionMeta.session_type.toUpperCase() === 'RACE';

  const divider = (
    <div style={{ width: 1, height: 20, background: '#2A2A2A', flexShrink: 0 }} />
  );

  return (
    <div
      style={{
        height: 44,
        background: '#0D0D0D',
        borderBottom: '1px solid #1E1E1E',
        display: 'flex',
        alignItems: 'center',
        padding: '0 12px',
        gap: 10,
        flexShrink: 0,
        position: 'relative',
        zIndex: 100,
      }}
    >
      {/* Back button */}
      {onBack && (
        <button
          onClick={onBack}
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            color: '#666',
            background: 'transparent',
            border: '1px solid #2A2A2A',
            borderRadius: 3,
            padding: '3px 8px',
            cursor: 'pointer',
            letterSpacing: '0.06em',
            flexShrink: 0,
            whiteSpace: 'nowrap',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#CCC'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = '#666'; }}
        >
          ← BACK
        </button>
      )}

      {/* Left: logo + GP info */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Logo */}
        <span
          style={{
            fontSize: 14,
            fontWeight: 'bold',
            color: '#E10600',
            fontFamily: 'Titillium Web, sans-serif',
            letterSpacing: '0.04em',
          }}
        >
          Grid<span style={{ color: '#fff' }}>Insight</span>
        </span>

        {divider}

        <span
          style={{
            fontSize: 12,
            fontWeight: 'bold',
            color: '#E0E0E0',
            fontFamily: 'Titillium Web, sans-serif',
            letterSpacing: '0.04em',
            whiteSpace: 'nowrap',
          }}
        >
          {sessionMeta.year} {sessionMeta.gp_name.toUpperCase()}
        </span>

        {divider}

        <span
          style={{
            fontSize: 10,
            color: '#888',
            fontFamily: 'JetBrains Mono, monospace',
            whiteSpace: 'nowrap',
          }}
        >
          {sessionMeta.circuit_name}
        </span>

        {divider}

        <span
          style={{
            fontSize: 10,
            color: '#666',
            fontFamily: 'JetBrains Mono, monospace',
            letterSpacing: '0.08em',
          }}
        >
          {sessionMeta.country_code}
        </span>
      </div>

      {/* Center: weather (hidden on small screens via flex shrink) */}
      {settings.showWeather && weather && (
        <div
          style={{
            flex: 1,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'hidden',
            minWidth: 0,
          }}
        >
          <WeatherChips weather={weather} settings={settings} />
        </div>
      )}

      {!settings.showWeather || !weather ? <div style={{ flex: 1 }} /> : null}

      {/* Right: session badge + RC + settings */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
          position: 'relative',
        }}
      >
        {/* Session badge */}
        <span
          style={{
            ...sessionBadgeStyle(sessionMeta.session_type),
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 'bold',
            padding: '3px 8px',
            borderRadius: 3,
            letterSpacing: '0.08em',
          }}
        >
          {sessionLabel(sessionMeta.session_type)}
        </span>

        {/* RC button */}
        <button
          onClick={onToggleRC}
          title="Race Control messages"
          style={{
            fontSize: 10,
            fontFamily: 'JetBrains Mono, monospace',
            fontWeight: 'bold',
            color: showRCMessages ? '#E10600' : '#666',
            background: 'transparent',
            border: `1px solid ${showRCMessages ? '#E10600' : '#333'}`,
            borderRadius: 3,
            padding: '3px 8px',
            cursor: 'pointer',
            letterSpacing: '0.06em',
          }}
        >
          RC
        </button>

        {/* Settings gear */}
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            title="Settings"
            style={{
              fontSize: 14,
              color: settingsOpen ? '#E10600' : '#888',
              background: 'transparent',
              border: `1px solid ${settingsOpen ? '#E10600' : '#333'}`,
              borderRadius: 3,
              padding: '2px 8px',
              cursor: 'pointer',
              lineHeight: 1,
            }}
          >
            ⚙
          </button>

          {settingsOpen && (
            <SettingsPanel
              settings={settings}
              onSettingsChange={onSettingsChange}
              isRace={isRace}
              onClose={() => setSettingsOpen(false)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
